import { useState } from 'react'
import type { CricketFieldZone, PitchDeliveryLength } from '../../types/match.ts'
import {
  CRICKET_FIELD_ZONES,
  ALL_ZONES,
  PITCH_LENGTHS,
  ALL_LENGTHS,
} from '../../services/wagonWheelService.ts'

export interface ShotTrackerModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (zone: CricketFieldZone, length: PitchDeliveryLength) => void
  batterName: string
  bowlerName: string
  runs: number
  isBoundary: boolean
  isWicket: boolean
}

export function ShotTrackerModal({
  isOpen,
  onClose,
  onSelect,
  batterName,
  bowlerName,
  runs,
  isBoundary,
  isWicket,
}: ShotTrackerModalProps) {
  const [selectedZone, setSelectedZone] = useState<CricketFieldZone>('cover')
  const [selectedLength, setSelectedLength] = useState<PitchDeliveryLength>('good_length')

  if (!isOpen) return null

  function handleConfirm() {
    onSelect(selectedZone, selectedLength)
    onClose()
  }

  function handleQuickZone(zone: CricketFieldZone) {
    setSelectedZone(zone)
    onSelect(zone, selectedLength)
    onClose()
  }

  return (
    <div className="settings-backdrop shot-tracker-backdrop" role="dialog" aria-modal="true">
      <div className="settings-modal shot-tracker-container">
        {/* Header */}
        <div className="shot-tracker-header">
          <div>
            <span className="section-kicker">Shot &amp; Pitch Tracker</span>
            <h3>
              {isBoundary ? (runs === 6 ? 'SIX 🔥' : 'FOUR ⚡') : runs > 0 ? `${runs} Runs` : isWicket ? 'Wicket 💥' : 'Dot Ball'} · {batterName}
            </h3>
            <small className="tracker-sub">Bowler: {bowlerName}</small>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Skip">
            ✕
          </button>
        </div>

        {/* Step 1: 8 Ground Zones (Tap to select) */}
        <div className="shot-step">
          <label className="step-label">Where was it hit? (Ground Zone)</label>
          <div className="shot-zone-selector-grid">
            {ALL_ZONES.map((zoneKey) => {
              const z = CRICKET_FIELD_ZONES[zoneKey]
              const isSelected = selectedZone === zoneKey
              return (
                <button
                  key={zoneKey}
                  type="button"
                  className={`shot-zone-btn ${isSelected ? 'active' : ''}`}
                  onClick={() => handleQuickZone(zoneKey)}
                  style={{ borderColor: isSelected ? z.color : undefined }}
                >
                  <span className="zone-indicator-dot" style={{ backgroundColor: z.color }} />
                  <span className="zone-btn-text">{z.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Step 2: Pitch Delivery Length */}
        <div className="shot-step">
          <label className="step-label">Delivery Length</label>
          <div className="shot-length-selector-grid">
            {ALL_LENGTHS.map((lenKey) => {
              const meta = PITCH_LENGTHS[lenKey]
              const isSelected = selectedLength === lenKey
              return (
                <button
                  key={lenKey}
                  type="button"
                  className={`shot-length-btn ${isSelected ? 'active' : ''}`}
                  onClick={() => setSelectedLength(lenKey)}
                >
                  <span className="length-btn-label">{meta.label}</span>
                  <small className="length-btn-range">{meta.range}</small>
                </button>
              )
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="shot-tracker-actions">
          <button type="button" className="primary-button wide-button" onClick={handleConfirm}>
            Save Shot Placement ✓
          </button>
          <button type="button" className="secondary-button" onClick={onClose}>
            Skip for this ball
          </button>
        </div>
      </div>
    </div>
  )
}

export default ShotTrackerModal
