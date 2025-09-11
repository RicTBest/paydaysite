import axios from 'axios'
import { supabase } from '../../lib/supabase'

// Kalshi API configuration
const KALSHI_BASE_URL = 'https://api.kalshi.com/trade-api/v2'

// Team name mappings for Kalshi market search
const TEAM_NAME_MAPPING = {
  'ARI': ['Arizona', 'Cardinals'],
  'ATL': ['Atlanta', 'Falcons'],
  'BAL': ['Baltimore', 'Ravens'],
  'BUF': ['Buffalo', 'Bills'],
  'CAR': ['Carolina', 'Panthers'],
  'CHI': ['Chicago', 'Bears'],
  'CIN': ['Cincinnati', 'Bengals'],
  'CLE': ['Cleveland', 'Browns'],
  'DAL': ['Dallas', 'Cowboys'],
  'DEN': ['Denver', 'Broncos'],
  'DET': ['Detroit', 'Lions'],
  'GB': ['Green Bay', 'Packers'],
  'HOU': ['Houston', 'Texans'],
  'IND': ['Indianapolis', 'Colts'],
  'JAX': ['Jacksonville', 'Jaguars'],
  'KC': ['Kansas City', 'Chiefs'],
  'LV': ['Las Vegas', 'Raiders'],
  'LAC': ['Los Angeles', 'Chargers'],
  'LAR': ['Los Angeles', 'Rams'],
  'MIA': ['Miami', 'Dolphins'],
  'MIN': ['Minnesota', 'Vikings'],
  'NE': ['New England', 'Patriots'],
  'NO': ['New Orleans', 'Saints'],
  'NYG': ['New York', 'Giants'],
  'NYJ': ['New York', 'Jets'],
  'PHI': ['Philadelphia', 'Eagles'],
  'PIT': ['Pittsburgh', 'Steelers'],
  'SF': ['San Francisco', '49ers'],
  'SEA': ['Seattle', 'Seahawks'],
  'TB': ['Tampa Bay', 'Buccaneers'],
  'TEN': ['Tennessee', 'Titans'],
  'WSH': ['Washington', 'Commanders']
}

class KalshiAPI {
  constructor() {
    this.baseURL = KALSHI_BASE_URL
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 10000
    })
  }

  // Get NFL markets for current week
  async getNFLMarkets() {
    try {
      const response = await this.client.get('/markets', {
        params: {
          limit: 1000,
          status: 'open',
          category: 'Sports'
        }
      })
      
      // Filter for NFL markets
      const nflMarkets = response.data.markets?.filter(market => 
        market.category === 'Sports' && 
        (market.title.toLowerCase().includes('nfl') || 
         market.title.toLowerCase().includes('football'))
      ) || []
      
      return nflMarkets
    } catch (error) {
      console.error('Error fetching Kalshi markets:', error.response?.data || error.message)
      return []
    }
  }

  // Find win probability for a specific team
  async getTeamWinProbability(teamAbbr) {
    try {
      const markets = await this.getNFLMarkets()
      const teamNames = TEAM_NAME_MAPPING[teamAbbr] || [teamAbbr]
      
      // Look for markets that mention this team winning
      const teamMarkets = markets.filter(market => {
        const title = market.title.toLowerCase()
        return teamNames.some(name => 
          title.includes(name.toLowerCase()) && 
          (title.includes('win') || title.includes('beat') || title.includes('cover'))
        )
      })
      
      if (teamMarkets.length > 0) {
        // Get the most recent/relevant market
        const market = teamMarkets[0]
        
        // Get market details including current prices
        const response = await this.client.get(`/markets/${market.ticker}`)
        const marketData = response.data.market
        
        // Return the yes price as probability (Kalshi prices are in cents, so divide by 100)
        return {
          probability: (marketData.yes_bid || marketData.yes_ask || 50) / 100,
          market: marketData.title,
          ticker: marketData.ticker
        }
      }
      
      // If no specific market found, return default probability
      return {
        probability: 0.5,
        market: 'No market found',
        ticker: null
      }
      
    } catch (error) {
      console.error(`Error getting win probability for ${teamAbbr}:`, error.response?.data || error.message)
      return {
        probability: 0.5,
        market: 'Error fetching data',
        ticker: null
      }
    }
  }
}

export default async function handler(req, res) {
  const { week = 1, season = 2025 } = req.query

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

    const kalshi = new KalshiAPI()
    const probabilities = {}
    
    // For now, let's use mock data since Kalshi requires authentication
    // In production, you would use real Kalshi API calls
    
    for (const team of teams || []) {
      // Mock probability calculation (replace with real Kalshi API)
      const mockProbability = 0.3 + (Math.random() * 0.4) // Random between 0.3 and 0.7
      
      probabilities[team.abbr] = {
        winProbability: mockProbability,
        team: team.abbr,
        teamName: team.name,
        owner: team.owners?.name || 'Unknown',
        ownerId: team.owner_id,
        market: `Mock: ${team.name} game odds`,
        source: 'mock' // Change to 'kalshi' when using real API
      }
    }

    // Uncomment below when you have Kalshi API access:

    for (const team of teams || []) {
      const probData = await kalshi.getTeamWinProbability(team.abbr)
      
      probabilities[team.abbr] = {
        winProbability: probData.probability,
        team: team.abbr,
        teamName: team.name,
        owner: team.owners?.name || 'Unknown',
        ownerId: team.owner_id,
        market: probData.market,
        ticker: probData.ticker,
        source: 'kalshi'
      }
    }


    res.status(200).json({
      week: parseInt(week),
      season: parseInt(season),
      probabilities,
      totalTeams: Object.keys(probabilities).length,
      source: 'calculated' // Change to 'kalshi' when using real API
    })

  } catch (error) {
    console.error('Error fetching probabilities:', error)
    res.status(500).json({ 
      message: 'Error fetching probabilities', 
      error: error.message 
    })
  }
}