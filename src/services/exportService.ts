import { jsPDF } from 'jspdf'
import { Capacitor } from '@capacitor/core'
import { deliverFile } from '../utils/fileDelivery'
import type { CompletedMatch, MatchResult, PlayerOfMatch, ScoreState } from '../types/match'

export function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`
}

export function countMaidens(score: ScoreState, bowlerName: string) {
  return score.overHistory.filter(
    (over) =>
      over.bowler === bowlerName &&
      over.deliveries.filter((delivery) => delivery.legal).length === 6 &&
      over.deliveries.every(
        (delivery) => (delivery.bowlerConcededRuns ?? delivery.runs) === 0,
      ),
  ).length
}

export function exportMatchCsv(match: CompletedMatch) {
  const rows: (string | number)[][] = [
    ['Team', 'Player', 'Status', 'Runs', 'Balls', '4s', '6s', 'Strike rate'],
  ]
  for (const innings of [match.firstInningsScore, match.secondInningsScore]) {
    if (!innings) continue
    const team =
      innings === match.firstInningsScore
        ? match.firstBattingHome
          ? match.teamOne
          : match.teamTwo
        : match.firstBattingHome
          ? match.teamTwo
          : match.teamOne
    for (const player of innings.battingStats)
      rows.push([
        team,
        player.name,
        player.out ? player.dismissal ?? 'Out' : 'Not out',
        player.runs,
        player.balls,
        player.fours,
        player.sixes,
        player.balls ? ((player.runs / player.balls) * 100).toFixed(2) : '0.00',
      ])
  }
  const csvContent = rows.map((row) => row.map(csvCell).join(',')).join('\n')
  const safeTeamOne = match.teamOne.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '') || 'team1'
  const safeTeamTwo = match.teamTwo.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '') || 'team2'
  const filename = `${safeTeamOne}-vs-${safeTeamTwo}-scorecard.csv`
  void deliverFile({
    filename,
    content: csvContent,
    mimeType: 'text/csv',
  })
}

export type DownloadScorecardOptions = {
  result: MatchResult
  teamOne: string
  teamTwo: string
  firstBattingHome: boolean
  firstInningsScore: ScoreState | null
  score: ScoreState | null
  selectedPlayerData?: PlayerOfMatch | null
}

export function downloadScorecard({
  result,
  teamOne,
  teamTwo,
  firstBattingHome,
  firstInningsScore,
  score,
  selectedPlayerData,
}: DownloadScorecardOptions) {
  const firstTeam = firstBattingHome ? teamOne : teamTwo
  const secondTeam = firstBattingHome ? teamTwo : teamOne
  const firstScore = firstInningsScore?.runs ?? 0
  const secondScore = score?.runs ?? 0

  const pdf = new jsPDF()
  let y = 18
  const lineHeight = 7
  const addText = (text: string, size = 10, bold = false) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal')
    pdf.setFontSize(size)
    pdf.text(text, 15, y)
    y += lineHeight
  }
  const addInnings = (innings: ScoreState | null, team: string, label: string) => {
    if (!innings) return
    if (y > 255) {
      pdf.addPage()
      y = 18
    }
    addText(
      `${label}: ${team} ${innings.runs}/${innings.wickets} (${Math.floor(innings.balls / 6)}.${innings.balls % 6} overs)`,
      13,
      true,
    )
    addText('Batters: Name | Status | R | B | 4s | 6s | SR', 9, true)
    innings.battingStats.forEach((player) => {
      const status = player.out
        ? player.dismissal ?? 'Out'
        : player.name === innings.striker.name || player.name === innings.nonStriker.name
          ? 'Not out'
          : 'Yet to bat'
      const strikeRate = player.balls
        ? ((player.runs / player.balls) * 100).toFixed(2)
        : '0.00'
      addText(
        `${player.name} | ${status} | ${player.runs} | ${player.balls} | ${player.fours} | ${player.sixes} | ${strikeRate}`,
        9,
      )
    })
    addText('Bowlers: Name | O | M | R | W | ER', 9, true)
    innings.bowlerStats.forEach((bowler) =>
      addText(
        `${bowler.name} | ${Math.floor(bowler.balls / 6)}.${bowler.balls % 6} | 0 | ${bowler.runs} | ${bowler.wickets} | ${bowler.balls ? (bowler.runs / (bowler.balls / 6)).toFixed(1) : '0.0'}`,
        9,
      ),
    )
    y += 5
  }

  addText('ScoreMate - Match Scorecard', 18, true)
  addText(
    result.winner === 'Match Drawn'
      ? 'Match Drawn'
      : `${result.winner} won${result.margin ? ` by ${result.margin}` : ''}`,
    13,
    true,
  )
  addText(
    `${firstTeam}: ${firstScore}/${firstInningsScore?.wickets ?? 0}   ${secondTeam}: ${secondScore}/${score?.wickets ?? 0}`,
    11,
  )
  if (selectedPlayerData)
    addText(
      `Player of the Match: ${selectedPlayerData.name} (${selectedPlayerData.team}, ${selectedPlayerData.reason})`,
      11,
      true,
    )
  y += 5
  addInnings(firstInningsScore, firstTeam, 'First innings')
  addInnings(score, secondTeam, 'Second innings')
  const safeFirst = firstTeam.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '') || 'team1'
  const safeSecond = secondTeam.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '') || 'team2'
  const filename = `${safeFirst}-vs-${safeSecond}-scorecard.pdf`
  if (Capacitor.isNativePlatform()) {
    const dataUri = pdf.output('datauristring')
    void deliverFile({
      filename,
      content: dataUri,
      mimeType: 'application/pdf',
      isBase64: true,
    })
  } else {
    pdf.save(filename)
  }
}

export function exportMatchesToCsv(completedMatches: CompletedMatch[]) {
  if (!completedMatches.length) return
  const rows: (string | number)[][] = [
    ['Team', 'Player', 'Runs', 'Balls', '4s', '6s', 'SR'],
  ]
  for (const match of completedMatches) {
    for (const innings of [match.firstInningsScore, match.secondInningsScore]) {
      if (!innings) continue
      const team =
        innings === match.firstInningsScore
          ? match.firstBattingHome
            ? match.teamOne
            : match.teamTwo
          : match.firstBattingHome
            ? match.teamTwo
            : match.teamOne
      for (const player of innings.battingStats)
        rows.push([
          team,
          player.name,
          player.runs,
          player.balls,
          player.fours,
          player.sixes,
          player.balls
            ? ((player.runs / player.balls) * 100).toFixed(2)
            : '0.00',
        ])
    }
  }
  const csvContent = rows.map((row) => row.map(csvCell).join(',')).join('\n')
  const link = document.createElement('a')
  link.download = 'scoremate-all-matches.csv'
  if (Capacitor.isNativePlatform()) {
    void deliverFile({
      filename: 'scoremate-all-matches.csv',
      content: csvContent,
      mimeType: 'text/csv',
    })
  } else {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' })
    link.href = URL.createObjectURL(blob)
    link.click()
    URL.revokeObjectURL(link.href)
  }
}
