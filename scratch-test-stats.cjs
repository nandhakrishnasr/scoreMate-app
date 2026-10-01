const fs = require('fs');
const data = JSON.parse(fs.readFileSync('gully-scorer-backup.json', 'utf8'));
const matches = data.completed;

// Let's inspect aggregatePlayerStats from statsService.ts
function createEmptyPlayerStat(recordName) {
  return {
    name: recordName,
    runs: 0,
    balls: 0,
    bowlingBalls: 0,
    fours: 0,
    sixes: 0,
    outs: 0,
    notOuts: 0,
    wickets: 0,
    catches: 0,
    runOuts: 0,
    stumpings: 0,
    matches: 0,
    innings: 0,
    best: 0,
    average: 0,
    strikeRate: 0,
    fifties: 0,
    hundreds: 0,
    ducks: 0,
    overs: 0,
    maidens: 0,
    wides: 0,
    noBalls: 0,
    dotBalls: 0,
    economy: 0,
    runsConceded: 0,
  };
}

const records = new Map();

for (const match of matches) {
  const seenThisMatch = new Set();
  for (const innings of [match.firstInningsScore, match.secondInningsScore]) {
    if (!innings) continue;
    for (const batter of innings.battingStats || []) {
      const record = records.get(batter.name) || createEmptyPlayerStat(batter.name);
      record.runs += batter.runs || 0;
      record.balls += batter.balls || 0;
      record.fours += batter.fours || 0;
      record.sixes += batter.sixes || 0;
      record.innings += 1;
      if (batter.out) record.outs += 1;
      else record.notOuts += 1;
      record.best = Math.max(record.best, batter.runs || 0);
      if (batter.runs >= 50 && batter.runs < 100) record.fifties += 1;
      if (batter.runs >= 100) record.hundreds += 1;
      if (batter.runs === 0 && batter.out) record.ducks += 1;
      records.set(batter.name, record);
      seenThisMatch.add(batter.name);
    }
    for (const bowler of innings.bowlerStats || []) {
      const bowlerName = (bowler.name || '').trim();
      if (!bowlerName) continue;
      const record = records.get(bowlerName) || createEmptyPlayerStat(bowlerName);
      record.wickets += bowler.wickets || 0;
      record.bowlingBalls += bowler.balls || 0;
      record.runsConceded += bowler.runs || 0;
      record.wides += bowler.wides || 0;
      record.noBalls += bowler.noBalls || 0;
      record.dotBalls += bowler.dotBalls || 0;
      records.set(bowlerName, record);
      seenThisMatch.add(bowlerName);
    }
  }
  for (const name of seenThisMatch) {
    const record = records.get(name);
    if (record) record.matches += 1;
  }
}

const playerList = Array.from(records.values());
const topPlayers = playerList.sort((a,b) => b.matches - a.matches).slice(0, 5);
console.log(JSON.stringify(topPlayers, null, 2));
