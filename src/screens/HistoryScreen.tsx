import { useState, type ChangeEvent } from 'react'
import Icon from '../components/Icon'
import { Header } from '../components/common/Header'
import { BottomNav } from '../components/common/BottomNav'
import type { CompletedMatch, Screen } from '../types/match'
import { ACTIVE_MATCH_KEY, COMPLETED_MATCHES_KEY } from '../services/storageService'
import { exportMatchCsv } from '../services/exportService'
import { exportMatchImage } from '../services/canvasService'
import { filterMatches } from '../utils/search'
import { deliverFile } from '../utils/fileDelivery'
import { Capacitor } from '@capacitor/core'

export interface HistoryScreenProps {
  matches: CompletedMatch[]
  onBack: () => void
  onImport: (matches: CompletedMatch[]) => void
  setScreen: (screen: Screen) => void
}

function formatMatchResult(winner: string, margin?: string): string {
  if (winner === 'Match Drawn') return 'Match Drawn'
  if (!margin) return `${winner} won`
  const trimmed = margin.trim()
  const lower = trimmed.toLowerCase()
  if (lower.startsWith(winner.toLowerCase())) return trimmed
  if (lower.startsWith('won by')) return `${winner} ${trimmed}`
  if (lower.startsWith('by ')) return `${winner} won ${trimmed}`
  return `${winner} won by ${trimmed}`
}

export function HistoryScreen({
  matches,
  onBack,
  onImport,
  setScreen,
}: HistoryScreenProps) {
  const [search, setSearch] = useState('')
  const orderedMatches = [...matches].sort((first, second) => {
    const firstTime = Date.parse(first.savedAt)
    const secondTime = Date.parse(second.savedAt)
    return (Number.isNaN(secondTime) ? 0 : secondTime) - (Number.isNaN(firstTime) ? 0 : firstTime)
  })
  const filteredMatches = filterMatches(orderedMatches, search)

  function exportBackup() {
    const payload = { active: localStorage.getItem(ACTIVE_MATCH_KEY), completed: matches }
    const link = document.createElement('a')
    link.download = 'scoremate-backup.json'
    if (Capacitor.isNativePlatform()) {
      void deliverFile({
        filename: 'scoremate-backup.json',
        content: JSON.stringify(payload, null, 2),
        mimeType: 'application/json',
      })
    } else {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      link.href = URL.createObjectURL(blob)
      link.click()
      URL.revokeObjectURL(link.href)
    }
  }

  function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result)) as {
          active?: string | null
          completed?: CompletedMatch[]
        }
        if (payload.active) localStorage.setItem(ACTIVE_MATCH_KEY, payload.active)
        if (payload.completed) {
          localStorage.setItem(COMPLETED_MATCHES_KEY, JSON.stringify(payload.completed))
          localStorage.removeItem('scoremate-localstorage-migrated-v1')
          onImport(payload.completed)
        }
        window.location.reload()
      } catch {
        window.alert('This backup file is not valid.')
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="app-shell history-screen">
      <Header title="Match history" onBack={onBack} />
      <main className="history-content">
        <div className="search-bar">
          <Icon name="search" size={16} />
          <input
            type="search"
            placeholder="Search matches, teams, players, venue…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="history-actions">
          <button className="secondary-button" onClick={exportBackup}>
            <Icon name="download-cloud" />
            Backup data
          </button>
          <label className="secondary-button import-button">
            <Icon name="upload-cloud" />
            Import backup
            <input type="file" accept="application/json" onChange={importBackup} />
          </label>
        </div>
        {filteredMatches.length === 0 ? (
          <section className="empty-state">
            <div className="empty-icon">
              <Icon name="history" size={32} />
            </div>
            <h2>{search ? 'No matches found' : 'No saved matches yet'}</h2>
            <p>{search ? 'Try a different search term.' : 'Completed matches will appear here.'}</p>
          </section>
        ) : (
          <>
            {filteredMatches.map((match) => (
              <section className="history-match" key={match.id}>
                <div>
                  <span>{new Date(match.savedAt).toLocaleString()}</span>
                  <h3>
                    {match.teamOne} vs {match.teamTwo}
                  </h3>
                  <strong>
                    {match.firstInningsScore?.runs ?? 0}/{match.firstInningsScore?.wickets ?? 0} ·{' '}
                    {match.secondInningsScore?.runs ?? 0}/{match.secondInningsScore?.wickets ?? 0}
                  </strong>
                  <p>
                    {formatMatchResult(match.result.winner, match.result.margin)}
                  </p>
                </div>
                <div className="history-match-actions">
                  <button onClick={() => exportMatchCsv(match)}>
                    <Icon name="file-spreadsheet" />
                    CSV
                  </button>
                  <button onClick={() => exportMatchImage(match)}>
                    <Icon name="image" />
                    Image
                  </button>
                </div>
              </section>
            ))}
          </>
        )}
      </main>
      <BottomNav active="history" setScreen={setScreen} />
    </div>
  )
}

export default HistoryScreen
