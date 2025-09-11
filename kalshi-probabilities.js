// pages/api/kalshi-probabilities.js
import { KalshiAPI } from '../../lib/kalshi'
import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  const kalshi = new KalshiAPI(process.env.KALSHI_API_KEY)
  const { week = 1, season = 2024 } = req.query

  try {
    // Get all active teams
    const { data: teams } = await supabase
      .from('teams')
      .select('abbr, owner_id, owners(name)')
      .eq('active', true)

    const probabilities = {}
    
    for (const team of teams) {
      const winProb = await kalshi.getTeamWinProbability(team.abbr, week)
      probabilities[team.abbr] = {
        winProbability: winProb,
        team: team.abbr,
        owner: team.owners.name
      }
    }

    res.status(200).json(probabilities)
  } catch (error) {
    console.error('Error fetching Kalshi probabilities:', error)
    res.status(500).json({ message: 'Error fetching probabilities' })
  }
}