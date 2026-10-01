import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ScoreState } from '../../types/match'

export interface InningsChartsProps {
  firstInningsScore: ScoreState | null
  secondInningsScore: ScoreState | null
  firstTeam: string
  secondTeam: string
}

export function InningsCharts({
  firstInningsScore,
  secondInningsScore,
  firstTeam,
  secondTeam,
}: InningsChartsProps) {
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

  if (!data.length) return null

  return (
    <section className="innings-charts">
      <div className="chart-heading">
        <span className="section-kicker">Innings analytics</span>
        <strong>Manhattan &amp; worm</strong>
      </div>
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
    </section>
  )
}

export default InningsCharts
