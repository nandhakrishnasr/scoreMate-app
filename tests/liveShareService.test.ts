import test from 'node:test'
import assert from 'node:assert/strict'
import type { LiveMatchSnapshot } from '../src/types/match.ts'
import {
  encodeLiveMatchToUrl,
  decodeLiveMatchFromUrl,
  shortenLiveUrl,
} from '../src/services/liveShareService.ts'

const sampleSnapshot: LiveMatchSnapshot = {
  version: 1,
  id: 'live-test-123',
  teamOne: 'Royal Challengers',
  teamTwo: 'Super Kings',
  overs: 20,
  inningsNumber: 2,
  firstBattingHome: true,
  venue: 'Chinnaswamy Stadium',
  competition: 'Premier League',
  target: 185,
  timestamp: '2026-10-11T14:30:00Z',
  score: {
    runs: 142,
    wickets: 3,
    balls: 92,
    striker: { name: 'Virat', runs: 72, balls: 44, fours: 6, sixes: 3 },
    nonStriker: { name: 'Faf', runs: 38, balls: 26, fours: 4, sixes: 1 },
    bowler: { name: 'Pathirana', overs: '3.2', balls: 20, runs: 28, wickets: 2, maidens: 0 },
    currentOver: [
      { ball: 1, runs: 1, legal: true, wicket: false },
      { ball: 2, runs: 4, legal: true, wicket: false },
    ],
    overHistory: [],
    battingStats: [{ name: 'Virat', runs: 72, balls: 44, fours: 6, sixes: 3 }],
    bowlerStats: [],
    fallOfWickets: [],
    dismissedBatters: [],
    ballTracking: [
      {
        ballNumber: 92,
        overNumber: 16,
        ballInOver: 2,
        batterName: 'Virat',
        bowlerName: 'Pathirana',
        runs: 4,
        isBoundary: true,
        isWicket: false,
        zone: 'cover',
        length: 'full',
        timestamp: '2026-10-11T14:30:00Z',
      },
    ],
  },
  firstInningsScore: {
    runs: 184,
    wickets: 6,
    balls: 120,
    striker: { name: 'Ruturaj', runs: 65, balls: 40, fours: 5, sixes: 2 },
    nonStriker: { name: 'Dube', runs: 40, balls: 20, fours: 2, sixes: 3 },
    bowler: { name: 'Siraj', overs: '4.0', balls: 24, runs: 32, wickets: 2, maidens: 0 },
    currentOver: [],
    overHistory: [],
    battingStats: [],
    bowlerStats: [],
    fallOfWickets: [],
    dismissedBatters: [],
  },
}

test('encodeLiveMatchToUrl generates an ultra-compact hash URL', () => {
  const url = encodeLiveMatchToUrl(sampleSnapshot, 'https://scoremate.app/')
  assert.ok(url.startsWith('https://scoremate.app/#live='))
  const hashPart = url.split('#live=')[1]
  assert.ok(hashPart && hashPart.length > 20)
  // Ensure the link is truly compact (less than 350 characters, over 90% reduction from 3000+)
  assert.ok(url.length < 350, `URL length ${url.length} should be under 350 characters`)
})

test('decodeLiveMatchFromUrl decodes and recovers exact live match state from compact format', () => {
  const url = encodeLiveMatchToUrl(sampleSnapshot, 'https://scoremate.app/')
  const recovered = decodeLiveMatchFromUrl(url)

  assert.ok(recovered)
  assert.equal(recovered.teamOne, 'Royal Challengers')
  assert.equal(recovered.teamTwo, 'Super Kings')
  assert.equal(recovered.target, 185)
  assert.equal(recovered.score.runs, 142)
  assert.equal(recovered.score.wickets, 3)
  assert.equal(recovered.score.striker.name, 'Virat')
  assert.equal(recovered.score.striker.runs, 72)
  assert.equal(recovered.score.ballTracking?.length, 1)
  assert.equal(recovered.score.ballTracking?.[0].zone, 'cover')
})

test('decodeLiveMatchFromUrl handles query parameters and raw hashes safely', () => {
  const url = encodeLiveMatchToUrl(sampleSnapshot, 'https://scoremate.app/?ref=share')
  const recovered = decodeLiveMatchFromUrl(url)
  assert.ok(recovered)
  assert.equal(recovered.teamOne, 'Royal Challengers')

  // Malformed input returns null without crashing
  assert.equal(decodeLiveMatchFromUrl(''), null)
  assert.equal(decodeLiveMatchFromUrl('https://scoremate.app/#live=garbage123'), null)
})

test('decodeLiveMatchFromUrl backward compatibility with legacy full JSON format', () => {
  const legacyJson = JSON.stringify(sampleSnapshot)
  const legacyB64 = Buffer.from(legacyJson).toString('base64')
  const legacyUrl = `https://scoremate.app/#live=${legacyB64}`

  const recovered = decodeLiveMatchFromUrl(legacyUrl)
  assert.ok(recovered)
  assert.equal(recovered.teamOne, 'Royal Challengers')
  assert.equal(recovered.score.runs, 142)
})

test('shortenLiveUrl handles short or empty inputs gracefully', async () => {
  const alreadyShort = 'https://da.gd/abc'
  assert.equal(await shortenLiveUrl(alreadyShort), alreadyShort)
  assert.equal(await shortenLiveUrl(''), '')
})
