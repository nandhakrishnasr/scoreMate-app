import type {
  LiveMatchSnapshot,
  ScoreState,
  Delivery,
  BallTrackRecord,
  CricketFieldZone,
  PitchDeliveryLength,
} from '../types/match.ts'

const LIVE_HASH_PREFIX = '#live='
const LIVE_QUERY_PARAM = 'live='
const BROADCAST_CHANNEL_NAME = 'scoremate_live_stream'

/**
 * UTF-8 safe base64url encoder.
 */
function toBase64Url(str: string): string {
  let base64 = ''
  if (typeof btoa === 'function') {
    base64 = btoa(unescape(encodeURIComponent(str)))
  } else if (typeof (globalThis as unknown as { Buffer?: { from: (s: string, enc: string) => { toString: (enc: string) => string } } }).Buffer !== 'undefined') {
    const buf = (globalThis as unknown as { Buffer: { from: (s: string, enc: string) => { toString: (enc: string) => string } } }).Buffer
    base64 = buf.from(str, 'utf8').toString('base64')
  }

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * UTF-8 safe base64/base64url decoder.
 */
function fromBase64Url(b64: string): string {
  let normalized = b64.replace(/-/g, '+').replace(/_/g, '/')
  while (normalized.length % 4 !== 0) {
    normalized += '='
  }

  if (typeof atob === 'function') {
    return decodeURIComponent(escape(atob(normalized)))
  }

  if (typeof (globalThis as unknown as { Buffer?: { from: (s: string, enc: string) => { toString: (enc: string) => string } } }).Buffer !== 'undefined') {
    const buf = (globalThis as unknown as { Buffer: { from: (s: string, enc: string) => { toString: (enc: string) => string } } }).Buffer
    return buf.from(normalized, 'base64').toString('utf8')
  }

  return ''
}

/**
 * Encodes a live match snapshot into a compact URL-safe hash fragment.
 * Uses a highly-compressed tuple format (V2) to keep links ultra-short (~200 chars).
 */
export function encodeLiveMatchToUrl(snapshot: LiveMatchSnapshot, baseUrl?: string): string {
  const score = snapshot.score
  const striker = score.striker
  const nonStriker = score.nonStriker
  const bowler = score.bowler

  // Extract compact deliveries string (e.g. "1,4,W,0")
  const currentOverStr = (score.currentOver || [])
    .map((b) => b.label || String(b.runs || 0))
    .join(',')

  // Compact ball tracking points (last 15 deliveries)
  const compactTracking = (score.ballTracking || []).slice(-15).map((b) => [
    b.ballNumber ?? 0,
    b.runs ?? 0,
    b.isBoundary ? 1 : 0,
    b.isWicket ? 1 : 0,
    b.zone ?? '',
    b.length ?? '',
  ])

  // Compact first innings score if present
  const compactFirstInnings = snapshot.firstInningsScore
    ? [
        snapshot.firstInningsScore.runs,
        snapshot.firstInningsScore.wickets,
        snapshot.firstInningsScore.balls,
      ]
    : null

  const tuple = [
    2, // format version
    snapshot.id,
    snapshot.teamOne,
    snapshot.teamTwo,
    snapshot.overs,
    snapshot.inningsNumber,
    snapshot.firstBattingHome ? 1 : 0,
    snapshot.target || 0,
    snapshot.venue || '',
    score.runs,
    score.wickets,
    score.balls,
    score.freeHit ? 1 : 0,
    score.inningsComplete ? 1 : 0,
    striker?.name || '',
    striker?.runs || 0,
    striker?.balls || 0,
    striker?.fours || 0,
    striker?.sixes || 0,
    nonStriker?.name || '',
    nonStriker?.runs || 0,
    nonStriker?.balls || 0,
    nonStriker?.fours || 0,
    nonStriker?.sixes || 0,
    bowler?.name || '',
    bowler?.balls || 0,
    bowler?.maidens || 0,
    bowler?.runs || 0,
    bowler?.wickets || 0,
    currentOverStr,
    compactTracking,
    compactFirstInnings,
  ]

  const json = JSON.stringify(tuple)
  const base64 = toBase64Url(json)
  const base = baseUrl || (typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '')
  return `${base}#live=${base64}`
}

/**
 * Decodes a live match snapshot from a URL, hash, or query string.
 * Supports both V2 compact tuples and legacy V1 objects with full backward compatibility.
 */
export function decodeLiveMatchFromUrl(rawLocation?: string): LiveMatchSnapshot | null {
  let payload = ''

  const str = rawLocation || (typeof window !== 'undefined' ? `${window.location.hash}${window.location.search}` : '')
  if (!str) return null

  if (str.includes(LIVE_HASH_PREFIX)) {
    const after = str.split(LIVE_HASH_PREFIX)[1]
    payload = after?.split('&')[0]?.split('?')[0] || ''
  } else if (str.includes(LIVE_QUERY_PARAM)) {
    const parts = str.split(LIVE_QUERY_PARAM)
    payload = parts[1]?.split('&')[0]?.split('#')[0] || ''
  } else if (str.startsWith('Wz') || str.startsWith('ey')) {
    // Direct raw base64 string
    payload = str
  }

  if (!payload) return null

  try {
    const json = fromBase64Url(payload)
    if (!json) return null

    const data = JSON.parse(json)

    // Format V2: Compact Array Tuple
    if (Array.isArray(data) && data[0] === 2) {
      const [
        _ver,
        id,
        teamOne,
        teamTwo,
        overs,
        inningsNumber,
        firstBattingHome,
        target,
        venue,
        runs,
        wickets,
        balls,
        freeHit,
        inningsComplete,
        stName,
        stR,
        stB,
        st4,
        st6,
        nsName,
        nsR,
        nsB,
        ns4,
        ns6,
        bwName,
        bwBalls,
        bwM,
        bwR,
        bwW,
        currentOverStr,
        compactTracking,
        compactFirstInnings,
      ] = data

      const currentOver: Delivery[] = currentOverStr
        ? String(currentOverStr)
            .split(',')
            .filter(Boolean)
            .map((label: string) => ({
              label,
              runs: parseInt(label) || 0,
              legal: !label.toLowerCase().includes('wd') && !label.toLowerCase().includes('nb'),
              wicket: label.toLowerCase().includes('w')
                ? {
                    kind: 'Bowled',
                    dismissedBatter: 'striker',
                    dismissedPlayerName: String(stName || 'Striker'),
                    runsCompleted: 0,
                  }
                : null,
            }))
        : []

      const ballTracking: BallTrackRecord[] = Array.isArray(compactTracking)
        ? compactTracking.map((t: (string | number)[], idx: number) => ({
            ballNumber: Number(t[0] || idx + 1),
            overNumber: Math.floor(Number(balls || 0) / 6),
            ballInOver: Number(balls || 0) % 6,
            batterName: String(stName || 'Batter'),
            bowlerName: String(bwName || 'Bowler'),
            runs: Number(t[1] || 0),
            batterRuns: Number(t[1] || 0),
            isBoundary: Boolean(t[2]),
            isWicket: Boolean(t[3]),
            zone: (t[4] as CricketFieldZone) || undefined,
            length: (t[5] as PitchDeliveryLength) || undefined,
            timestamp: new Date().toISOString(),
          }))
        : []

      const emptyScoreState = (r: number, w: number, b: number): ScoreState => ({
        runs: r,
        wickets: w,
        balls: b,
        striker: { name: 'Batter', runs: 0, balls: 0, fours: 0, sixes: 0, out: false },
        nonStriker: { name: 'Batter', runs: 0, balls: 0, fours: 0, sixes: 0, out: false },
        bowler: { name: 'Bowler', balls: 0, maidens: 0, runs: 0, wickets: 0 },
        currentOver: [],
        overHistory: [],
        dismissedBatters: [],
        fallOfWickets: [],
        inningsComplete: true,
        battingStats: [],
        bowlerStats: [],
        ballTracking: [],
      })

      const firstInningsScore: ScoreState | null = Array.isArray(compactFirstInnings)
        ? emptyScoreState(
            Number(compactFirstInnings[0] || 0),
            Number(compactFirstInnings[1] || 0),
            Number(compactFirstInnings[2] || 0),
          )
        : null

      return {
        version: 1,
        id: String(id || 'live-match'),
        teamOne: String(teamOne || 'Team 1'),
        teamTwo: String(teamTwo || 'Team 2'),
        overs: Number(overs || 20),
        inningsNumber: inningsNumber === 2 ? 2 : 1,
        firstBattingHome: Boolean(firstBattingHome),
        target: target ? Number(target) : null,
        venue: venue ? String(venue) : undefined,
        score: {
          runs: Number(runs || 0),
          wickets: Number(wickets || 0),
          balls: Number(balls || 0),
          freeHit: Boolean(freeHit),
          inningsComplete: Boolean(inningsComplete),
          striker: {
            name: String(stName || 'Striker'),
            runs: Number(stR || 0),
            balls: Number(stB || 0),
            fours: Number(st4 || 0),
            sixes: Number(st6 || 0),
            out: false,
          },
          nonStriker: {
            name: String(nsName || 'Non-Striker'),
            runs: Number(nsR || 0),
            balls: Number(nsB || 0),
            fours: Number(ns4 || 0),
            sixes: Number(ns6 || 0),
            out: false,
          },
          bowler: {
            name: String(bwName || 'Bowler'),
            balls: Number(bwBalls || 0),
            maidens: Number(bwM || 0),
            runs: Number(bwR || 0),
            wickets: Number(bwW || 0),
          },
          currentOver,
          overHistory: [],
          fallOfWickets: [],
          dismissedBatters: [],
          battingStats: [],
          bowlerStats: [],
          ballTracking,
        },
        firstInningsScore,
        timestamp: new Date().toISOString(),
      }
    }

    // Format V1: Full Snapshot Object
    if (data && data.teamOne && data.teamTwo && data.score) {
      return data as LiveMatchSnapshot
    }
  } catch {
    // Malformed base64 or JSON
    return null
  }

  return null
}

/**
 * Shortens a live spectator URL using da.gd (CORS enabled, instant 302 redirect).
 * Falls back to the original URL if network request fails or times out.
 */
export async function shortenLiveUrl(longUrl: string): Promise<string> {
  if (!longUrl || longUrl.length < 35) return longUrl

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3500)

    const res = await fetch(`https://da.gd/s?url=${encodeURIComponent(longUrl)}`, {
      method: 'GET',
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (res.ok) {
      const text = (await res.text()).trim()
      if (text.startsWith('http')) {
        return text
      }
    }
  } catch {
    // Offline or network error
  }

  return longUrl
}

/**
 * Creates a reactive broadcast channel for instant multi-tab live sync.
 */
export function createLiveBroadcastChannel(onMessage?: (snapshot: LiveMatchSnapshot) => void): {
  broadcast: (snapshot: LiveMatchSnapshot) => void
  close: () => void
} {
  if (typeof window === 'undefined' || typeof window.BroadcastChannel === 'undefined') {
    return {
      broadcast: () => {},
      close: () => {},
    }
  }

  const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME)

  if (onMessage) {
    channel.onmessage = (event) => {
      try {
        const snap = event.data as LiveMatchSnapshot
        if (snap?.teamOne && snap?.teamTwo && snap?.score) {
          onMessage(snap)
        }
      } catch {}
    }
  }

  return {
    broadcast: (snapshot: LiveMatchSnapshot) => {
      try {
        channel.postMessage(snapshot)
      } catch {}
    },
    close: () => {
      try {
        channel.close()
      } catch {}
    },
  }
}

/**
 * Shares or copies the live viewer link.
 */
export async function deliverLiveShare(
  url: string,
  matchTitle: string,
): Promise<{ method: 'share' | 'clipboard'; success: boolean }> {
  const shareText = `🏏 Watch ${matchTitle} LIVE on ScoreMate! Ball-by-ball scores & wagon wheel:`

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: `Live Cricket: ${matchTitle}`,
        text: shareText,
        url,
      })
      return { method: 'share', success: true }
    } catch {
      // User cancelled or failed - fallback to clipboard
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(url)
      return { method: 'clipboard', success: true }
    } catch {}
  }

  return { method: 'clipboard', success: false }
}
