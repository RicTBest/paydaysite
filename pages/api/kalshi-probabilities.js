import axios from 'axios'
import { supabase } from '../../lib/supabase'

// Team abbreviation mapping (our format to Kalshi format)
const KALSHI_TEAM_MAPPING = {
  'ARI': 'ARI', 'ATL': 'ATL', 'BAL': 'BAL', 'BUF': 'BUF',
  'CAR': 'CAR', 'CHI': 'CHI', 'CIN': 'CIN', 'CLE': 'CLE',
  'DAL': 'DAL', 'DEN': 'DEN', 'DET': 'DET', 'GB': 'GB',
  'HOU': 'HOU', 'IND': 'IND', 
  'JAX': 'JAC', 'JAC': 'JAC',  // Handle both JAX and JAC
  'KC': 'KC', 'LV': 'LV', 'LAC': 'LAC', 'LAR': 'LA', 'MIA': 'MIA',   
  'MIN': 'MIN', 'NE': 'NE', 'NO': 'NO', 'NYG': 'NYG',
  'NYJ': 'NYJ', 'PHI': 'PHI', 'PIT': 'PIT', 'SF': 'SF',
  'SEA': 'SEA', 'TB': 'TB', 'TEN': 'TEN', 
  'WSH': 'WAS', 'WAS': 'WAS'   // Handle both WSH and WAS
}

// Format date for Kalshi ticker (25SEP14 format - year then date)
function formatKalshiDate(date) {
  const d = new Date(date)
  const day = d.getDate().toString().padStart(2, '0')
  const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
  const year = d.getFullYear().toString().slice(-2)
  return `${year}${month}${day}`
}

// Get team win probability from Kalshi with retry logic
async function getKalshiProbability(homeTeam, awayTeam, gameDate, targetTeam, apiKey) {
  const maxRetries = 3
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const kalshiHome = KALSHI_TEAM_MAPPING[homeTeam]
      const kalshiAway = KALSHI_TEAM_MAPPING[awayTeam]
      const kalshiTarget = KALSHI_TEAM_MAPPING[targetTeam]
      
      if (!kalshiHome || !kalshiAway || !kalshiTarget) {
        console.error(`Missing team mapping: ${homeTeam}→${kalshiHome}, ${awayTeam}→${kalshiAway}, ${targetTeam}→${kalshiTarget}`)
        return {
          probability: 0.5,
          market: 'Team mapping error',
          ticker: null,
          lastPrice: null,
          confidence: 'error'
        }
      }
      
      const formattedDate = formatKalshiDate(gameDate)
      
      // Build ticker: KXNFLGAME-25SEP14SFNO-SF (no dash between date and teams)
      const ticker = `KXNFLGAME-${formattedDate}${kalshiAway}${kalshiHome}-${kalshiTarget}`
      
      console.log(`Attempt ${attempt}: Fetching Kalshi market: ${ticker}`)
      
      const response = await axios.get(
        `https://api.elections.kalshi.com/trade-api/v2/markets/${ticker}`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 8000
        }
      )
      
      const market = response.data.market
      const lastPriceCents = market.last_price || 50
      const probability = lastPriceCents / 100
      
      console.log(`✅ Kalshi success for ${ticker}: ${(probability * 100).toFixed(1)}% (${lastPriceCents}¢)`)
      
      return {
        probability,
        market: market.title,
        ticker,
        lastPrice: `${lastPriceCents}¢`,
        confidence: 'high'
      }
      
    } catch (error) {
      console.error(`❌ Kalshi attempt ${attempt} failed for ${targetTeam}:`, error.response?.status, error.message)
      
      if (attempt === maxRetries) {
        // Final attempt failed - use calculated fallback
        const fallback = calculateFallbackProbability(homeTeam, awayTeam, targetTeam)
        console.log(`🔄 Using calculated fallback for ${targetTeam}: ${(fallback.probability * 100).toFixed(1)}%`)
        return fallback
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
    }
  }
}

// Calculate realistic fallback probability based on team strength
function calculateFallbackProbability(homeTeam, awayTeam, targetTeam) {
  const TEAM_STRENGTH = {
    'KC': 95, 'BUF': 92, 'SF': 90, 'PHI': 88, 'DAL': 85,
    'BAL': 87, 'MIA': 82, 'CIN': 80, 'LAC': 78, 'NYJ': 75,
    'MIN': 77, 'DET': 76, 'SEA': 74, 'GB': 79, 'JAX': 73,
    'LAR': 72, 'LV': 70, 'PIT': 71, 'TEN': 68, 'IND': 69,
    'ATL': 67, 'TB': 66, 'NO': 65, 'WSH': 64, 'NYG': 60,
    'CHI': 62, 'NE': 58, 'DEN': 63, 'CLE': 56, 'CAR': 55,
    'ARI': 59, 'HOU': 61, 'WAS': 64, 'JAC': 73
  }

  const homeStrength = TEAM_STRENGTH[homeTeam] || 65
  const awayStrength = TEAM_STRENGTH[awayTeam] || 65
  const homeAdvantage = 6 // About 3 point home field advantage

  let probability
  if (targetTeam === homeTeam) {
    const adjustedHomeStrength = homeStrength + homeAdvantage
    const strengthDiff = adjustedHomeStrength - awayStrength
    probability = 1 / (1 + Math.exp(-strengthDiff / 15))
  } else {
    const adjustedHomeStrength = homeStrength + homeAdvantage
    const strengthDiff = adjustedHomeStrength - awayStrength
    probability = 1 - (1 / (1 + Math.exp(-strengthDiff / 15)))
  }

  return {
    probability,
    market: `Calculated: ${targetTeam} vs opponent`,
    ticker: null,
    lastPrice: null,
    confidence: 'calculated'
  }
}

export default async function handler(req, res) {
  const { week = 2, season = 2025 } = req.query

  try {
    // Get all active teams with their owners
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select(`
        abbr, 
        name,
        owner_id,
        owners!inner(name)
      `)
      .eq('active', true)

    if (teamsError) {
      throw new Error(`Database error: ${teamsError.message}`)
    }

    // Get games for this week
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('home, away, kickoff, final, home_pts, away_pts')
      .eq('season', season)
      .eq('week', week)

    if (gamesError) {
      throw new Error(`Database error getting games: ${gamesError.message}`)
    }

    const probabilities = {}
    
    // Process each team
    for (const team of teams || []) {
      let winProb = 0.5
      let market = 'No game this week'
      let ticker = null
      let lastPrice = null
      let confidence = 'none'
      
      // Find this team's game
      const game = games?.find(g => g.home === team.abbr || g.away === team.abbr)
      
      if (game) {
        if (game.final) {
          // Game is over - set probability based on actual result
          const teamWon = (game.home === team.abbr && game.home_pts > game.away_pts) ||
                         (game.away === team.abbr && game.away_pts > game.home_pts)
          winProb = teamWon ? 1.0 : 0.0
          market = `Final: ${game.away} ${game.away_pts} - ${game.home_pts} ${game.home}`
          confidence = 'final'
        } else {
          // Game pending - get Kalshi probability
          if (process.env.KALSHI_API_KEY) {
            const kalshiData = await getKalshiProbability(
              game.home, 
              game.away, 
              game.kickoff, 
              team.abbr,
              process.env.KALSHI_API_KEY
            )
            winProb = kalshiData.probability
            market = kalshiData.market
            ticker = kalshiData.ticker
            lastPrice = kalshiData.lastPrice
            confidence = kalshiData.confidence
          } else {
            market = 'No Kalshi API key'
            confidence = 'no-api'
          }
        }
      }
      
      probabilities[team.abbr] = {
        winProbability: winProb,
        team: team.abbr,
        teamName: team.name,
        owner: team.owners?.name || 'Unknown',
        ownerId: team.owner_id,
        market,
        ticker,
        lastPrice,
        confidence,
        source: process.env.KALSHI_API_KEY ? 'kalshi' : 'no-api'
      }
    }

    res.status(200).json({
      week: parseInt(week),
      season: parseInt(season),
      probabilities,
      totalTeams: Object.keys(probabilities).length,
      gamesFound: games?.length || 0,
      source: process.env.KALSHI_API_KEY ? 'kalshi' : 'no-api'
    })

  } catch (error) {
    console.error('Error fetching probabilities:', error)
    res.status(500).json({ 
      message: 'Error fetching probabilities', 
      error: error.message 
    })
  }
}