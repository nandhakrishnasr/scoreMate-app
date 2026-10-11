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
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('worm')
  const [activeInnings, setActiveInnings] = useState<1 | 2>(secondInningsScore ? 2 : 1)

  const firstData = (firstInningsScore?.overHistory ?? []).map((over) => ({
    over: over.number,
    [firstTeam]: over.runs,
  }))
  const secondData = (secondInningsScore?.overHistory ?? []).map((over) => ({
    over: over.number,
    [secondTeam]: over.runs,
  }))
  const data = Array.from(
    { length: Math.max(firstData.length, secondData.length) },
    (_, index) => ({
      over: index + 1,
      [firstTeam]: firstData[index]?.[firstTeam] ?? null,
      [secondTeam]: secondData[index]?.[secondTeam] ?? null,
    }),
  )

  const currentInningsScore = activeInnings === 1 ? firstInningsScore : (secondInningsScore || firstInningsScore)
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

  if (!data.length && !firstInningsScore && !secondInningsScore) return null

  return (
    <section className="innings-charts">
      {/* Top Header */}
      <div className="chart-heading">
        <div>
          <span className="section-kicker">Visual Match Analytics</span>
          <strong>Match Breakdown</strong>
        </div>

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
          <div className="chart-card">
            <span>Runs per over</span>
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="over" stroke="var(--chart-axis)" fontSize={10} />
                <YAxis stroke="var(--chart-axis)" fontSize={10} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--surface)',
                    borderColor: 'var(--line)',
                    color: 'var(--text-primary)',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  itemStyle={{ color: 'var(--text-primary)' }}
                  labelStyle={{ color: 'var(--muted)' }}
                />
                <Line
                  type="monotone"
                  dataKey={firstTeam}
                  stroke="var(--chart-line-1)"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey={secondTeam}
                  stroke="var(--chart-line-2)"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-card">
            <span>Cumulative score</span>
            <ResponsiveContainer width="100%" height={170}>
              <LineChart
                data={data.map((entry, index) => ({
                  ...entry,
                  [firstTeam]:
                    firstData
                      .slice(0, index + 1)
                      .reduce((total, item) => total + (Number(item[firstTeam]) || 0), 0) || null,
                  [secondTeam]:
                    secondData
                      .slice(0, index + 1)
                      .reduce((total, item) => total + (Number(item[secondTeam]) || 0), 0) || null,
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="over" stroke="var(--chart-axis)" fontSize={10} />
                <YAxis stroke="var(--chart-axis)" fontSize={10} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--surface)',
                    borderColor: 'var(--line)',
                    color: 'var(--text-primary)',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  itemStyle={{ color: 'var(--text-primary)' }}
                  labelStyle={{ color: 'var(--muted)' }}
                />
                <Line
                  type="monotone"
                  dataKey={firstTeam}
                  stroke="var(--chart-line-1)"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey={secondTeam}
                  stroke="var(--chart-line-2)"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
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
    </section>
  )
}

export default InningsCharts
