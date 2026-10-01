import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { generateBackupFilename } from '../src/services/backupService.ts'

const ROOT_DIR = path.resolve(import.meta.dirname, '..')

describe('Phase 7 — ScoreMate Branding & App Identity Audit', () => {
  it('1. index.html document title is ScoreMate and links manifest.json', () => {
    const html = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8')
    assert.match(html, /<title>ScoreMate<\/title>/)
    assert.match(html, /<link rel="manifest" href="\/manifest\.json" \/>/)
    assert.match(html, /content="ScoreMate — Street cricket, scored cleanly/)
  })

  it('2. Web App Manifest specifies ScoreMate as name and short_name with verified physical icons', () => {
    const manifestPath = path.join(ROOT_DIR, 'public', 'manifest.json')
    assert.ok(fs.existsSync(manifestPath), 'manifest.json must exist in public/')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    assert.equal(manifest.name, 'ScoreMate')
    assert.equal(manifest.short_name, 'ScoreMate')
    assert.equal(manifest.display, 'standalone')

    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'manifest must contain icons array')
    for (const icon of manifest.icons) {
      const iconPath = path.join(ROOT_DIR, 'public', icon.src.replace(/^\//, ''))
      assert.ok(fs.existsSync(iconPath), `Icon file must exist: ${icon.src}`)

      if (icon.src.endsWith('.png')) {
        const buf = fs.readFileSync(iconPath)
        const width = buf.readUInt32BE(16)
        const height = buf.readUInt32BE(20)
        if (icon.sizes === '192x192') {
          assert.equal(width, 192, `${icon.src} width must be 192`)
          assert.equal(height, 192, `${icon.src} height must be 192`)
        } else if (icon.sizes === '512x512') {
          assert.equal(width, 512, `${icon.src} width must be 512`)
          assert.equal(height, 512, `${icon.src} height must be 512`)
        }
        if (icon.purpose) {
          assert.ok(
            ['any', 'maskable', 'any maskable'].includes(icon.purpose),
            `Invalid purpose: ${icon.purpose}`
          )
        }
      }
    }
  })

  it('3. Capacitor config sets appName to ScoreMate while preserving appId com.gullyscorer.app', () => {
    const configPath = path.join(ROOT_DIR, 'capacitor.config.ts')
    const content = fs.readFileSync(configPath, 'utf8')
    assert.match(content, /appName:\s*'ScoreMate'/)
    assert.match(content, /appId:\s*'com\.gullyscorer\.app'/)
  })

  it('4. Android strings.xml sets app_name and title_activity_main to ScoreMate while keeping package_name', () => {
    const stringsPath = path.join(ROOT_DIR, 'android/app/src/main/res/values/strings.xml')
    const content = fs.readFileSync(stringsPath, 'utf8')
    assert.match(content, /<string name="app_name">ScoreMate<\/string>/)
    assert.match(content, /<string name="title_activity_main">ScoreMate<\/string>/)
    assert.match(content, /<string name="package_name">com\.gullyscorer\.app<\/string>/)
  })

  it('5. iOS Info.plist sets CFBundleDisplayName to ScoreMate while preserving bundle identifier', () => {
    const plistPath = path.join(ROOT_DIR, 'ios/App/App/Info.plist')
    const content = fs.readFileSync(plistPath, 'utf8')
    assert.match(content, /<key>CFBundleDisplayName<\/key>\s*<string>ScoreMate<\/string>/)
    assert.match(content, /<key>CFBundleIdentifier<\/key>\s*<string>\$\(PRODUCT_BUNDLE_IDENTIFIER\)<\/string>/)
  })

  it('6. PDF export uses ScoreMate in title header', () => {
    const exportPath = path.join(ROOT_DIR, 'src/services/exportService.ts')
    const content = fs.readFileSync(exportPath, 'utf8')
    assert.match(content, /addText\('ScoreMate - Match Scorecard', 18, true\)/)
    assert.doesNotMatch(content, /Gully Scorer - Match Scorecard/)
  })

  it('7. CSV match export uses scoremate-all-matches.csv', () => {
    const exportPath = path.join(ROOT_DIR, 'src/services/exportService.ts')
    const content = fs.readFileSync(exportPath, 'utf8')
    assert.match(content, /link\.download = 'scoremate-all-matches\.csv'/)
    assert.doesNotMatch(content, /gully-scorer-all-matches\.csv/)
  })

  it('8. HistoryScreen fallback export uses scoremate-backup.json', () => {
    const historyPath = path.join(ROOT_DIR, 'src/screens/HistoryScreen.tsx')
    const content = fs.readFileSync(historyPath, 'utf8')
    assert.match(content, /link\.download = 'scoremate-backup\.json'/)
    assert.doesNotMatch(content, /gully-scorer-backup\.json/)
  })

  it('9. StorageService export uses scoremate-backup.json while preserving legacy migration keys', () => {
    const storagePath = path.join(ROOT_DIR, 'src/services/storageService.ts')
    const content = fs.readFileSync(storagePath, 'utf8')
    assert.match(content, /link\.download = 'scoremate-backup\.json'/)
    assert.doesNotMatch(content, /gully-scorer-backup\.json/)
    // Legacy migration keys must be preserved for backward compatibility
    assert.match(content, /export const ACTIVE_MATCH_KEY = 'gully-scorer-active-match'/)
    assert.match(content, /export const COMPLETED_MATCHES_KEY = 'gully-scorer-completed-matches'/)
  })

  it('10. BackupService generates scoremate_backup_* filenames', () => {
    const filename = generateBackupFilename()
    assert.match(filename, /^scoremate_backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/)
  })

  it('11. package.json metadata identifies project as scoremate', () => {
    const pkgPath = path.join(ROOT_DIR, 'package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    assert.equal(pkg.name, 'scoremate')
    assert.ok(pkg.description?.includes('ScoreMate'))
  })

  it('12. No unintended user-facing GullyScorer strings remain in active UI components', () => {
    const uiFiles = [
      'src/App.tsx',
      'src/screens/LoginScreen.tsx',
      'src/screens/HistoryScreen.tsx',
      'src/components/common/Header.tsx',
      'src/components/modals/SettingsModal.tsx',
      'src/components/modals/AuthModal.tsx',
      'src/components/modals/ConfirmModal.tsx',
    ]

    for (const relPath of uiFiles) {
      const fullPath = path.join(ROOT_DIR, relPath)
      const content = fs.readFileSync(fullPath, 'utf8')
      assert.doesNotMatch(
        content,
        /Gully\s*Scorer/i,
        `Unexpected Gully Scorer string found in UI file: ${relPath}`
      )
    }
  })
})
