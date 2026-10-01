import { useState } from 'react'

export interface AuthModalProps {
  type: 'create' | 'forgot' | 'collision'
  initialEmail?: string
  collisionMessage?: string
  close: () => void
  onSubmitCreate?: (email: string, pass: string) => Promise<void>
  onSubmitForgot?: (email: string) => Promise<void>
  onSwitchToSignIn?: () => void
}

export function AuthModal({
  type,
  initialEmail = '',
  collisionMessage,
  close,
  onSubmitCreate,
  onSubmitForgot,
  onSwitchToSignIn,
}: AuthModalProps) {
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const title =
    type === 'create'
      ? 'Create Account'
      : type === 'forgot'
        ? 'Reset Password'
        : 'Account Already Exists'

  async function handleSubmit() {
    setError(null)
    if (type === 'create') {
      if (!email.trim()) return setError('Please enter your email address.')
      if (!password) return setError('Please enter a password.')
      if (password.length < 6) return setError('Password must be at least 6 characters.')
      if (password !== confirmPassword) return setError('Passwords do not match.')

      setLoading(true)
      try {
        await onSubmitCreate?.(email.trim(), password)
        close()
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to create account.')
      } finally {
        setLoading(false)
      }
    } else if (type === 'forgot') {
      if (!email.trim()) return setError('Please enter your email address.')

      setLoading(true)
      try {
        await onSubmitForgot?.(email.trim())
        setSuccessMessage('Password reset email sent! Check your inbox.')
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to send password reset email.')
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <div className="auth-modal-backdrop" onClick={close}>
      <section className="auth-modal" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={close} aria-label="Close dialog">
          ×
        </button>
        <span className="section-kicker">ScoreMate</span>
        <h3>{title}</h3>

        {type === 'collision' ? (
          <div className="collision-content">
            <p className="auth-modal-copy">
              {collisionMessage ||
                'An account with this email address already exists. Sign in to your existing account to access your cloud matches, or keep using your current guest session.'}
            </p>
            <div className="modal-actions" style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
              <button
                className="primary-button"
                style={{ flex: 1 }}
                onClick={() => {
                  close()
                  onSwitchToSignIn?.()
                }}
              >
                Sign In
              </button>
              <button
                className="secondary-button"
                style={{ flex: 1 }}
                onClick={close}
              >
                Stay as Guest
              </button>
            </div>
          </div>
        ) : (
          <>
            {type === 'forgot' && (
              <p className="auth-modal-copy">
                Enter your registered email address and we will send you a link to reset your password.
              </p>
            )}

            {successMessage ? (
              <div className="success-banner" style={{ color: 'var(--green)', margin: '14px 0', fontSize: '13px' }}>
                {successMessage}
                <button
                  className="primary-button wide-button"
                  style={{ marginTop: '16px' }}
                  onClick={close}
                >
                  Back to Sign In
                </button>
              </div>
            ) : (
              <>
                <label className="field-label">
                  Email address
                  <input
                    className="login-input"
                    autoFocus
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={loading}
                  />
                </label>

                {type === 'create' && (
                  <>
                    <label className="field-label">
                      Password
                      <input
                        className="login-input"
                        type="password"
                        placeholder="At least 6 characters"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        disabled={loading}
                      />
                    </label>
                    <label className="field-label">
                      Confirm password
                      <input
                        className="login-input"
                        type="password"
                        placeholder="Re-enter password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        disabled={loading}
                      />
                    </label>
                  </>
                )}

                {error && (
                  <p className="login-message" style={{ margin: '10px 0 0' }}>
                    {error}
                  </p>
                )}

                <button
                  className="primary-button wide-button"
                  onClick={handleSubmit}
                  disabled={loading}
                  style={{ marginTop: '16px' }}
                >
                  {loading
                    ? 'Processing…'
                    : type === 'create'
                      ? 'Create Account'
                      : 'Send Reset Link'}{' '}
                  <span>→</span>
                </button>
              </>
            )}
          </>
        )}
      </section>
    </div>
  )
}

export default AuthModal
