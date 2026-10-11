import { useState, useMemo, useEffect } from 'react'
import Icon from '../Icon.tsx'
import type { LiveMatchSnapshot } from '../../types/match.ts'
import { encodeLiveMatchToUrl, deliverLiveShare, shortenLiveUrl } from '../../services/liveShareService.ts'

export interface LiveShareModalProps {
  isOpen: boolean
  onClose: () => void
  snapshot: LiveMatchSnapshot
}

export function LiveShareModal({ isOpen, onClose, snapshot }: LiveShareModalProps) {
  const [copied, setCopied] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [shortUrl, setShortUrl] = useState<string | null>(null)
  const [isShortening, setIsShortening] = useState(false)
  const [useShort, setUseShort] = useState(true)

  const compactUrl = useMemo(() => {
    return encodeLiveMatchToUrl(snapshot)
  }, [snapshot])

  // Automatically attempt to fetch shortened link when modal opens
  useEffect(() => {
    if (!isOpen) return
    let active = true
    shortenLiveUrl(compactUrl)
      .then((res) => {
        if (!active) return
        if (res && res !== compactUrl) {
          setShortUrl(res)
          setUseShort(true)
        }
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [isOpen, compactUrl])

  if (!isOpen) return null

  const matchTitle = `${snapshot.teamOne} vs ${snapshot.teamTwo}`
  const activeUrl = useShort && shortUrl ? shortUrl : compactUrl

  async function handleShare() {
    setSharing(true)
    const result = await deliverLiveShare(activeUrl, matchTitle)
    setSharing(false)
    if (result.success && result.method === 'clipboard') {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  async function handleCopy() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(activeUrl)
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      } catch {}
    }
  }

  async function handleManualShorten() {
    if (shortUrl) {
      setUseShort(!useShort)
      return
    }
    setIsShortening(true)
    const res = await shortenLiveUrl(compactUrl)
    setIsShortening(false)
    if (res && res !== compactUrl) {
      setShortUrl(res)
      setUseShort(true)
    }
  }

  return (
    <div className="settings-backdrop live-share-backdrop" role="dialog" aria-modal="true">
      <div className="settings-modal live-share-container">
        {/* Header */}
        <div className="live-share-header">
          <div>
            <div className="live-broadcast-pill">
              <span className="live-pulse-dot" />
              <span>LIVE BROADCAST</span>
            </div>
            <h3>Share Live Match</h3>
            <p className="live-share-sub">{matchTitle}</p>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Live Preview Card */}
        <div className="live-share-preview-card">
          <div className="preview-top">
            <span className="live-preview-tag">
              {shortUrl && useShort ? '⚡ Short Link Ready' : 'Compact Spectator Link'}
            </span>
            <small>Updated live on every ball</small>
          </div>
          <div className="preview-score-box">
            <strong className="preview-score">
              {snapshot.score.runs}/{snapshot.score.wickets}
            </strong>
            <span className="preview-overs">
              ({Math.floor(snapshot.score.balls / 6)}.{snapshot.score.balls % 6}/{snapshot.overs} ov)
            </span>
          </div>
          <div className="preview-crease">
            <span>Batting: {snapshot.score.striker.name}* ({snapshot.score.striker.runs})</span>
            <span>Bowler: {snapshot.score.bowler.name}</span>
          </div>
        </div>

        {/* URL Box */}
        <div className="live-url-box">
          <input
            type="text"
            readOnly
            value={activeUrl}
            className="live-url-input"
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <button
            type="button"
            className={`copy-url-btn ${copied ? 'copied' : ''}`}
            onClick={handleCopy}
            title="Copy Link"
          >
            {copied ? 'Copied! ✓' : 'Copy'}
          </button>
        </div>

        {/* Shorten Link Meta & Toggle */}
        <div className="live-url-meta-row">
          <span className="live-url-length-pill">
            {activeUrl.length} characters {activeUrl.length < 40 ? '(Short)' : '(Compact)'}
          </span>
          <button
            type="button"
            className="shorten-toggle-btn"
            onClick={handleManualShorten}
            disabled={isShortening}
          >
            {isShortening
              ? 'Shortening... ⏳'
              : shortUrl
                ? useShort
                  ? 'Switch to Direct Link'
                  : 'Switch to Short Link ⚡'
                : '⚡ Shorten Link'}
          </button>
        </div>

        {/* Share Action Buttons */}
        <div className="live-share-actions">
          <button
            type="button"
            className="primary-button wide-button live-broadcast-share-btn"
            onClick={handleShare}
            disabled={sharing}
          >
            <Icon name="share-2" size={18} />
            {copied ? 'Link Copied to Clipboard! ✓' : 'Share Short Link with Spectators'}
          </button>

          <p className="live-share-hint">
            Anyone with this link can watch live ball-by-ball scores, wagon wheels, and pitch heatmaps in real time on any phone or browser.
          </p>
        </div>
      </div>
    </div>
  )
}

export default LiveShareModal
