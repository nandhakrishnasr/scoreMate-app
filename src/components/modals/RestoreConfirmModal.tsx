import { useState } from 'react'
import Icon from '../Icon'
import type { RestoreMode } from '../../types/database'

export interface RestoreConfirmModalProps {
  isOpen: boolean
  onCancel: () => void
  onConfirm: (mode: RestoreMode) => void
  isRestoring?: boolean
  backupSummary?: {
    matchCount?: number
    teamCount?: number
    playerCount?: number
    createdAt?: string
  } | null
}

export function RestoreConfirmModal({
  isOpen,
  onCancel,
  onConfirm,
  isRestoring = false,
  backupSummary,
}: RestoreConfirmModalProps) {
  const [selectedMode, setSelectedMode] = useState<RestoreMode>('merge')

  if (!isOpen) return null

  const isReplace = selectedMode === 'replace'

  return (
    <div className="settings-backdrop" role="dialog" aria-modal="true" aria-labelledby="restore-modal-title">
      <section className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <button
          className="sheet-close"
          onClick={onCancel}
          disabled={isRestoring}
          aria-label="Close restore dialog"
        >
          <Icon name="x" size={16} />
        </button>

        <div className="settings-head">
          <span className="section-kicker">Data Management</span>
          <h3 id="restore-modal-title">Restore backup</h3>
        </div>

        {backupSummary && (
          <div
            style={{
              background: 'var(--surface-soft)',
              border: '1px solid var(--line)',
              borderRadius: '12px',
              padding: '10px 14px',
              marginBottom: '16px',
              fontSize: '12px',
              color: 'var(--soft)',
            }}
          >
            <strong style={{ display: 'block', marginBottom: '4px', color: 'var(--text-heading)' }}>
              Backup Details
            </strong>
            {backupSummary.createdAt && (
              <div style={{ color: 'var(--muted)', fontSize: '11px', marginBottom: '4px' }}>
                Created: {new Date(backupSummary.createdAt).toLocaleString()}
              </div>
            )}
            <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--soft)' }}>
              {backupSummary.matchCount !== undefined && <span>Matches: {backupSummary.matchCount}</span>}
              {backupSummary.teamCount !== undefined && <span>Teams: {backupSummary.teamCount}</span>}
              {backupSummary.playerCount !== undefined && <span>Players: {backupSummary.playerCount}</span>}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
          {/* Merge Option */}
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              padding: '12px',
              borderRadius: '12px',
              border: selectedMode === 'merge' ? '1px solid var(--accent)' : '1px solid var(--line)',
              background: selectedMode === 'merge' ? 'rgba(169, 152, 255, 0.12)' : 'var(--surface-soft)',
              cursor: isRestoring ? 'not-allowed' : 'pointer',
            }}
          >
            <input
              type="radio"
              name="restoreMode"
              value="merge"
              checked={selectedMode === 'merge'}
              onChange={() => setSelectedMode('merge')}
              disabled={isRestoring}
              style={{ marginTop: '3px' }}
            />
            <div>
              <strong style={{ display: 'block', fontSize: '13px', color: 'var(--text-heading)' }}>Merge</strong>
              <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginTop: '2px' }}>
                Adds/restores backup data while preserving compatible existing local data.
              </span>
            </div>
          </label>

          {/* Replace Option */}
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              padding: '12px',
              borderRadius: '12px',
              border: selectedMode === 'replace' ? '1px solid var(--danger)' : '1px solid var(--line)',
              background: selectedMode === 'replace' ? 'rgba(255, 143, 155, 0.12)' : 'var(--surface-soft)',
              cursor: isRestoring ? 'not-allowed' : 'pointer',
            }}
          >
            <input
              type="radio"
              name="restoreMode"
              value="replace"
              checked={selectedMode === 'replace'}
              onChange={() => setSelectedMode('replace')}
              disabled={isRestoring}
              style={{ marginTop: '3px' }}
            />
            <div>
              <strong style={{ display: 'block', fontSize: '13px', color: selectedMode === 'replace' ? 'var(--danger)' : 'var(--text-heading)' }}>
                Replace
              </strong>
              <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginTop: '2px' }}>
                Replaces the local matches, teams and players with the backup contents.
              </span>
            </div>
          </label>
        </div>

        {/* Warning banner for Replace */}
        {isReplace && (
          <div
            style={{
              background: 'rgba(255, 143, 155, 0.12)',
              border: '1px solid var(--danger)',
              borderRadius: '10px',
              padding: '10px 12px',
              marginBottom: '16px',
              fontSize: '11px',
              color: 'var(--danger)',
              lineHeight: 1.4,
            }}
          >
            <strong>Warning:</strong> Existing local match history, teams, and players will be permanently overwritten. This operation cannot be undone.
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            className="secondary-button"
            onClick={onCancel}
            disabled={isRestoring}
            style={{ flex: 1 }}
          >
            Cancel
          </button>
          <button
            className="primary-button"
            onClick={() => onConfirm(selectedMode)}
            disabled={isRestoring}
            style={{
              flex: 1.2,
              background: isReplace ? 'var(--danger)' : undefined,
              borderColor: isReplace ? 'var(--danger)' : undefined,
            }}
          >
            {isRestoring
              ? 'Restoring…'
              : isReplace
              ? 'Replace local data'
              : 'Merge backup data'}
          </button>
        </div>
      </section>
    </div>
  )
}

export default RestoreConfirmModal
