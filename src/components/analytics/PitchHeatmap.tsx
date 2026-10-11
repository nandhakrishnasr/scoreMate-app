import { useState, useMemo } from 'react'
import type { BallTrackRecord, PitchDeliveryLength } from '../../types/match.ts'
import {
  PITCH_LENGTHS,
  ALL_LENGTHS,
  getLengthBreakdown,
} from '../../services/wagonWheelService.ts'

export interface PitchHeatmapProps {
  records: BallTrackRecord[]
  bowlers?: string[]
  title?: string
}

const ZONE_GEOMETRY: Record<PitchDeliveryLength, { y: number; h: number; label: string }> = {
  bouncer: { y: 20, h: 48, label: 'Bouncer (8m+)' },
  short: { y: 72, h: 54, label: 'Short (6–8m)' },
  good_length: { y: 130, h: 64, label: 'Good Length (4–6m)' },
  full: { y: 198, h: 54, label: 'Full (2–4m)' },
  yorker: { y: 256, h: 48, label: 'Yorker (0–2m)' },
}

export function PitchHeatmap({ records, bowlers = [], title = 'Pitch Length Heatmap' }: PitchHeatmapProps) {
  const [selectedBowler, setSelectedBowler] = useState<string>('all')
  const [hoveredLength, setHoveredLength] = useState<PitchDeliveryLength | null>(null)

  const filteredRecords = useMemo(() => {
    return selectedBowler === 'all'
      ? records
      : records.filter((r) => r.bowlerName === selectedBowler)
  }, [records, selectedBowler])

  const lengthStats = useMemo(() => {
    return getLengthBreakdown(filteredRecords, selectedBowler === 'all' ? undefined : selectedBowler)
  }, [filteredRecords, selectedBowler])

  // Plot landing dots on the pitch with deterministic jitter based on index
  const landingDots = useMemo(() => {
    return filteredRecords.map((r, idx) => {
      const len = r.length || 'good_length'
      const geo = ZONE_GEOMETRY[len]
      const pitchWidth = 140
      const pitchLeft = 130

      // Jitter x across pitch corridor (130 to 270)
      const xJitter = ((idx * 31) % (pitchWidth - 28)) + 14
      const x = pitchLeft + xJitter

      // Jitter y within zone height
      const yJitter = ((idx * 19) % (geo.h - 14)) + 7
      const y = geo.y + yJitter

      let dotColor = '#38bdf8' // Runs
      if (r.runs === 0) dotColor = '#94a3b8' // Dot ball
      if (r.runs >= 4) dotColor = '#34d399' // Boundary
      if (r.isWicket) dotColor = '#ef4444' // Wicket

      return {
        id: `dot-${idx}`,
        x,
        y,
        runs: r.runs,
        isWicket: r.isWicket,
        color: dotColor,
        length: len,
      }
    })
  }, [filteredRecords])

  return (
    <div className="pitch-heatmap-container">
      {/* Header */}
      <div className="wagon-wheel-header">
        <div className="wagon-wheel-title-group">
          <span className="section-kicker">Bowling Pitch Map</span>
          <h4>{title}</h4>
        </div>

        {bowlers.length > 0 && (
          <select
            value={selectedBowler}
            onChange={(e) => setSelectedBowler(e.target.value)}
            className="chart-select"
            aria-label="Filter by Bowler"
          >
            <option value="all">All Bowlers ({records.length} balls)</option>
            {bowlers.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* 22-Yard Pitch SVG Diagram */}
      <div className="pitch-heatmap-visual">
        <svg
          viewBox="0 0 400 340"
          className="pitch-heatmap-svg"
          role="img"
          aria-label="Cricket 22-yard pitch delivery length distribution"
        >
          <defs>
            <linearGradient id="pitchGrass" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#081a13" />
              <stop offset="100%" stopColor="#040f0a" />
            </linearGradient>
            <linearGradient id="turfPitch" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#1e1b18" />
              <stop offset="50%" stopColor="#292520" />
              <stop offset="100%" stopColor="#1e1b18" />
            </linearGradient>
          </defs>

          {/* Outfield background */}
          <rect x="0" y="0" width="400" height="340" rx="16" fill="url(#pitchGrass)" stroke="rgba(255, 255, 255, 0.08)" />

          {/* Pitch Strip (Width 140, Height 290, centered at X=130) */}
          <rect
            x="130"
            y="16"
            width="140"
            height="292"
            rx="6"
            fill="url(#turfPitch)"
            stroke="rgba(245, 158, 11, 0.3)"
            strokeWidth="1.5"
          />

          {/* Bowling Stumps (Top) */}
          <line x1="170" y1="18" x2="230" y2="18" stroke="#fef08a" strokeWidth="3" />
          <line x1="185" y1="18" x2="185" y2="24" stroke="#fef08a" strokeWidth="2.5" />
          <line x1="200" y1="18" x2="200" y2="24" stroke="#fef08a" strokeWidth="2.5" />
          <line x1="215" y1="18" x2="215" y2="24" stroke="#fef08a" strokeWidth="2.5" />
          <text x="200" y="12" fill="#94a3b8" fontSize="8" textAnchor="middle">BOWLER END</text>

          {/* Batting Stumps & Crease (Bottom) */}
          <line x1="150" y1="285" x2="250" y2="285" stroke="#fef08a" strokeWidth="2" strokeDasharray="3 3" />
          <line x1="170" y1="304" x2="230" y2="304" stroke="#fef08a" strokeWidth="3" />
          <line x1="185" y1="304" x2="185" y2="310" stroke="#fef08a" strokeWidth="2.5" />
          <line x1="200" y1="304" x2="200" y2="310" stroke="#fef08a" strokeWidth="2.5" />
          <line x1="215" y1="304" x2="215" y2="310" stroke="#fef08a" strokeWidth="2.5" />
          <text x="200" y="324" fill="#94a3b8" fontSize="8" textAnchor="middle">BATTER END</text>

          {/* 5 Length Zones on Pitch */}
          {ALL_LENGTHS.map((lenKey) => {
            const geo = ZONE_GEOMETRY[lenKey]
            const meta = PITCH_LENGTHS[lenKey]
            const stats = lengthStats[lenKey] || { balls: 0, percentage: 0 }
            const isHovered = hoveredLength === lenKey

            return (
              <g
                key={lenKey}
                onMouseEnter={() => setHoveredLength(lenKey)}
                onMouseLeave={() => setHoveredLength(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Zone rectangle */}
                <rect
                  x="132"
                  y={geo.y}
                  width="136"
                  height={geo.h - 4}
                  rx="4"
                  fill={isHovered ? meta.color : 'rgba(255, 255, 255, 0.04)'}
                  stroke={isHovered ? meta.accentColor : 'rgba(255, 255, 255, 0.1)'}
                  strokeWidth={isHovered ? 1.5 : 0.8}
                />
                {/* Left zone indicator text */}
                <text
                  x="122"
                  y={geo.y + geo.h / 2}
                  fill={isHovered ? meta.accentColor : '#94a3b8'}
                  fontSize="9.5"
                  fontWeight="600"
                  textAnchor="end"
                  fontFamily="'Outfit', sans-serif"
                >
                  {meta.label}
                </text>
                {/* Right percentage badge */}
                <text
                  x="278"
                  y={geo.y + geo.h / 2}
                  fill={isHovered ? meta.accentColor : '#f8fafc'}
                  fontSize="10"
                  fontWeight="700"
                  textAnchor="start"
                  fontFamily="'Outfit', sans-serif"
                >
                  {stats.percentage}% <tspan fill="#64748b" fontSize="8.5">({stats.balls}b)</tspan>
                </text>
              </g>
            )
          })}

          {/* Delivery Landing Dots */}
          {landingDots.map((dot) => (
            <g key={dot.id}>
              {dot.isWicket ? (
                <text
                  x={dot.x}
                  y={dot.y + 3}
                  fill="#ef4444"
                  fontSize="10"
                  fontWeight="900"
                  textAnchor="middle"
                >
                  ✕
                </text>
              ) : (
                <circle
                  cx={dot.x}
                  cy={dot.y}
                  r="3"
                  fill={dot.color}
                  stroke="rgba(0, 0, 0, 0.5)"
                  strokeWidth="1"
                  opacity={0.9}
                />
              )}
            </g>
          ))}
        </svg>

        {/* Legend */}
        <div className="wagon-wheel-legend">
          <span className="legend-item"><i className="legend-dot dot" /> Dots ({filteredRecords.filter(r => r.runs === 0).length})</span>
          <span className="legend-item"><i className="legend-dot runs" /> Runs ({filteredRecords.filter(r => r.runs > 0 && r.runs < 4).length})</span>
          <span className="legend-item"><i className="legend-dot four" /> 4s/6s ({filteredRecords.filter(r => r.runs >= 4).length})</span>
          <span className="legend-item"><i className="legend-dot wicket" /> Out ({filteredRecords.filter(r => r.isWicket).length})</span>
        </div>
      </div>

      {/* 5-Length Breakdown Cards */}
      <div className="pitch-length-grid">
        {ALL_LENGTHS.map((lenKey) => {
          const meta = PITCH_LENGTHS[lenKey]
          const stats = lengthStats[lenKey] || { balls: 0, runs: 0, wickets: 0, dotBalls: 0, percentage: 0 }
          const isSelected = hoveredLength === lenKey

          return (
            <div
              key={lenKey}
              className={`pitch-length-card ${isSelected ? 'highlight' : ''}`}
              onMouseEnter={() => setHoveredLength(lenKey)}
              onMouseLeave={() => setHoveredLength(null)}
            >
              <div className="length-card-top">
                <span className="length-name" style={{ color: meta.accentColor }}>{meta.label}</span>
                <span className="length-pct">{stats.percentage}%</span>
              </div>
              <div className="length-card-stats">
                <strong>{stats.balls} <small>balls</small></strong>
                <span>{stats.runs} runs conceded</span>
              </div>
              <div className="length-card-footer">
                <span className="dot-count">{stats.dotBalls} dots</span>
                {stats.wickets > 0 && <span className="wicket-count">{stats.wickets} wkt</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default PitchHeatmap
