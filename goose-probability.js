import { supabase } from '../../lib/supabase'
import { KalshiAPI } from '../../lib/kalshi'

export default async function handler(req, res) {
  const { owner_id, week = 1, season = 2024 } = req.query
  
  try {
    // Get owner's teams
    const { data: teams } = await supabase
      .from('teams')
      .select('abbr')
      .eq('owner_id', owner_id)
      .eq('active', true)

    if (!teams || teams.length === 0) {
      return res.status(200).json({ gooseProbability: 0 })
    }

    // Check if owner already has a win this week
    const { data: wins } = await supabase
      .from('awards')
      .select('*')
      .eq('season', season)
      .eq('week', week)
      .eq('owner_id', owner_id)
      .in('type', ['WIN', 'TIE_AWAY'])

    if (wins && wins.length > 0) {
      return res.status(200).json({ gooseProbability: 0 })
    }

    // Get games for this week
    const { data: games } = await supabase
      .from('games')
      .select('home, away')
      .eq('season', season)
      .eq('week', week)

    // Check if owner has teams playing each other
    const ownerTeams = teams.map(t => t.abbr)
    const hasInternalGame = games?.some(game => 
      ownerTeams.includes(game.home) && ownerTeams.includes(game.away)
    )

    if (hasInternalGame) {
      return res.status(200).json({ gooseProbability: 0 })
    }

    // Calculate goose probability (product of all opponent win probabilities)
    const kalshi = new KalshiAPI(process.env.KALSHI_API_KEY)
    let gooseProb = 1

    for (const team of teams) {
      // Find this team's opponent
      const game = games?.find(g => g.home === team.abbr || g.away === team.abbr)
      if (game) {
        const opponent = game.home === team.abbr ? game.away : game.home
        const oppWinProb = await kalshi.getTeamWinProbability(opponent, week)
        gooseProb *= oppWinProb
      }
    }

    res.status(200).json({ gooseProbability: gooseProb })
  } catch (error) {
    console.error('Error calculating goose probability:', error)
    res.status(500).json({ message: 'Error calculating goose probability' })
  }
}