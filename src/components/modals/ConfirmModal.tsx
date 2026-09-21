export interface ConfirmModalProps {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmModal({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onCancel, onConfirm }: ConfirmModalProps) {
  return (
    <div className="settings-backdrop" role="dialog" aria-modal="true">
      <section className="settings-modal">
        <div className="settings-head">
          <span className="section-kicker">ScoreMate</span>
          <h3>{title}</h3>
          {message && <p className="confirm-modal-message">{message}</p>}
        </div>
        <div className="login-row">
          <button className="secondary-button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="primary-button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}

export default ConfirmModal
