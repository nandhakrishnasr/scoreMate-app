import { useState, useMemo } from 'react'
import type { BallTrackRecord, CricketFieldZone } from '../../types/match.ts'
import {
  CRICKET_FIELD_ZONES,
  ALL_ZONES,
  getZoneBreakdown,
} from '../../services/wagonWheelService.ts'

export interface WagonWheelProps {
  records: BallTrackRecord[]
  batters?: string[]
  title?: string
}

export function WagonWheel({ records, batters = [], title = 'Wagon Wheel' }: WagonWheelProps) {
  const [selectedBatter, setSelectedBatter] = useState<string>('all')
  const [filterType, setFilterType] = useState<'all' | 'boundaries' | 'wickets'>('all')
  const [hoveredZone, setHoveredZone] = useState<CricketFieldZone | null>(null)

  // Filter records
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (selectedBatter !== 'all' && r.batterName !== selectedBatter) return false
      if (filterType === 'boundaries' && !r.isBoundary) return false
      if (filterType === 'wickets' && !r.isWicket) return false
      return true
    })
  }, [records, selectedBatter, filterType])

  const zoneStats = useMemo(() => {
    return getZoneBreakdown(filteredRecords, selectedBatter === 'all' ? undefined : selectedBatter)
  }, [filteredRecords, selectedBatter])

  // Center of SVG (viewBox 0 0 400 400)
  const cx = 200
  const cy = 200
  const radius = 175
  const innerRadius = 90

  // Calculate coordinates for shot rays
  const shotRays = useMemo(() => {
    return filteredRecords.map((r, idx) => {
      const zoneMeta = CRICKET_FIELD_ZONES[r.zone || 'cover']
      // Add slight jitter (-12 deg to +12 deg) around zone angle so lines don't stack directly
      const jitter = ((idx * 17) % 25) - 12
      const angle = (zoneMeta.angleDeg + jitter - 90) * (Math.PI / 180)

      let lineDist = radius * 0.55
      let strokeColor = '#38bdf8' // 1,2,3 runs (Cyan)
      let strokeWidth = 2.5

      if (r.runs === 6) {
        lineDist = radius * 0.98
        strokeColor = '#c084fc' // 6 runs (Purple)
        strokeWidth = 3.5
      } else if (r.runs === 4) {
        lineDist = radius * 0.88
        strokeColor = '#34d399' // 4 runs (Emerald)
        strokeWidth = 3.5
      } else if (r.isWicket) {
        lineDist = radius * 0.65
        strokeColor = '#f87171' // Wicket (Red)
        strokeWidth = 3
      } else if (r.runs === 0) {
        lineDist = radius * 0.32
        strokeColor = 'rgba(148, 163, 184, 0.45)' // Dot (Muted)
        strokeWidth = 1.5
      } else if (r.runs > 1) {
        lineDist = radius * 0.72
        strokeColor = '#60a5fa' // 2 or 3 runs (Blue)
        strokeWidth = 2.5
      }

      const x2 = cx + Math.cos(angle) * lineDist
      const y2 = cy + Math.sin(angle) * lineDist

      return {
        id: `shot-${idx}`,
        x1: cx,
        y1: cy,
        x2,
        y2,
        runs: r.runs,
        isBoundary: r.isBoundary,
        isWicket: r.isWicket,
        color: strokeColor,
        width: strokeWidth,
        batter: r.batterName,
        zone: r.zone,
      }
    })
  }, [filteredRecords, cx, cy, radius])

  return (
    <div className="wagon-wheel-container">
      {/* Header & Controls */}
      <div className="wagon-wheel-header">
        <div className="wagon-wheel-title-group">
          <span className="section-kicker">Ball Trajectory</span>
          <h4>{title}</h4>
        </div>

        {/* Filter Toolbars */}
        <div className="wagon-wheel-controls">
          {batters.length > 0 && (
            <select
              value={selectedBatter}
              onChange={(e) => setSelectedBatter(e.target.value)}
              className="chart-select"
              aria-label="Filter by Batter"
            >
              <option value="all">All Batters ({records.length} balls)</option>
              {batters.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          )}

          <div className="wagon-pill-group">
            <button
              type="button"
              className={`wagon-pill ${filterType === 'all' ? 'active' : ''}`}
              onClick={() => setFilterType('all')}
            >
              All
            </button>
            <button
              type="button"
              className={`wagon-pill ${filterType === 'boundaries' ? 'active' : ''}`}
              onClick={() => setFilterType('boundaries')}
            >
              4s &amp; 6s
            </button>
            <button
              type="button"
              className={`wagon-pill ${filterType === 'wickets' ? 'active' : ''}`}
              onClick={() => setFilterType('wickets')}
            >
              Wickets
            </button>
          </div>
        </div>
      </div>

      {/* SVG Cricket Ground */}
      <div className="wagon-wheel-ground-wrapper">
        <svg
          viewBox="0 0 400 400"
          className="wagon-wheel-svg"
          role="img"
          aria-label="Cricket ground wagon wheel visualization"
        >
          <defs>
            <radialGradient id="groundGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#0f291e" />
              <stop offset="85%" stopColor="#081c14" />
              <stop offset="100%" stopColor="#040e0a" />
            </radialGradient>
            <radialGradient id="pitchGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(245, 158, 11, 0.25)" />
              <stop offset="100%" stopColor="rgba(245, 158, 11, 0)" />
            </radialGradient>
          </defs>

          {/* Outfield Grass Circle */}
          <circle cx={cx} cy={cy} r={radius} fill="url(#groundGrad)" stroke="rgba(52, 211, 153, 0.4)" strokeWidth="3" />

          {/* 30-Yard Circle */}
          <circle
            cx={cx}
            cy={cy}
            r={innerRadius}
            fill="none"
            stroke="rgba(255, 255, 255, 0.15)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />

          {/* Sector Dividers (8 Ground Zones) */}
          {ALL_ZONES.map((zoneKey) => {
            const z = CRICKET_FIELD_ZONES[zoneKey]
            const angle = (z.angleDeg - 90) * (Math.PI / 180)
            const edgeX = cx + Math.cos(angle) * radius
            const edgeY = cy + Math.sin(angle) * radius
            const labelX = cx + Math.cos(angle) * (radius - 22)
            const labelY = cy + Math.sin(angle) * (radius - 22)
            const isHovered = hoveredZone === zoneKey

            return (
              <g
                key={zoneKey}
                onMouseEnter={() => setHoveredZone(zoneKey)}
                onMouseLeave={() => setHoveredZone(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Ray line divider */}
                <line
                  x1={cx}
                  y1={cy}
                  x2={edgeX}
                  y2={edgeY}
                  stroke={isHovered ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.08)'}
                  strokeWidth={isHovered ? 2 : 1}
                />
                {/* Sector short label */}
                <text
                  x={labelX}
                  y={labelY + 4}
                  fill={isHovered ? '#34d399' : 'rgba(255, 255, 255, 0.45)'}
                  fontSize="8.5"
                  fontWeight="600"
                  textAnchor="middle"
                  fontFamily="'Outfit', -apple-system, sans-serif"
                >
                  {z.label.split(' ')[0]}
                </text>
              </g>
            )
          })}

          {/* Pitch Rectangle in Center */}
          <rect
            x={cx - 10}
            y={cy - 24}
            width={20}
            height={48}
            rx={3}
            fill="#d97706"
            stroke="rgba(251, 191, 36, 0.8)"
            strokeWidth="1.5"
          />
          {/* Batting Crease lines */}
          <line x1={cx - 12} y1={cy - 16} x2={cx + 12} y2={cy - 16} stroke="#fef3c7" strokeWidth="1.5" />
          <line x1={cx - 12} y1={cy + 16} x2={cx + 12} y2={cy + 16} stroke="#fef3c7" strokeWidth="1.5" />

          {/* Shot Rays */}
          {shotRays.map((shot) => (
            <g key={shot.id}>
              <line
                x1={shot.x1}
                y1={shot.y1}
                x2={shot.x2}
                y2={shot.y2}
                stroke={shot.color}
                strokeWidth={shot.width}
                strokeLinecap="round"
                opacity={0.88}
              />
              {/* Terminal marker */}
              {shot.isWicket ? (
                <text
                  x={shot.x2}
                  y={shot.y2 + 4}
                  fill="#ef4444"
                  fontSize="12"
                  fontWeight="900"
                  textAnchor="middle"
                >
                  ✕
                </text>
              ) : (
                <circle
                  cx={shot.x2}
                  cy={shot.y2}
                  r={shot.isBoundary ? 3.5 : 2.5}
                  fill={shot.color}
                  stroke="rgba(0, 0, 0, 0.4)"
                  strokeWidth="1"
                />
              )}
            </g>
          ))}
        </svg>

        {/* Legend */}
        <div className="wagon-wheel-legend">
          <span className="legend-item"><i className="legend-dot six" /> 6s ({filteredRecords.filter(r => r.runs === 6).length})</span>
          <span className="legend-item"><i className="legend-dot four" /> 4s ({filteredRecords.filter(r => r.runs === 4).length})</span>
          <span className="legend-item"><i className="legend-dot runs" /> 1s-3s ({filteredRecords.filter(r => r.runs > 0 && r.runs < 4).length})</span>
          <span className="legend-item"><i className="legend-dot wicket" /> Out ({filteredRecords.filter(r => r.isWicket).length})</span>
        </div>
      </div>

      {/* 8-Zone Scoring Breakdown Cards */}
      <div className="wagon-zone-grid">
        {ALL_ZONES.map((zoneKey) => {
          const z = CRICKET_FIELD_ZONES[zoneKey]
          const stats = zoneStats[zoneKey] || { runs: 0, balls: 0, fours: 0, sixes: 0, percentage: 0 }
          const isSelected = hoveredZone === zoneKey

          return (
            <div
              key={zoneKey}
              className={`wagon-zone-card ${isSelected ? 'highlight' : ''}`}
              onMouseEnter={() => setHoveredZone(zoneKey)}
              onMouseLeave={() => setHoveredZone(null)}
            >
              <div className="zone-card-top">
                <span className="zone-name" style={{ color: z.color }}>{z.label}</span>
                <span className="zone-pct">{stats.percentage}%</span>
              </div>
              <div className="zone-card-stats">
                <strong>{stats.runs} <small>runs</small></strong>
                <span>{stats.balls} balls</span>
              </div>
              {(stats.fours > 0 || stats.sixes > 0) && (
                <div className="zone-card-boundaries">
                  {stats.fours > 0 && <span className="four-tag">{stats.fours}×4</span>}
                  {stats.sixes > 0 && <span className="six-tag">{stats.sixes}×6</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default WagonWheel
