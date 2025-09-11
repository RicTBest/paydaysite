import axios from 'axios'

const KALSHI_BASE_URL = 'https://api.kalshi.com/v1'

export class KalshiAPI {
  constructor(apiKey) {
    this.apiKey = apiKey
    this.client = axios.create({
      baseURL: KALSHI_BASE_URL,
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    })
  }

  async getNFLMarkets(week = null) {
    try {
      const params = {
        category: 'Sports',
        tags: 'NFL'
      }
      if (week) params.tags += `,Week${week}`
      
      const response = await this.client.get('/markets', { params })
      return response.data.markets || []
    } catch (error) {
      console.error('Kalshi API error:', error)
      return []
    }
  }

  async getTeamWinProbability(teamAbbr, week) {
    try {
      const markets = await this.getNFLMarkets(week)
      
      // Look for team win markets
      const teamMarket = markets.find(m => 
        m.title.includes(teamAbbr) && 
        (m.title.includes('win') || m.title.includes('beat'))
      )
      
      if (teamMarket) {
        const response = await this.client.get(`/markets/${teamMarket.id}`)
        return response.data.market.yes_price / 100 // Convert cents to probability
      }
      
      return 0.5 // Default 50% if no market found
    } catch (error) {
      console.error(`Error getting win probability for ${teamAbbr}:`, error)
      return 0.5
    }
  }
}