import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  // Handle both GET and POST
  let owner_id, week, season, providedProbabilities
  
  if (req.method === 'POST') {
    ({ owner_id, week, season, probabilities: providedProbabilities } = req.body)
  } else {
    ({ owner_id, week, season } = req.query)
  }

  // Validate required parameters
  if (!owner_id) {
    return res.status(400).json({ message: 'owner_id is required' })
  }
  
  // Get current week/season if not provided
  if (!week || !season) {
    try {
      const currentWeekResponse = await fetch(`${req.headers.origin || 'http://localhost:3000'}/api/current-week`)
      if (currentWeekResponse.ok) {
        const currentData = await currentWeekResponse.json()
        week = week || currentData.week
        season = season || currentData.season
        console.log(`Goose calc: Using current week ${week}, season ${season}`)
      } else {
        // Fallback if current-week API fails
        week = week || 2
        season = season || 2025
        console.warn(`Goose calc: Failed to get current week, using fallback week ${week}, season ${season}`)
      }
    } catch (error) {
      console.error('Error getting current week for goose calc:', error)
      week = week || 2
      season = season || 2025
    }
  }
  
  try {
    // Get owner's active teams
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('abbr, name')
      .eq('owner_id', owner_id)
      .eq('active', true)

    if (teamsError) {
      console.error('Error fetching teams:', teamsError)
      throw new Error(`Database error: ${teamsError.message}`)
    }

    if (!teams || teams.length === 0) {
      return res.status(200).json({ 
        gooseProbability: 0,
        goosePercentage: '0%',
        reason: 'No active teams found for this owner',
        teamDetails: []
      })
    }

    // Check if owner already has a win THIS WEEK
    const { data: wins, error: winsError } = await supabase
      .from('awards')
      .select('id')
      .eq('season', season)
      .eq('week', week)
      .eq('owner_id', owner_id)
      .in('type', ['WIN', 'TIE_AWAY'])
      .limit(1)

    if (winsError) {
      console.error('Error checking wins:', winsError)
      throw new Error(`Database error checking wins: ${winsError.message}`)
    }

    if (wins && wins.length > 0) {
      return res.status(200).json({ 
        gooseProbability: 0,
        goosePercentage: '0%',
        reason: 'Already has a win this week',
        teamDetails: []
      })
    }

    // Get all games for this week
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('home, away, final, home_pts, away_pts')
      .eq('season', season)
      .eq('week', week)

    if (gamesError) {
      console.error('Error fetching games:', gamesError)
      throw new Error(`Database error getting games: ${gamesError.message}`)
    }

    if (!games || games.length === 0) {
      // No games this week - all teams on bye, all automatic losses
      return res.status(200).json({ 
        gooseProbability: 1,
        goosePercentage: '100%',
        reason: 'No games scheduled this week (all teams on bye)',
        teamCount: teams.length,
        teamDetails: teams.map(t => ({
          team: t.abbr,
          teamName: t.name,
          onBye: true,
          loseProbability: 1.0
        })),
        calculation: 'All teams on bye = 100% goose'
      })
    }

    const ownerTeams = teams.map(t => t.abbr)
    
    // Check if owner has teams playing each other (internal game = guaranteed win)
    const hasInternalGame = games.some(game => 
      ownerTeams.includes(game.home) && ownerTeams.includes(game.away)
    )

    if (hasInternalGame) {
      const internalGame = games.find(game => 
        ownerTeams.includes(game.home) && ownerTeams.includes(game.away)
      )
      return res.status(200).json({ 
        gooseProbability: 0,
        goosePercentage: '0%',
        reason: 'Has teams playing each other (guaranteed win)',
        internalGame: `${internalGame.away} @ ${internalGame.home}`,
        teamDetails: []
      })
    }

    // Get probabilities - use provided ones or fetch fresh
    let probabilities = {}
    
    if (providedProbabilities && Object.keys(providedProbabilities).length > 0) {
      probabilities = providedProbabilities
      console.log(`Goose calc: Using provided probabilities for ${Object.keys(probabilities).length} teams`)
    } else {
      // Fallback to fetching (for GET requests or when no probabilities provided)
      try {
        const probResponse = await fetch(`${req.headers.origin || 'http://localhost:3000'}/api/kalshi-probabilities?week=${week}&season=${season}`)
        if (probResponse.ok) {
          const probData = await probResponse.json()
          probabilities = probData.probabilities || {}
          console.log(`Goose calc: Fetched fresh probabilities for ${Object.keys(probabilities).length} teams`)
        } else {
          console.error('Failed to get probabilities for goose calculation')
        }
      } catch (error) {
        console.error('Error fetching probabilities:', error)
      }
    }

    // Separate teams into those playing and those on bye THIS WEEK
    const teamsPlaying = []
    const teamsOnBye = []

    for (const team of teams) {
      const game = games.find(g => g.home === team.abbr || g.away === team.abbr)
      if (game) {
        teamsPlaying.push({ ...team, game })
      } else {
        teamsOnBye.push(team)
      }
    }

    // Calculate goose probability
    // Teams on bye = automatic loss (probability 1.0)
    // Teams playing = probability they lose (1 - win_probability)
    
    let gooseProb = 1
    let gamesFinished = 0
    const teamDetails = []
    
    // Process teams on bye (automatic losses)
    for (const team of teamsOnBye) {
      teamDetails.push({
        team: team.abbr,
        teamName: team.name,
        onBye: true,
        winProbability: 0,
        loseProbability: 1.0,
        source: 'bye_week'
      })
      // Multiply by 1.0 (no effect, but conceptually these are guaranteed losses)
      gooseProb *= 1.0
    }
    
    // Process teams playing this week
    for (const team of teamsPlaying) {
      const teamAbbr = team.abbr
      const game = team.game
      const prob = probabilities[teamAbbr]
      
      // Check if game is already finished
      if (game.final) {
        const teamWon = (game.home === teamAbbr && game.home_pts > game.away_pts) ||
                       (game.away === teamAbbr && game.away_pts > game.home_pts)
        
        teamDetails.push({
          team: teamAbbr,
          teamName: team.name,
          opponent: game.home === teamAbbr ? game.away : game.home,
          game: `${game.away} @ ${game.home}`,
          actualResult: teamWon ? 'WIN' : 'LOSS',
          winProbability: teamWon ? 1 : 0,
          loseProbability: teamWon ? 0 : 1,
          source: 'game_finished'
        })
        
        gamesFinished++
        
        // If team won, goose is impossible
        if (teamWon) {
          gooseProb = 0
          break
        } else {
          // Team lost, multiply by 1 (certain loss)
          gooseProb *= 1
        }
      } else {
        // Game not finished - use probability
        let winProb = 0.5
        
        if (prob && prob.confidence !== 'fallback') {
          winProb = prob.winProbability
        } else {
          // Fallback strength estimates
          const TEAM_STRENGTH = {
            'KC': 0.75, 'BUF': 0.73, 'SF': 0.72, 'PHI': 0.70, 'DAL': 0.68,
            'BAL': 0.69, 'MIA': 0.65, 'CIN': 0.64, 'LAC': 0.62, 'NYJ': 0.45,
            'MIN': 0.61, 'DET': 0.60, 'SEA': 0.59, 'GB': 0.63, 'JAX': 0.47,
            'LAR': 0.57, 'LV': 0.49, 'PIT': 0.56, 'TEN': 0.44, 'IND': 0.46,
            'ATL': 0.43, 'TB': 0.42, 'NO': 0.41, 'WSH': 0.40, 'NYG': 0.35,
            'CHI': 0.38, 'NE': 0.33, 'DEN': 0.39, 'CLE': 0.32, 'CAR': 0.30,
            'ARI': 0.36, 'HOU': 0.37, 'WAS': 0.40, 'JAC': 0.47
          }
          winProb = TEAM_STRENGTH[teamAbbr] || 0.5
        }
        
        const loseProb = 1 - winProb
        gooseProb *= loseProb
        
        const opponent = game.home === teamAbbr ? game.away : game.home
        teamDetails.push({
          team: teamAbbr,
          teamName: team.name,
          opponent: opponent,
          game: `${game.away} @ ${game.home}`,
          winProbability: winProb,
          loseProbability: loseProb,
          source: prob ? prob.confidence : 'estimated'
        })
      }
    }

    console.log(`Goose calc for owner ${owner_id}: ${teamsPlaying.length} playing, ${teamsOnBye.length} on bye, final prob: ${(gooseProb * 100).toFixed(2)}%`)

    res.status(200).json({ 
      gooseProbability: gooseProb,
      goosePercentage: `${(gooseProb * 100).toFixed(1)}%`,
      reason: gooseProb > 0 ? `${teamsPlaying.length - gamesFinished} more teams must lose` : 'Cannot goose',
      teamCount: teams.length,
      teamsPlaying: teamsPlaying.length,
      teamsOnBye: teamsOnBye.length,
      teamDetails,
      calculation: `${teamDetails.map(t => `${((t.loseProbability) * 100).toFixed(0)}%`).join(' × ')} = ${(gooseProb * 100).toFixed(1)}%`,
      dataSource: providedProbabilities ? 'provided_probabilities' : 'fetched_fresh'
    })

  } catch (error) {
    console.error('Error calculating goose probability:', error)
    res.status(500).json({ 
      message: 'Error calculating goose probability', 
      error: error.message 
    })
  }
}
