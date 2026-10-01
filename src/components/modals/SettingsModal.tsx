import { useState, useRef, type ChangeEvent } from 'react'
import Icon from '../Icon'
import { useAuth } from '../../context/AuthContext'
import { RestoreConfirmModal } from './RestoreConfirmModal'
import {
  executeLocalExport,
  executeRestore,
  inspectBackupSummary,
  sanitizeUserFacingError,
  type BackupUIOperation,
  type BackupStatusMessage,
  type BackupInspectionSummary,
} from '../../services/backupUIController'
import type { RestoreMode } from '../../types/database'

export interface SettingsModalProps {
  theme: 'dark' | 'light'
  onThemeChange: (theme: 'dark' | 'light') => void
  onClose: () => void
  exportBackup?: () => void
  onImport?: (event: ChangeEvent<HTMLInputElement>) => void
  onReloadMatches?: () => void | Promise<void>
}

export function SettingsModal({
  theme,
  onThemeChange,
  onClose,
  exportBackup,
  onImport,
  onReloadMatches,
}: SettingsModalProps) {
  const { user } = useAuth()

  // Local Backup & Restore State
  const [operation, setOperation] = useState<BackupUIOperation>('idle')
  const [statusMessage, setStatusMessage] = useState<BackupStatusMessage | null>(null)

  // Restore Modal State
  const [restoreModalOpen, setRestoreModalOpen] = useState(false)
  const [pendingRestoreContent, setPendingRestoreContent] = useState<string | null>(null)
  const [pendingRestoreSummary, setPendingRestoreSummary] = useState<BackupInspectionSummary | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const isBusy = operation !== 'idle'

  async function handleLocalExport() {
    if (isBusy) return
    if (exportBackup) {
      exportBackup()
      return
    }
    setOperation('exporting')
    setStatusMessage({ type: 'info', text: 'Exporting backup…' })
    try {
      const res = await executeLocalExport()
      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: `Backup exported successfully (${res.filename}).`,
        })
      } else {
        setStatusMessage({
          type: 'error',
          text: res.error || 'Export failed.',
        })
      }
    } finally {
      setOperation('idle')
    }
  }

  async function handleFilePickerChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (onImport) {
      onImport(e)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    if (isBusy) {
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setOperation('importing')
    setStatusMessage({ type: 'info', text: 'Reading backup file…' })

    try {
      const text = await file.text()
      const summary = inspectBackupSummary(text)
      setPendingRestoreContent(text)
      setPendingRestoreSummary(summary)
      setRestoreModalOpen(true)
      setStatusMessage(null)
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: sanitizeUserFacingError(err),
      })
    } finally {
      setOperation('idle')
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleConfirmRestore(mode: RestoreMode) {
    if (!pendingRestoreContent || isBusy) return
    setOperation('restoring')
    setStatusMessage({ type: 'info', text: 'Restoring backup data…' })

    try {
      const isAuthenticated = Boolean(user && !user.isOfflineGuest)
      const res = await executeRestore(pendingRestoreContent, mode, isAuthenticated)

      if (res.localSuccess) {
        if (onReloadMatches) {
          await onReloadMatches()
        }
      }

      setStatusMessage({
        type: res.statusType,
        text: res.message,
      })
      setRestoreModalOpen(false)
      setPendingRestoreContent(null)
      setPendingRestoreSummary(null)
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: sanitizeUserFacingError(err),
      })
    } finally {
      setOperation('idle')
    }
  }

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <section className="settings-modal" onClick={(event) => event.stopPropagation()}>
        <button className="sheet-close" onClick={onClose} aria-label="Close settings" disabled={isBusy}>
          <Icon name="x" size={16} />
        </button>
        <div className="settings-head">
          <span className="section-kicker">ScoreMate</span>
          <h3>App Settings</h3>
        </div>

        {/* Status Message Banner */}
        {statusMessage && (
          <div className={`backup-feedback-banner ${statusMessage.type}`} style={{ marginBottom: '14px' }}>
            <span>{statusMessage.text}</span>
            <button
              onClick={() => setStatusMessage(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'currentColor',
                cursor: 'pointer',
                fontSize: '14px',
                padding: '0 4px',
              }}
              aria-label="Dismiss message"
            >
              ×
            </button>
          </div>
        )}

        {/* ==================================================
            APPEARANCE SECTION
            ================================================== */}
        <div className="settings-section" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.12em' }}>
              APPEARANCE
            </span>
          </div>
          <div className="settings-card" style={{ background: 'var(--surface-raised)', borderRadius: '12px', padding: '12px 14px' }}>
            <div className="theme-setting" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ fontSize: '13px', color: 'var(--soft)', display: 'block' }}>Theme</strong>
                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Choose light or dark visual style</span>
              </div>
              <div className="theme-toggle" role="group" aria-label="Theme selection">
                <button
                  type="button"
                  className={theme === 'dark' ? 'active' : ''}
                  onClick={() => onThemeChange('dark')}
                  aria-pressed={theme === 'dark'}
                  aria-label="Switch to Dark theme"
                >
                  Dark
                </button>
                <button
                  type="button"
                  className={theme === 'light' ? 'active' : ''}
                  onClick={() => onThemeChange('light')}
                  aria-pressed={theme === 'light'}
                  aria-label="Switch to Light theme"
                >
                  Light
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ==================================================
            LOCAL DATA MANAGEMENT SECTION
            ================================================== */}
        <div className="settings-section" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.12em' }}>
              DATA MANAGEMENT
            </span>
            {isBusy && (
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>
                {operation === 'exporting' && 'Exporting…'}
                {operation === 'importing' && 'Importing…'}
                {operation === 'restoring' && 'Restoring…'}
              </span>
            )}
          </div>

          <div className="backup-card">
            <div className="backup-card-head">
              <span className="backup-card-title">Local Backup</span>
            </div>
            <p className="backup-card-desc">
              Export and restore complete ScoreMate data to and from JSON files.
            </p>
            <div className="backup-button-row">
              <button
                className="secondary-button"
                onClick={handleLocalExport}
                disabled={isBusy}
                style={{ flex: 1 }}
              >
                <Icon name="download-cloud" />
                {operation === 'exporting' ? 'Exporting…' : 'Export Backup'}
              </button>
              <label
                className={`secondary-button import-button ${isBusy ? 'disabled' : ''}`}
                style={{ flex: 1, cursor: isBusy ? 'not-allowed' : 'pointer' }}
              >
                <Icon name="upload-cloud" />
                {operation === 'importing' ? 'Importing…' : 'Import Backup'}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json"
                  onChange={handleFilePickerChange}
                  disabled={isBusy}
                />
              </label>
            </div>
          </div>
        </div>

        {/* ==================================================
            ABOUT SECTION
            ================================================== */}
        <div className="settings-section">
          <div style={{ marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.12em' }}>
              ABOUT
            </span>
          </div>
          <div className="settings-card" style={{ background: 'var(--surface-raised)', borderRadius: '12px', padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <strong style={{ fontSize: '13px', color: 'var(--soft)' }}>ScoreMate</strong>
                <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>Street cricket, scored cleanly</span>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>v1.0.0</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => window.alert('Open Source Licenses:\n- React & React-DOM (MIT)\n- Vite (MIT)\n- Capacitor (MIT)\n- Firebase SDK (Apache 2.0)\n- Recharts (MIT)')}
                disabled={isBusy}
                style={{ fontSize: '11px', padding: '8px' }}
              >
                <Icon name="licenses" size={16} />
                Licenses
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => window.alert('ScoreMate — Crafted with precision for street & club cricket scorers.')}
                disabled={isBusy}
                style={{ fontSize: '11px', padding: '8px' }}
              >
                <Icon name="credits" size={16} />
                Credits
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => window.alert('Privacy Policy:\nScoreMate operates offline-first. Your match data is stored on your device and optionally backed up to your personal Google Drive or synchronized to your authenticated Firebase account.')}
                disabled={isBusy}
                style={{ fontSize: '11px', padding: '8px' }}
              >
                Privacy Policy
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => window.alert('Terms of Service:\nScoreMate is provided for recreational cricket scoring. Always ensure your backups are kept up-to-date.')}
                disabled={isBusy}
                style={{ fontSize: '11px', padding: '8px' }}
              >
                Terms
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Restore Confirmation Dialog */}
      <RestoreConfirmModal
        isOpen={restoreModalOpen}
        isRestoring={operation === 'restoring'}
        backupSummary={pendingRestoreSummary}
        onCancel={() => {
          setRestoreModalOpen(false)
          setPendingRestoreContent(null)
          setPendingRestoreSummary(null)
        }}
        onConfirm={handleConfirmRestore}
      />
    </div>
  )
}

export default SettingsModal
