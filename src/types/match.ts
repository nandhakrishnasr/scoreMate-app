export type Player = { name: string; runs: number; balls: number; fours: number; sixes: number; out: boolean; dismissal?: string }
export type SquadPlayer = { name: string; hand: 'Right' | 'Left'; image?: string }

export type ExtrasBreakdown = {
  wides: number
  noBalls: number
  byes: number
  legByes: number
  penalty: number
}

export type TrueDismissalKind =
  | 'Bowled'
  | 'Caught'
  | 'Caught Behind'
  | 'Caught & Bowled'
  | 'LBW'
  | 'Stumped'
  | 'Hit Wicket'
  | 'Run Out'
  | 'Run Out (Mankaded)'
  | 'Retired Out'

export type BatterStatusEvent = 'Retired Hurt' | 'Absent'

export type WicketType = TrueDismissalKind | BatterStatusEvent
export type WicketKind = WicketType

export type WicketEvent = {
  kind: WicketType
  dismissedBatter: 'striker' | 'nonStriker'
  dismissedPlayerName: string
  helper?: string
  runsCompleted: number
}

export type DeliveryInput = {
  batterRuns: number
  extras: ExtrasBreakdown
  completedRuns: number
  isLegal: boolean
  wicket?: WicketEvent | null
  customLabel?: string
}

export type Delivery = {
  label: string
  legal: boolean
  runs: number
  batterRuns?: number
  extras?: ExtrasBreakdown
  bowlerConcededRuns?: number
  wicket?: WicketEvent | null
}

export type OverSummary = { number: number; bowler: string; runs: number; deliveries: Delivery[] }
export type FallOfWicket = { wicket: number; score: number; batter: string; dismissal?: string }
export type Partnership = { runs: number; balls: number; batters: [string, string] }
export type BowlerStats = {
  name: string
  balls: number
  runs: number
  wickets: number
  maidens?: number
  wides?: number
  noBalls?: number
  dotBalls?: number
}
export type CricketFieldZone =
  | 'fine_leg'
  | 'square_leg'
  | 'mid_wicket'
  | 'long_on'
  | 'long_off'
  | 'cover'
  | 'point'
  | 'third_man'

export type PitchDeliveryLength =
  | 'yorker'
  | 'full'
  | 'good_length'
  | 'short'
  | 'bouncer'

export interface BallTrackRecord {
  ballNumber: number
  overNumber: number
  ballInOver: number
  batterName: string
  bowlerName: string
  runs: number
  batterRuns: number
  isBoundary: boolean
  isWicket: boolean
  zone?: CricketFieldZone
  length?: PitchDeliveryLength
  timestamp: string
}

export type ScoreState = {
  runs: number
  wickets: number
  balls: number
  striker: Player
  nonStriker: Player
  bowler: BowlerStats
  currentOver: Delivery[]
  overHistory: OverSummary[]
  fallOfWickets: FallOfWicket[]
  target?: number
  maxOvers?: number
  partnership?: Partnership
  freeHit?: boolean
  wicketStreak?: number
  dismissedBatters: string[]
  inningsComplete: boolean
  battingStats: Player[]
  bowlerStats: BowlerStats[]
  ballTracking?: BallTrackRecord[]
}
export type Screen = 'login' | 'setup' | 'opening' | 'match-options' | 'roster' | 'opening-select' | 'innings-break' | 'second-opening' | 'live' | 'scorecard' | 'result' | 'history' | 'teams' | 'players' | 'profile' | 'viewer'

export interface LiveMatchSnapshot {
  version: 1
  id: string
  teamOne: string
  teamTwo: string
  overs: number
  inningsNumber: 1 | 2
  firstBattingHome: boolean
  venue?: string
  competition?: string
  score: ScoreState
  firstInningsScore: ScoreState | null
  target: number | null
  timestamp: string
}
export type BallKind = 'runs' | 'wide' | 'noBall' | 'bye' | 'legBye' | 'wicket'
export type ScoringModal = 'runs' | 'wide' | 'noBall' | 'bye' | 'legBye' | 'wicket' | null
export type WicketDetails = {
  type: WicketType
  helper?: string
  dismissedBatter?: 'striker' | 'nonStriker'
  runsCompleted?: number
}
export type MatchResult = { winner: string; margin: string }
export type PlayerOfMatch = { name: string; team: string; reason: string }
export type CompletedMatch = {
  id: string
  savedAt: string
  teamOne: string
  teamTwo: string
  firstBattingHome: boolean
  firstInningsScore: ScoreState | null
  secondInningsScore: ScoreState | null
  result: MatchResult
  playerOfMatch?: PlayerOfMatch
  venue?: string
  competition?: string
  homePlayers?: SquadPlayer[]
  visitorPlayers?: SquadPlayer[]
}
export type TeamStat = { name: string; played: number; wins: number; losses: number; draws: number }
export type PlayerStat = {
  name: string
  runs: number
  balls: number
  bowlingBalls: number
  fours: number
  sixes: number
  outs: number
  notOuts: number
  wickets: number
  catches: number
  runOuts: number
  stumpings: number
  matches: number
  innings: number
  best: number
  average: number
  strikeRate: number
  fifties: number
  hundreds: number
  ducks: number
  overs: number
  maidens: number
  wides: number
  noBalls: number
  dotBalls: number
  economy: number
  runsConceded: number
}
export type SavedAppState = { screen: Screen; teamOne: string; teamTwo: string; overs: string; teamSize: string; lastManBatting: boolean; venue: string; competition: string; tossCaller: 'host' | 'visitor' | null; tossCall: 'Heads' | 'Tails' | null; tossWinner: 'host' | 'visitor' | null; decision: 'bat' | 'bowl'; homePlayers: SquadPlayer[]; visitorPlayers: SquadPlayer[]; openingStriker: string; openingNonStriker: string; openingBowler: string; score: ScoreState | null; history: ScoreState[]; inningsNumber: 1 | 2; firstBattingHome: boolean; firstInningsScore: ScoreState | null; matchResult: MatchResult | null; battingRoster: SquadPlayer[]; bowlingRoster: SquadPlayer[] }