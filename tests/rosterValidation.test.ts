import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  normalizeName,
  validateName,
  validateTeamMatchup,
  validatePlayerName,
  validateSquadsReady,
  validateOpeningSelection,
} from '../src/utils/validation.ts'
import type { SquadPlayer } from '../src/types/match.ts'

describe('Roster & Name Validation (Phase 9)', () => {
  describe('1. normalizeName', () => {
    it('trims leading and trailing whitespace', () => {
      assert.strictEqual(normalizeName('   Team A   '), 'Team A')
    })

    it('collapses multiple internal whitespace characters to a single space', () => {
      assert.strictEqual(normalizeName('M.    S.    Dhoni'), 'M. S. Dhoni')
      assert.strictEqual(normalizeName('Royal   Challengers   Bangalore'), 'Royal Challengers Bangalore')
    })
  })

  describe('2. validateName', () => {
    it('accepts standard letters, numbers, and spaces', () => {
      const res = validateName('Chennai Super Kings')
      assert.strictEqual(res.isValid, true)
      assert.strictEqual(res.normalized, 'Chennai Super Kings')
      assert.strictEqual(res.error, '')
    })

    it('accepts international Unicode names and accents', () => {
      assert.strictEqual(validateName('René François').isValid, true)
      assert.strictEqual(validateName('Müller XI').isValid, true)
      assert.strictEqual(validateName('दीपक').isValid, true)
      assert.strictEqual(validateName('田中 太郎').isValid, true)
    })

    it('accepts valid cricket punctuation (hyphens, apostrophes, and dots)', () => {
      assert.strictEqual(validateName("Liam O'Connor").isValid, true)
      assert.strictEqual(validateName('Trent Boult-Smith').isValid, true)
      assert.strictEqual(validateName('A. B. de Villiers').isValid, true)
      assert.strictEqual(validateName("St. John's CC").isValid, true)
    })

    it('rejects empty or whitespace-only names', () => {
      const empty = validateName('')
      assert.strictEqual(empty.isValid, false)
      assert.ok(empty.error.includes('cannot be empty'))

      const spaces = validateName('     ')
      assert.strictEqual(spaces.isValid, false)
      assert.ok(spaces.error.includes('cannot be empty'))
    })

    it('rejects names exceeding 100 characters', () => {
      const longName = 'A'.repeat(101)
      const res = validateName(longName)
      assert.strictEqual(res.isValid, false)
      assert.ok(res.error.includes('100 characters or fewer'))
    })

    it('rejects control characters and zero-width formatting characters', () => {
      assert.strictEqual(validateName('Player\x00Name').isValid, false)
      assert.strictEqual(validateName('Team\x1FName').isValid, false)
      assert.strictEqual(validateName('Player\u200BName').isValid, false)
    })

    it('rejects names starting with punctuation', () => {
      const hyp = validateName('-Smith')
      assert.strictEqual(hyp.isValid, false)
      assert.ok(hyp.error.includes('must start with a letter or number'))

      const dot = validateName('.Kohli')
      assert.strictEqual(dot.isValid, false)

      const apos = validateName("'Connor")
      assert.strictEqual(apos.isValid, false)
    })

    it('rejects names composed solely of punctuation or symbols', () => {
      assert.strictEqual(validateName('---').isValid, false)
      assert.strictEqual(validateName('...').isValid, false)
    })

    it('rejects disallowed special characters', () => {
      assert.strictEqual(validateName('Player@1').isValid, false)
      assert.strictEqual(validateName('Team#A').isValid, false)
      assert.strictEqual(validateName('Cool<Batter>').isValid, false)
    })
  })

  describe('3. validateTeamMatchup', () => {
    it('accepts two different valid team names', () => {
      const res = validateTeamMatchup('Chennai Superstars', 'Mumbai Warriors')
      assert.strictEqual(res.isValid, true)
      assert.strictEqual(res.teamOne, 'Chennai Superstars')
      assert.strictEqual(res.teamTwo, 'Mumbai Warriors')
    })

    it('rejects identical team names', () => {
      const res = validateTeamMatchup('Warriors', 'Warriors')
      assert.strictEqual(res.isValid, false)
      assert.strictEqual(res.error, 'Host and visitor teams must have different names.')
    })

    it('rejects case-insensitively identical team names', () => {
      const res = validateTeamMatchup('Warriors', 'warriors')
      assert.strictEqual(res.isValid, false)
      assert.strictEqual(res.error, 'Host and visitor teams must have different names.')
    })

    it('rejects identical team names that differ only by spacing', () => {
      const res = validateTeamMatchup('  Warriors  ', 'Warriors')
      assert.strictEqual(res.isValid, false)
      assert.strictEqual(res.error, 'Host and visitor teams must have different names.')
    })

    it('fails when either team name is invalid', () => {
      const res = validateTeamMatchup('', 'Warriors')
      assert.strictEqual(res.isValid, false)
      assert.ok(res.error.includes('cannot be empty'))
    })
  })

  describe('4. validatePlayerName (Squad Uniqueness)', () => {
    const homeSquad: SquadPlayer[] = [
      { name: 'Virat Kohli', hand: 'Right' },
      { name: 'Rohit Sharma', hand: 'Right' },
    ]
    const visitorSquad: SquadPlayer[] = [
      { name: 'Steve Smith', hand: 'Right' },
      { name: 'David Warner', hand: 'Left' },
    ]

    it('accepts a new unique player name', () => {
      const res = validatePlayerName('Jasprit Bumrah', homeSquad, visitorSquad)
      assert.strictEqual(res.isValid, true)
      assert.strictEqual(res.normalized, 'Jasprit Bumrah')
    })

    it('rejects duplicate within the same squad (case-insensitive)', () => {
      const res = validatePlayerName('virat kohli', homeSquad, visitorSquad)
      assert.strictEqual(res.isValid, false)
      assert.strictEqual(res.error, 'This player already exists in this team.')
    })

    it('allows editing an existing player keeping their own name at same index', () => {
      const res = validatePlayerName('Virat Kohli', homeSquad, visitorSquad, 0)
      assert.strictEqual(res.isValid, true)
    })

    it('rejects cross-squad duplicate for the current match', () => {
      const res = validatePlayerName('steve smith', homeSquad, visitorSquad)
      assert.strictEqual(res.isValid, false)
      assert.strictEqual(
        res.error,
        'A player with this name is already in the opposing team for this match.'
      )
    })
  })

  describe('5. validateSquadsReady', () => {
    const makeSquad = (prefix: string, count: number): SquadPlayer[] =>
      Array.from({ length: count }, (_, i) => ({
        name: `${prefix} Player ${i + 1}`,
        hand: 'Right',
      }))

    it('accepts squads that exactly meet team limit with distinct players', () => {
      const home = makeSquad('Home', 5)
      const visitor = makeSquad('Visitor', 5)
      const res = validateSquadsReady(home, visitor, 5, 'Red XI', 'Blue XI')
      assert.strictEqual(res.isValid, true)
      assert.strictEqual(res.error, '')
    })

    it('rejects when home squad is under team limit', () => {
      const home = makeSquad('Home', 4)
      const visitor = makeSquad('Visitor', 5)
      const res = validateSquadsReady(home, visitor, 5, 'Red XI', 'Blue XI')
      assert.strictEqual(res.isValid, false)
      assert.strictEqual(res.error, 'Add 1 more player to Red XI.')
    })

    it('rejects when visitor squad is under team limit', () => {
      const home = makeSquad('Home', 5)
      const visitor = makeSquad('Visitor', 3)
      const res = validateSquadsReady(home, visitor, 5, 'Red XI', 'Blue XI')
      assert.strictEqual(res.isValid, false)
      assert.strictEqual(res.error, 'Add 2 more players to Blue XI.')
    })

    it('rejects when a player is on both squads in the match', () => {
      const home: SquadPlayer[] = [
        { name: 'Common Player', hand: 'Right' },
        { name: 'Home 2', hand: 'Right' },
      ]
      const visitor: SquadPlayer[] = [
        { name: 'common player', hand: 'Left' },
        { name: 'Visitor 2', hand: 'Right' },
      ]
      const res = validateSquadsReady(home, visitor, 2, 'Red XI', 'Blue XI')
      assert.strictEqual(res.isValid, false)
      assert.ok(res.error.includes('present in both teams for this match'))
    })
  })

  describe('6. validateOpeningSelection', () => {
    const battingRoster: SquadPlayer[] = [
      { name: 'Player A', hand: 'Right' },
      { name: 'Player B', hand: 'Right' },
      { name: 'Player C', hand: 'Left' },
    ]
    const bowlingRoster: SquadPlayer[] = [
      { name: 'Bowler X', hand: 'Right' },
      { name: 'Bowler Y', hand: 'Left' },
    ]

    it('accepts valid distinct openings from the respective rosters', () => {
      const res = validateOpeningSelection(
        'Player A',
        'Player B',
        'Bowler X',
        battingRoster,
        bowlingRoster
      )
      assert.strictEqual(res.isValid, true)
      assert.strictEqual(res.error, '')
    })

    it('rejects when striker and non-striker are the same player', () => {
      const res = validateOpeningSelection(
        'Player A',
        'player a',
        'Bowler X',
        battingRoster,
        bowlingRoster
      )
      assert.strictEqual(res.isValid, false)
      assert.strictEqual(
        res.error,
        'Opening striker and non-striker must be two different players.'
      )
    })

    it('rejects when striker is not in the batting roster', () => {
      const res = validateOpeningSelection(
        'Imposter',
        'Player B',
        'Bowler X',
        battingRoster,
        bowlingRoster
      )
      assert.strictEqual(res.isValid, false)
      assert.ok(res.error.includes('is not in the batting squad'))
    })

    it('rejects when non-striker is not in the batting roster', () => {
      const res = validateOpeningSelection(
        'Player A',
        'Imposter',
        'Bowler X',
        battingRoster,
        bowlingRoster
      )
      assert.strictEqual(res.isValid, false)
      assert.ok(res.error.includes('is not in the batting squad'))
    })

    it('rejects when opening bowler is not in the bowling roster', () => {
      const res = validateOpeningSelection(
        'Player A',
        'Player B',
        'Imposter Bowler',
        battingRoster,
        bowlingRoster
      )
      assert.strictEqual(res.isValid, false)
      assert.ok(res.error.includes('is not in the bowling squad'))
    })

    it('rejects when any selection is empty or whitespace', () => {
      const res = validateOpeningSelection(
        '',
        'Player B',
        'Bowler X',
        battingRoster,
        bowlingRoster
      )
      assert.strictEqual(res.isValid, false)
      assert.strictEqual(
        res.error,
        'Choose two opening batters and an opening bowler.'
      )
    })
  })
})
