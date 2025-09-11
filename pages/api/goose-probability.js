import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  // Handle both GET and POST
  let owner_id, week, season, providedProbabilities
  
  if (req.method === 'POST') {
    ({ owner_id, week, season, probabilities: providedProbabilities } = req.body)
  } else {
    ({ owner_id, week, season } = req.query)
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
    // Get owner's teams
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('abbr, name')
      .eq('owner_id', owner_id)
      .eq('active', true)

    if (teamsError) {
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

    // Check if owner already has a win THIS WEEK (not any week)
    const { data: wins, error: winsError } = await supabase
      .from('awards')
      .select('*')
      .eq('season', season)
      .eq('week', week) // Only check current week
      .eq('owner_id', owner_id)
      .in('type', ['WIN', 'TIE_AWAY'])

    if (winsError) {
      throw new Error(`Database error checking wins: ${winsError.message}`)
    }

    // Get games for this week to check matchups
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('home, away, final, home_pts, away_pts')
      .eq('season', season)
      .eq('week', week)

    if (gamesError) {
      throw new Error(`Database error getting games: ${gamesError.message}`)
    }

    const ownerTeams = teams.map(t => t.abbr)
    
    // Check if owner has teams playing each other (internal game = guaranteed win, so can't goose)
    const hasInternalGame = games?.some(game => 
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
      const probResponse = await fetch(`${req.headers.origin || 'http://localhost:3000'}/api/kalshi-probabilities?week=${week}&season=${season}`)
      if (probResponse.ok) {
        const probData = await probResponse.json()
        probabilities = probData.probabilities || {}
        console.log(`Goose calc: Fetched fresh probabilities for ${Object.keys(probabilities).length} teams`)
      } else {
        console.error('Failed to get probabilities for goose calculation')
      }
    }

    // Calculate goose probability
    // Goose happens when ALL of the owner's teams lose
    // So goose probability = product of (1 - win_probability) for each team
    
    let gooseProb = 1
    let teamsPlayed = 0
    const teamDetails = []
    
    for (const team of teams) {
      const teamAbbr = team.abbr
      const prob = probabilities[teamAbbr]
      
      // Use team probability if available, otherwise calculate fallback
      let winProb = 0.5
      if (prob && prob.confidence !== 'fallback') {
        winProb = prob.winProbability
      } else {
        // Calculate a reasonable probability based on team strength
        const TEAM_STRENGTH = {
          'KC': 0.75, 'BUF': 0.73, 'SF': 0.72, 'PHI': 0.70, 'DAL': 0.68,
          'BAL': 0.69, 'MIA': 0.65, 'CIN': 0.64, 'LAC': 0.62, 'NYJ': 0.45, // NYJ is weak
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
      
      teamDetails.push({
        team: teamAbbr,
        teamName: team.name,
        winProbability: winProb,
        loseProbability: loseProb,
        source: prob ? prob.confidence : 'estimated'
      })
      
      // Find opponent for context
      const game = games?.find(g => g.home === teamAbbr || g.away === teamAbbr)
      if (game) {
        const opponent = game.home === teamAbbr ? game.away : game.home
        teamDetails[teamDetails.length - 1].opponent = opponent
        teamDetails[teamDetails.length - 1].game = `${game.away} @ ${game.home}`
        
        if (game.final) {
          teamsPlayed += 1
          // Game is over, we know the result
          const teamWon = (game.home === teamAbbr && game.home_pts > game.away_pts) ||
                         (game.away === teamAbbr && game.away_pts >= game.home_pts)
          teamDetails[teamDetails.length - 1].actualResult = teamWon ? 'WIN' : 'LOSS'
          
          // If any game is already won, goose probability is 0
          if (teamWon) {
            gooseProb = 0
            break
          }
        }
      }
    }

    console.log(`Goose calc for owner ${owner_id}: ${teamDetails.length} teams, final prob: ${(gooseProb * 100).toFixed(2)}%`)

    res.status(200).json({ 
      gooseProbability: gooseProb,
      goosePercentage: `${(gooseProb * 100).toFixed(1)}%`,
      reason: gooseProb > 0 ? `${teams.length - teamsPlayed} more teams must lose` : 'Cannot goose',
      teamCount: teams.length,
      teamDetails,
      calculation: `${teamDetails.map(t => `${((1-t.winProbability) * 100).toFixed(0)}%`).join(' × ')} = ${(gooseProb * 100).toFixed(1)}%`,
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
