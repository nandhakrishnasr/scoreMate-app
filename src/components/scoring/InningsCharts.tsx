import { useState, useMemo } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ScoreState } from '../../types/match.ts'
import { WagonWheel } from '../analytics/WagonWheel.tsx'
import { PitchHeatmap } from '../analytics/PitchHeatmap.tsx'
import { synthesizeBallTrackingIfEmpty } from '../../services/wagonWheelService.ts'

export interface InningsChartsProps {
  firstInningsScore: ScoreState | null
  secondInningsScore: ScoreState | null
  firstTeam: string
  secondTeam: string
}

type AnalyticsTab = 'worm' | 'wagon_wheel' | 'pitch_map'

export function InningsCharts({
  firstInningsScore,
  secondInningsScore,
  firstTeam,
  secondTeam,
}: InningsChartsProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('scoremate_analytics_expanded')
      return saved !== null ? saved === 'true' : true
    } catch {
      return true
    }
  })

  // Extract completed and in-progress overs for an innings
  const getInningsOvers = (score: ScoreState | null, teamName: string) => {
    if (!score) return []
    const oversList: { over: number; [key: string]: number }[] = []

    const history = score.overHistory ?? []
    history.forEach((over) => {
      oversList.push({
        over: over.number,
        [teamName]: over.runs,
      })
    })

    // If an over is in progress with balls bowled, include its runs so far
    const ballsInOver = score.balls % 6
    const currentOverBalls = score.currentOver ?? []
    const currentRuns = currentOverBalls.reduce(
      (sum, d) => sum + (typeof d === 'object' && d !== null && 'runs' in d ? (d.runs ?? 0) : 0),
      0
    )

    if (
      !score.inningsComplete &&
      (ballsInOver > 0 || currentOverBalls.length > 0) &&
      oversList.length < Math.ceil(score.balls / 6)
    ) {
      oversList.push({
        over: oversList.length + 1,
        [teamName]: currentRuns,
      })
    }

    return oversList
  }

  const firstData = useMemo(
    () => getInningsOvers(firstInningsScore, firstTeam),
    [firstInningsScore, firstTeam]
  )

  const secondData = useMemo(
    () => getInningsOvers(secondInningsScore, secondTeam),
    [secondInningsScore, secondTeam]
  )

  const hasChartData = firstData.length > 0 || secondData.length > 0

  const [activeTab, setActiveTab] = useState<AnalyticsTab>(() => {
    // If no overs have been bowled yet, default to Wagon Wheel so user sees useful shot tracking
    return (firstInningsScore?.balls ?? 0) > 0 ? 'worm' : 'wagon_wheel'
  })

  const [activeInnings, setActiveInnings] = useState<1 | 2>(secondInningsScore ? 2 : 1)

  // Runs per over data
  const runsPerOverData = useMemo(() => {
    if (!hasChartData) return []
    const maxLen = Math.max(firstData.length, secondData.length)
    return Array.from({ length: maxLen }, (_, index) => {
      const point: { over: number; [key: string]: number | null } = {
        over: index + 1,
        [firstTeam]: firstData[index]?.[firstTeam] ?? null,
      }
      if (secondInningsScore) {
        point[secondTeam] = secondData[index]?.[secondTeam] ?? null
      }
      return point
    })
  }, [firstData, secondData, firstTeam, secondTeam, secondInningsScore, hasChartData])

  // Cumulative score data (starting at Over 0)
  const cumulativeData = useMemo(() => {
    if (!hasChartData) return []
    const maxLen = Math.max(firstData.length, secondData.length)
    const points: { over: number; [key: string]: number | null }[] = [
      {
        over: 0,
        [firstTeam]: 0,
        ...(secondInningsScore ? { [secondTeam]: 0 } : {}),
      },
    ]

    let cum1 = 0
    let cum2 = 0

    for (let i = 0; i < maxLen; i++) {
      const r1 = firstData[i]?.[firstTeam]
      const r2 = secondData[i]?.[secondTeam]
      if (typeof r1 === 'number') cum1 += r1
      if (typeof r2 === 'number') cum2 += r2

      const pt: { over: number; [key: string]: number | null } = {
        over: i + 1,
        [firstTeam]: i < firstData.length ? cum1 : null,
      }
      if (secondInningsScore) {
        pt[secondTeam] = i < secondData.length ? cum2 : null
      }
      points.push(pt)
    }

    return points
  }, [firstData, secondData, firstTeam, secondTeam, secondInningsScore, hasChartData])

  const currentInningsScore =
    activeInnings === 1 ? firstInningsScore : (secondInningsScore || firstInningsScore)
  const currentTeamName = activeInnings === 1 ? firstTeam : secondTeam

  const currentBallRecords = useMemo(() => {
    return synthesizeBallTrackingIfEmpty(currentInningsScore)
  }, [currentInningsScore])

  const currentBatters = useMemo(() => {
    return (currentInningsScore?.battingStats ?? []).map((b) => b.name)
  }, [currentInningsScore])

  const currentBowlers = useMemo(() => {
    return (currentInningsScore?.bowlerStats ?? []).map((bw) => bw.name)
  }, [currentInningsScore])

  function toggleExpand() {
    setIsExpanded((prev) => {
      const next = !prev
      try {
        localStorage.setItem('scoremate_analytics_expanded', String(next))
      } catch {}
      return next
    })
  }

  if (!hasChartData && !firstInningsScore && !secondInningsScore) return null

  return (
    <section className={`innings-charts ${!isExpanded ? 'is-collapsed' : ''}`}>
      {/* Top Header */}
      <div className="chart-heading">
        <div className="chart-title-group">
          <span className="section-kicker">Visual Match Analytics</span>
          <strong className="chart-main-title">Match Breakdown</strong>
        </div>

        <div className="chart-heading-actions">
          {/* Expand / Collapse Button (Icon-only) */}
          <button
            type="button"
            className="analytics-expand-btn icon-only"
            onClick={toggleExpand}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Collapse Analytics' : 'Expand Analytics'}
            title={isExpanded ? 'Collapse Analytics' : 'Expand Analytics'}
          >
            <span className={`analytics-expand-chevron ${isExpanded ? 'expanded' : ''}`}>
              {isExpanded ? '▲' : '▼'}
            </span>
          </button>
        </div>
      </div>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="analytics-collapsible-body">
          {/* Tab Buttons */}
          <div className="analytics-tab-bar" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'worm'}
              className={`analytics-tab-btn ${activeTab === 'worm' ? 'active' : ''}`}
              onClick={() => setActiveTab('worm')}
            >
              📈 Run Rate
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'wagon_wheel'}
              className={`analytics-tab-btn ${activeTab === 'wagon_wheel' ? 'active' : ''}`}
              onClick={() => setActiveTab('wagon_wheel')}
            >
              🎯 Wagon Wheel
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'pitch_map'}
              className={`analytics-tab-btn ${activeTab === 'pitch_map' ? 'active' : ''}`}
              onClick={() => setActiveTab('pitch_map')}
            >
              📍 Pitch Map
            </button>
          </div>

          {/* Innings Switcher for Visual Tabs */}
          {(activeTab === 'wagon_wheel' || activeTab === 'pitch_map') && secondInningsScore && (
            <div className="analytics-innings-switcher">
              <button
                type="button"
                className={`innings-switch-pill ${activeInnings === 1 ? 'active' : ''}`}
                onClick={() => setActiveInnings(1)}
              >
                1st Innings ({firstTeam})
              </button>
              <button
                type="button"
                className={`innings-switch-pill ${activeInnings === 2 ? 'active' : ''}`}
                onClick={() => setActiveInnings(2)}
              >
                2nd Innings ({secondTeam})
              </button>
            </div>
          )}

          {/* Tab 1: Manhattan & Worm Line Charts */}
          {activeTab === 'worm' && (
            <>
              {hasChartData ? (
                <>
                  <div className="chart-card">
                    <div className="chart-card-header">
                      <span>Runs per over</span>
                      <div className="chart-legend-inline">
                        <span className="legend-dot team-1" />
                        <small>{firstTeam}</small>
                        {secondInningsScore && (
                          <>
                            <span className="legend-dot team-2" />
                            <small>{secondTeam}</small>
                          </>
                        )}
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={170}>
                      <LineChart data={runsPerOverData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, rgba(255,255,255,0.08))" />
                        <XAxis dataKey="over" stroke="var(--chart-axis, rgba(255,255,255,0.45))" fontSize={10} />
                        <YAxis stroke="var(--chart-axis, rgba(255,255,255,0.45))" fontSize={10} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'var(--surface-card, #0f172a)',
                            borderColor: 'var(--line, rgba(255,255,255,0.12))',
                            color: 'var(--text-primary, #f8fafc)',
                            borderRadius: '8px',
                            fontSize: '12px',
                          }}
                          itemStyle={{ color: 'var(--text-primary, #f8fafc)' }}
                          labelStyle={{ color: 'var(--text-muted, #94a3b8)' }}
                        />
                        <Line
                          type="monotone"
                          dataKey={firstTeam}
                          stroke="var(--chart-line-1, #10b981)"
                          strokeWidth={2.5}
                          dot={{ r: 3, fill: 'var(--chart-line-1, #10b981)' }}
                          activeDot={{ r: 5 }}
                          connectNulls
                        />
                        {secondInningsScore && (
                          <Line
                            type="monotone"
                            dataKey={secondTeam}
                            stroke="var(--chart-line-2, #38bdf8)"
                            strokeWidth={2.5}
                            dot={{ r: 3, fill: 'var(--chart-line-2, #38bdf8)' }}
                            activeDot={{ r: 5 }}
                            connectNulls
                          />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="chart-card">
                    <div className="chart-card-header">
                      <span>Cumulative score</span>
                      <div className="chart-legend-inline">
                        <span className="legend-dot team-1" />
                        <small>{firstTeam}</small>
                        {secondInningsScore && (
                          <>
                            <span className="legend-dot team-2" />
                            <small>{secondTeam}</small>
                          </>
                        )}
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={170}>
                      <LineChart data={cumulativeData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, rgba(255,255,255,0.08))" />
                        <XAxis dataKey="over" stroke="var(--chart-axis, rgba(255,255,255,0.45))" fontSize={10} />
                        <YAxis stroke="var(--chart-axis, rgba(255,255,255,0.45))" fontSize={10} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'var(--surface-card, #0f172a)',
                            borderColor: 'var(--line, rgba(255,255,255,0.12))',
                            color: 'var(--text-primary, #f8fafc)',
                            borderRadius: '8px',
                            fontSize: '12px',
                          }}
                          itemStyle={{ color: 'var(--text-primary, #f8fafc)' }}
                          labelStyle={{ color: 'var(--text-muted, #94a3b8)' }}
                        />
                        <Line
                          type="monotone"
                          dataKey={firstTeam}
                          stroke="var(--chart-line-1, #10b981)"
                          strokeWidth={2.5}
                          dot={{ r: 3, fill: 'var(--chart-line-1, #10b981)' }}
                          activeDot={{ r: 5 }}
                          connectNulls
                        />
                        {secondInningsScore && (
                          <Line
                            type="monotone"
                            dataKey={secondTeam}
                            stroke="var(--chart-line-2, #38bdf8)"
                            strokeWidth={2.5}
                            dot={{ r: 3, fill: 'var(--chart-line-2, #38bdf8)' }}
                            activeDot={{ r: 5 }}
                            connectNulls
                          />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <div className="analytics-empty-card">
                  <span className="analytics-empty-icon">📊</span>
                  <h4>Waiting for Over Data</h4>
                  <p>
                    Runs per over and cumulative worm charts will appear automatically once overs are bowled in this innings.
                  </p>
                </div>
              )}
            </>
          )}

          {/* Tab 2: Interactive Wagon Wheel */}
          {activeTab === 'wagon_wheel' && (
            <WagonWheel
              records={currentBallRecords}
              batters={currentBatters}
              title={`Wagon Wheel · ${currentTeamName}`}
            />
          )}

          {/* Tab 3: Interactive Pitch Length Heatmap */}
          {activeTab === 'pitch_map' && (
            <PitchHeatmap
              records={currentBallRecords}
              bowlers={currentBowlers}
              title={`Pitch Length Heatmap · ${currentTeamName} Bowlers`}
            />
          )}
        </div>
      )}
    </section>
  )
}

export default InningsCharts
