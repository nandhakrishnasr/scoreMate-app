import type { CompletedMatch, PlayerStat } from '../types/match'
import { countMaidens } from './exportService'

export type TeamStat = {
  name: string
  played: number
  wins: number
  losses: number
  draws: number
}

export type KdmDatabaseExport = {
  Players?: Array<{ documentId: string; name: string; isDeleted?: number }>
  Teams?: Array<{ documentId: string; name: string; isDeleted?: number }>
  Matches?: Array<{
    documentId: string
    teamOneId: string
    teamTwoId: string
    whoWon?: string | null
    isTie?: number
    isFinished?: number
    isDeleted?: number
  }>
  BattingStats?: Array<{
    playerId: string
    matchId?: string
    runs?: number | string
    ballsFaced?: number | string
    noOfFours?: number | string
    noOfSixes?: number | string
    noOfDots?: number | string
    isOut?: boolean | number
  }>
  BowlingStats?: Array<{
    playerId: string
    matchId?: string
    balls?: number | string
    maidens?: number | string
    wickets?: number | string
    runs?: number | string
    wides?: number | string
    noBalls?: number | string
    noOfDots?: number | string
  }>
  FieldingStats?: Array<{
    playerId: string
    matchId?: string
    catches?: string
    stumpings?: string
    runOuts?: string
  }>
}

export function normalizePlayerName(name: string): string {
  return (name ?? '')
    .normalize('NFKC')
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function canonicalPlayerName(name: string): string {
  const normalized = normalizePlayerName(name)
  if (!normalized) return ''
  if (normalized.includes('nand')) return 'Nandhu'
  return name.trim().replace(/\s+/g, ' ')
}

export function countStatItems(value?: string | number | null): number {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const text = String(value).trim()
  if (!text) return 0
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text)
  return text
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean).length
}

export function getInitials(name: string): string {
  return (
    name
      .split(/\s|-/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'PL'
  )
}


export function loadTeamStatsFromDatabase(): Promise<TeamStat[]> {
  return fetch('/full_database_export.json')
    .then((response) => {
      if (!response.ok) throw new Error(`Database export not available: ${response.status}`)
      return response.json() as Promise<KdmDatabaseExport>
    })
    .then((database) => {
      const teamNames = new Map<string, string>()
      for (const team of database.Teams ?? []) {
        if ((team.isDeleted ?? 0) === 0) teamNames.set(team.documentId, team.name)
      }

      const stats = new Map<string, TeamStat>()
      for (const team of database.Teams ?? []) {
        if ((team.isDeleted ?? 0) !== 0) continue
        stats.set(team.documentId, { name: team.name, played: 0, wins: 0, losses: 0, draws: 0 })
      }

      for (const match of database.Matches ?? []) {
        if ((match.isDeleted ?? 0) !== 0) continue
        const teamOneId = match.teamOneId
        const teamTwoId = match.teamTwoId
        const teamOneName = teamNames.get(teamOneId) ?? teamOneId
        const teamTwoName = teamNames.get(teamTwoId) ?? teamTwoId
        const teamOne = stats.get(teamOneId) ?? { name: teamOneName, played: 0, wins: 0, losses: 0, draws: 0 }
        const teamTwo = stats.get(teamTwoId) ?? { name: teamTwoName, played: 0, wins: 0, losses: 0, draws: 0 }

        teamOne.played += 1
        teamTwo.played += 1
        stats.set(teamOneId, teamOne)
        stats.set(teamTwoId, teamTwo)

        if (match.isTie === 1 || !match.whoWon || !String(match.whoWon).trim()) {
          teamOne.draws += 1
          teamTwo.draws += 1
          continue
        }

        if (match.whoWon === teamOneName || match.whoWon === teamOneId) {
          teamOne.wins += 1
          teamTwo.losses += 1
        } else if (match.whoWon === teamTwoName || match.whoWon === teamTwoId) {
          teamTwo.wins += 1
          teamOne.losses += 1
        } else {
          teamOne.draws += 1
          teamTwo.draws += 1
        }
      }

      return Array.from(stats.values())
        .filter((team) => team.played > 0)
        .sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name))
    })
    .catch(() => [])
}

export function loadPlayerStatsFromDatabase(): Promise<PlayerStat[]> {
  return fetch('/full_database_export.json')
    .then((response) => {
      if (!response.ok) throw new Error(`Database export not available: ${response.status}`)
      return response.json() as Promise<KdmDatabaseExport>
    })
    .then((database) => {
      const playersById = new Map<string, string>()
      for (const player of database.Players ?? []) {
        if ((player.isDeleted ?? 0) !== 0) continue
        playersById.set(player.documentId, canonicalPlayerName(player.name))
      }

      const battingByPlayer = new Map<
        string,
        {
          runs: number
          balls: number
          fours: number
          sixes: number
          outs: number
          notOuts: number
          best: number
          thirties: number
          fifties: number
          hundreds: number
          ducks: number
          dotBalls: number
          matches: Set<string>
        }
      >()
      for (const item of database.BattingStats ?? []) {
        if ((item as { isDeleted?: number }).isDeleted === 1) continue
        const playerName = playersById.get(item.playerId) ?? canonicalPlayerName(item.playerId)
        if (!playerName) continue
        const record = battingByPlayer.get(playerName) ?? {
          runs: 0,
          balls: 0,
          fours: 0,
          sixes: 0,
          outs: 0,
          notOuts: 0,
          best: 0,
          thirties: 0,
          fifties: 0,
          hundreds: 0,
          ducks: 0,
          dotBalls: 0,
          matches: new Set<string>(),
        }
        const runs = Number(item.runs ?? 0)
        const balls = Number(item.ballsFaced ?? 0)
        const isOut = Number(item.isOut ?? 0) === 1
        record.runs += runs
        record.balls += balls
        record.fours += Number(item.noOfFours ?? 0)
        record.sixes += Number(item.noOfSixes ?? 0)
        record.dotBalls += Number(item.noOfDots ?? 0)
        record.best = Math.max(record.best, runs)
        if (isOut) record.outs += 1
        else record.notOuts += 1
        if (item.matchId) record.matches.add(item.matchId)
        if (runs >= 100) record.hundreds += 1
        else if (runs >= 50) record.fifties += 1
        else if (runs >= 30) record.thirties += 1
        if (runs === 0 && isOut) record.ducks += 1
        battingByPlayer.set(playerName, record)
      }

      const bowlingByPlayer = new Map<
        string,
        {
          wickets: number
          balls: number
          maidens: number
          runs: number
          wides: number
          noBalls: number
          dotBalls: number
          matches: Set<string>
        }
      >()
      for (const item of database.BowlingStats ?? []) {
        if ((item as { isDeleted?: number }).isDeleted === 1) continue
        const playerName = playersById.get(item.playerId) ?? canonicalPlayerName(item.playerId)
        if (!playerName) continue
        const record = bowlingByPlayer.get(playerName) ?? {
          wickets: 0,
          balls: 0,
          maidens: 0,
          runs: 0,
          wides: 0,
          noBalls: 0,
          dotBalls: 0,
          matches: new Set<string>(),
        }
        record.wickets += Number.isFinite(Number(item.wickets))
          ? Number(item.wickets)
          : countStatItems(item.wickets)
        record.balls += Number(item.balls ?? 0)
        record.maidens += Number(item.maidens ?? 0)
        record.runs += Number(item.runs ?? 0)
        record.wides += Number(item.wides ?? 0)
        record.noBalls += Number(item.noBalls ?? 0)
        record.dotBalls += Number(item.noOfDots ?? 0)
        if (item.matchId) record.matches.add(item.matchId)
        bowlingByPlayer.set(playerName, record)
      }

      const fieldingByPlayer = new Map<
        string,
        {
          catches: number
          runOuts: number
          stumpings: number
          matches: Set<string>
        }
      >()
      for (const item of database.FieldingStats ?? []) {
        if ((item as { isDeleted?: number }).isDeleted === 1) continue
        const playerName = playersById.get(item.playerId) ?? canonicalPlayerName(item.playerId)
        if (!playerName) continue
        const record = fieldingByPlayer.get(playerName) ?? {
          catches: 0,
          runOuts: 0,
          stumpings: 0,
          matches: new Set<string>(),
        }
        record.catches += countStatItems(item.catches)
        record.runOuts += countStatItems(item.runOuts)
        record.stumpings += countStatItems(item.stumpings)
        if (item.matchId) record.matches.add(item.matchId)
        fieldingByPlayer.set(playerName, record)
      }

      const merged = new Map<string, PlayerStat>()
      for (const player of database.Players ?? []) {
        if ((player.isDeleted ?? 0) !== 0) continue
        const key = canonicalPlayerName(player.name)
        if (!key) continue
        const batting = battingByPlayer.get(key) ?? {
          runs: 0,
          balls: 0,
          fours: 0,
          sixes: 0,
          outs: 0,
          notOuts: 0,
          best: 0,
          thirties: 0,
          fifties: 0,
          hundreds: 0,
          ducks: 0,
          dotBalls: 0,
          matches: new Set<string>(),
        }
        const bowling = bowlingByPlayer.get(key) ?? {
          wickets: 0,
          balls: 0,
          maidens: 0,
          runs: 0,
          wides: 0,
          noBalls: 0,
          dotBalls: 0,
          matches: new Set<string>(),
        }
        const fielding = fieldingByPlayer.get(key) ?? {
          catches: 0,
          runOuts: 0,
          stumpings: 0,
          matches: new Set<string>(),
        }
        const matches = new Set<string>([
          ...batting.matches,
          ...bowling.matches,
          ...fielding.matches,
        ])
        const overs = bowling.balls / 6
        const record: PlayerStat = {
          name: key,
          runs: batting.runs,
          balls: batting.balls,
          bowlingBalls: bowling.balls,
          fours: batting.fours,
          sixes: batting.sixes,
          outs: batting.outs,
          notOuts: batting.notOuts,
          wickets: bowling.wickets,
          catches: fielding.catches,
          runOuts: fielding.runOuts,
          stumpings: fielding.stumpings,
          matches: matches.size,
          innings: batting.outs + batting.notOuts,
          best: batting.best,
          average: batting.outs > 0 ? batting.runs / batting.outs : batting.runs,
          strikeRate: batting.balls > 0 ? (batting.runs / batting.balls) * 100 : 0,
          fifties: batting.fifties,
          hundreds: batting.hundreds,
          ducks: batting.ducks,
          overs,
          maidens: bowling.maidens,
          wides: bowling.wides,
          noBalls: bowling.noBalls,
          dotBalls: bowling.dotBalls,
          economy: overs > 0 ? bowling.runs / overs : 0,
          runsConceded: bowling.runs,
        }
        merged.set(key, record)
      }

      return Array.from(merged.values()).sort(
        (a, b) => b.runs - a.runs || b.wickets - a.wickets || a.name.localeCompare(b.name)
      )
    })
    .catch(() => [])
}

export function aggregateTeamStats(matches: CompletedMatch[]): TeamStat[] {
  const records = new Map<string, TeamStat>()
  for (const match of matches) {
    const teams = [match.teamOne, match.teamTwo]
    for (const team of teams) {
      const existing = records.get(team) ?? { name: team, played: 0, wins: 0, losses: 0, draws: 0 }
      existing.played += 1
      if (match.result.winner === 'Match Drawn') existing.draws += 1
      else if (match.result.winner === team) existing.wins += 1
      else existing.losses += 1
      records.set(team, existing)
    }
  }
  return Array.from(records.values()).sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name))
}

export function createEmptyPlayerStat(recordName: string): PlayerStat {
  return {
    name: recordName,
    runs: 0,
    balls: 0,
    bowlingBalls: 0,
    fours: 0,
    sixes: 0,
    outs: 0,
    notOuts: 0,
    wickets: 0,
    catches: 0,
    runOuts: 0,
    stumpings: 0,
    matches: 0,
    innings: 0,
    best: 0,
    average: 0,
    strikeRate: 0,
    fifties: 0,
    hundreds: 0,
    ducks: 0,
    overs: 0,
    maidens: 0,
    wides: 0,
    noBalls: 0,
    dotBalls: 0,
    economy: 0,
    runsConceded: 0,
  }
}

export function aggregatePlayerStats(matches: CompletedMatch[]): PlayerStat[] {
  const records = new Map<string, PlayerStat>()

  for (const match of matches) {
    const seenThisMatch = new Set<string>()
    for (const innings of [match.firstInningsScore, match.secondInningsScore]) {
      if (!innings) continue
      for (const batter of innings.battingStats) {
        const record = records.get(batter.name) ?? createEmptyPlayerStat(batter.name)
        record.runs += batter.runs
        record.balls += batter.balls
        record.fours += batter.fours
        record.sixes += batter.sixes
        record.innings += 1
        if (batter.out) record.outs += 1
        else record.notOuts += 1
        record.best = Math.max(record.best, batter.runs)
        if (batter.runs >= 50 && batter.runs < 100) record.fifties += 1
        if (batter.runs >= 100) record.hundreds += 1
        if (batter.runs === 0 && batter.out) record.ducks += 1
        records.set(batter.name, record)
        seenThisMatch.add(batter.name)
      }
      for (const bowler of innings.bowlerStats) {
        const bowlerName = bowler.name.trim()
        if (!bowlerName) continue
        const record = records.get(bowlerName) ?? createEmptyPlayerStat(bowlerName)
        record.wickets += bowler.wickets ?? 0
        record.bowlingBalls += bowler.balls ?? 0
        record.runsConceded += bowler.runs ?? 0
        record.maidens += (bowler.maidens !== undefined ? bowler.maidens : countMaidens(innings, bowler.name))
        record.wides += bowler.wides ?? 0
        record.noBalls += bowler.noBalls ?? 0
        record.dotBalls += bowler.dotBalls ?? 0
        records.set(bowlerName, record)
        seenThisMatch.add(bowlerName)
      }
    }

    for (const name of seenThisMatch) {
      const record = records.get(name)
      if (record) record.matches += 1
    }

    for (const innings of [match.firstInningsScore, match.secondInningsScore]) {
      if (!innings) continue
      const totalBowlerWickets = innings.bowlerStats.reduce((sum, b) => sum + (b.wickets ?? 0), 0)
      if (totalBowlerWickets === 0) {
        for (const batter of innings.battingStats) {
          if (!batter.out || !batter.dismissal) continue
          const dismissal = batter.dismissal.trim()
          if (/^run\s+out/i.test(dismissal)) continue
          const bowlerMatch = dismissal.match(/\bb\s+([A-Za-z0-9\s._'-]+)$/i)
          if (bowlerMatch) {
            const bowlerName = bowlerMatch[1].trim()
            if (bowlerName) {
              const record = records.get(bowlerName) ?? createEmptyPlayerStat(bowlerName)
              record.wickets += 1
              records.set(bowlerName, record)
            }
          }
        }
      }
      for (const batter of innings.battingStats) {
        if (!batter.out || !batter.dismissal) continue
        const dismissal = batter.dismissal.trim()
        const caughtAndBowled = dismissal.match(/^c\s+&\s+b\s+(.+)$/i)
        const caughtByFielder = dismissal.match(/^c\s+(.+?)\s+b\s+(.+)$/i)
        const caughtOnly = dismissal.match(/^c\s+([^&].+?)$/i)
        const stumped = dismissal.match(/^st\s+(.+?)(?:\s+b\s+(.+))?$/i)
        const runOut = dismissal.match(/^run\s+out(?:\s*\((.+?)\))?/i)
        if (caughtAndBowled) {
          const bowler = caughtAndBowled[1].trim()
          const record = records.get(bowler) ?? createEmptyPlayerStat(bowler)
          record.catches += 1
          records.set(bowler, record)
        } else if (caughtByFielder) {
          const fielder = caughtByFielder[1].trim()
          const record = records.get(fielder) ?? createEmptyPlayerStat(fielder)
          record.catches += 1
          records.set(fielder, record)
        } else if (caughtOnly) {
          const fielder = caughtOnly[1].trim()
          const record = records.get(fielder) ?? createEmptyPlayerStat(fielder)
          record.catches += 1
          records.set(fielder, record)
        } else if (stumped) {
          const keeper = stumped[1].trim()
          const record = records.get(keeper) ?? createEmptyPlayerStat(keeper)
          record.stumpings += 1
          records.set(keeper, record)
        } else if (runOut) {
          if (runOut[1]) {
            const helpers = runOut[1].split(/[/,/]/)
            for (const helper of helpers) {
              const trimmed = helper.trim()
              if (!trimmed) continue
              const record = records.get(trimmed) ?? createEmptyPlayerStat(trimmed)
              record.runOuts += 1
              records.set(trimmed, record)
            }
          }
        }
      }
    }
  }

  return Array.from(records.values())
    .map((record) => ({
      ...record,
      average: record.outs > 0 ? record.runs / record.outs : record.runs,
      strikeRate: record.balls > 0 ? (record.runs / record.balls) * 100 : 0,
      overs: record.bowlingBalls > 0 ? record.bowlingBalls / 6 : 0,
      economy: record.bowlingBalls > 0 ? record.runsConceded / (record.bowlingBalls / 6) : 0,
    }))
    .sort((a, b) => b.runs - a.runs || b.wickets - a.wickets || a.name.localeCompare(b.name))
}
