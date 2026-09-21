import { useState, useEffect, useRef, type ChangeEvent } from 'react'
import Icon from '../Icon'
import { useAuth } from '../../context/AuthContext'
import { AuthModal } from './AuthModal'
import { RestoreConfirmModal } from './RestoreConfirmModal'
import { googleDriveService, type DriveFileMetadata } from '../../services/googleDriveService'
import {
  executeLocalExport,
  executeRestore,
  executeDriveBackup,
  executeDriveDownload,
  executeDriveDisconnect,
  inspectBackupSummary,
  sanitizeUserFacingError,
  formatLastBackupTime,
  type BackupUIOperation,
  type BackupStatusMessage,
  type BackupInspectionSummary,
} from '../../services/backupUIController'
import { settingsRepository } from '../../services/repositories/settingsRepository'
import type { RestoreMode } from '../../types/database'

export interface SettingsModalProps {
  theme: 'dark' | 'light'
  onThemeChange: (theme: 'dark' | 'light') => void
  onClose: () => void
  exportBackup?: () => void
  onImport?: (event: ChangeEvent<HTMLInputElement>) => void
  onExportCsv?: () => void
  onExportImage?: () => void
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
  const { user, isGuest, signOut, linkGuestWithEmail, linkGuestWithGoogle, linkGuestWithApple } = useAuth()
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [collisionInfo, setCollisionInfo] = useState<string | null>(null)
  const [linkMessage, setLinkMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Backup & Restore State (Milestone 4.6)
  const [operation, setOperation] = useState<BackupUIOperation>('idle')
  const [statusMessage, setStatusMessage] = useState<BackupStatusMessage | null>(null)
  const [driveConnected, setDriveConnected] = useState<boolean>(() => googleDriveService.isConnected())
  const [_driveBackupMeta, setDriveBackupMeta] = useState<DriveFileMetadata | null>(() =>
    googleDriveService.getStoredFileMetadata()
  )
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null)

  // Restore Modal State
  const [restoreModalOpen, setRestoreModalOpen] = useState(false)
  const [pendingRestoreContent, setPendingRestoreContent] = useState<string | null>(null)
  const [pendingRestoreSummary, setPendingRestoreSummary] = useState<BackupInspectionSummary | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const isBusy = operation !== 'idle'

  // Query Drive status and last backup timestamp on mount
  useEffect(() => {
    let active = true
    void settingsRepository.getLastSuccessfulDriveBackupAt().then((ts) => {
      if (active) setLastBackupAt(ts)
    }).catch(() => {})

    if (googleDriveService.isConnected()) {
      void googleDriveService.findBackupFile().then((meta) => {
        if (active) setDriveBackupMeta(meta)
      }).catch(() => {
        // Silent catch for background discovery
      })
    }
    return () => {
      active = false
    }
  }, [])

  async function handleSignOut() {
    try {
      googleDriveService.clearToken()
      setDriveConnected(false)
      setDriveBackupMeta(null)
      await signOut()
      onClose()
    } catch {
      window.alert('Failed to sign out. Please check your connection.')
    }
  }

  async function handleLinkEmail(email: string, pass: string) {
    setLoading(true)
    try {
      const res = await linkGuestWithEmail(email, pass)
      if ('message' in res) {
        setCollisionInfo(res.message)
      } else {
        setLinkMessage('Account successfully created and linked!')
        setShowLinkModal(false)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleLinkGoogle() {
    setLoading(true)
    try {
      const res = await linkGuestWithGoogle()
      if ('message' in res) {
        window.alert(res.message)
      } else {
        setLinkMessage('Google account successfully linked!')
      }
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : 'Failed to link Google account.')
    } finally {
      setLoading(false)
    }
  }

  async function handleLinkApple() {
    setLoading(true)
    try {
      const res = await linkGuestWithApple()
      if ('message' in res) {
        window.alert(res.message)
      } else {
        setLinkMessage('Apple account successfully linked!')
      }
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : 'Failed to link Apple account.')
    } finally {
      setLoading(false)
    }
  }

  // --- Backup & Restore Handlers (Milestone 4.6) ---

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

    // If caller provided legacy onImport prop, delegate to it
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

  async function handleConnectDrive() {
    if (isBusy) return
    setOperation('connecting')
    setStatusMessage({ type: 'info', text: 'Connecting to Google Drive…' })
    try {
      await googleDriveService.authorize(true)
      setDriveConnected(true)
      const meta = await googleDriveService.findBackupFile()
      setDriveBackupMeta(meta)
      setStatusMessage({
        type: 'success',
        text: 'Google Drive connected successfully.',
      })
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: sanitizeUserFacingError(err),
      })
    } finally {
      setOperation('idle')
    }
  }

  async function handleDriveBackup() {
    if (isBusy) return
    setOperation('backing_up_drive')
    setStatusMessage({ type: 'info', text: 'Backing up to Google Drive…' })
    try {
      const res = await executeDriveBackup()
      if (res.success) {
        setDriveConnected(true)
        setDriveBackupMeta(res.metadata ?? null)
        const ts = await settingsRepository.getLastSuccessfulDriveBackupAt()
        setLastBackupAt(ts)
        setStatusMessage({
          type: 'success',
          text: 'Backup successfully uploaded to Google Drive.',
        })
      } else {
        setStatusMessage({
          type: 'error',
          text: res.error || 'Google Drive backup failed.',
        })
      }
    } finally {
      setOperation('idle')
    }
  }

  async function handleDriveRestore() {
    if (isBusy) return
    setOperation('downloading_drive')
    setStatusMessage({ type: 'info', text: 'Downloading backup from Google Drive…' })
    try {
      const res = await executeDriveDownload()
      if (res.success && res.content) {
        const summary = inspectBackupSummary(res.content)
        setPendingRestoreContent(res.content)
        setPendingRestoreSummary(summary)
        setRestoreModalOpen(true)
        setStatusMessage(null)
      } else {
        setStatusMessage({
          type: 'error',
          text: res.error || 'Failed to download backup from Google Drive.',
        })
      }
    } finally {
      setOperation('idle')
    }
  }

  async function handleDriveDisconnect() {
    if (isBusy) return
    setOperation('connecting')
    try {
      const res = await executeDriveDisconnect()
      setDriveConnected(false)
      setDriveBackupMeta(null)
      if (res.success) {
        setStatusMessage({
          type: 'info',
          text: 'Google Drive authorization disconnected.',
        })
      } else {
        setStatusMessage({
          type: 'error',
          text: res.error || 'Failed to disconnect Google Drive.',
        })
      }
    } finally {
      setOperation('idle')
    }
  }

  const accountDisplay = user
    ? user.email || user.phoneNumber || (user.isOfflineGuest ? 'Guest (Offline)' : user.isAnonymous ? 'Guest (Online)' : 'ScoreMate Account')
    : 'Not signed in'

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <section className="settings-modal" onClick={(event) => event.stopPropagation()}>
        <button className="sheet-close" onClick={onClose} aria-label="Close settings" disabled={isBusy}>
          <span aria-hidden="true">×</span>
        </button>
        <div className="settings-head">
          <span className="section-kicker">ScoreMate</span>
          <h3>Settings</h3>
        </div>

        {/* Account Info Banner */}
        <div
          className="account-card"
          style={{
            background: 'var(--surface-raised)',
            padding: '12px 14px',
            borderRadius: '12px',
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', fontWeight: 600 }}>
              ACCOUNT
            </span>
            <strong style={{ fontSize: '13px', color: 'var(--soft)' }}>{accountDisplay}</strong>
          </div>
          {user && (
            <button
              onClick={handleSignOut}
              disabled={isBusy}
              style={{
                background: 'rgba(255, 143, 155, 0.12)',
                border: '1px solid var(--danger)',
                color: 'var(--danger)',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: isBusy ? 'not-allowed' : 'pointer',
              }}
            >
              Sign out
            </button>
          )}
        </div>

        {/* Guest Upgrade Prompt */}
        {isGuest && (
          <div
            className="guest-upgrade-banner"
            style={{
              background: 'rgba(169, 152, 255, 0.1)',
              border: '1px solid var(--accent)',
              borderRadius: '12px',
              padding: '12px 14px',
              marginBottom: '14px',
            }}
          >
            <div style={{ fontSize: '12px', color: 'var(--soft)', marginBottom: '8px' }}>
              <strong>Save your match data permanently</strong>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--muted)' }}>
                Upgrade your guest session to keep your statistics across devices.
              </p>
            </div>
            {linkMessage && (
              <p style={{ color: 'var(--green)', fontSize: '12px', margin: '4px 0 8px' }}>{linkMessage}</p>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="primary-button"
                style={{ flex: 1, padding: '8px 10px', fontSize: '12px' }}
                onClick={() => setShowLinkModal(true)}
                disabled={loading || isBusy}
              >
                Create Account
              </button>
              <button
                className="secondary-button"
                style={{ flex: 1, padding: '8px 10px', fontSize: '12px' }}
                onClick={handleLinkGoogle}
                disabled={loading || isBusy}
              >
                Link Google
              </button>
              <button
                className="secondary-button"
                style={{ flex: 1, padding: '8px 10px', fontSize: '12px' }}
                onClick={handleLinkApple}
                disabled={loading || isBusy}
              >
                Link Apple
              </button>
            </div>
          </div>
        )}

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
            DATA & BACKUP SECTION (Milestone 4.6)
            ================================================== */}
        <div className="backup-section">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.12em' }}>
              DATA & BACKUP
            </span>
            {isBusy && (
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>
                {operation === 'exporting' && 'Exporting…'}
                {operation === 'importing' && 'Importing…'}
                {operation === 'connecting' && 'Connecting…'}
                {operation === 'backing_up_drive' && 'Backing up…'}
                {operation === 'downloading_drive' && 'Downloading backup…'}
                {operation === 'restoring' && 'Restoring…'}
                {operation === 'syncing' && 'Syncing…'}
              </span>
            )}
          </div>

          {/* Local Backup Card */}
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

          {/* Google Drive Card */}
          <div className="backup-card">
            <div className="backup-card-head">
              <span className="backup-card-title">Google Drive</span>
              <span className={`backup-status-badge ${driveConnected ? 'connected' : 'disconnected'}`}>
                {driveConnected ? 'Connected' : 'Not Connected'}
              </span>
            </div>
            <p className="backup-card-desc">
              {driveConnected
                ? `Last Google Drive backup: ${formatLastBackupTime(lastBackupAt)}.`
                : 'Back up and restore your match data securely across devices via Google Drive.'}
            </p>

            <div className="backup-button-row">
              {!driveConnected ? (
                <button
                  className="secondary-button"
                  onClick={handleConnectDrive}
                  disabled={isBusy}
                  style={{ flex: 1 }}
                >
                  <Icon name="download-cloud" />
                  {operation === 'connecting' ? 'Connecting…' : 'Connect Google Drive'}
                </button>
              ) : (
                <>
                  <button
                    className="secondary-button"
                    onClick={handleDriveBackup}
                    disabled={isBusy}
                    style={{ flex: 1 }}
                  >
                    <Icon name="download-cloud" />
                    {operation === 'backing_up_drive' ? 'Backing up…' : 'Back up to Drive'}
                  </button>
                  <button
                    className="secondary-button"
                    onClick={handleDriveRestore}
                    disabled={isBusy}
                    style={{ flex: 1 }}
                  >
                    <Icon name="upload-cloud" />
                    {operation === 'downloading_drive' ? 'Downloading…' : 'Restore from Drive'}
                  </button>
                  <button
                    className="secondary-button"
                    onClick={handleDriveDisconnect}
                    disabled={isBusy}
                    style={{
                      flex: 0.6,
                      color: 'var(--danger)',
                      borderColor: 'rgba(255, 143, 155, 0.3)',
                    }}
                    title="Disconnect Google Drive authorization"
                  >
                    Disconnect
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Existing Appearance & Export Utilities */}
        <div className="settings-grid" style={{ marginTop: '14px' }}>
          <div className="theme-setting">
            <span>Appearance</span>
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

          <button
            className="secondary-button"
            onClick={() => window.alert('Open source licenses: MIT-style local app assets.')}
            disabled={isBusy}
          >
            <Icon name="licenses" />
            Licenses
          </button>
          <button
            className="secondary-button"
            onClick={() => window.alert('ScoreMate by your local scoring studio.')}
            disabled={isBusy}
          >
            <Icon name="credits" />
            Credits
          </button>
        </div>
      </section>

      {/* Restore Confirmation Dialog (Milestone 4.6) */}
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

      {/* Account Linking Modal */}
      {showLinkModal && (
        <AuthModal
          type="create"
          close={() => setShowLinkModal(false)}
          onSubmitCreate={handleLinkEmail}
        />
      )}

      {/* Collision Modal */}
      {collisionInfo && (
        <AuthModal
          type="collision"
          collisionMessage={collisionInfo}
          close={() => setCollisionInfo(null)}
          onSwitchToSignIn={() => {
            setCollisionInfo(null)
            onClose()
            handleSignOut()
          }}
        />
      )}
    </div>
  )
}

export default SettingsModal
