import type { CompletedMatch, PlayerStat } from '../types/match'
import { countMaidens } from './exportService'

export type TeamStat = {
  name: string
  played: number
  wins: number
  losses: number
  draws: number
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
  return Promise.resolve([])
}

export function loadPlayerStatsFromDatabase(): Promise<PlayerStat[]> {
  return Promise.resolve([])
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
