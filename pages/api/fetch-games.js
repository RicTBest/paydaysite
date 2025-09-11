import { NFLDataService } from '../../lib/nfl-data'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  try {
    const { season, week } = req.body

    // If no season/week provided, get current week
    let targetSeason = season
    let targetWeek = week

    if (!targetSeason || !targetWeek) {
      const current = await NFLDataService.getCurrentWeek()
      targetSeason = targetSeason || current.season
      targetWeek = targetWeek || current.week
    }

    console.log(`Fetching games for season ${targetSeason}, week ${targetWeek}`)

    // Fetch games from ESPN
    const games = await NFLDataService.fetchWeekGames(targetSeason, targetWeek)
    
    if (games.length === 0) {
      return res.status(200).json({
        message: 'No games found for this week',
        season: targetSeason,
        week: targetWeek,
        games: 0
      })
    }

    // Update database
    const results = await NFLDataService.updateGamesInDatabase(games)
    
    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    res.status(200).json({
      message: `Fetched ${games.length} games for week ${targetWeek}`,
      season: targetSeason,
      week: targetWeek,
      totalGames: games.length,
      successful,
      failed,
      games: games.map(g => ({
        id: g.gid,
        matchup: `${g.away} @ ${g.home}`,
        score: `${g.away_pts}-${g.home_pts}`,
        status: g.status,
        final: g.final
      }))
    })

  } catch (error) {
    console.error('Error fetching games:', error)
    res.status(500).json({ 
      message: 'Error fetching games', 
      error: error.message 
    })
  }
}