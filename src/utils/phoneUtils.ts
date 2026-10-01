/**
 * ScoreMate Phone Number Normalization & Validation Utility
 *
 * Normalizes user input into valid E.164 phone numbers for Firebase Phone Authentication.
 * Intelligently handles 10-digit Indian mobile numbers (with or without leading 0 / 91)
 * as well as arbitrary international numbers with country codes.
 */

export interface PhoneValidationResult {
  valid: boolean
  normalized: string
  error?: string
}

export function normalizePhoneNumber(rawInput: string): PhoneValidationResult {
  if (!rawInput || !rawInput.trim()) {
    return {
      valid: false,
      normalized: '',
      error: 'Please enter your phone number.',
    }
  }

  const trimmed = rawInput.trim()

  // Case 1: Explicit leading '+'
  if (trimmed.startsWith('+')) {
    // Strip formatting whitespace, hyphens, and parentheses
    const cleaned = '+' + trimmed.slice(1).replace(/[\s\-()]/g, '')
    // E.164: + followed by 7 to 15 digits, first non-zero
    const e164Regex = /^\+[1-9]\d{6,14}$/
    if (!e164Regex.test(cleaned)) {
      return {
        valid: false,
        normalized: cleaned,
        error: 'Please enter a valid phone number with country code (e.g. +91 98765 43210).',
      }
    }
    return {
      valid: true,
      normalized: cleaned,
    }
  }

  // Case 2: Number entered without '+'
  const digitsOnly = trimmed.replace(/\D/g, '')

  // 10-digit number -> default to +91 (India)
  if (digitsOnly.length === 10) {
    return {
      valid: true,
      normalized: `+91${digitsOnly}`,
    }
  }

  // 11-digit number starting with 0 (e.g. 09876543210) -> strip 0 and prepend +91
  if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
    return {
      valid: true,
      normalized: `+91${digitsOnly.slice(1)}`,
    }
  }

  // 12-digit number starting with 91 (e.g. 919876543210) -> prepend +
  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    return {
      valid: true,
      normalized: `+${digitsOnly}`,
    }
  }

  return {
    valid: false,
    normalized: trimmed,
    error: 'Please enter a valid 10-digit mobile number or include your country code (e.g. +91 98765 43210).',
  }
}
