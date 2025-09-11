import { supabase } from '../../lib/supabase'

// Team abbreviation mapping (our format to Kalshi format)
const KALSHI_TEAM_MAPPING = {
  'ARI': 'ARI', 'ATL': 'ATL', 'BAL': 'BAL', 'BUF': 'BUF',
  'CAR': 'CAR', 'CHI': 'CHI', 'CIN': 'CIN', 'CLE': 'CLE',
  'DAL': 'DAL', 'DEN': 'DEN', 'DET': 'DET', 'GB': 'GB',
  'HOU': 'HOU', 'IND': 'IND', 'JAX': 'JAC', 'KC': 'KC', 'JAC' : 'JAC', // JAX -> JAC
  'LV': 'LV', 'LAC': 'LAC', 'LAR': 'LA', 'MIA': 'MIA',   // LAR -> LA
  'MIN': 'MIN', 'NE': 'NE', 'NO': 'NO', 'NYG': 'NYG',
  'NYJ': 'NYJ', 'PHI': 'PHI', 'PIT': 'PIT', 'SF': 'SF',
  'SEA': 'SEA', 'TB': 'TB', 'TEN': 'TEN', 'WSH': 'WAS', 'WAS' : 'WAS' // WSH -> WAS
}

// Format date for Kalshi ticker
function formatKalshiDate(date) {
  const d = new Date(date)
  const day = d.getDate().toString().padStart(2, '0')
  const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
  const year = d.getFullYear().toString().slice(-2)
  return `${day}${month}${year}`
}

export default async function handler(req, res) {
  const { week = 2, season = 2025 } = req.query

  try {
    // Get games for this week
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('*')
      .eq('season', season)
      .eq('week', week)
      .order('kickoff')

    if (gamesError) {
      throw new Error(`Database error: ${gamesError.message}`)
    }

    // Build expected Kalshi tickers for each game
    const gameDetails = games?.map(game => {
      const kalshiHome = KALSHI_TEAM_MAPPING[game.home]
      const kalshiAway = KALSHI_TEAM_MAPPING[game.away]
      const formattedDate = formatKalshiDate(game.kickoff)
      
      return {
        ourGame: `${game.away} @ ${game.home}`,
        kickoff: game.kickoff,
        final: game.final,
        score: game.final ? `${game.away_pts}-${game.home_pts}` : 'TBD',
        kalshiHome,
        kalshiAway,
        formattedDate,
        homeWinTicker: `KXNFL-${formattedDate}-${kalshiAway}${kalshiHome}-${kalshiHome}`,
        awayWinTicker: `KXNFL-${formattedDate}-${kalshiAway}${kalshiHome}-${kalshiAway}`
      }
    }) || []

    res.status(200).json({
      week: parseInt(week),
      season: parseInt(season),
      totalGames: games?.length || 0,
      games: gameDetails,
      sampleTickers: gameDetails.slice(0, 2).map(g => ({
        matchup: g.ourGame,
        homeTicker: g.homeWinTicker,
        awayTicker: g.awayWinTicker
      }))
    })

  } catch (error) {
    console.error('Error debugging games:', error)
    res.status(500).json({ 
      message: 'Error debugging games', 
      error: error.message 
    })
  }
}