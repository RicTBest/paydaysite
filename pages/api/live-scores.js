import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  try {
    console.log('🏈 Starting live score update...')
    
    // Get current week/season
    const currentWeekResponse = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/current-week`)
    const { week, season } = await currentWeekResponse.json()
    
    // Fetch games from ESPN (same logic as your admin button)
    const espnResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2`)
    const data = await espnResponse.json()
    
    let updated = 0
    
    for (const game of data.events) {
      const homeTeam = game.competitions[0].competitors.find(c => c.homeAway === 'home')
      const awayTeam = game.competitions[0].competitors.find(c => c.homeAway === 'away')
      
      const gameData = {
        home: homeTeam.team.abbreviation,
        away: awayTeam.team.abbreviation,
        home_pts: parseInt(homeTeam.score) || 0,
        away_pts: parseInt(awayTeam.score) || 0,
        status: game.status.type.name,
        final: game.status.type.completed
      }
      
      // Update the game in your database
      const { error } = await supabase
        .from('games')
        .upsert(gameData, {
          onConflict: 'season,week,home,away'
        })
      
      if (!error) updated++
    }
    
    console.log(`✅ Updated ${updated} games`)
    return res.json({ success: true, updated })
    
  } catch (error) {
    console.error('❌ Live score update failed:', error)
    return res.status(500).json({ error: error.message })
  }
}
