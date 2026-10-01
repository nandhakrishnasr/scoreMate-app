import type { CompletedMatch, ScoreState } from '../types/match'
import { deliverFile } from '../utils/fileDelivery'

export function exportMatchImage(match: CompletedMatch) {
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 760
  const context = canvas.getContext('2d')
  if (!context) return
  context.fillStyle = '#151624'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#f3f0ff'
  context.font = 'bold 42px sans-serif'
  context.fillText(`${match.teamOne} vs ${match.teamTwo}`, 60, 75)
  context.font = 'bold 30px sans-serif'
  context.fillStyle = '#79e4ae'
  context.fillText(
    match.result.winner === 'Match Drawn'
      ? 'Match Drawn'
      : `${match.result.winner} won`,
    60,
    130,
  )
  context.font = '26px sans-serif'
  context.fillStyle = '#f3f0ff'
  context.fillText(
    `${match.teamOne}: ${match.firstInningsScore?.runs ?? 0}/${match.firstInningsScore?.wickets ?? 0}`,
    60,
    205,
  )
  context.fillText(
    `${match.teamTwo}: ${match.secondInningsScore?.runs ?? 0}/${match.secondInningsScore?.wickets ?? 0}`,
    60,
    250,
  )
  let y = 330
  for (const innings of [match.firstInningsScore, match.secondInningsScore]) {
    if (!innings) continue
    for (const player of innings.battingStats) {
      context.fillText(
        `${player.name}  ${player.runs} (${player.balls})  ${player.out ? player.dismissal ?? 'Out' : 'Not out'}`,
        60,
        y,
      )
      y += 34
    }
  }
  const dataUrl = canvas.toDataURL('image/png')
  const safeTeamOne = match.teamOne.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '') || 'team1'
  const safeTeamTwo = match.teamTwo.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '') || 'team2'
  const filename = `${safeTeamOne}-vs-${safeTeamTwo}-scorecard.png`
  void deliverFile({
    filename,
    content: dataUrl,
    mimeType: 'image/png',
    isBase64: true,
  })
}

export function createLiveScoreImage(
  score: ScoreState,
  teamOne: string,
  teamTwo: string,
  inningsNumber: 1 | 2,
) {
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 630
  const context = canvas.getContext('2d')
  if (!context) return null
  context.fillStyle = '#151624'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#a998ff'
  context.font = 'bold 34px sans-serif'
  context.fillText(`${teamOne} vs ${teamTwo}`, 60, 70)
  context.fillStyle = '#79e4ae'
  context.font = 'bold 26px sans-serif'
  context.fillText(
    `${inningsNumber === 1 ? '1st' : '2nd'} innings · Over ${Math.floor(score.balls / 6)}`,
    60,
    120,
  )
  context.fillStyle = '#f3f0ff'
  context.font = 'bold 64px sans-serif'
  context.fillText(`${score.runs}/${score.wickets}`, 60, 215)
  context.font = '24px sans-serif'
  context.fillStyle = '#aaaabd'
  context.fillText(
    `${Math.floor(score.balls / 6)}.${score.balls % 6} overs · Run rate ${score.balls ? (score.runs / (score.balls / 6)).toFixed(2) : '0.00'}`,
    60,
    265,
  )
  context.fillStyle = '#f3f0ff'
  context.font = '22px sans-serif'
  context.fillText('This over', 60, 350)
  context.fillStyle = '#79e4ae'
  context.font = 'bold 28px sans-serif'
  context.fillText(
    score.currentOver.map((delivery) => delivery.label).join('  '),
    60,
    400,
  )
  context.fillStyle = '#aaaabd'
  context.font = '22px sans-serif'
  context.fillText(
    `Striker: ${score.striker.name}   ${score.striker.runs} (${score.striker.balls})`,
    60,
    490,
  )
  context.fillText(
    `Non-striker: ${score.nonStriker.name}   ${score.nonStriker.runs} (${score.nonStriker.balls})`,
    60,
    535,
  )
  return canvas.toDataURL('image/png')
}
