import type { CompletedMatch, PlayerStat } from '../types/match.ts'

export interface OpponentRecord {
  opponentTeam: string
  matches: number
  innings: number
  runs: number
  balls: number
  best: number
  battingAvg: number
  strikeRate: number
  fours: number
  sixes: number
  wickets: number
  bowlingBalls: number
  runsConceded: number
  bowlingAvg: number
  economy: number
}

export interface PlayerMatchLogItem {
  matchId: string
  date: string
  matchTitle: string
  opponent: string
  winner: string
  batting: {
    runs: number
    balls: number
    fours: number
    sixes: number
    notOut: boolean
  } | null
  bowling: {
    overs: string
    runs: number
    wickets: number
    maidens: number
    economy: string
  } | null
}

export interface TeamH2HSummary {
  teamA: string
  teamB: string
  totalMatches: number
  teamAWins: number
  teamBWins: number
  draws: number
  teamAWinPct: number
  teamBWinPct: number
  teamAHighest: number
  teamBHighest: number
  recentForm: ('W' | 'L' | 'D')[] // From perspective of teamA
  matches: CompletedMatch[]
}

export interface CareerMilestoneBadge {
  id: string
  title: string
  desc: string
  icon: string
  earned: boolean
  progress?: string
}

/**
 * Returns which team a player was on in a specific match.
 */
export function getPlayerTeamInMatch(playerName: string, match: CompletedMatch): string {
  if (match.homePlayers?.some((p) => p.name === playerName)) return match.teamOne
  if (match.visitorPlayers?.some((p) => p.name === playerName)) return match.teamTwo

  const firstBattingTeam = match.firstBattingHome !== false ? match.teamOne : match.teamTwo
  const secondBattingTeam = match.firstBattingHome !== false ? match.teamTwo : match.teamOne

  if (match.firstInningsScore?.battingStats.some((b) => b.name === playerName)) {
    return firstBattingTeam
  }
  if (match.secondInningsScore?.battingStats.some((b) => b.name === playerName)) {
    return secondBattingTeam
  }
  if (match.firstInningsScore?.bowlerStats.some((bw) => bw.name === playerName)) {
    return secondBattingTeam
  }
  if (match.secondInningsScore?.bowlerStats.some((bw) => bw.name === playerName)) {
    return firstBattingTeam
  }

  return ''
}

/**
 * Computes head-to-head records of a player broken down by opposing teams.
 */
export function getPlayerHeadToHeadByTeam(
  playerName: string,
  matches: CompletedMatch[],
): OpponentRecord[] {
  const map = new Map<string, OpponentRecord>()

  for (const m of matches) {
    const playerTeam = getPlayerTeamInMatch(playerName, m)
    if (!playerTeam) continue

    const opponent = playerTeam === m.teamOne ? m.teamTwo : m.teamOne
    if (!opponent) continue

    const rec: OpponentRecord = map.get(opponent) ?? {
      opponentTeam: opponent,
      matches: 0,
      innings: 0,
      runs: 0,
      balls: 0,
      best: 0,
      battingAvg: 0,
      strikeRate: 0,
      fours: 0,
      sixes: 0,
      wickets: 0,
      bowlingBalls: 0,
      runsConceded: 0,
      bowlingAvg: 0,
      economy: 0,
    }

    rec.matches += 1

    // Extract batting stats
    for (const inn of [m.firstInningsScore, m.secondInningsScore]) {
      if (!inn) continue
      const bStat = inn.battingStats.find((b) => b.name === playerName)
      if (bStat) {
        rec.innings += 1
        rec.runs += bStat.runs
        rec.balls += bStat.balls
        rec.fours += bStat.fours
        rec.sixes += bStat.sixes
        rec.best = Math.max(rec.best, bStat.runs)
      }

      // Extract bowling stats
      const bwStat = inn.bowlerStats.find((bw) => bw.name === playerName)
      if (bwStat) {
        rec.wickets += bwStat.wickets ?? 0
        rec.bowlingBalls += bwStat.balls ?? 0
        rec.runsConceded += bwStat.runs ?? 0
      }
    }

    map.set(opponent, rec)
  }

  return Array.from(map.values())
    .map((r) => {
      const bAvg = r.innings > 0 ? r.runs / r.innings : 0
      const sr = r.balls > 0 ? (r.runs / r.balls) * 100 : 0
      const overs = r.bowlingBalls / 6
      const bwAvg = r.wickets > 0 ? r.runsConceded / r.wickets : 0
      const econ = overs > 0 ? r.runsConceded / overs : 0

      return {
        ...r,
        battingAvg: Math.round(bAvg * 10) / 10,
        strikeRate: Math.round(sr * 10) / 10,
        bowlingAvg: Math.round(bwAvg * 10) / 10,
        economy: Math.round(econ * 10) / 10,
      }
    })
    .sort((a, b) => b.runs - a.runs || b.matches - a.matches)
}

/**
 * Returns chronological match log items for a specific player.
 */
export function getPlayerRecentMatchLog(
  playerName: string,
  matches: CompletedMatch[],
  limit = 10,
): PlayerMatchLogItem[] {
  const logs: PlayerMatchLogItem[] = []

  const sorted = [...matches].sort((a, b) => {
    const timeA = Date.parse(a.savedAt)
    const timeB = Date.parse(b.savedAt)
    return (Number.isNaN(timeB) ? 0 : timeB) - (Number.isNaN(timeA) ? 0 : timeA)
  })

  for (const m of sorted) {
    const playerTeam = getPlayerTeamInMatch(playerName, m)
    if (!playerTeam) continue

    const opponent = playerTeam === m.teamOne ? m.teamTwo : m.teamOne
    let battingInfo: PlayerMatchLogItem['batting'] = null
    let bowlingInfo: PlayerMatchLogItem['bowling'] = null

    for (const inn of [m.firstInningsScore, m.secondInningsScore]) {
      if (!inn) continue
      const bStat = inn.battingStats.find((b) => b.name === playerName)
      if (bStat) {
        battingInfo = {
          runs: bStat.runs,
          balls: bStat.balls,
          fours: bStat.fours,
          sixes: bStat.sixes,
          notOut: !bStat.out,
        }
      }

      const bwStat = inn.bowlerStats.find((bw) => bw.name === playerName)
      if (bwStat) {
        const ovs = `${Math.floor((bwStat.balls ?? 0) / 6)}.${(bwStat.balls ?? 0) % 6}`
        const econ = (bwStat.balls ?? 0) > 0 ? ((bwStat.runs ?? 0) / ((bwStat.balls ?? 0) / 6)).toFixed(1) : '0.0'
        bowlingInfo = {
          overs: ovs,
          runs: bwStat.runs ?? 0,
          wickets: bwStat.wickets ?? 0,
          maidens: bwStat.maidens ?? 0,
          economy: econ,
        }
      }
    }

    logs.push({
      matchId: m.id,
      date: new Date(m.savedAt).toLocaleDateString(),
      matchTitle: `${m.teamOne} vs ${m.teamTwo}`,
      opponent,
      winner: m.result.winner,
      batting: battingInfo,
      bowling: bowlingInfo,
    })

    if (logs.length >= limit) break
  }

  return logs
}

/**
 * Computes deep head-to-head comparison metrics between two teams.
 */
export function getTeamHeadToHeadComparison(
  teamA: string,
  teamB: string,
  matches: CompletedMatch[],
): TeamH2HSummary {
  const filtered = matches.filter(
    (m) =>
      (m.teamOne === teamA && m.teamTwo === teamB) ||
      (m.teamOne === teamB && m.teamTwo === teamA),
  )

  const sorted = [...filtered].sort((a, b) => {
    const timeA = Date.parse(a.savedAt)
    const timeB = Date.parse(b.savedAt)
    return (Number.isNaN(timeB) ? 0 : timeB) - (Number.isNaN(timeA) ? 0 : timeA)
  })

  let teamAWins = 0
  let teamBWins = 0
  let draws = 0
  let teamAHighest = 0
  let teamBHighest = 0
  const recentForm: ('W' | 'L' | 'D')[] = []

  for (const m of sorted) {
    if (m.result.winner === teamA) {
      teamAWins++
      recentForm.push('W')
    } else if (m.result.winner === teamB) {
      teamBWins++
      recentForm.push('L')
    } else {
      draws++
      recentForm.push('D')
    }

    // Determine actual team score based on firstBattingHome
    const teamOneScore = (m.firstBattingHome !== false ? m.firstInningsScore?.runs : m.secondInningsScore?.runs) ?? 0
    const teamTwoScore = (m.firstBattingHome !== false ? m.secondInningsScore?.runs : m.firstInningsScore?.runs) ?? 0

    const aScore = m.teamOne === teamA ? teamOneScore : teamTwoScore
    const bScore = m.teamOne === teamB ? teamOneScore : teamTwoScore

    if (aScore > teamAHighest) teamAHighest = aScore
    if (bScore > teamBHighest) teamBHighest = bScore
  }

  const total = filtered.length || 1
  const teamAWinPct = Math.round((teamAWins / total) * 100)
  const teamBWinPct = Math.round((teamBWins / total) * 100)

  return {
    teamA,
    teamB,
    totalMatches: filtered.length,
    teamAWins,
    teamBWins,
    draws,
    teamAWinPct,
    teamBWinPct,
    teamAHighest,
    teamBHighest,
    recentForm: recentForm.slice(0, 5),
    matches: sorted,
  }
}

/**
 * Calculates career milestone badges based on player stats.
 */
export function getPlayerMilestoneBadges(stats: PlayerStat): CareerMilestoneBadge[] {
  const badges: CareerMilestoneBadge[] = [
    {
      id: 'centurion',
      title: 'Centurion',
      desc: 'Scored 100+ in a match',
      icon: '💯',
      earned: (stats.hundreds ?? 0) > 0,
      progress: `${stats.hundreds ?? 0} hundreds`,
    },
    {
      id: 'half_century',
      title: 'Fifty Club',
      desc: 'Scored 50+ runs',
      icon: '🎖️',
      earned: (stats.fifties ?? 0) > 0 || (stats.hundreds ?? 0) > 0,
      progress: `${(stats.fifties ?? 0) + (stats.hundreds ?? 0)} fifties`,
    },
    {
      id: 'run_machine',
      title: 'Run Machine',
      desc: '100+ career runs scored',
      icon: '🏏',
      earned: stats.runs >= 100,
      progress: `${stats.runs}/100 runs`,
    },
    {
      id: 'strike_master',
      title: 'Strike Master',
      desc: 'Strike Rate over 135 (min 20 balls)',
      icon: '⚡',
      earned: stats.balls >= 20 && (stats.strikeRate ?? 0) >= 135,
      progress: `${(stats.strikeRate ?? 0).toFixed(1)} SR`,
    },
    {
      id: 'wicket_hunter',
      title: 'Wicket Taker',
      desc: '3+ career wickets taken',
      icon: '🎯',
      earned: (stats.wickets ?? 0) >= 3,
      progress: `${stats.wickets ?? 0} wickets`,
    },
    {
      id: 'boundary_king',
      title: 'Boundary Boss',
      desc: '10+ career boundaries (4s & 6s)',
      icon: '💥',
      earned: (stats.fours ?? 0) + (stats.sixes ?? 0) >= 10,
      progress: `${(stats.fours ?? 0) + (stats.sixes ?? 0)} boundaries`,
    },
    {
      id: 'safe_hands',
      title: 'Safe Hands',
      desc: '2+ catches or run-outs',
      icon: '🧤',
      earned: (stats.catches ?? 0) + (stats.runOuts ?? 0) >= 2,
      progress: `${(stats.catches ?? 0) + (stats.runOuts ?? 0)} dismissals`,
    },
    {
      id: 'veteran',
      title: 'Veteran',
      desc: 'Played 5+ matches',
      icon: '🏆',
      earned: (stats.matches ?? 0) >= 5,
      progress: `${stats.matches ?? 0}/5 matches`,
    },
  ]

  return badges
}
