import axios from 'axios'
import { supabase } from '../../lib/supabase'

// Only the teams we care about for LOTA
const LOTA_TEAMS = ['NYG', 'LV', 'NYJ', 'CLE']

// Team abbreviation mapping for Kalshi
const KALSHI_TEAM_MAPPING = {
  'NYG': 'NYG',
  'LV': 'LV', 
  'NYJ': 'NYJ',
  'CLE': 'CLE',
  // Opponents we might need
  'DAL': 'DAL',
  'KC': 'KC',
  'BUF': 'BUF',
  'CIN': 'CIN',
  'NE': 'NE',
  'PIT': 'PIT'
}

// Format date for Kalshi ticker
function formatKalshiDate(dateLike) {
  const d = new Date(dateLike)
  const year = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: '2-digit' }).format(d)
  const month = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short' }).format(d).toUpperCase()
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', day: '2-digit' }).format(d)
  return `${year}${month}${day}`
}

// Get team win probability from Kalshi
async function getKalshiProbability(homeTeam, awayTeam, gameDate, targetTeam, apiKey) {
  try {
    const kalshiHome = KALSHI_TEAM_MAPPING[homeTeam] || homeTeam
    const kalshiAway = KALSHI_TEAM_MAPPING[awayTeam] || awayTeam
    const kalshiTarget = KALSHI_TEAM_MAPPING[targetTeam] || targetTeam
    
    const formattedDate = formatKalshiDate(gameDate)
    const ticker = `KXNFLGAME-${formattedDate}${kalshiAway}${kalshiHome}-${kalshiTarget}`
    
    console.log(`LOTA: Fetching ${ticker}`)
    
    const response = await axios.get(
      `https://api.elections.kalshi.com/trade-api/v2/markets/${ticker}`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    )
    
    const market = response.data.market
    const probability = (market.last_price || 50) / 100
    
    return {
      probability,
      confidence: 'high',
      ticker,
      lastPrice: `${market.last_price}¢`
    }
  } catch (error) {
    console.error(`LOTA: Kalshi failed for ${targetTeam}:`, error.message)
    return {
      probability: 0.5,
      confidence: 'fallback',
      ticker: null,
      lastPrice: null
    }
  }
}

export default async function handler(req, res) {
  const { season = 2025 } = req.query

  try {
    // Get games for week 17 and 18 for LOTA teams only
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('week, home, away, kickoff, final, home_pts, away_pts')
      .eq('season', season)
      .in('week', [17, 18])
      .or(`home.in.(${LOTA_TEAMS.join(',')}),away.in.(${LOTA_TEAMS.join(',')})`)

    if (gamesError) {
      throw new Error(`Database error: ${gamesError.message}`)
    }

    const week17Probs = {}
    const week18Probs = {}
    
    const apiKey = process.env.KALSHI_API_KEY

    // Process each LOTA team's games
    for (const team of LOTA_TEAMS) {
      // Week 17 game
      const w17Game = games?.find(g => g.week === 17 && (g.home === team || g.away === team))
      if (w17Game) {
        if (w17Game.final) {
          const teamWon = (w17Game.home === team && w17Game.home_pts > w17Game.away_pts) ||
                         (w17Game.away === team && w17Game.away_pts > w17Game.home_pts)
          week17Probs[team] = { winProbability: teamWon ? 1.0 : 0.0, confidence: 'final' }
        } else if (apiKey) {
          const kalshiData = await getKalshiProbability(w17Game.home, w17Game.away, w17Game.kickoff, team, apiKey)
          week17Probs[team] = { winProbability: kalshiData.probability, confidence: kalshiData.confidence }
        } else {
          week17Probs[team] = { winProbability: 0.5, confidence: 'no-api' }
        }
      }

      // Week 18 game
      const w18Game = games?.find(g => g.week === 18 && (g.home === team || g.away === team))
      if (w18Game) {
        if (w18Game.final) {
          const teamWon = (w18Game.home === team && w18Game.home_pts > w18Game.away_pts) ||
                         (w18Game.away === team && w18Game.away_pts > w18Game.home_pts)
          week18Probs[team] = { winProbability: teamWon ? 1.0 : 0.0, confidence: 'final' }
        } else if (apiKey) {
          const kalshiData = await getKalshiProbability(w18Game.home, w18Game.away, w18Game.kickoff, team, apiKey)
          week18Probs[team] = { winProbability: kalshiData.probability, confidence: kalshiData.confidence }
        } else {
          week18Probs[team] = { winProbability: 0.5, confidence: 'no-api' }
        }
      }
    }

    res.status(200).json({
      season: parseInt(season),
      week17: week17Probs,
      week18: week18Probs,
      gamesFound: games?.length || 0,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('LOTA probabilities error:', error)
    res.status(500).json({ error: error.message })
  }
}
