import type { SquadPlayer } from '../types/match.ts'
import { matchRepository } from './repositories/matchRepository.ts'
import { teamRepository } from './repositories/teamRepository.ts'
import { playerRepository } from './repositories/playerRepository.ts'
import { normalizeName } from '../utils/validation.ts'
import { generateUUID } from '../utils/uuid.ts'

export interface PullSquadResult {
  players: SquadPlayer[]
  source: 'match' | 'team' | 'none'
  message?: string
}

/**
 * Searches historical matches and repositories for players who previously played for `teamName`.
 *
 * Priority:
 * 1. Most recent match in `matchRepository` containing this team (home or visitor) with squad players.
 * 2. Team and player records in `teamRepository` and `playerRepository`.
 *
 * Excludes duplicates and any player currently in `opposingSquad` to maintain match integrity.
 */
export async function getPreviousSquadForTeam(
  teamName: string,
  opposingSquad: SquadPlayer[] = [],
  teamLimit = 11
): Promise<PullSquadResult> {
  const trimmed = teamName.trim()
  if (!trimmed) {
    return { players: [], source: 'none', message: 'Team name is required.' }
  }

  const target = trimmed.toLowerCase()
  const opposingSet = new Set(opposingSquad.map((p) => normalizeName(p.name).toLowerCase()))

  // 1. Check matchRepository (all matches, sorted newest to oldest)
  try {
    const matches = await matchRepository.listMatches()
    // Sort specifically by completedAt or updatedAt desc
    const sortedMatches = [...matches].sort((a, b) => {
      const timeA = new Date(a.completedAt || a.updatedAt).getTime()
      const timeB = new Date(b.completedAt || b.updatedAt).getTime()
      return timeB - timeA
    })

    for (const match of sortedMatches) {
      let candidateSquad: SquadPlayer[] | null = null

      if (match.teamOne && match.teamOne.trim().toLowerCase() === target && match.homePlayers?.length) {
        candidateSquad = match.homePlayers
      } else if (match.teamTwo && match.teamTwo.trim().toLowerCase() === target && match.visitorPlayers?.length) {
        candidateSquad = match.visitorPlayers
      }

      if (candidateSquad && candidateSquad.length > 0) {
        const cleaned = filterAndDeduplicateSquad(candidateSquad, opposingSet, teamLimit)
        if (cleaned.length > 0) {
          const omittedCount = candidateSquad.length - cleaned.length
          let message = `Loaded ${cleaned.length} player${cleaned.length === 1 ? '' : 's'} from previous match.`
          if (omittedCount > 0) {
            message += ` (${omittedCount} omitted due to limit or opposing team conflict)`
          }
          return {
            players: cleaned,
            source: 'match',
            message,
          }
        }
      }
    }
  } catch (err) {
    console.warn('Failed to query matchRepository for previous squad:', err)
  }

  // 2. Fallback: check teamRepository and playerRepository
  try {
    const team = await teamRepository.getTeamByName(trimmed)
    if (team) {
      const players = await playerRepository.listPlayers({ teamId: team.id })
      if (players.length > 0) {
        const mapped: SquadPlayer[] = players.map((p) => ({
          name: p.name,
          hand: p.hand || 'Right',
        }))
        const cleaned = filterAndDeduplicateSquad(mapped, opposingSet, teamLimit)
        if (cleaned.length > 0) {
          return {
            players: cleaned,
            source: 'team',
            message: `Loaded ${cleaned.length} player${cleaned.length === 1 ? '' : 's'} from team roster.`,
          }
        }
      }
    }
  } catch (err) {
    console.warn('Failed to query team/player repositories for previous squad:', err)
  }

  return {
    players: [],
    source: 'none',
    message: `No previous squad found for "${trimmed}".`,
  }
}

/**
 * Persists the given squad players to team and player repositories.
 * Used upon match completion or roster confirmation.
 */
export async function persistSquadToRepositories(
  teamName: string,
  players: SquadPlayer[],
  ownerUid: string | null = null
): Promise<void> {
  const trimmed = teamName.trim()
  if (!trimmed || players.length === 0) return

  try {
    let team = await teamRepository.getTeamByName(trimmed)
    const now = new Date().toISOString()

    if (!team) {
      team = {
        schemaVersion: 1,
        id: generateUUID(),
        name: trimmed,
        ownerUid,
        createdAt: now,
        updatedAt: now,
        playerIds: [],
      }
    }

    const playerIds: string[] = [...(team.playerIds || [])]

    for (const player of players) {
      const pName = normalizeName(player.name)
      if (!pName) continue

      let playerRec = await playerRepository.getPlayerByName(pName)
      if (!playerRec) {
        const pId = generateUUID()
        playerRec = {
          schemaVersion: 1,
          id: pId,
          name: pName,
          hand: player.hand || 'Right',
          teamId: team.id,
          ownerUid,
          createdAt: now,
          updatedAt: now,
        }
        await playerRepository.savePlayer(playerRec)
        if (!playerIds.includes(pId)) playerIds.push(pId)
      } else {
        // Update hand if different or assign teamId if missing
        if (playerRec.hand !== player.hand || !playerRec.teamId) {
          await playerRepository.savePlayer({
            ...playerRec,
            hand: player.hand || playerRec.hand,
            teamId: playerRec.teamId || team.id,
            updatedAt: now,
          })
        }
        if (!playerIds.includes(playerRec.id)) playerIds.push(playerRec.id)
      }
    }

    team.playerIds = playerIds
    team.updatedAt = now
    await teamRepository.saveTeam(team)
  } catch (err) {
    console.warn(`Failed to persist squad to repositories for ${teamName}:`, err)
  }
}

/**
 * Cleans, validates, dedupes, and filters squad players.
 */
function filterAndDeduplicateSquad(
  squad: SquadPlayer[],
  opposingSet: Set<string>,
  teamLimit: number
): SquadPlayer[] {
  const result: SquadPlayer[] = []
  const seenInCurrent = new Set<string>()

  for (const player of squad) {
    if (!player || !player.name) continue
    const norm = normalizeName(player.name)
    if (!norm) continue
    const lower = norm.toLowerCase()

    // Skip if already in this squad or in opposing squad
    if (seenInCurrent.has(lower) || opposingSet.has(lower)) continue

    seenInCurrent.add(lower)
    result.push({
      name: norm,
      hand: player.hand === 'Left' ? 'Left' : 'Right',
    })

    if (result.length >= teamLimit) break
  }

  return result
}
