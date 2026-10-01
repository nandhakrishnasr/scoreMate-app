import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cleanSearchText,
  condenseSearchText,
  matchesSearchQuery,
  getDeterministicDateSearchTokens,
  extractParticipatingPlayers,
  extractMatchSearchFields,
  matchesMultiField,
  filterMatches,
  filterTeams,
  filterPlayers,
} from '../src/utils/search.ts'
import type { CompletedMatch, PlayerStat, ScoreState, TeamStat } from '../src/types/match.ts'
import { toCompletedMatch, type PersistedMatchRecord } from '../src/types/database.ts'

test('Search Normalization - Exact required pairs', () => {
  const pairs: [string, string][] = [
    ['René', 'Rene'],
    ['Rene', 'René'],
    ['Müller', 'Muller'],
    ['Muller', 'Müller'],
    ['José', 'Jose'],
    ['Jose', 'José'],
    ['M. S. Dhoni', 'MS Dhoni'],
    ['MS Dhoni', 'M. S. Dhoni'],
    ["O'Connor", 'OConnor'],
    ['OConnor', "O'Connor"],
    ['Trent Boult-Smith', 'Boult Smith'],
    ['Trent Boult-Smith', 'Boult-Smith'],
    ['A. B. de Villiers', 'de villiers'],
    ['A. B. de Villiers', 'ab de villiers'],
    ['दीपक', 'दीपक'],
    ['ரிதம்', 'ரிதம்'],
    ['कृष्ण', 'कृष्ण'],
    ['山田', '山田'],
    ['محمد', 'محمد'],
  ]

  for (const [target, query] of pairs) {
    assert.equal(
      matchesSearchQuery(target, query),
      true,
      `Target "${target}" should match query "${query}"`
    )
  }
})

test('Search Normalization - Preserves non-Latin scripts without stripping combining marks', () => {
  // Latin accents should be stripped
  assert.equal(cleanSearchText('René Müller José François'), 'rene muller jose francois')

  // Indic scripts must preserve their vowel marks (matras) intact!
  // If matras were stripped: दीपक -> दपक, ரிதம் -> ரதம, कृष्ण -> कषण
  assert.equal(cleanSearchText('दीपक'), 'दीपक')
  assert.equal(cleanSearchText('ரிதம்'), 'ரிதம்')
  assert.equal(cleanSearchText('कृष्ण'), 'कृष्ण')
  assert.equal(cleanSearchText('山田'), '山田')
  assert.equal(cleanSearchText('محمد'), 'محمد')

  // Partial matches within non-Latin scripts
  assert.equal(matchesSearchQuery('दीपक चाहर', 'दीपक'), true)
  assert.equal(matchesSearchQuery('ரிதம் குமார்', 'ரிதம்'), true)
  assert.equal(matchesSearchQuery('山田 太郎', '山田'), true)
  assert.equal(matchesSearchQuery('محمد علي', 'محمد'), true)
})

test('Search Normalization - Mixed-script names', () => {
  const target = 'Virat Kohli विराट (விஹாரி)'
  assert.equal(matchesSearchQuery(target, 'Kohli'), true)
  assert.equal(matchesSearchQuery(target, 'विराट'), true)
  assert.equal(matchesSearchQuery(target, 'விஹாரி'), true)
  assert.equal(matchesSearchQuery(target, 'virat'), true)
})

test('Search Normalization - Empty query and partial query', () => {
  assert.equal(matchesSearchQuery('Virat Kohli', ''), true)
  assert.equal(matchesSearchQuery('Virat Kohli', '   '), true)
  assert.equal(matchesSearchQuery('Virat Kohli', null), true)
  assert.equal(matchesSearchQuery('Virat Kohli', undefined), true)

  // Empty target
  assert.equal(matchesSearchQuery('', 'Kohli'), false)
  assert.equal(matchesSearchQuery(null, 'Kohli'), false)
  assert.equal(matchesSearchQuery(undefined, 'Kohli'), false)

  // Partial query
  assert.equal(matchesSearchQuery('Jasprit Bumrah', 'bum'), true)
  assert.equal(matchesSearchQuery('Jasprit Bumrah', 'JASP'), true)
  assert.equal(matchesSearchQuery('Ravindra Jadeja', 'Jad'), true)
})

test('Search Normalization - Punctuation and whitespace variants', () => {
  const name = "Trent Boult-Smith Jr."
  assert.equal(matchesSearchQuery(name, 'Boult Smith'), true)
  assert.equal(matchesSearchQuery(name, 'BoultSmith'), true)
  assert.equal(matchesSearchQuery(name, 'boult-smith'), true)
  assert.equal(matchesSearchQuery(name, 'Jr'), true)
  assert.equal(matchesSearchQuery(name, 'jr.'), true)

  // Extra whitespace in query and target
  assert.equal(matchesSearchQuery('  Rohit   Sharma  ', 'rohit  sharma'), true)
  assert.equal(matchesSearchQuery('Shaheen Shah Afridi', '  shaheen   afridi  '), true)

  // condenseSearchText
  assert.equal(condenseSearchText('M. S. Dhoni'), 'msdhoni')
  assert.equal(condenseSearchText("O'Connor"), 'oconnor')
  assert.equal(condenseSearchText('Trent Boult-Smith'), 'trentboultsmith')

  // matchesMultiField
  assert.equal(matchesMultiField(['India', 'Australia', 'Melbourne'], 'India'), true)
  assert.equal(matchesMultiField(['India', 'Australia', 'Melbourne'], 'Melbourne India'), true)
  assert.equal(matchesMultiField(['India', 'Australia'], 'South Africa'), false)
  assert.equal(matchesMultiField([], 'India'), false)
  assert.equal(matchesMultiField(['India'], ''), true)
})

test('Deterministic Date Search Tokens - Locale-independent date representations', () => {
  const dateStr = '2026-09-18T10:30:00.000Z'
  const tokens = getDeterministicDateSearchTokens(dateStr)

  // Must contain ISO year, month name, date representations
  assert.ok(tokens.some((t) => t.includes('2026')))
  assert.ok(tokens.some((t) => t.includes('Sep') || t.includes('September')))
  assert.ok(tokens.some((t) => t.includes('2026-09') || t.includes('2026-09-18')))

  // Invalid date handling
  const invalidTokens = getDeterministicDateSearchTokens('invalid-date')
  assert.deepEqual(invalidTokens, ['invalid-date'])

  // Empty date handling
  assert.deepEqual(getDeterministicDateSearchTokens(''), [])
  assert.deepEqual(getDeterministicDateSearchTokens(null), [])
})

test('Participating player extraction from ScoreState', () => {
  const score: ScoreState = {
    runs: 180,
    wickets: 4,
    balls: 120,
    striker: { name: 'Rohit Sharma', runs: 65, balls: 42, fours: 6, sixes: 3, isOut: false },
    nonStriker: { name: 'Virat Kohli', runs: 50, balls: 35, fours: 4, sixes: 1, isOut: false },
    bowler: { name: 'Pat Cummins', balls: 24, runs: 32, wickets: 2 },
    currentOver: [],
    overHistory: [],
    fallOfWickets: [],
    dismissedBatters: ['KL Rahul', 'Shubman Gill'],
    inningsComplete: true,
    battingStats: [
      { name: 'KL Rahul', runs: 20, balls: 15, fours: 2, sixes: 0, isOut: true },
      { name: 'Shubman Gill', runs: 35, balls: 25, fours: 4, sixes: 0, isOut: true },
      { name: 'Rohit Sharma', runs: 65, balls: 42, fours: 6, sixes: 3, isOut: false },
      { name: 'Virat Kohli', runs: 50, balls: 35, fours: 4, sixes: 1, isOut: false },
    ],
    bowlerStats: [
      { name: 'Mitchell Starc', balls: 24, runs: 40, wickets: 1 },
      { name: 'Pat Cummins', balls: 24, runs: 32, wickets: 2 },
      { name: 'Josh Hazlewood', balls: 24, runs: 28, wickets: 1 },
    ],
  }

  const players = extractParticipatingPlayers(score)
  assert.ok(players.includes('Rohit Sharma'))
  assert.ok(players.includes('Virat Kohli'))
  assert.ok(players.includes('Pat Cummins'))
  assert.ok(players.includes('KL Rahul'))
  assert.ok(players.includes('Shubman Gill'))
  assert.ok(players.includes('Mitchell Starc'))
  assert.ok(players.includes('Josh Hazlewood'))
})

test('History Search - Multi-field search over CompletedMatch', () => {
  const mockMatch: CompletedMatch = {
    id: 'match-123',
    savedAt: '2026-09-18T14:00:00.000Z',
    teamOne: 'India',
    teamTwo: 'Australia',
    firstBattingHome: true,
    firstInningsScore: {
      runs: 180,
      wickets: 4,
      balls: 120,
      striker: { name: 'Rohit Sharma', runs: 65, balls: 42, fours: 6, sixes: 3, isOut: false },
      nonStriker: { name: 'Virat Kohli', runs: 50, balls: 35, fours: 4, sixes: 1, isOut: false },
      bowler: { name: 'Mitchell Starc', balls: 24, runs: 40, wickets: 1 },
      currentOver: [],
      overHistory: [],
      fallOfWickets: [],
      dismissedBatters: [],
      inningsComplete: true,
      battingStats: [{ name: 'Rohit Sharma', runs: 65, balls: 42, fours: 6, sixes: 3, isOut: false }],
      bowlerStats: [{ name: 'Mitchell Starc', balls: 24, runs: 40, wickets: 1 }],
    },
    secondInningsScore: {
      runs: 150,
      wickets: 8,
      balls: 120,
      striker: { name: 'Glenn Maxwell', runs: 45, balls: 25, fours: 3, sixes: 3, isOut: false },
      nonStriker: { name: 'Pat Cummins', runs: 12, balls: 10, fours: 1, sixes: 0, isOut: false },
      bowler: { name: 'Jasprit Bumrah', balls: 24, runs: 20, wickets: 3 },
      currentOver: [],
      overHistory: [],
      fallOfWickets: [],
      dismissedBatters: ['Travis Head', 'David Warner'],
      inningsComplete: true,
      battingStats: [
        { name: 'Travis Head', runs: 20, balls: 15, fours: 2, sixes: 0, isOut: true },
        { name: 'David Warner', runs: 30, balls: 22, fours: 3, sixes: 1, isOut: true },
        { name: 'Glenn Maxwell', runs: 45, balls: 25, fours: 3, sixes: 3, isOut: false },
      ],
      bowlerStats: [{ name: 'Jasprit Bumrah', balls: 24, runs: 20, wickets: 3 }],
    },
    result: { winner: 'India', margin: '30 runs' },
    playerOfMatch: { name: 'Rohit Sharma', team: 'India', reason: 'Match-winning 65 runs' },
    venue: 'Melbourne Cricket Ground',
    competition: 'World Cup Final',
  }

  // Search by teamOne
  assert.equal(filterMatches([mockMatch], 'India').length, 1)

  // Search by teamTwo
  assert.equal(filterMatches([mockMatch], 'Australia').length, 1)

  // Search by participating batter (first innings)
  assert.equal(filterMatches([mockMatch], 'Rohit Sharma').length, 1)

  // Search by participating batter (second innings)
  assert.equal(filterMatches([mockMatch], 'Glenn Maxwell').length, 1)

  // Search by participating bowler (first innings)
  assert.equal(filterMatches([mockMatch], 'Mitchell Starc').length, 1)

  // Search by participating bowler (second innings)
  assert.equal(filterMatches([mockMatch], 'Jasprit Bumrah').length, 1)

  // Search by dismissed batter
  assert.equal(filterMatches([mockMatch], 'Travis Head').length, 1)

  // Search by venue
  assert.equal(filterMatches([mockMatch], 'Melbourne').length, 1)

  // Search by competition
  assert.equal(filterMatches([mockMatch], 'World Cup').length, 1)

  // Search by winner
  assert.equal(filterMatches([mockMatch], 'India won').length, 1)

  // Search by margin
  assert.equal(filterMatches([mockMatch], '30 runs').length, 1)

  // Search by player of match
  assert.equal(filterMatches([mockMatch], 'Rohit').length, 1)

  // Search by deterministic date
  assert.equal(filterMatches([mockMatch], '2026').length, 1)
  assert.equal(filterMatches([mockMatch], 'Sep').length, 1)

  // Non-matching query
  assert.equal(filterMatches([mockMatch], 'England').length, 0)
  assert.equal(filterMatches([mockMatch], 'Ben Stokes').length, 0)
})

test('Backward Compatibility - Legacy CompletedMatch without venue and competition', () => {
  const legacyMatch: CompletedMatch = {
    id: 'legacy-1',
    savedAt: '2025-05-10T09:00:00.000Z',
    teamOne: 'Surrey',
    teamTwo: 'Yorkshire',
    firstBattingHome: true,
    firstInningsScore: null,
    secondInningsScore: null,
    result: { winner: 'Surrey', margin: '5 wickets' },
  }

  // Must not throw or crash
  assert.doesNotThrow(() => {
    const fields = extractMatchSearchFields(legacyMatch)
    assert.ok(fields.includes('Surrey'))
    assert.ok(fields.includes('Yorkshire'))
  })

  // Filtering legacy match works
  assert.equal(filterMatches([legacyMatch], 'Surrey').length, 1)
  assert.equal(filterMatches([legacyMatch], 'Yorkshire').length, 1)
  assert.equal(filterMatches([legacyMatch], '5 wickets').length, 1)
  assert.equal(filterMatches([legacyMatch], '2025').length, 1)
  assert.equal(filterMatches([legacyMatch], 'Middlesex').length, 0)
})

test('Data Integrity & Immutability - Filter functions never mutate original objects', () => {
  const originalTeams: TeamStat[] = [
    Object.freeze({ name: 'Chennai Super Kings', played: 14, wins: 10, losses: 4, draws: 0 }),
    Object.freeze({ name: 'Mumbai Indians', played: 14, wins: 9, losses: 5, draws: 0 }),
  ]

  const originalPlayers: PlayerStat[] = [
    Object.freeze({
      name: 'MS Dhoni',
      runs: 450,
      balls: 250,
      bowlingBalls: 0,
      fours: 35,
      sixes: 25,
      outs: 4,
      notOuts: 8,
      wickets: 0,
      catches: 15,
      runOuts: 3,
      stumpings: 5,
      matches: 14,
    }),
  ]

  // Team search
  const filteredTeams = filterTeams(originalTeams, 'Chennai')
  assert.equal(filteredTeams.length, 1)
  assert.equal(filteredTeams[0].name, 'Chennai Super Kings')
  assert.equal(originalTeams.length, 2)

  // Empty search returns same list
  assert.equal(filterTeams(originalTeams, '').length, 2)

  // Player search
  const filteredPlayers = filterPlayers(originalPlayers, 'M. S. Dhoni')
  assert.equal(filteredPlayers.length, 1)
  assert.equal(filteredPlayers[0].name, 'MS Dhoni')

  // Empty search returns same list
  assert.equal(filterPlayers(originalPlayers, '').length, 1)
})

test('Performance and Edge Cases - Large datasets and empty lists', () => {
  // Empty inputs
  assert.deepEqual(filterMatches([], 'India'), [])
  assert.deepEqual(filterTeams([], 'India'), [])
  assert.deepEqual(filterPlayers([], 'Kohli'), [])

  // Large dataset (1,000 matches)
  const largeMatches: CompletedMatch[] = Array.from({ length: 1000 }, (_, i) => ({
    id: `match-${i}`,
    savedAt: '2026-09-18T10:00:00.000Z',
    teamOne: i % 2 === 0 ? 'India' : 'Australia',
    teamTwo: i % 2 === 0 ? 'England' : 'South Africa',
    firstBattingHome: true,
    firstInningsScore: null,
    secondInningsScore: null,
    result: { winner: i % 2 === 0 ? 'India' : 'Australia', margin: '20 runs' },
    venue: `Stadium ${i % 10}`,
    competition: 'Premier League',
  }))

  const start = performance.now()
  const filtered = filterMatches(largeMatches, 'Stadium 5')
  const duration = performance.now() - start

  assert.equal(filtered.length, 100)
  // Must execute comfortably under 50ms for 1000 records
  assert.ok(duration < 100, `Search took ${duration}ms, expected under 100ms`)
})

test('Targeted Audit: Innings participating players and full lifecycle persistence', () => {
  // Realistic first innings where:
  // - Openers: Rohit Sharma & Shubman Gill
  // - #3: Virat Kohli
  // - #4: KL Rahul
  // - Final batters at the crease: Hardik Pandya & Ravindra Jadeja
  // - Current bowler at end of innings: Josh Hazlewood
  // - Earlier bowlers: Mitchell Starc, Pat Cummins, Adam Zampa
  const firstInnings: ScoreState = {
    runs: 310,
    wickets: 4,
    balls: 300,
    striker: { name: 'Hardik Pandya', runs: 55, balls: 30, fours: 4, sixes: 3, isOut: false },
    nonStriker: { name: 'Ravindra Jadeja', runs: 35, balls: 22, fours: 3, sixes: 1, isOut: false },
    bowler: { name: 'Josh Hazlewood', balls: 60, runs: 50, wickets: 1 },
    currentOver: [],
    overHistory: [],
    fallOfWickets: [
      { wicket: 1, score: 60, batter: 'Rohit Sharma' },
      { wicket: 2, score: 140, batter: 'Shubman Gill' },
      { wicket: 3, score: 210, batter: 'Virat Kohli' },
      { wicket: 4, score: 250, batter: 'KL Rahul' },
    ],
    dismissedBatters: ['Rohit Sharma', 'Shubman Gill', 'Virat Kohli', 'KL Rahul'],
    inningsComplete: true,
    battingStats: [
      { name: 'Rohit Sharma', runs: 35, balls: 28, fours: 4, sixes: 1, isOut: true },
      { name: 'Shubman Gill', runs: 45, balls: 40, fours: 5, sixes: 0, isOut: true },
      { name: 'Virat Kohli', runs: 75, balls: 65, fours: 7, sixes: 1, isOut: true },
      { name: 'KL Rahul', runs: 30, balls: 25, fours: 2, sixes: 1, isOut: true },
      { name: 'Hardik Pandya', runs: 55, balls: 30, fours: 4, sixes: 3, isOut: false },
      { name: 'Ravindra Jadeja', runs: 35, balls: 22, fours: 3, sixes: 1, isOut: false },
    ],
    bowlerStats: [
      { name: 'Mitchell Starc', balls: 60, runs: 65, wickets: 1 },
      { name: 'Pat Cummins', balls: 60, runs: 55, wickets: 1 },
      { name: 'Adam Zampa', balls: 60, runs: 70, wickets: 1 },
      { name: 'Josh Hazlewood', balls: 60, runs: 50, wickets: 1 },
    ],
  }

  // Realistic second innings where:
  // - Openers: David Warner & Travis Head
  // - #3: Steve Smith
  // - Final batters at the crease: Glenn Maxwell & Alex Carey
  // - Final bowler: Jasprit Bumrah
  // - Earlier bowlers: Mohammed Shami & Kuldeep Yadav
  const secondInnings: ScoreState = {
    runs: 280,
    wickets: 5,
    balls: 300,
    striker: { name: 'Glenn Maxwell', runs: 65, balls: 45, fours: 6, sixes: 2, isOut: false },
    nonStriker: { name: 'Alex Carey', runs: 20, balls: 18, fours: 2, sixes: 0, isOut: false },
    bowler: { name: 'Jasprit Bumrah', balls: 60, runs: 40, wickets: 2 },
    currentOver: [],
    overHistory: [],
    fallOfWickets: [
      { wicket: 1, score: 40, batter: 'David Warner' },
      { wicket: 2, score: 110, batter: 'Travis Head' },
      { wicket: 3, score: 180, batter: 'Steve Smith' },
    ],
    dismissedBatters: ['David Warner', 'Travis Head', 'Steve Smith'],
    inningsComplete: true,
    battingStats: [
      { name: 'David Warner', runs: 22, balls: 20, fours: 3, sixes: 0, isOut: true },
      { name: 'Travis Head', runs: 50, balls: 42, fours: 6, sixes: 1, isOut: true },
      { name: 'Steve Smith', runs: 45, balls: 50, fours: 4, sixes: 0, isOut: true },
      { name: 'Glenn Maxwell', runs: 65, balls: 45, fours: 6, sixes: 2, isOut: false },
      { name: 'Alex Carey', runs: 20, balls: 18, fours: 2, sixes: 0, isOut: false },
    ],
    bowlerStats: [
      { name: 'Mohammed Shami', balls: 60, runs: 55, wickets: 1 },
      { name: 'Kuldeep Yadav', balls: 60, runs: 60, wickets: 2 },
      { name: 'Jasprit Bumrah', balls: 60, runs: 40, wickets: 2 },
    ],
  }

  // Simulated full persistence record as stored in IndexedDB and reloaded
  const persistedRecord: PersistedMatchRecord = {
    schemaVersion: 1,
    matchId: 'match-audit-999',
    status: 'completed',
    ownerUid: 'uid-test',
    createdAt: '2026-09-18T10:00:00.000Z',
    updatedAt: '2026-09-18T14:30:00.000Z',
    completedAt: '2026-09-18T14:30:00.000Z',
    teamOne: 'India',
    teamTwo: 'Australia',
    overs: '50',
    teamSize: '11',
    lastManBatting: false,
    venue: 'Wankhede Stadium',
    competition: 'ICC Champions Trophy',
    firstBattingHome: true,
    firstInningsScore: firstInnings,
    score: secondInnings,
    matchResult: { winner: 'India', margin: '30 runs' },
    playerOfMatch: { name: 'Virat Kohli', team: 'India', reason: 'Anchoring 75' },
    syncStatus: 'synced',
    syncPending: false,
  }

  // Convert to domain CompletedMatch exactly as MatchContext does on reload
  const match = toCompletedMatch(persistedRecord)
  const matchesList = [match]

  // Proof 1: A batter who batted earlier in innings 1 but is no longer striker/non-striker
  assert.equal(filterMatches(matchesList, 'KL Rahul').length, 1)

  // Proof 2: A batter who was dismissed earlier
  assert.equal(filterMatches(matchesList, 'Shubman Gill').length, 1)

  // Proof 3: A batter who faced at least one delivery but is now absent from striker/non-striker
  assert.equal(filterMatches(matchesList, 'Rohit Sharma').length, 1)

  // Proof 4: A bowler who completed an earlier over and is no longer current bowler
  assert.equal(filterMatches(matchesList, 'Mitchell Starc').length, 1)

  // Proof 5: A bowler who bowled but has no current bowling position
  assert.equal(filterMatches(matchesList, 'Adam Zampa').length, 1)

  // Proof 6: Players from BOTH innings
  // Innings 1 batter & bowler:
  assert.equal(filterMatches(matchesList, 'Virat Kohli').length, 1)
  assert.equal(filterMatches(matchesList, 'Pat Cummins').length, 1)
  // Innings 2 batter & bowler:
  assert.equal(filterMatches(matchesList, 'David Warner').length, 1)
  assert.equal(filterMatches(matchesList, 'Mohammed Shami').length, 1)
  assert.equal(filterMatches(matchesList, 'Kuldeep Yadav').length, 1)
  assert.equal(filterMatches(matchesList, 'Glenn Maxwell').length, 1)

  // Verification of persisted metadata survived reload:
  // Venue
  assert.equal(filterMatches(matchesList, 'Wankhede').length, 1)
  // Competition
  assert.equal(filterMatches(matchesList, 'Champions Trophy').length, 1)
  // Winner and margin
  assert.equal(filterMatches(matchesList, 'India won').length, 1)
  assert.equal(filterMatches(matchesList, '30 runs').length, 1)
  // Player of the match
  assert.equal(filterMatches(matchesList, 'Virat Kohli').length, 1)

  // Deterministic date tokens matching stored date rather than current device locale
  assert.equal(filterMatches(matchesList, '2026-09-18').length, 1)
  assert.equal(filterMatches(matchesList, 'Sep 2026').length, 1)
  assert.equal(filterMatches(matchesList, '18 Sep').length, 1)
})


