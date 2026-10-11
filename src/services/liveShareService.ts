import type { LiveMatchSnapshot } from '../types/match.ts'

const LIVE_HASH_PREFIX = '#live='
const LIVE_QUERY_PARAM = 'live='
const BROADCAST_CHANNEL_NAME = 'scoremate_live_stream'

/**
 * Encodes a live match snapshot into a URL-safe hash fragment.
 */
export function encodeLiveMatchToUrl(snapshot: LiveMatchSnapshot, baseUrl?: string): string {
  const json = JSON.stringify(snapshot)
  // UTF-8 safe Base64 encoding
  let base64: string
  if (typeof btoa === 'function') {
    base64 = btoa(unescape(encodeURIComponent(json)))
  } else if (typeof (globalThis as unknown as { Buffer?: { from: (s: string, enc: string) => { toString: (enc: string) => string } } }).Buffer !== 'undefined') {
    const buf = (globalThis as unknown as { Buffer: { from: (s: string, enc: string) => { toString: (enc: string) => string } } }).Buffer
    base64 = buf.from(json, 'utf8').toString('base64')
  } else {
    base64 = ''
  }

  const base = baseUrl || (typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '')
  return `${base}#live=${base64}`
}

/**
 * Decodes a live match snapshot from a URL, hash, or query string.
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
  } else if (str.startsWith('ey')) {
    // Direct raw base64 string
    payload = str
  }

  if (!payload) return null

  try {
    let json: string
    if (typeof atob === 'function') {
      json = decodeURIComponent(escape(atob(payload)))
    } else if (typeof (globalThis as unknown as { Buffer?: { from: (s: string, enc: string) => { toString: (enc: string) => string } } }).Buffer !== 'undefined') {
      const buf = (globalThis as unknown as { Buffer: { from: (s: string, enc: string) => { toString: (enc: string) => string } } }).Buffer
      json = buf.from(payload, 'base64').toString('utf8')
    } else {
      return null
    }

    const data = JSON.parse(json) as LiveMatchSnapshot
    if (data && data.teamOne && data.teamTwo && data.score) {
      return data
    }
  } catch {
    // Malformed base64 or JSON
    return null
  }

  return null
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
  const shareText = `🏏 Watch ${matchTitle} LIVE on ScoreMate! Ball-by-ball scores, wagon wheel & commentary:`

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
