import type { ScoreState, MatchResult } from '../types/match.ts'
import { deliverFile } from '../utils/fileDelivery.ts'

export type PosterType = 'player_of_match' | 'match_summary' | 'milestone'

export interface MilestoneCandidate {
  name: string
  team: string
  type: 'runs' | 'wickets'
  title: string // e.g. "FIFTY!", "CENTURY!", "3-WICKET HAUL!"
  value: number // runs scored or wickets taken
  balls?: number
  fours?: number
  sixes?: number
  strikeRate?: string
  overs?: string
  runsConceded?: number
  economy?: string
}

export interface PlayerOfMatchData {
  name: string
  team: string
  runs?: number
  balls?: number
  fours?: number
  sixes?: number
  strikeRate?: string
  wickets?: number
  overs?: string
  runsConceded?: number
  economy?: string
  reason?: string
}

export interface TopPerformer {
  name: string
  highlight: string
  subtext: string
}

export interface MatchSummaryPosterOptions {
  teamOne: string
  teamTwo: string
  firstTeam: string
  secondTeam: string
  firstInningsScore: ScoreState | null
  secondInningsScore: ScoreState | null
  result: MatchResult
  venue?: string
  date?: string
}

export interface PlayerOfMatchPosterOptions {
  matchSummary: {
    teamOne: string
    teamTwo: string
    winner: string
    margin?: string
  }
  player: PlayerOfMatchData
}

export interface MilestonePosterOptions {
  matchSummary: {
    teamOne: string
    teamTwo: string
  }
  milestone: MilestoneCandidate
}

export function formatOvers(balls: number): string {
  return `${Math.floor(balls / 6)}.${balls % 6}`
}

export function formatEconomy(runs: number, balls: number): string {
  if (balls === 0) return '0.0'
  const overs = balls / 6
  return (runs / overs).toFixed(1)
}

/**
 * Extracts players who achieved notable milestones:
 * - 50+ or 100+ runs in batting
 * - 3+ wickets in bowling
 */
export function extractMilestoneCandidates(match: {
  firstInningsScore: ScoreState | null
  secondInningsScore: ScoreState | null
  teamOne: string
  teamTwo: string
  firstBattingHome: boolean
}): MilestoneCandidate[] {
  const candidates: MilestoneCandidate[] = []
  const firstBattingTeam = match.firstBattingHome ? match.teamOne : match.teamTwo
  const secondBattingTeam = match.firstBattingHome ? match.teamTwo : match.teamOne

  // 1. Batting milestones in first innings
  for (const b of match.firstInningsScore?.battingStats ?? []) {
    if (b.runs >= 50) {
      candidates.push({
        name: b.name,
        team: firstBattingTeam,
        type: 'runs',
        title: b.runs >= 100 ? 'CENTURY!' : 'HALF-CENTURY!',
        value: b.runs,
        balls: b.balls,
        fours: b.fours,
        sixes: b.sixes,
        strikeRate: b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(1) : '0.0',
      })
    }
  }

  // 2. Bowling milestones in first innings (bowled by second batting team)
  for (const bw of match.firstInningsScore?.bowlerStats ?? []) {
    if (bw.wickets >= 3) {
      candidates.push({
        name: bw.name,
        team: secondBattingTeam,
        type: 'wickets',
        title: bw.wickets >= 5 ? '5-WICKET HAUL!' : `${bw.wickets}-WICKET HAUL!`,
        value: bw.wickets,
        overs: formatOvers(bw.balls),
        runsConceded: bw.runs,
        economy: formatEconomy(bw.runs, bw.balls),
      })
    }
  }

  // 3. Batting milestones in second innings
  for (const b of match.secondInningsScore?.battingStats ?? []) {
    if (b.runs >= 50) {
      candidates.push({
        name: b.name,
        team: secondBattingTeam,
        type: 'runs',
        title: b.runs >= 100 ? 'CENTURY!' : 'HALF-CENTURY!',
        value: b.runs,
        balls: b.balls,
        fours: b.fours,
        sixes: b.sixes,
        strikeRate: b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(1) : '0.0',
      })
    }
  }

  // 4. Bowling milestones in second innings (bowled by first batting team)
  for (const bw of match.secondInningsScore?.bowlerStats ?? []) {
    if (bw.wickets >= 3) {
      candidates.push({
        name: bw.name,
        team: firstBattingTeam,
        type: 'wickets',
        title: bw.wickets >= 5 ? '5-WICKET HAUL!' : `${bw.wickets}-WICKET HAUL!`,
        value: bw.wickets,
        overs: formatOvers(bw.balls),
        runsConceded: bw.runs,
        economy: formatEconomy(bw.runs, bw.balls),
      })
    }
  }

  return candidates.sort((a, b) => b.value - a.value)
}

/**
 * Extracts top batters and bowlers from an innings.
 */
export function extractTopPerformers(score: ScoreState | null, teamName: string): {
  topBatters: TopPerformer[]
  topBowlers: TopPerformer[]
} {
  if (!score) return { topBatters: [], topBowlers: [] }

  const sortedBatters = [...(score.battingStats ?? [])]
    .filter((b) => b.runs > 0)
    .sort((a, b) => b.runs - a.runs)
    .slice(0, 2)
    .map((b) => ({
      name: b.name,
      highlight: `${b.runs}${b.out ? '' : '*'} (${b.balls})`,
      subtext: `${b.fours}×4, ${b.sixes}×6 · SR ${b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(0) : 0}`,
    }))

  const sortedBowlers = [...(score.bowlerStats ?? [])]
    .filter((bw) => bw.wickets > 0 || bw.balls > 0)
    .sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)
    .slice(0, 2)
    .map((bw) => ({
      name: bw.name,
      highlight: `${bw.wickets}/${bw.runs}`,
      subtext: `${formatOvers(bw.balls)} ov · Econ ${formatEconomy(bw.runs, bw.balls)}`,
    }))

  void teamName
  return { topBatters: sortedBatters, topBowlers: sortedBowlers }
}

/**
 * Draws sleek rounded card container on canvas.
 */
function drawCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  fillColor: string,
  strokeColor?: string,
  strokeWidth = 2,
) {
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.arcTo(x + w, y, x + w, y + radius, radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius)
  ctx.lineTo(x + radius, y + h)
  ctx.arcTo(x, y + h, x, y + h - radius, radius)
  ctx.lineTo(x, y + radius)
  ctx.arcTo(x, y, x + radius, y, radius)
  ctx.closePath()

  ctx.fillStyle = fillColor
  ctx.fill()

  if (strokeColor) {
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = strokeWidth
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * Draws modern stadium floodlight / stadium dark gradient background.
 */
function drawAtmosphericBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  accentGlow: 'gold' | 'emerald' | 'cyan' = 'emerald',
) {
  // Base deep background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, width, height)
  bgGrad.addColorStop(0, '#0a0d16')
  bgGrad.addColorStop(0.5, '#0f1424')
  bgGrad.addColorStop(1, '#080a12')
  ctx.fillStyle = bgGrad
  ctx.fillRect(0, 0, width, height)

  // Subtle circular stadium floodlights
  ctx.save()
  const glowX1 = width * 0.2
  const glowY1 = height * 0.15
  const glowGrad1 = ctx.createRadialGradient(glowX1, glowY1, 10, glowX1, glowY1, 550)

  if (accentGlow === 'gold') {
    glowGrad1.addColorStop(0, 'rgba(245, 158, 11, 0.22)')
    glowGrad1.addColorStop(0.6, 'rgba(217, 119, 6, 0.08)')
    glowGrad1.addColorStop(1, 'rgba(0, 0, 0, 0)')
  } else if (accentGlow === 'cyan') {
    glowGrad1.addColorStop(0, 'rgba(56, 189, 248, 0.22)')
    glowGrad1.addColorStop(0.6, 'rgba(14, 165, 233, 0.08)')
    glowGrad1.addColorStop(1, 'rgba(0, 0, 0, 0)')
  } else {
    glowGrad1.addColorStop(0, 'rgba(52, 211, 153, 0.22)')
    glowGrad1.addColorStop(0.6, 'rgba(16, 185, 129, 0.08)')
    glowGrad1.addColorStop(1, 'rgba(0, 0, 0, 0)')
  }
  ctx.fillStyle = glowGrad1
  ctx.fillRect(0, 0, width, height)

  // Bottom secondary glow
  const glowX2 = width * 0.8
  const glowY2 = height * 0.85
  const glowGrad2 = ctx.createRadialGradient(glowX2, glowY2, 10, glowX2, glowY2, 600)
  glowGrad2.addColorStop(0, 'rgba(99, 102, 241, 0.18)')
  glowGrad2.addColorStop(0.7, 'rgba(79, 70, 229, 0.05)')
  glowGrad2.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = glowGrad2
  ctx.fillRect(0, 0, width, height)
  ctx.restore()

  // Subtle decorative border outline
  drawCard(ctx, 30, 30, width - 60, height - 60, 32, 'transparent', 'rgba(255, 255, 255, 0.08)', 1.5)
}

/**
 * Draws top app branding on poster.
 */
function drawHeaderBrand(ctx: CanvasRenderingContext2D, width: number, kickerText: string) {
  ctx.save()
  // Badge pill
  drawCard(ctx, (width - 260) / 2, 70, 260, 46, 23, 'rgba(255, 255, 255, 0.07)', 'rgba(255, 255, 255, 0.16)', 1)

  ctx.fillStyle = '#f8fafc'
  ctx.font = 'bold 20px "Outfit", "Inter", -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('⚡ SCOREMATE', width / 2, 100)

  // Sub-kicker
  ctx.font = 'bold 16px "Outfit", "Inter", -apple-system, sans-serif'
  ctx.fillStyle = '#94a3b8'
  ctx.letterSpacing = '3px'
  ctx.fillText(kickerText.toUpperCase(), width / 2, 148)
  ctx.restore()
}

/**
 * Draws footer on poster.
 */
function drawFooter(ctx: CanvasRenderingContext2D, width: number, height: number, subtext = 'Scored with ScoreMate · Live Cricket Scoring') {
  ctx.save()
  ctx.textAlign = 'center'
  ctx.font = '16px "Outfit", "Inter", -apple-system, sans-serif'
  ctx.fillStyle = '#64748b'
  ctx.fillText(subtext, width / 2, height - 70)
  ctx.restore()
}

/**
 * 1. Generates Player of the Match Card (1080 x 1350)
 */
export function generatePlayerOfMatchPoster(options: PlayerOfMatchPosterOptions): string {
  if (typeof document === 'undefined') return ''

  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1350
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  const { player, matchSummary } = options
  const W = canvas.width
  const H = canvas.height

  // Stadium atmosphere background
  drawAtmosphericBackground(ctx, W, H, 'gold')
  drawHeaderBrand(ctx, W, 'Player of the Match')

  // Gold Trophy Icon & Circle
  ctx.save()
  const trophyY = 240
  drawCard(ctx, (W - 120) / 2, trophyY - 50, 120, 120, 60, 'rgba(245, 158, 11, 0.15)', 'rgba(251, 191, 36, 0.4)', 2)
  ctx.font = '54px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('🏆', W / 2, trophyY + 28)
  ctx.restore()

  // Player Name
  ctx.save()
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 54px "Outfit", "Inter", -apple-system, sans-serif'
  ctx.fillText(player.name, W / 2, 385)

  // Team Pill
  drawCard(ctx, (W - 280) / 2, 415, 280, 48, 24, 'rgba(245, 158, 11, 0.2)', 'rgba(245, 158, 11, 0.6)', 1.5)
  ctx.fillStyle = '#fbbf24'
  ctx.font = 'bold 22px "Outfit", "Inter", -apple-system, sans-serif'
  ctx.fillText(player.team.toUpperCase(), W / 2, 447)
  ctx.restore()

  // Primary Highlight Card (Runs / Wickets)
  drawCard(ctx, 80, 495, W - 160, 210, 24, 'rgba(255, 255, 255, 0.04)', 'rgba(255, 255, 255, 0.12)', 1.5)

  ctx.save()
  ctx.textAlign = 'center'
  ctx.fillStyle = '#94a3b8'
  ctx.font = 'bold 18px "Outfit", "Inter", -apple-system, sans-serif'
  ctx.fillText('MATCH WINNING PERFORMANCE', W / 2, 535)

  ctx.fillStyle = '#38bdf8'
  ctx.font = 'bold 56px "Outfit", "Inter", -apple-system, sans-serif'
  const primaryHighlight = player.reason || `${player.runs ?? 0} runs`
  ctx.fillText(primaryHighlight, W / 2, 605)

  if (player.strikeRate || player.economy) {
    ctx.fillStyle = '#cbd5e1'
    ctx.font = '22px "Outfit", "Inter", -apple-system, sans-serif'
    const subParts: string[] = []
    if (player.balls !== undefined && player.balls > 0) subParts.push(`${player.balls} balls`)
    if (player.strikeRate) subParts.push(`SR ${player.strikeRate}`)
    if (player.fours !== undefined && player.fours > 0) subParts.push(`${player.fours}×4`)
    if (player.sixes !== undefined && player.sixes > 0) subParts.push(`${player.sixes}×6`)
    if (player.overs) subParts.push(`${player.overs} ov`)
    if (player.economy) subParts.push(`Econ ${player.economy}`)
    ctx.fillText(subParts.join('  ·  '), W / 2, 660)
  }
  ctx.restore()

  // 4 Key Stats Grid (Runs, Balls, 4s/6s, Strike Rate or Wickets)
  const gridY = 740
  const boxW = (W - 160 - 20) / 2
  const boxH = 135

  const stats = [
    { label: 'RUNS SCORED', val: player.runs !== undefined ? `${player.runs}` : '-' },
    { label: 'BALLS FACED', val: player.balls !== undefined ? `${player.balls}` : '-' },
    { label: 'BOUNDARIES', val: `${player.fours ?? 0}×4  ${player.sixes ?? 0}×6` },
    {
      label: player.wickets && player.wickets > 0 ? 'WICKETS TAKEN' : 'STRIKE RATE',
      val: player.wickets && player.wickets > 0 ? `${player.wickets}/${player.runsConceded ?? 0}` : `${player.strikeRate || '0.0'}`,
    },
  ]

  stats.forEach((st, idx) => {
    const col = idx % 2
    const row = Math.floor(idx / 2)
    const bx = 80 + col * (boxW + 20)
    const by = gridY + row * (boxH + 18)

    drawCard(ctx, bx, by, boxW, boxH, 18, 'rgba(255, 255, 255, 0.03)', 'rgba(255, 255, 255, 0.08)', 1)
    ctx.save()
    ctx.textAlign = 'center'
    ctx.fillStyle = '#64748b'
    ctx.font = 'bold 15px "Outfit", "Inter", -apple-system, sans-serif'
    ctx.fillText(st.label, bx + boxW / 2, by + 42)

    ctx.fillStyle = '#f8fafc'
    ctx.font = 'bold 38px "Outfit", "Inter", -apple-system, sans-serif'
    ctx.fillText(st.val, bx + boxW / 2, by + 95)
    ctx.restore()
  })

  // Match Summary Footer Card
  const matchCardY = 1060
  drawCard(ctx, 80, matchCardY, W - 160, 150, 20, 'rgba(15, 23, 42, 0.7)', 'rgba(255, 255, 255, 0.1)', 1)

  ctx.save()
  ctx.textAlign = 'center'
  ctx.fillStyle = '#94a3b8'
  ctx.font = 'bold 16px "Outfit", "Inter", -apple-system, sans-serif'
  ctx.fillText(`${matchSummary.teamOne.toUpperCase()}  vs  ${matchSummary.teamTwo.toUpperCase()}`, W / 2, matchCardY + 45)

  ctx.fillStyle = '#4ade80'
  ctx.font = 'bold 28px "Outfit", "Inter", -apple-system, sans-serif'
  const winText = matchSummary.winner === 'Match Drawn'
    ? 'MATCH DRAWN'
    : `${matchSummary.winner.toUpperCase()} WON${matchSummary.margin ? ` BY ${matchSummary.margin.toUpperCase()}` : ''}`
  ctx.fillText(winText, W / 2, matchCardY + 95)
  ctx.restore()

  drawFooter(ctx, W, H)
  return canvas.toDataURL('image/png')
}

/**
 * 2. Generates Match Summary Poster (1080 x 1350)
 */
export function generateMatchSummaryPoster(options: MatchSummaryPosterOptions): string {
  if (typeof document === 'undefined') return ''

  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1350
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  const {
    firstTeam,
    secondTeam,
    firstInningsScore,
    secondInningsScore,
    result,
    venue,
  } = options
  const W = canvas.width
  const H = canvas.height

  drawAtmosphericBackground(ctx, W, H, 'emerald')
  drawHeaderBrand(ctx, W, 'Match Result Summary')

  // Winner Banner Box
  drawCard(ctx, 80, 185, W - 160, 110, 24, 'rgba(16, 185, 129, 0.15)', 'rgba(52, 211, 153, 0.4)', 2)
  ctx.save()
  ctx.textAlign = 'center'
  ctx.fillStyle = '#34d399'
  ctx.font = 'bold 36px "Outfit", "Inter", -apple-system, sans-serif'
  const winnerTitle = result.winner === 'Match Drawn'
    ? 'MATCH DRAWN'
    : `${result.winner.toUpperCase()} WON`
  ctx.fillText(winnerTitle, W / 2, 242)

  if (result.margin) {
    ctx.fillStyle = '#cbd5e1'
    ctx.font = '20px "Outfit", "Inter", -apple-system, sans-serif'
    ctx.fillText(`by ${result.margin}`, W / 2, 275)
  }
  ctx.restore()

  // Innings Scores Card (Team 1 vs Team 2)
  const inningsCardY = 320
  drawCard(ctx, 80, inningsCardY, W - 160, 240, 24, 'rgba(255, 255, 255, 0.04)', 'rgba(255, 255, 255, 0.1)', 1.5)

  // Team 1 Line
  ctx.save()
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 34px "Outfit", "Inter", -apple-system, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(firstTeam, 120, inningsCardY + 70)

  ctx.textAlign = 'right'
  ctx.fillStyle = '#f8fafc'
  ctx.font = 'bold 44px "Outfit", "Inter", -apple-system, sans-serif'
  const score1 = `${firstInningsScore?.runs ?? 0}/${firstInningsScore?.wickets ?? 0}`
  ctx.fillText(score1, W - 120, inningsCardY + 70)

  ctx.fillStyle = '#94a3b8'
  ctx.font = '20px "Outfit", "Inter", -apple-system, sans-serif'
  const overs1 = firstInningsScore
    ? `(${Math.floor(firstInningsScore.balls / 6)}.${firstInningsScore.balls % 6} ov)`
    : ''
  ctx.fillText(overs1, W - 120, inningsCardY + 102)

  // Divider Line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(120, inningsCardY + 125)
  ctx.lineTo(W - 120, inningsCardY + 125)
  ctx.stroke()

  // Team 2 Line
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 34px "Outfit", "Inter", -apple-system, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(secondTeam, 120, inningsCardY + 185)

  ctx.textAlign = 'right'
  ctx.fillStyle = '#f8fafc'
  ctx.font = 'bold 44px "Outfit", "Inter", -apple-system, sans-serif'
  const score2 = `${secondInningsScore?.runs ?? 0}/${secondInningsScore?.wickets ?? 0}`
  ctx.fillText(score2, W - 120, inningsCardY + 185)

  ctx.fillStyle = '#94a3b8'
  ctx.font = '20px "Outfit", "Inter", -apple-system, sans-serif'
  const overs2 = secondInningsScore
    ? `(${Math.floor(secondInningsScore.balls / 6)}.${secondInningsScore.balls % 6} ov)`
    : ''
  ctx.fillText(overs2, W - 120, inningsCardY + 217)
  ctx.restore()

  // Top Performers Section
  const performersY = 585
  const top1 = extractTopPerformers(firstInningsScore, firstTeam)
  const top2 = extractTopPerformers(secondInningsScore, secondTeam)

  // Section Header
  ctx.save()
  ctx.fillStyle = '#94a3b8'
  ctx.font = 'bold 18px "Outfit", "Inter", -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('KEY INNINGS PERFORMERS', W / 2, performersY + 20)
  ctx.restore()

  // Two columns for Team 1 and Team 2 top performers
  const colW = (W - 160 - 20) / 2
  const colH = 430

  // Column 1
  drawCard(ctx, 80, performersY + 40, colW, colH, 20, 'rgba(255, 255, 255, 0.03)', 'rgba(255, 255, 255, 0.08)', 1)
  ctx.save()
  ctx.textAlign = 'left'
  ctx.fillStyle = '#38bdf8'
  ctx.font = 'bold 22px "Outfit", "Inter", -apple-system, sans-serif'
  ctx.fillText(firstTeam.substring(0, 16), 110, performersY + 80)

  let curY = performersY + 130
  ctx.fillStyle = '#64748b'
  ctx.font = 'bold 14px "Outfit", "Inter", -apple-system, sans-serif'
  ctx.fillText('TOP BATTERS', 110, curY)
  curY += 28

  top1.topBatters.forEach((b) => {
    ctx.fillStyle = '#f1f5f9'
    ctx.font = 'bold 20px "Outfit", "Inter", -apple-system, sans-serif'
    ctx.fillText(b.name, 110, curY)
    ctx.fillStyle = '#4ade80'
    ctx.textAlign = 'right'
    ctx.fillText(b.highlight, 80 + colW - 30, curY)
    ctx.textAlign = 'left'
    curY += 22
    ctx.fillStyle = '#94a3b8'
    ctx.font = '14px "Outfit", "Inter", -apple-system, sans-serif'
    ctx.fillText(b.subtext, 110, curY)
    curY += 36
  })

  curY = performersY + 280
  ctx.fillStyle = '#64748b'
  ctx.font = 'bold 14px "Outfit", "Inter", -apple-system, sans-serif'
  ctx.fillText('TOP BOWLERS', 110, curY)
  curY += 28

  top2.topBowlers.forEach((bw) => {
    ctx.fillStyle = '#f1f5f9'
    ctx.font = 'bold 20px "Outfit", "Inter", -apple-system, sans-serif'
    ctx.fillText(bw.name, 110, curY)
    ctx.fillStyle = '#38bdf8'
    ctx.textAlign = 'right'
    ctx.fillText(bw.highlight, 80 + colW - 30, curY)
    ctx.textAlign = 'left'
    curY += 22
    ctx.fillStyle = '#94a3b8'
    ctx.font = '14px "Outfit", "Inter", -apple-system, sans-serif'
    ctx.fillText(bw.subtext, 110, curY)
    curY += 36
  })
  ctx.restore()

  // Column 2
  const col2X = 80 + colW + 20
  drawCard(ctx, col2X, performersY + 40, colW, colH, 20, 'rgba(255, 255, 255, 0.03)', 'rgba(255, 255, 255, 0.08)', 1)
  ctx.save()
  ctx.textAlign = 'left'
  ctx.fillStyle = '#fbbf24'
  ctx.font = 'bold 22px "Outfit", "Inter", -apple-system, sans-serif'
  ctx.fillText(secondTeam.substring(0, 16), col2X + 30, performersY + 80)

  curY = performersY + 130
  ctx.fillStyle = '#64748b'
  ctx.font = 'bold 14px "Outfit", "Inter", -apple-system, sans-serif'
  ctx.fillText('TOP BATTERS', col2X + 30, curY)
  curY += 28

  top2.topBatters.forEach((b) => {
    ctx.fillStyle = '#f1f5f9'
    ctx.font = 'bold 20px "Outfit", "Inter", -apple-system, sans-serif'
    ctx.fillText(b.name, col2X + 30, curY)
    ctx.fillStyle = '#4ade80'
    ctx.textAlign = 'right'
    ctx.fillText(b.highlight, col2X + colW - 30, curY)
    ctx.textAlign = 'left'
    curY += 22
    ctx.fillStyle = '#94a3b8'
    ctx.font = '14px "Outfit", "Inter", -apple-system, sans-serif'
    ctx.fillText(b.subtext, col2X + 30, curY)
    curY += 36
  })

  curY = performersY + 280
  ctx.fillStyle = '#64748b'
  ctx.font = 'bold 14px "Outfit", "Inter", -apple-system, sans-serif'
  ctx.fillText('TOP BOWLERS', col2X + 30, curY)
  curY += 28

  top1.topBowlers.forEach((bw) => {
    ctx.fillStyle = '#f1f5f9'
    ctx.font = 'bold 20px "Outfit", "Inter", -apple-system, sans-serif'
    ctx.fillText(bw.name, col2X + 30, curY)
    ctx.fillStyle = '#38bdf8'
    ctx.textAlign = 'right'
    ctx.fillText(bw.highlight, col2X + colW - 30, curY)
    ctx.textAlign = 'left'
    curY += 22
    ctx.fillStyle = '#94a3b8'
    ctx.font = '14px "Outfit", "Inter", -apple-system, sans-serif'
    ctx.fillText(bw.subtext, col2X + 30, curY)
    curY += 36
  })
  ctx.restore()

  // Match Info Bar
  if (venue) {
    ctx.save()
    ctx.fillStyle = '#94a3b8'
    ctx.font = '18px "Outfit", "Inter", -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`📍 ${venue}`, W / 2, 1140)
    ctx.restore()
  }

  drawFooter(ctx, W, H)
  return canvas.toDataURL('image/png')
}

/**
 * 3. Generates Individual Milestone Poster (1080 x 1350)
 */
export function generateMilestonePoster(options: MilestonePosterOptions): string {
  if (typeof document === 'undefined') return ''

  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1350
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  const { milestone, matchSummary } = options
  const W = canvas.width
  const H = canvas.height

  drawAtmosphericBackground(ctx, W, H, milestone.type === 'runs' ? 'gold' : 'cyan')
  drawHeaderBrand(ctx, W, 'Match Milestone')

  // Star Icon
  ctx.save()
  const iconY = 240
  drawCard(ctx, (W - 120) / 2, iconY - 50, 120, 120, 60, 'rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.2)', 2)
  ctx.font = '54px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(milestone.type === 'runs' ? '🏏' : '🎯', W / 2, iconY + 28)
  ctx.restore()

  // Milestone Title (e.g. "CENTURY!", "HALF-CENTURY!")
  ctx.save()
  ctx.textAlign = 'center'
  ctx.fillStyle = milestone.type === 'runs' ? '#f59e0b' : '#38bdf8'
  ctx.font = 'bold 36px "Outfit", "Inter", -apple-system, sans-serif'
  ctx.fillText(milestone.title, W / 2, 380)

  // Player Name
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 58px "Outfit", "Inter", -apple-system, sans-serif'
  ctx.fillText(milestone.name, W / 2, 455)

  // Team Pill
  drawCard(ctx, (W - 280) / 2, 485, 280, 48, 24, 'rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.2)', 1.5)
  ctx.fillStyle = '#cbd5e1'
  ctx.font = 'bold 22px "Outfit", "Inter", -apple-system, sans-serif'
  ctx.fillText(milestone.team.toUpperCase(), W / 2, 517)
  ctx.restore()

  // Big Hero Stat Box
  drawCard(ctx, 80, 570, W - 160, 260, 28, 'rgba(255, 255, 255, 0.04)', 'rgba(255, 255, 255, 0.12)', 2)

  ctx.save()
  ctx.textAlign = 'center'
  ctx.fillStyle = '#f8fafc'
  ctx.font = 'bold 120px "Outfit", "Inter", -apple-system, sans-serif'
  const heroText = milestone.type === 'runs' ? `${milestone.value}` : `${milestone.value} Wkts`
  ctx.fillText(heroText, W / 2, 725)

  ctx.fillStyle = '#94a3b8'
  ctx.font = '24px "Outfit", "Inter", -apple-system, sans-serif'
  const heroSub = milestone.type === 'runs'
    ? `${milestone.balls ?? 0} BALLS FACED  ·  STRIKE RATE ${milestone.strikeRate ?? '0.0'}`
    : `${milestone.overs ?? '0'} OVERS  ·  ${milestone.runsConceded ?? 0} RUNS CONCEDED`
  ctx.fillText(heroSub, W / 2, 785)
  ctx.restore()

  // Detailed Stats Breakdown Grid
  const gridY = 865
  const boxW = (W - 160 - 20) / 2
  const boxH = 135

  const stats = milestone.type === 'runs'
    ? [
        { label: 'FOURS HIT', val: `${milestone.fours ?? 0} (${(milestone.fours ?? 0) * 4} runs)` },
        { label: 'SIXES HIT', val: `${milestone.sixes ?? 0} (${(milestone.sixes ?? 0) * 6} runs)` },
        { label: 'STRIKE RATE', val: `${milestone.strikeRate ?? '0.0'}` },
        { label: 'RUNS FROM BOUNDARIES', val: `${(milestone.fours ?? 0) * 4 + (milestone.sixes ?? 0) * 6}` },
      ]
    : [
        { label: 'OVERS BOWLED', val: `${milestone.overs ?? '0'}` },
        { label: 'RUNS CONCEDED', val: `${milestone.runsConceded ?? 0}` },
        { label: 'ECONOMY RATE', val: `${milestone.economy ?? '0.0'}` },
        { label: 'WICKETS', val: `${milestone.value}` },
      ]

  stats.forEach((st, idx) => {
    const col = idx % 2
    const row = Math.floor(idx / 2)
    const bx = 80 + col * (boxW + 20)
    const by = gridY + row * (boxH + 18)

    drawCard(ctx, bx, by, boxW, boxH, 18, 'rgba(255, 255, 255, 0.03)', 'rgba(255, 255, 255, 0.08)', 1)
    ctx.save()
    ctx.textAlign = 'center'
    ctx.fillStyle = '#64748b'
    ctx.font = 'bold 15px "Outfit", "Inter", -apple-system, sans-serif'
    ctx.fillText(st.label, bx + boxW / 2, by + 42)

    ctx.fillStyle = '#f8fafc'
    ctx.font = 'bold 36px "Outfit", "Inter", -apple-system, sans-serif'
    ctx.fillText(st.val, bx + boxW / 2, by + 95)
    ctx.restore()
  })

  // Match Summary Footer
  ctx.save()
  ctx.textAlign = 'center'
  ctx.fillStyle = '#94a3b8'
  ctx.font = 'bold 18px "Outfit", "Inter", -apple-system, sans-serif'
  ctx.fillText(`${matchSummary.teamOne.toUpperCase()}  vs  ${matchSummary.teamTwo.toUpperCase()}`, W / 2, 1200)
  ctx.restore()

  drawFooter(ctx, W, H)
  return canvas.toDataURL('image/png')
}

/**
 * Delivers generated poster via native share sheet or web download.
 */
export async function deliverPoster(dataUrl: string, filename: string): Promise<void> {
  const safeFilename = filename.toLowerCase().replace(/[^a-z0-9_.-]/g, '-')
  await deliverFile({
    filename: safeFilename.endsWith('.png') ? safeFilename : `${safeFilename}.png`,
    content: dataUrl,
    mimeType: 'image/png',
    isBase64: true,
  })
}
