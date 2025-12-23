// LOTA (Luck of the Andrew) - #1 NFL Draft Pick Probability Calculator
// Uses Kalshi win probabilities to calculate each team's chance at #1 overall

export default async function handler(req, res) {
const season = req.query.season || 2025

try {
// Fetch Kalshi probabilities for Week 17 and Week 18, plus game results
const [week17Response, week18Response, week17GamesResponse, week18GamesResponse] = await Promise.all([
fetch('${getBaseUrl(req)}/api/kalshi-probabilities?week=17&season=${season}'),
fetch('${getBaseUrl(req)}/api/kalshi-probabilities?week=18&season=${season}'),
fetch('${getBaseUrl(req)}/api/games?week=17&season=${season}'),
fetch('${getBaseUrl(req)}/api/games?week=18&season=${season}')
])

'''
let week17Probs = {}
let week18Probs = {}
let week17Games = []
let week18Games = []

if (week17Response.ok) {
  const data = await week17Response.json()
  week17Probs = data.probabilities || {}
}

if (week18Response.ok) {
  const data = await week18Response.json()
  week18Probs = data.probabilities || {}
}

if (week17GamesResponse.ok) {
  const data = await week17GamesResponse.json()
  week17Games = data.games || []
}

if (week18GamesResponse.ok) {
  const data = await week18GamesResponse.json()
  week18Games = data.games || []
}

// Helper to check if a team won/lost a finished game
// Returns: 1 if team won, 0 if team lost, null if game not finished
const getGameResult = (games, teamAbbr) => {
  for (const game of games) {
    const isHome = game.home === teamAbbr
    const isAway = game.away === teamAbbr
    
    if (!isHome && !isAway) continue
    
    // Check if game is final
    if (game.status !== 'STATUS_FINAL') return null
    
    const teamScore = isHome ? game.home_pts : game.away_pts
    const oppScore = isHome ? game.away_pts : game.home_pts
    
    if (teamScore > oppScore) return 1  // Won
    if (teamScore < oppScore) return 0  // Lost
    return 0.5  // Tie (rare but possible)
  }
  return null  // Game not found
}

// Current standings (as of the request - these are the teams in contention)
// Giants (2 wins), Raiders (2 wins), Jets (3 wins), Browns (3 wins)
const standings = {
  NYG: { wins: 2, name: 'New York Giants' },
  LV: { wins: 2, name: 'Las Vegas Raiders' },
  NYJ: { wins: 3, name: 'New York Jets' },
  CLE: { wins: 3, name: 'Cleveland Browns' }
}

// Tiebreaker order (lowest wins gets pick; if tied, this order applies)
// Browns > Giants > Jets > Raiders
const tiebreakerOrder = ['CLE', 'NYG', 'NYJ', 'LV']

// Week 17 matchups
// Giants @ Raiders - these two play each other!
// Patriots @ Jets
// Steelers @ Browns

// Week 18 matchups  
// Cowboys @ Giants
// Chiefs @ Raiders
// Jets @ Bills
// Browns @ Bengals

// Get win probabilities - use actual result if game finished, else Kalshi odds
const getWinProb = (probs, games, team) => {
  const result = getGameResult(games, team)
  if (result !== null) return result  // Game finished - use actual result
  return probs[team]?.winProbability ?? 0.5  // Game not finished - use Kalshi
}

// Track which games are finished for display
const gameStatuses = {
  week17: {
    raiders_vs_giants: getGameResult(week17Games, 'LV'),
    jets_vs_patriots: getGameResult(week17Games, 'NYJ'),
    browns_vs_steelers: getGameResult(week17Games, 'CLE')
  },
  week18: {
    giants_vs_cowboys: getGameResult(week18Games, 'NYG'),
    raiders_vs_chiefs: getGameResult(week18Games, 'LV'),
    jets_vs_bills: getGameResult(week18Games, 'NYJ'),
    browns_vs_bengals: getGameResult(week18Games, 'CLE')
  }
}

// W17 probabilities (use actual results if available)
const P_raiders_w17 = getWinProb(week17Probs, week17Games, 'LV') // Raiders win vs Giants
const P_jets_w17_win = getWinProb(week17Probs, week17Games, 'NYJ') // Jets win vs Patriots
const P_browns_w17_win = getWinProb(week17Probs, week17Games, 'CLE') // Browns win vs Steelers

// W18 probabilities (use actual results if available)
const P_giants_w18 = getWinProb(week18Probs, week18Games, 'NYG') // Giants win vs Cowboys (home)
const P_raiders_w18 = getWinProb(week18Probs, week18Games, 'LV') // Raiders win vs Chiefs (home)
const P_jets_w18_win = getWinProb(week18Probs, week18Games, 'NYJ') // Jets win @ Bills
const P_browns_w18_win = getWinProb(week18Probs, week18Games, 'CLE') // Browns win @ Bengals

// Calculated probabilities
const P_browns_0_2 = (1 - P_browns_w17_win) * (1 - P_browns_w18_win) // Browns lose both
const P_jets_0_2 = (1 - P_jets_w17_win) * (1 - P_jets_w18_win) // Jets lose both

// Apply the formulas from the spec:

// GIANTS = P_raiders_w17 × (1 - P_giants_w18)
//        + P_raiders_w17 × P_giants_w18 × (1 - P_browns_0_2)
//        + (1 - P_raiders_w17) × P_raiders_w18 × (1 - P_browns_0_2) × (1 - P_giants_w18)
const P_giants = 
  P_raiders_w17 * (1 - P_giants_w18) +
  P_raiders_w17 * P_giants_w18 * (1 - P_browns_0_2) +
  (1 - P_raiders_w17) * P_raiders_w18 * (1 - P_browns_0_2) * (1 - P_giants_w18)

// RAIDERS = (1 - P_raiders_w17) × (1 - P_raiders_w18)
//         + (1 - P_raiders_w17) × P_raiders_w18 × (1 - P_browns_0_2) × P_giants_w18 × (1 - P_jets_0_2)
const P_raiders = 
  (1 - P_raiders_w17) * (1 - P_raiders_w18) +
  (1 - P_raiders_w17) * P_raiders_w18 * (1 - P_browns_0_2) * P_giants_w18 * (1 - P_jets_0_2)

// BROWNS = P_raiders_w17 × P_giants_w18 × P_browns_0_2
//        + (1 - P_raiders_w17) × P_raiders_w18 × P_browns_0_2
const P_browns = 
  P_raiders_w17 * P_giants_w18 * P_browns_0_2 +
  (1 - P_raiders_w17) * P_raiders_w18 * P_browns_0_2

// JETS = (1 - P_raiders_w17) × P_raiders_w18 × (1 - P_browns_0_2) × P_giants_w18 × P_jets_0_2
const P_jets = 
  (1 - P_raiders_w17) * P_raiders_w18 * (1 - P_browns_0_2) * P_giants_w18 * P_jets_0_2

// Owner mappings (from your Payday database)
// Ric owns Raiders + Browns, Zack owns Giants, Joey owns Jets
const teamOwners = {
  NYG: { id: '15c593d3-6e69-42e6-b89f-bae0b2044ce5', name: 'Zack' },
  LV: { id: '804aaadb-0f8f-469a-b9d9-b691f7f12112', name: 'Ric' },
  NYJ: { id: '48a98e96-b111-4e1f-9444-204768856567', name: 'Joey' },
  CLE: { id: '804aaadb-0f8f-469a-b9d9-b691f7f12112', name: 'Ric' }
}

// Calculate owner probabilities
const ownerProbs = {}
Object.entries(teamOwners).forEach(([team, owner]) => {
  if (!ownerProbs[owner.name]) {
    ownerProbs[owner.name] = { probability: 0, teams: [] }
  }
  const teamProb = team === 'NYG' ? P_giants : team === 'LV' ? P_raiders : team === 'NYJ' ? P_jets : P_browns
  ownerProbs[owner.name].probability += teamProb
  ownerProbs[owner.name].teams.push(team)
})

const result = {
  timestamp: new Date().toISOString(),
  season,
  gameStatuses,  // Which games are finished (null = not finished, 0 = lost, 1 = won)
  inputProbabilities: {
    week17: {
      raiders_beat_giants: P_raiders_w17,
      jets_beat_patriots: P_jets_w17_win,
      browns_beat_steelers: P_browns_w17_win
    },
    week18: {
      giants_beat_cowboys: P_giants_w18,
      raiders_beat_chiefs: P_raiders_w18,
      jets_beat_bills: P_jets_w18_win,
      browns_beat_bengals: P_browns_w18_win
    },
    derived: {
      browns_go_0_2: P_browns_0_2,
      jets_go_0_2: P_jets_0_2
    }
  },
  teamProbabilities: {
    NYG: { probability: P_giants, name: 'New York Giants', currentWins: 2 },
    LV: { probability: P_raiders, name: 'Las Vegas Raiders', currentWins: 2 },
    CLE: { probability: P_browns, name: 'Cleveland Browns', currentWins: 3 },
    NYJ: { probability: P_jets, name: 'New York Jets', currentWins: 3 }
  },
  ownerProbabilities: ownerProbs,
  tiebreakerOrder,
  notes: [
    'Giants and Raiders play each other W17, so exactly one stays at 2 wins entering W18',
    'Tiebreaker order: Browns > Giants > Jets > Raiders',
    'Browns need to go 0-2 AND the 2-win team to win W18 to have a chance',
    'Jets only get #1 in a very specific scenario chain'
  ]
}

// Verify probabilities sum close to 1 (allow for rounding)
const totalProb = P_giants + P_raiders + P_browns + P_jets
result.probabilityCheck = {
  total: totalProb,
  isValid: Math.abs(totalProb - 1) < 0.01
}

res.status(200).json(result)
'''

} catch (error) {
console.error('LOTA odds calculation error:', error)
res.status(500).json({ error: error.message })
}
}

function getBaseUrl(req) {
const protocol = req.headers['x-forwarded-proto'] || 'http'
const host = req.headers.host
return '${protocol}://${host}'
}
