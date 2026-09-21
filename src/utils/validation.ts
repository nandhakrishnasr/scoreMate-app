/**
 * Phase 9 — Roster & Name Validation Service
 *
 * Pure domain validation rules for team names, player names, squads,
 * and opening lineups. No React or DOM dependencies.
 */
import type { SquadPlayer } from '../types/match'

export type NameValidationResult = {
  isValid: boolean
  error: string
  normalized: string
}

/**
 * Collapses multiple internal spaces to a single space and trims whitespace.
 */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

/**
 * Validates an individual team or player name.
 *
 * Rules:
 * - Must not be empty or whitespace-only.
 * - Max length: 100 characters (after trimming).
 * - No control characters (\x00-\x1F, \x7F) or zero-width formatting characters.
 * - Must contain at least one letter (\p{L}) or digit (\p{N}).
 * - Allowed characters: Unicode letters, numbers, spaces, hyphens (-), apostrophes ('), and dots (.).
 * - Must start with a letter or digit.
 */
export function validateName(rawName: string, fieldLabel = 'Name'): NameValidationResult {
  const trimmed = rawName.trim()
  if (!trimmed) {
    return { isValid: false, error: `${fieldLabel} cannot be empty.`, normalized: '' }
  }

  // Check for ASCII control characters or zero-width/invisible formatting characters
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F\u200B-\u200D\uFEFF]/.test(rawName)) {
    return {
      isValid: false,
      error: `${fieldLabel} contains invalid or control characters.`,
      normalized: '',
    }
  }

  const normalized = normalizeName(rawName)

  if (normalized.length > 100) {
    return {
      isValid: false,
      error: `${fieldLabel} must be 100 characters or fewer.`,
      normalized: '',
    }
  }

  // Must contain at least one letter or number
  if (!/[\p{L}\p{N}]/u.test(normalized)) {
    return {
      isValid: false,
      error: `${fieldLabel} must contain at least one letter or number.`,
      normalized: '',
    }
  }

  // Must start with a letter or number
  if (!/^[\p{L}\p{N}]/u.test(normalized)) {
    return {
      isValid: false,
      error: `${fieldLabel} must start with a letter or number.`,
      normalized: '',
    }
  }

  // Allowed characters: letters, combining marks/accents, numbers, spaces, hyphens, apostrophes, and dots
  if (!/^[\p{L}\p{N}][\p{L}\p{M}\p{N}\s\-'.]*$/u.test(normalized)) {
    return {
      isValid: false,
      error: `${fieldLabel} may only contain letters, numbers, spaces, hyphens, apostrophes, and dots.`,
      normalized: '',
    }
  }

  return { isValid: true, error: '', normalized }
}

/**
 * Validates host and visitor team names for a match matchup.
 * Ensures both names are individually valid and distinct (case-insensitive).
 */
export function validateTeamMatchup(
  teamOneRaw: string,
  teamTwoRaw: string
): { isValid: boolean; error: string; teamOne: string; teamTwo: string } {
  const v1 = validateName(teamOneRaw, 'Host team')
  if (!v1.isValid) {
    return { isValid: false, error: v1.error, teamOne: '', teamTwo: '' }
  }
  const v2 = validateName(teamTwoRaw, 'Visitor team')
  if (!v2.isValid) {
    return { isValid: false, error: v2.error, teamOne: '', teamTwo: '' }
  }

  if (v1.normalized.toLowerCase() === v2.normalized.toLowerCase()) {
    return {
      isValid: false,
      error: 'Host and visitor teams must have different names.',
      teamOne: '',
      teamTwo: '',
    }
  }

  return {
    isValid: true,
    error: '',
    teamOne: v1.normalized,
    teamTwo: v2.normalized,
  }
}

/**
 * Validates a player name being added or edited in a match squad.
 * Checks intra-squad uniqueness and inter-squad uniqueness for the current match.
 */
export function validatePlayerName(
  rawName: string,
  currentSquad: SquadPlayer[],
  opposingSquad: SquadPlayer[],
  editingIndex?: number
): { isValid: boolean; error: string; normalized: string } {
  const val = validateName(rawName, 'Player name')
  if (!val.isValid) {
    return val
  }
  const norm = val.normalized
  const lower = norm.toLowerCase()

  // 1. Check duplicate within the same squad
  const duplicateInCurrent = currentSquad.some(
    (p, idx) => idx !== editingIndex && normalizeName(p.name).toLowerCase() === lower
  )
  if (duplicateInCurrent) {
    return {
      isValid: false,
      error: 'This player already exists in this team.',
      normalized: '',
    }
  }

  // 2. Check duplicate in opposing squad (match-scoped uniqueness)
  const duplicateInOpposing = opposingSquad.some(
    (p) => normalizeName(p.name).toLowerCase() === lower
  )
  if (duplicateInOpposing) {
    return {
      isValid: false,
      error: 'A player with this name is already in the opposing team for this match.',
      normalized: '',
    }
  }

  return { isValid: true, error: '', normalized: norm }
}

/**
 * Validates both squads before advancing from roster to opening selection.
 * Ensures squads meet the exact configured team size and contain no duplicate names.
 */
export function validateSquadsReady(
  homePlayers: SquadPlayer[],
  visitorPlayers: SquadPlayer[],
  teamSize: number,
  teamOneName = 'Host Team',
  teamTwoName = 'Visitor Team'
): { isValid: boolean; error: string } {
  if (homePlayers.length < teamSize) {
    const diff = teamSize - homePlayers.length
    return {
      isValid: false,
      error: `Add ${diff} more player${diff === 1 ? '' : 's'} to ${teamOneName}.`,
    }
  }
  if (homePlayers.length > teamSize) {
    return {
      isValid: false,
      error: `${teamOneName} has more players than the team size (${teamSize}).`,
    }
  }

  if (visitorPlayers.length < teamSize) {
    const diff = teamSize - visitorPlayers.length
    return {
      isValid: false,
      error: `Add ${diff} more player${diff === 1 ? '' : 's'} to ${teamTwoName}.`,
    }
  }
  if (visitorPlayers.length > teamSize) {
    return {
      isValid: false,
      error: `${teamTwoName} has more players than the team size (${teamSize}).`,
    }
  }

  const homeNamesLower = new Set<string>()
  for (const p of homePlayers) {
    const lower = normalizeName(p.name).toLowerCase()
    if (homeNamesLower.has(lower)) {
      return {
        isValid: false,
        error: `Duplicate player name "${p.name}" found in ${teamOneName}.`,
      }
    }
    homeNamesLower.add(lower)
  }

  const visitorNamesLower = new Set<string>()
  for (const p of visitorPlayers) {
    const lower = normalizeName(p.name).toLowerCase()
    if (visitorNamesLower.has(lower)) {
      return {
        isValid: false,
        error: `Duplicate player name "${p.name}" found in ${teamTwoName}.`,
      }
    }
    if (homeNamesLower.has(lower)) {
      return {
        isValid: false,
        error: `Player "${p.name}" is present in both teams for this match.`,
      }
    }
    visitorNamesLower.add(lower)
  }

  return { isValid: true, error: '' }
}

/**
 * Validates opening striker, non-striker, and bowler selections.
 * Ensures distinct batters and roster membership.
 */
export function validateOpeningSelection(
  openingStriker: string,
  openingNonStriker: string,
  openingBowler: string,
  battingRoster: SquadPlayer[],
  bowlingRoster: SquadPlayer[]
): { isValid: boolean; error: string } {
  if (!openingStriker.trim() || !openingNonStriker.trim() || !openingBowler.trim()) {
    return {
      isValid: false,
      error: 'Choose two opening batters and an opening bowler.',
    }
  }

  const strikerNorm = normalizeName(openingStriker).toLowerCase()
  const nonStrikerNorm = normalizeName(openingNonStriker).toLowerCase()
  const bowlerNorm = normalizeName(openingBowler).toLowerCase()

  if (strikerNorm === nonStrikerNorm) {
    return {
      isValid: false,
      error: 'Opening striker and non-striker must be two different players.',
    }
  }

  const strikerExists = battingRoster.some(
    (p) => normalizeName(p.name).toLowerCase() === strikerNorm
  )
  if (!strikerExists) {
    return {
      isValid: false,
      error: `Opening striker "${openingStriker}" is not in the batting squad.`,
    }
  }

  const nonStrikerExists = battingRoster.some(
    (p) => normalizeName(p.name).toLowerCase() === nonStrikerNorm
  )
  if (!nonStrikerExists) {
    return {
      isValid: false,
      error: `Opening non-striker "${openingNonStriker}" is not in the batting squad.`,
    }
  }

  const bowlerExists = bowlingRoster.some(
    (p) => normalizeName(p.name).toLowerCase() === bowlerNorm
  )
  if (!bowlerExists) {
    return {
      isValid: false,
      error: `Opening bowler "${openingBowler}" is not in the bowling squad.`,
    }
  }

  return { isValid: true, error: '' }
}
