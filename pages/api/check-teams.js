import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  try {
    // Get unique team abbreviations from games table
    const { data: games } = await supabase
      .from('games')
      .select('home, away')
      .eq('season', 2025)
      .eq('week', 2)

    const allTeams = new Set()
    games?.forEach(game => {
      allTeams.add(game.home)
      allTeams.add(game.away)
    })

    // Also get teams from teams table
    const { data: teams } = await supabase
      .from('teams')
      .select('abbr, name')
      .eq('active', true)

    res.status(200).json({
      gamesTeams: Array.from(allTeams).sort(),
      teamsTableTeams: teams?.map(t => ({ abbr: t.abbr, name: t.name })) || [],
      totalGamesTeams: allTeams.size,
      sampleGame: games?.[0] || null
    })

  } catch (error) {
    console.error('Error checking teams:', error)
    res.status(500).json({ 
      message: 'Error checking teams', 
      error: error.message 
    })
  }
}