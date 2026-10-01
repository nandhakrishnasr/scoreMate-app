import { describe, it } from 'node:test'
import assert from 'node:assert'
import { normalizePhoneNumber } from '../src/utils/phoneUtils.ts'

describe('Phone Number Normalization and Validation (E.164)', () => {
  it('normalizes 10-digit Indian mobile numbers without country code', () => {
    const res = normalizePhoneNumber('9876543210')
    assert.strictEqual(res.valid, true)
    assert.strictEqual(res.normalized, '+919876543210')
  })

  it('handles 10-digit numbers with whitespace and hyphens', () => {
    const res = normalizePhoneNumber(' 98765 43210 ')
    assert.strictEqual(res.valid, true)
    assert.strictEqual(res.normalized, '+919876543210')

    const res2 = normalizePhoneNumber('98765-43210')
    assert.strictEqual(res2.valid, true)
    assert.strictEqual(res2.normalized, '+919876543210')
  })

  it('normalizes 11-digit numbers starting with 0 to +91', () => {
    const res = normalizePhoneNumber('09876543210')
    assert.strictEqual(res.valid, true)
    assert.strictEqual(res.normalized, '+919876543210')
  })

  it('normalizes 12-digit numbers starting with 91 to +91', () => {
    const res = normalizePhoneNumber('919876543210')
    assert.strictEqual(res.valid, true)
    assert.strictEqual(res.normalized, '+919876543210')
  })

  it('preserves already formatted E.164 numbers with valid country codes', () => {
    const resIndia = normalizePhoneNumber('+919876543210')
    assert.strictEqual(resIndia.valid, true)
    assert.strictEqual(resIndia.normalized, '+919876543210')

    const resUS = normalizePhoneNumber('+1 (555) 123-4567')
    assert.strictEqual(resUS.valid, true)
    assert.strictEqual(resUS.normalized, '+15551234567')

    const resUK = normalizePhoneNumber('+44 7911 123456')
    assert.strictEqual(resUK.valid, true)
    assert.strictEqual(resUK.normalized, '+447911123456')

    const resAus = normalizePhoneNumber('+61 412 345 678')
    assert.strictEqual(resAus.valid, true)
    assert.strictEqual(resAus.normalized, '+61412345678')
  })

  it('rejects empty or whitespace-only inputs', () => {
    const resEmpty = normalizePhoneNumber('')
    assert.strictEqual(resEmpty.valid, false)
    assert.strictEqual(resEmpty.error, 'Please enter your phone number.')

    const resSpaces = normalizePhoneNumber('   ')
    assert.strictEqual(resSpaces.valid, false)
    assert.strictEqual(resSpaces.error, 'Please enter your phone number.')
  })

  it('rejects malformed numbers with clear messages', () => {
    const resShort = normalizePhoneNumber('12345')
    assert.strictEqual(resShort.valid, false)
    assert.ok(resShort.error?.includes('10-digit mobile number'))

    const resLetters = normalizePhoneNumber('98765abcde')
    assert.strictEqual(resLetters.valid, false)

    const resInvalidE164 = normalizePhoneNumber('+0123456')
    assert.strictEqual(resInvalidE164.valid, false)
    assert.ok(resInvalidE164.error?.includes('valid phone number with country code'))
  })
})
