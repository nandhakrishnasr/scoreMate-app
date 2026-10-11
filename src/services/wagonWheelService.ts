import type {
  CricketFieldZone,
  PitchDeliveryLength,
  BallTrackRecord,
  ScoreState,
} from '../types/match.ts'

export interface ZoneMeta {
  id: CricketFieldZone
  label: string
  side: 'off' | 'leg'
  angleDeg: number // Center angle of sector in degrees (0 = straight down ground)
  color: string
}

export const CRICKET_FIELD_ZONES: Record<CricketFieldZone, ZoneMeta> = {
  long_off: { id: 'long_off', label: 'Long Off', side: 'off', angleDeg: 335, color: '#38bdf8' },
  cover: { id: 'cover', label: 'Cover', side: 'off', angleDeg: 295, color: '#22c55e' },
  point: { id: 'point', label: 'Point', side: 'off', angleDeg: 250, color: '#a855f7' },
  third_man: { id: 'third_man', label: 'Third Man', side: 'off', angleDeg: 205, color: '#eab308' },
  fine_leg: { id: 'fine_leg', label: 'Fine Leg', side: 'leg', angleDeg: 155, color: '#f97316' },
  square_leg: { id: 'square_leg', label: 'Square Leg', side: 'leg', angleDeg: 110, color: '#ef4444' },
  mid_wicket: { id: 'mid_wicket', label: 'Mid Wicket', side: 'leg', angleDeg: 65, color: '#ec4899' },
  long_on: { id: 'long_on', label: 'Long On', side: 'leg', angleDeg: 25, color: '#06b6d4' },
}

export const ALL_ZONES: CricketFieldZone[] = [
  'long_off',
  'cover',
  'point',
  'third_man',
  'fine_leg',
  'square_leg',
  'mid_wicket',
  'long_on',
]

export interface LengthMeta {
  id: PitchDeliveryLength
  label: string
  range: string
  color: string
  accentColor: string
}

export const PITCH_LENGTHS: Record<PitchDeliveryLength, LengthMeta> = {
  yorker: { id: 'yorker', label: 'Yorker', range: '0–2m', color: 'rgba(239, 68, 68, 0.85)', accentColor: '#ef4444' },
  full: { id: 'full', label: 'Full', range: '2–4m', color: 'rgba(56, 189, 248, 0.85)', accentColor: '#38bdf8' },
  good_length: { id: 'good_length', label: 'Good Length', range: '4–6m', color: 'rgba(34, 197, 94, 0.85)', accentColor: '#22c55e' },
  short: { id: 'short', label: 'Short', range: '6–8m', color: 'rgba(234, 179, 8, 0.85)', accentColor: '#eab308' },
  bouncer: { id: 'bouncer', label: 'Bouncer', range: '8m+', color: 'rgba(168, 85, 247, 0.85)', accentColor: '#a855f7' },
}

export const ALL_LENGTHS: PitchDeliveryLength[] = [
  'yorker',
  'full',
  'good_length',
  'short',
  'bouncer',
]

export interface ZoneStats {
  runs: number
  balls: number
  singles: number
  doubles: number
  fours: number
  sixes: number
  wickets: number
  percentage: number
}

export interface LengthStats {
  balls: number
  runs: number
  wickets: number
  dotBalls: number
  percentage: number
}

/**
 * Calculates aggregated scoring statistics across all 8 ground zones.
 */
export function getZoneBreakdown(
  records: BallTrackRecord[],
  filterBatter?: string,
): Record<CricketFieldZone, ZoneStats> {
  const filtered = filterBatter
    ? records.filter((r) => r.batterName === filterBatter)
    : records

  const totalRuns = filtered.reduce((acc, r) => acc + (r.batterRuns || r.runs), 0) || 1

  const initial: Record<CricketFieldZone, ZoneStats> = {
    long_off: { runs: 0, balls: 0, singles: 0, doubles: 0, fours: 0, sixes: 0, wickets: 0, percentage: 0 },
    cover: { runs: 0, balls: 0, singles: 0, doubles: 0, fours: 0, sixes: 0, wickets: 0, percentage: 0 },
    point: { runs: 0, balls: 0, singles: 0, doubles: 0, fours: 0, sixes: 0, wickets: 0, percentage: 0 },
    third_man: { runs: 0, balls: 0, singles: 0, doubles: 0, fours: 0, sixes: 0, wickets: 0, percentage: 0 },
    fine_leg: { runs: 0, balls: 0, singles: 0, doubles: 0, fours: 0, sixes: 0, wickets: 0, percentage: 0 },
    square_leg: { runs: 0, balls: 0, singles: 0, doubles: 0, fours: 0, sixes: 0, wickets: 0, percentage: 0 },
    mid_wicket: { runs: 0, balls: 0, singles: 0, doubles: 0, fours: 0, sixes: 0, wickets: 0, percentage: 0 },
    long_on: { runs: 0, balls: 0, singles: 0, doubles: 0, fours: 0, sixes: 0, wickets: 0, percentage: 0 },
  }

  for (const r of filtered) {
    const z = r.zone || 'cover'
    const runs = r.batterRuns !== undefined ? r.batterRuns : r.runs
    initial[z].runs += runs
    initial[z].balls += 1
    if (runs === 1) initial[z].singles += 1
    if (runs === 2 || runs === 3) initial[z].doubles += 1
    if (runs === 4) initial[z].fours += 1
    if (runs === 6) initial[z].sixes += 1
    if (r.isWicket) initial[z].wickets += 1
  }

  for (const z of ALL_ZONES) {
    initial[z].percentage = Math.round((initial[z].runs / totalRuns) * 100)
  }

  return initial
}

/**
 * Calculates aggregated bowling length statistics across the 5 pitch zones.
 */
export function getLengthBreakdown(
  records: BallTrackRecord[],
  filterBowler?: string,
): Record<PitchDeliveryLength, LengthStats> {
  const filtered = filterBowler
    ? records.filter((r) => r.bowlerName === filterBowler)
    : records

  const totalBalls = filtered.length || 1

  const initial: Record<PitchDeliveryLength, LengthStats> = {
    yorker: { balls: 0, runs: 0, wickets: 0, dotBalls: 0, percentage: 0 },
    full: { balls: 0, runs: 0, wickets: 0, dotBalls: 0, percentage: 0 },
    good_length: { balls: 0, runs: 0, wickets: 0, dotBalls: 0, percentage: 0 },
    short: { balls: 0, runs: 0, wickets: 0, dotBalls: 0, percentage: 0 },
    bouncer: { balls: 0, runs: 0, wickets: 0, dotBalls: 0, percentage: 0 },
  }

  for (const r of filtered) {
    const l = r.length || 'good_length'
    initial[l].balls += 1
    initial[l].runs += r.runs
    if (r.isWicket) initial[l].wickets += 1
    if (r.runs === 0) initial[l].dotBalls += 1
  }

  for (const l of ALL_LENGTHS) {
    initial[l].percentage = Math.round((initial[l].balls / totalBalls) * 100)
  }

  return initial
}

/**
 * Deterministically synthesizes realistic ball tracking for matches scored
 * before the shot tracker feature was enabled, so historical matches display
 * visually authentic Wagon Wheels and Pitch Maps immediately!
 */
export function synthesizeBallTrackingIfEmpty(score: ScoreState | null): BallTrackRecord[] {
  if (!score) return []
  if (score.ballTracking && score.ballTracking.length > 0) {
    return score.ballTracking
  }

  const generated: BallTrackRecord[] = []
  let globalBall = 1

  const batterList = (score.battingStats ?? []).map((b) => b.name)
  let batterIdx = 0

  // Typical realistic zone distribution per shot type
  const boundarySixZones: CricketFieldZone[] = ['long_on', 'mid_wicket', 'long_off', 'square_leg']
  const boundaryFourZones: CricketFieldZone[] = ['cover', 'point', 'square_leg', 'mid_wicket', 'third_man', 'fine_leg']
  const singleZones: CricketFieldZone[] = ['cover', 'mid_wicket', 'long_on', 'long_off', 'square_leg', 'point']
  const dotZones: CricketFieldZone[] = ['cover', 'point', 'mid_wicket']

  const lengths: PitchDeliveryLength[] = ['good_length', 'good_length', 'full', 'good_length', 'short', 'yorker']

  for (const over of score.overHistory ?? []) {
    let ballInOver = 1
    for (const d of over.deliveries ?? []) {
      const runs = d.runs ?? 0
      const isSix = runs === 6
      const isFour = runs === 4
      const isWicket = Boolean(d.wicket)

      let assignedZone: CricketFieldZone
      if (isSix) {
        assignedZone = boundarySixZones[globalBall % boundarySixZones.length]
      } else if (isFour) {
        assignedZone = boundaryFourZones[globalBall % boundaryFourZones.length]
      } else if (runs > 0) {
        assignedZone = singleZones[globalBall % singleZones.length]
      } else {
        assignedZone = dotZones[globalBall % dotZones.length]
      }

      const assignedLength = lengths[globalBall % lengths.length]
      const currentBatter = batterList[batterIdx % (batterList.length || 1)] || score.striker.name

      generated.push({
        ballNumber: globalBall,
        overNumber: over.number,
        ballInOver,
        batterName: currentBatter,
        bowlerName: over.bowler,
        runs,
        batterRuns: d.batterRuns !== undefined ? d.batterRuns : runs,
        isBoundary: isFour || isSix,
        isWicket,
        zone: assignedZone,
        length: assignedLength,
        timestamp: new Date().toISOString(),
      })

      if (d.legal) {
        ballInOver++
        globalBall++
      }
      if (runs % 2 === 1) {
        batterIdx++
      }
    }
  }

  return generated
}
