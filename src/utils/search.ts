import type { CompletedMatch, PlayerStat, ScoreState, TeamStat } from '../types/match'

const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]
const MONTH_NAMES_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * Normalizes text for search matching:
 * - NFKD decomposition
 * - Strips combining diacritical marks strictly in the Latin range (U+0300 to U+036F)
 *   preserving Indic, CJK, Arabic, and other non-Latin combining characters
 * - Converts to lower case
 * - Folds apostrophes/quotes
 * - Folds dots, dashes, underscores to spaces
 * - Trims and collapses multiple spaces into a single space
 */
export function cleanSearchText(str: string | null | undefined): string {
  if (!str) return ''
  return str
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/['’‘]/g, '')
    .replace(/[.\-–—_]+/g, ' ')
    .replace(/\s+/g, ' ')
}

/**
 * Strips all spaces from cleaned search text to allow matching across
 * spacing variations (e.g. "MS Dhoni" <-> "M. S. Dhoni", "Boult-Smith" <-> "BoultSmith").
 */
export function condenseSearchText(str: string | null | undefined): string {
  return cleanSearchText(str).replace(/\s+/g, '')
}

/**
 * Compiled search query representation for high-performance repeated checks.
 */
export interface CompiledQuery {
  raw: string
  clean: string
  condensed: string
  tokens: string[]
}

export function compileQuery(query: string | null | undefined): CompiledQuery {
  const raw = query ?? ''
  const clean = cleanSearchText(raw)
  const condensed = clean.replace(/\s+/g, '')
  const tokens = clean.split(' ').filter(Boolean)
  return { raw, clean, condensed, tokens }
}

/**
 * Internal fast-path match against a pre-compiled query.
 */
export function matchesCompiled(
  target: string | null | undefined,
  compiled: CompiledQuery
): boolean {
  if (!compiled.clean) return true
  if (!target) return false

  const tClean = cleanSearchText(target)
  if (!tClean) return false

  // Direct substring match
  if (tClean.includes(compiled.clean)) return true

  // Condensed match (e.g. "MS Dhoni" <-> "M. S. Dhoni", "O'Connor" <-> "OConnor")
  const tCond = tClean.replace(/\s+/g, '')
  if (compiled.condensed && tCond.includes(compiled.condensed)) return true

  // Multi-term token match: every space-separated term in query must match
  if (compiled.tokens.length > 1) {
    const allTokensMatch = compiled.tokens.every((token) => {
      if (tClean.includes(token)) return true
      const tokenCond = token.replace(/\s+/g, '')
      return tokenCond ? tCond.includes(tokenCond) : true
    })
    if (allTokensMatch) return true
  }

  return false
}

/**
 * Determines whether a target string matches a search query using:
 * 1. Case-folded, Latin-accent-folded substring matching
 * 2. Condensed punctuation/spacing-folded matching
 * 3. Multi-term token matching (all query words present in target)
 */
export function matchesSearchQuery(
  target: string | null | undefined,
  query: string | null | undefined
): boolean {
  const compiled = compileQuery(query)
  return matchesCompiled(target, compiled)
}

/**
 * Extracts deterministic searchable date strings for a given ISO date string.
 * Does not depend on browser locale.
 */
export function getDeterministicDateSearchTokens(dateStr: string | null | undefined): string[] {
  if (!dateStr) return []
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return [dateStr]

  const tokens = new Set<string>()
  tokens.add(dateStr)

  // UTC tokens
  const uYear = d.getUTCFullYear().toString()
  const uMonthIdx = d.getUTCMonth()
  const uMonthNum = (uMonthIdx + 1).toString().padStart(2, '0')
  const uDayNum = d.getUTCDate().toString().padStart(2, '0')
  const uShortMonth = MONTH_NAMES_SHORT[uMonthIdx]
  const uFullMonth = MONTH_NAMES_FULL[uMonthIdx]

  tokens.add(uYear)
  tokens.add(`${uYear}-${uMonthNum}`)
  tokens.add(`${uYear}-${uMonthNum}-${uDayNum}`)
  tokens.add(`${uDayNum}-${uMonthNum}-${uYear}`)
  tokens.add(`${uDayNum}/${uMonthNum}/${uYear}`)
  tokens.add(`${uMonthNum}/${uDayNum}/${uYear}`)
  tokens.add(`${uDayNum} ${uShortMonth} ${uYear}`)
  tokens.add(`${uDayNum} ${uFullMonth} ${uYear}`)
  tokens.add(`${uShortMonth} ${uYear}`)
  tokens.add(`${uFullMonth} ${uYear}`)

  // Local tokens
  const lYear = d.getFullYear().toString()
  const lMonthIdx = d.getMonth()
  const lMonthNum = (lMonthIdx + 1).toString().padStart(2, '0')
  const lDayNum = d.getDate().toString().padStart(2, '0')
  const lShortMonth = MONTH_NAMES_SHORT[lMonthIdx]
  const lFullMonth = MONTH_NAMES_FULL[lMonthIdx]

  tokens.add(lYear)
  tokens.add(`${lYear}-${lMonthNum}`)
  tokens.add(`${lYear}-${lMonthNum}-${lDayNum}`)
  tokens.add(`${lDayNum}-${lMonthNum}-${lYear}`)
  tokens.add(`${lDayNum}/${lMonthNum}/${lYear}`)
  tokens.add(`${lMonthNum}/${lDayNum}/${lYear}`)
  tokens.add(`${lDayNum} ${lShortMonth} ${uYear}`)
  tokens.add(`${lDayNum} ${lFullMonth} ${lYear}`)
  tokens.add(`${lShortMonth} ${lYear}`)
  tokens.add(`${lFullMonth} ${lYear}`)

  return Array.from(tokens)
}

/**
 * Extracts all participating player names (batters, dismissed batters, bowlers) from a ScoreState.
 */
export function extractParticipatingPlayers(score: ScoreState | null | undefined): string[] {
  if (!score) return []
  const names = new Set<string>()

  if (score.striker?.name) names.add(score.striker.name)
  if (score.nonStriker?.name) names.add(score.nonStriker.name)
  if (score.bowler?.name) names.add(score.bowler.name)

  if (Array.isArray(score.battingStats)) {
    for (const b of score.battingStats) {
      if (b?.name) names.add(b.name)
    }
  }

  if (Array.isArray(score.bowlerStats)) {
    for (const b of score.bowlerStats) {
      if (b?.name) names.add(b.name)
    }
  }

  if (Array.isArray(score.dismissedBatters)) {
    for (const d of score.dismissedBatters) {
      if (d) names.add(d)
    }
  }

  if (Array.isArray(score.fallOfWickets)) {
    for (const f of score.fallOfWickets) {
      if (f?.batter) names.add(f.batter)
    }
  }

  return Array.from(names)
}

/**
 * Extracts searchable fields from a CompletedMatch:
 * - teamOne
 * - teamTwo
 * - participating batter names
 * - participating bowler names
 * - venue
 * - competition
 * - winner
 * - result margin
 * - player of match
 * - deterministic match date tokens
 */
export function extractMatchSearchFields(match: CompletedMatch): string[] {
  const fields: string[] = []

  if (match.teamOne) fields.push(match.teamOne)
  if (match.teamTwo) fields.push(match.teamTwo)
  if (match.venue) fields.push(match.venue)
  if (match.competition) fields.push(match.competition)
  if (match.result?.winner) {
    fields.push(match.result.winner)
    if (match.result.winner !== 'Match Drawn' && match.result.winner !== 'Match Tied') {
      fields.push(`${match.result.winner} won`)
      if (match.result.margin) {
        fields.push(`${match.result.winner} won by ${match.result.margin}`)
      }
    }
  }
  if (match.result?.margin) fields.push(match.result.margin)
  if (match.playerOfMatch?.name) fields.push(match.playerOfMatch.name)

  // Participating players from both innings
  const firstPlayers = extractParticipatingPlayers(match.firstInningsScore)
  const secondPlayers = extractParticipatingPlayers(match.secondInningsScore)
  fields.push(...firstPlayers, ...secondPlayers)

  // Deterministic date tokens
  if (match.savedAt) {
    fields.push(...getDeterministicDateSearchTokens(match.savedAt))
  }

  return fields
}

/**
 * Checks whether candidate fields match a search query across all tokens.
 */
export function matchesMultiField(
  fields: (string | undefined | null)[],
  query: string | null | undefined
): boolean {
  const compiled = compileQuery(query)
  if (!compiled.clean) return true

  // Check if any single field directly matches the query
  for (const field of fields) {
    if (field && matchesCompiled(field, compiled)) {
      return true
    }
  }

  // Check combined fields
  const combined = fields.filter(Boolean).join(' ')
  if (matchesCompiled(combined, compiled)) {
    return true
  }

  // Token match across all fields: each query word must match at least one field
  if (compiled.tokens.length > 1) {
    const allTokensFound = compiled.tokens.every((token) => {
      const tokenCompiled = compileQuery(token)
      return fields.some((field) => field && matchesCompiled(field, tokenCompiled))
    })
    if (allTokensFound) return true
  }

  return false
}

/**
 * Efficient check if a CompletedMatch matches a compiled query.
 * Evaluates high-probability metadata fields first before extracting nested player structures.
 */
function matchMatchesCompiledQuery(match: CompletedMatch, compiled: CompiledQuery): boolean {
  if (!compiled.clean) return true

  // Fast-path: check top-level match metadata first
  const topFields = [
    match.teamOne,
    match.teamTwo,
    match.venue,
    match.competition,
    match.result?.winner,
    match.result?.margin,
    match.playerOfMatch?.name,
  ]

  for (const f of topFields) {
    if (f && matchesCompiled(f, compiled)) return true
  }

  if (match.result?.winner && match.result.winner !== 'Match Drawn' && match.result.winner !== 'Match Tied') {
    if (matchesCompiled(`${match.result.winner} won`, compiled)) return true
    if (match.result.margin && matchesCompiled(`${match.result.winner} won by ${match.result.margin}`, compiled)) {
      return true
    }
  }

  // Check participating players
  const firstPlayers = extractParticipatingPlayers(match.firstInningsScore)
  for (const p of firstPlayers) {
    if (matchesCompiled(p, compiled)) return true
  }

  const secondPlayers = extractParticipatingPlayers(match.secondInningsScore)
  for (const p of secondPlayers) {
    if (matchesCompiled(p, compiled)) return true
  }

  // Check deterministic date tokens
  if (match.savedAt) {
    const dateTokens = getDeterministicDateSearchTokens(match.savedAt)
    for (const d of dateTokens) {
      if (matchesCompiled(d, compiled)) return true
    }
  }

  // If query has multiple tokens (e.g. "India Kohli"), check if all tokens are matched across all fields
  if (compiled.tokens.length > 1) {
    const allFields = extractMatchSearchFields(match)
    return compiled.tokens.every((token) => {
      const tokenCompiled = compileQuery(token)
      return allFields.some((f) => matchesCompiled(f, tokenCompiled))
    })
  }

  return false
}

/**
 * Pure in-memory filter for CompletedMatch array.
 * Guaranteed read-only: does not mutate match objects or the original array.
 */
export function filterMatches(matches: CompletedMatch[], query: string): CompletedMatch[] {
  if (!query || !query.trim()) return matches
  const compiled = compileQuery(query)
  if (!compiled.clean) return matches

  return matches.filter((match) => matchMatchesCompiledQuery(match, compiled))
}

/**
 * Pure in-memory filter for TeamStat array.
 * Guaranteed read-only: does not mutate team objects or the original array.
 */
export function filterTeams(teams: TeamStat[], query: string): TeamStat[] {
  if (!query || !query.trim()) return teams
  const compiled = compileQuery(query)
  if (!compiled.clean) return teams

  return teams.filter((team) => matchesCompiled(team.name, compiled))
}

/**
 * Pure in-memory filter for PlayerStat array.
 * Guaranteed read-only: does not mutate player objects or the original array.
 */
export function filterPlayers(players: PlayerStat[], query: string): PlayerStat[] {
  if (!query || !query.trim()) return players
  const compiled = compileQuery(query)
  if (!compiled.clean) return players

  return players.filter((player) => matchesCompiled(player.name, compiled))
}
