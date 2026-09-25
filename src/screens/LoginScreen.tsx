import { useState, useEffect } from 'react'
import { Header } from '../components/common/Header'
import { AuthModal } from '../components/modals/AuthModal'
import { useAuth } from '../context/AuthContext'
import { mapAuthError, type PhoneOtpResult } from '../services/authService'
import { normalizePhoneNumber } from '../utils/phoneUtils'
import type { Screen } from '../types/match'

export interface LoginScreenProps {
  setScreen: (screen: Screen) => void
  resumeScreen?: Screen
}

export function LoginScreen({ setScreen, resumeScreen }: LoginScreenProps) {
  const targetScreen = resumeScreen || 'setup'
  const {
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    signInWithApple,
    sendPhoneOtp,
    verifyPhoneOtp,
    continueAsGuest,
    sendPasswordReset,
  } = useAuth()

  const [mode, setMode] = useState<'email' | 'phone'>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [otpResult, setOtpResult] = useState<PhoneOtpResult | null>(null)
  const [resendCooldown, setResendCooldown] = useState(0)

  const [modal, setModal] = useState<'create' | 'forgot' | 'collision' | null>(null)
  const [collisionMessage, setCollisionMessage] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [resendCooldown])

  async function handleEmailSignIn() {
    if (!email.trim() || !password) {
      setErrorMessage('Please enter both your email and password.')
      return
    }
    setErrorMessage('')
    setLoading(true)
    try {
      await signInWithEmail(email.trim(), password)
      setScreen(targetScreen)
    } catch (err: unknown) {
      setErrorMessage(mapAuthError(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateAccount(createEmail: string, createPass: string) {
    setErrorMessage('')
    try {
      await signUpWithEmail(createEmail, createPass)
      setScreen(targetScreen)
    } catch (err: unknown) {
      setErrorMessage(mapAuthError(err))
    }
  }

  async function handleForgotPassword(resetEmail: string) {
    setErrorMessage('')
    try {
      await sendPasswordReset(resetEmail)
    } catch (err: unknown) {
      setErrorMessage(mapAuthError(err))
    }
  }

  async function handleSendOtp() {
    const validation = normalizePhoneNumber(phone)
    if (!validation.valid) {
      setErrorMessage(validation.error || 'Please enter a valid phone number.')
      return
    }
    setErrorMessage('')
    setLoading(true)
    try {
      const res = await sendPhoneOtp(validation.normalized, 'recaptcha-container')
      setOtpResult(res)
      setResendCooldown(60)
    } catch (err: unknown) {
      setErrorMessage(mapAuthError(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp() {
    if (!otpResult || otp.length < 6) {
      setErrorMessage('Please enter the 6-digit OTP code.')
      return
    }
    setErrorMessage('')
    setLoading(true)
    try {
      await verifyPhoneOtp(otpResult, otp.trim())
      setScreen(targetScreen)
    } catch (err: unknown) {
      setErrorMessage(mapAuthError(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleSignIn() {
    setErrorMessage('')
    setLoading(true)
    try {
      await signInWithGoogle()
      setScreen(targetScreen)
    } catch (err: unknown) {
      setErrorMessage(mapAuthError(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleAppleSignIn() {
    setErrorMessage('')
    setLoading(true)
    try {
      await signInWithApple()
      setScreen(targetScreen)
    } catch (err: unknown) {
      setErrorMessage(mapAuthError(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleGuestContinue() {
    setErrorMessage('')
    setLoading(true)
    try {
      await continueAsGuest()
      setScreen(targetScreen)
    } catch (err: unknown) {
      setErrorMessage(mapAuthError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-shell login-shell">
      <Header
        title={
          <>
            <strong>Score</strong>Mate
          </>
        }
      />
      <main className="login-content">
        <section className="login-card">
          <div className="login-card-head">
            <span className="section-kicker">Welcome</span>
            <h2>Sign in to ScoreMate</h2>
          </div>

          <div className="auth-mode-tabs">
            <button
              className={mode === 'email' ? 'active' : ''}
              onClick={() => {
                setMode('email')
                setErrorMessage('')
              }}
              disabled={loading}
            >
              Email
            </button>
            <button
              className={mode === 'phone' ? 'active' : ''}
              onClick={() => {
                setMode('phone')
                setErrorMessage('')
              }}
              disabled={loading}
            >
              Phone OTP
            </button>
          </div>

          {mode === 'email' ? (
            <div className="login-form">
              <label className="field-label">Email address</label>
              <input
                className="login-input"
                placeholder="name@example.com"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={loading}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="field-label">Password</label>
                <button
                  type="button"
                  onClick={() => setModal('forgot')}
                  style={{
                    background: 'transparent',
                    border: 0,
                    color: 'var(--accent)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                  disabled={loading}
                >
                  Forgot password?
                </button>
              </div>
              <input
                className="login-input"
                placeholder="Enter password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={loading}
              />
              <div className="login-row">
                <button
                  className="primary-button"
                  onClick={handleEmailSignIn}
                  disabled={loading}
                >
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
                <button
                  className="secondary-button"
                  onClick={() => {
                    setModal('create')
                    setErrorMessage('')
                  }}
                  disabled={loading}
                >
                  Create account
                </button>
              </div>
            </div>
          ) : (
            <div className="login-form">
              <label className="field-label">Phone number</label>
              <input
                className="login-input"
                placeholder="e.g. 9876543210 or +91 98765 43210"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                disabled={loading || Boolean(otpResult)}
              />

              {otpResult && (
                <>
                  <label className="field-label">6-digit verification code</label>
                  <input
                    className="login-input"
                    placeholder="123456"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(event) =>
                      setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    disabled={loading}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-4px' }}>
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      disabled={resendCooldown > 0 || loading}
                      style={{
                        background: 'transparent',
                        border: 0,
                        color: resendCooldown > 0 ? 'var(--muted)' : 'var(--accent)',
                        fontSize: '11px',
                        cursor: resendCooldown > 0 ? 'default' : 'pointer',
                        padding: 0,
                      }}
                    >
                      {resendCooldown > 0
                        ? `Resend code in ${resendCooldown}s`
                        : 'Resend code'}
                    </button>
                  </div>
                </>
              )}

              <button
                className="primary-button wide-button"
                onClick={otpResult ? handleVerifyOtp : handleSendOtp}
                disabled={loading}
                style={{ marginTop: '12px' }}
              >
                {loading
                  ? 'Processing…'
                  : otpResult
                    ? 'Verify OTP'
                    : 'Send OTP'}{' '}
                <span>→</span>
              </button>
            </div>
          )}

          {/* Hidden element for reCAPTCHA widget in web dev environments */}
          <div id="recaptcha-container" style={{ display: 'none' }} />

          {errorMessage && <p className="login-message">{errorMessage}</p>}

          <button
            className="skip-button"
            onClick={handleGuestContinue}
            disabled={loading}
          >
            Skip and continue as guest <span>›</span>
          </button>

          <div className="social-login">
            <button
              className="social-button"
              onClick={handleGoogleSignIn}
              disabled={loading}
            >
              <span>G</span>Continue with Google
            </button>
            <button
              className="social-button"
              onClick={handleAppleSignIn}
              disabled={loading}
            >
              <span></span>Continue with Apple
            </button>
          </div>
        </section>
      </main>

      {modal && (
        <AuthModal
          type={modal}
          initialEmail={email}
          collisionMessage={collisionMessage}
          close={() => {
            setModal(null)
            setCollisionMessage('')
          }}
          onSubmitCreate={handleCreateAccount}
          onSubmitForgot={handleForgotPassword}
          onSwitchToSignIn={() => {
            setModal(null)
            setMode('email')
          }}
        />
      )}
    </div>
  )
}

export default LoginScreen
