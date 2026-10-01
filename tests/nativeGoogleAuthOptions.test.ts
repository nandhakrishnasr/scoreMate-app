import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  NativeAndroidOAuthProvider,
  createDefaultOAuthTokenProvider,
} from '../src/services/googleDriveOAuthProvider.ts'
import {
  GisOAuthProvider,
  DRIVE_APPDATA_SCOPE,
} from '../src/services/googleDriveService.ts'

const ROOT_DIR = path.resolve(import.meta.dirname, '..')

describe('Native Google Auth Options Audit', () => {
  it('1. Drive OAuth Google authentication passes useCredentialManager: false on Android', async () => {
    let capturedOptions: unknown = null
    const authBridge = {
      signInWithGoogle: async (options?: {
        scopes?: string[]
        skipNativeAuth?: boolean
        useCredentialManager?: boolean
      }) => {
        capturedOptions = options
        return {
          credential: {
            accessToken: 'ya29.mock_drive_token_xyz',
            idToken: 'mock_id_token',
          },
        }
      },
    }

    const provider = new NativeAndroidOAuthProvider({ authBridge })
    const token = await provider.requestToken(true)

    assert.deepEqual(capturedOptions, {
      scopes: [DRIVE_APPDATA_SCOPE],
      skipNativeAuth: true,
      useCredentialManager: false,
    })
    assert.equal(token.accessToken, 'ya29.mock_drive_token_xyz')
  })

  it('2. authService.ts explicitly passes useCredentialManager: false for native signInWithGoogle', () => {
    const authSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'services', 'authService.ts'), 'utf8')
    
    // Ensure signInWithGoogle has skipNativeAuth: true AND useCredentialManager: false
    const signInMatch = authSrc.match(/signInWithGoogle\(\)[\s\S]*?FirebaseAuthentication\.signInWithGoogle\(\{([\s\S]*?)\}\)/)
    assert.ok(signInMatch, 'signInWithGoogle must invoke FirebaseAuthentication.signInWithGoogle')
    assert.match(signInMatch[1], /skipNativeAuth:\s*true/)
    assert.match(signInMatch[1], /useCredentialManager:\s*false/)
  })

  it('3. authService.ts explicitly passes useCredentialManager: false for native linkGuestWithGoogle', () => {
    const authSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'services', 'authService.ts'), 'utf8')
    
    const linkMatch = authSrc.match(/linkGuestWithGoogle\(\)[\s\S]*?FirebaseAuthentication\.signInWithGoogle\(\{([\s\S]*?)\}\)/)
    assert.ok(linkMatch, 'linkGuestWithGoogle must invoke FirebaseAuthentication.signInWithGoogle on native')
    assert.match(linkMatch[1], /skipNativeAuth:\s*true/)
    assert.match(linkMatch[1], /useCredentialManager:\s*false/)
  })

  it('4. existing web/PWA behavior routes to GisOAuthProvider for Drive', () => {
    const provider = createDefaultOAuthTokenProvider({ platform: 'web', isNative: false })
    assert.ok(provider instanceof GisOAuthProvider)
    assert.equal(provider instanceof NativeAndroidOAuthProvider, false)
  })

  it('5. existing web/PWA fallback in authService retains signInWithPopup', () => {
    const authSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'services', 'authService.ts'), 'utf8')
    assert.match(authSrc, /signInWithPopup\(firebaseAuth,\s*provider\)/)
  })
})
