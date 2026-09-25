import { matchRepository } from './repositories/matchRepository.ts'
import { teamRepository } from './repositories/teamRepository.ts'
import { playerRepository } from './repositories/playerRepository.ts'
import { generateUUID } from '../utils/uuid.ts'
import type { PersistedMatchRecord, PersistedTeamRecord, PersistedPlayerRecord } from '../types/database.ts'
import type { CompletedMatch, SavedAppState } from '../types/match.ts'
import {
  ACTIVE_MATCH_KEY,
  COMPLETED_MATCHES_KEY,
  TEAM_IMAGES_KEY,
  PLAYER_IMAGES_KEY,
} from './storageService.ts'

export const MIGRATION_FLAG_KEY = 'scoremate-localstorage-migrated-v1'

export interface MigrationResult {
  alreadyMigrated: boolean
  matchesMigrated: number
  activeMigrated: boolean
  teamsMigrated: number
  playersMigrated: number
  errors: string[]
}

export async function migrateLocalStorageToIndexedDB(
  ownerUid: string | null = null,
  force = false
): Promise<MigrationResult> {
  const result: MigrationResult = {
    alreadyMigrated: false,
    matchesMigrated: 0,
    activeMigrated: false,
    teamsMigrated: 0,
    playersMigrated: 0,
    errors: [],
  }

  if (typeof localStorage === 'undefined') {
    return result
  }

  if (!force && localStorage.getItem(MIGRATION_FLAG_KEY) === 'true') {
    result.alreadyMigrated = true
    return result
  }

  // 1. Migrate Completed Matches
  try {
    const rawMatches = localStorage.getItem(COMPLETED_MATCHES_KEY)
    if (rawMatches) {
      const parsed: unknown = JSON.parse(rawMatches)
      if (Array.isArray(parsed)) {
        for (const item of parsed as CompletedMatch[]) {
          if (!item) continue
          const matchId = String(item.id || generateUUID())
          const existing = await matchRepository.getMatch(matchId)
          if (!existing) {
            const record: PersistedMatchRecord = {
              schemaVersion: 1,
              matchId,
              status: 'completed',
              ownerUid,
              createdAt: item.savedAt || new Date().toISOString(),
              updatedAt: item.savedAt || new Date().toISOString(),
              completedAt: item.savedAt || new Date().toISOString(),
              teamOne: item.teamOne || '',
              teamTwo: item.teamTwo || '',
              overs: '8',
              teamSize: '11',
              lastManBatting: false,
              venue: '',
              competition: '',
              tossCaller: null,
              tossCall: null,
              tossWinner: null,
              decision: 'bat',
              homePlayers: [],
              visitorPlayers: [],
              openingStriker: '',
              openingNonStriker: '',
              openingBowler: '',
              score: item.secondInningsScore,
              history: [],
              inningsNumber: 2,
              firstBattingHome: item.firstBattingHome ?? true,
              firstInningsScore: item.firstInningsScore,
              matchResult: item.result ?? { winner: '', margin: '' },
              battingRoster: [],
              bowlingRoster: [],
              playerOfMatch: item.playerOfMatch,
            }
            await matchRepository.saveMatch(record)
            result.matchesMigrated++
          } else {
            const updated: PersistedMatchRecord = {
              ...existing,
              score: item.secondInningsScore ?? existing.score,
              firstInningsScore: item.firstInningsScore ?? existing.firstInningsScore,
              matchResult: item.result ?? existing.matchResult,
              teamOne: item.teamOne || existing.teamOne,
              teamTwo: item.teamTwo || existing.teamTwo,
              updatedAt: item.savedAt || existing.updatedAt,
            }
            await matchRepository.saveMatch(updated)
          }
        }
      }
    }
  } catch (err) {
    result.errors.push(`Completed matches migration error: ${String(err)}`)
  }

  // 2. Migrate Active In-Progress Match
  try {
    const rawActive = localStorage.getItem(ACTIVE_MATCH_KEY)
    if (rawActive) {
      const state = JSON.parse(rawActive) as SavedAppState
      if (state && state.teamOne && state.teamTwo) {
        const existingActive = await matchRepository.getActiveMatch()
        if (!existingActive) {
          const matchId = generateUUID()
          const record: PersistedMatchRecord = {
            schemaVersion: 1,
            matchId,
            status: 'in_progress',
            ownerUid,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            teamOne: state.teamOne,
            teamTwo: state.teamTwo,
            overs: state.overs,
            teamSize: state.teamSize,
            lastManBatting: state.lastManBatting,
            venue: state.venue,
            competition: state.competition,
            tossCaller: state.tossCaller,
            tossCall: state.tossCall,
            tossWinner: state.tossWinner,
            decision: state.decision,
            homePlayers: state.homePlayers || [],
            visitorPlayers: state.visitorPlayers || [],
            openingStriker: state.openingStriker || '',
            openingNonStriker: state.openingNonStriker || '',
            openingBowler: state.openingBowler || '',
            score: state.score,
            history: state.history || [],
            inningsNumber: state.inningsNumber || 1,
            firstBattingHome: state.firstBattingHome ?? true,
            firstInningsScore: state.firstInningsScore || null,
            matchResult: state.matchResult || null,
            battingRoster: state.battingRoster || [],
            bowlingRoster: state.bowlingRoster || [],
            screen: state.screen,
          }
          await matchRepository.saveMatch(record)
          result.activeMigrated = true
        }
      }
    }
  } catch (err) {
    result.errors.push(`Active match migration error: ${String(err)}`)
  }

  // 3. Migrate Team Images
  try {
    const rawTeamImages = localStorage.getItem(TEAM_IMAGES_KEY)
    if (rawTeamImages) {
      const imageMap = JSON.parse(rawTeamImages) as Record<string, string>
      for (const [teamName, imageUri] of Object.entries(imageMap)) {
        if (!teamName || !imageUri) continue
        const existing = await teamRepository.getTeamByName(teamName)
        if (!existing) {
          const teamRecord: PersistedTeamRecord = {
            schemaVersion: 1,
            id: generateUUID(),
            name: teamName,
            image: imageUri,
            ownerUid,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          await teamRepository.saveTeam(teamRecord)
          result.teamsMigrated++
        }
      }
    }
  } catch (err) {
    result.errors.push(`Team images migration error: ${String(err)}`)
  }

  // 4. Migrate Player Images
  try {
    const rawPlayerImages = localStorage.getItem(PLAYER_IMAGES_KEY)
    if (rawPlayerImages) {
      const imageMap = JSON.parse(rawPlayerImages) as Record<string, string>
      for (const [playerName, imageUri] of Object.entries(imageMap)) {
        if (!playerName || !imageUri) continue
        const existing = await playerRepository.getPlayerByName(playerName)
        if (!existing) {
          const playerRecord: PersistedPlayerRecord = {
            schemaVersion: 1,
            id: generateUUID(),
            name: playerName,
            hand: 'Right',
            image: imageUri,
            ownerUid,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          await playerRepository.savePlayer(playerRecord)
          result.playersMigrated++
        }
      }
    }
  } catch (err) {
    result.errors.push(`Player images migration error: ${String(err)}`)
  }

  // Only mark migration complete if no critical exceptions were encountered
  if (result.errors.length === 0) {
    localStorage.setItem(MIGRATION_FLAG_KEY, 'true')
    // Safely retire obsolete prototype mock auth key
    localStorage.removeItem('gully-scorer-auth')
  }

  return result
}
