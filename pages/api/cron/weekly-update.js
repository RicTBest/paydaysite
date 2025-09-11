import { NFLDataService } from '../../../lib/nfl-data'

export default async function handler(req, res) {
  // This endpoint will be called by Vercel Cron on Tuesdays
  console.log('Starting weekly automation...')
  
  try {
    // Get current NFL week
    const currentWeek = await NFLDataService.getCurrentWeek()
    const { season, week } = currentWeek
    
    console.log(`Processing week ${week} of ${season} season`)

    // Step 1: Fetch all games for the week
    console.log('Fetching games from ESPN...')
    const games = await NFLDataService.fetchWeekGames(season, week)
    
    if (games.length === 0) {
      return res.status(200).json({
        success: false,
        message: 'No games found for this week',
        season,
        week
      })
    }

    // Step 2: Update games in database
    console.log(`Updating ${games.length} games in database...`)
    const gameResults = await NFLDataService.updateGamesInDatabase(games)
    const successfulGames = gameResults.filter(r => r.success).length

    // Step 3: Calculate awards for completed games
    console.log('Calculating weekly awards...')
    const awardResults = await NFLDataService.calculateWeeklyAwards(season, week)

    // Step 4: Send summary
    const summary = {
      success: true,
      message: 'Weekly update completed successfully',
      season,
      week,
      gamesProcessed: games.length,
      gamesUpdated: successfulGames,
      awardsGiven: awardResults.awards || 0,
      completedGames: games.filter(g => g.final).length,
      pendingGames: games.filter(g => !g.final).length,
      timestamp: new Date().toISOString()
    }

    console.log('Weekly automation completed:', summary)
    
    res.status(200).json(summary)

  } catch (error) {
    console.error('Weekly automation failed:', error)
    
    res.status(500).json({
      success: false,
      message: 'Weekly automation failed',
      error: error.message,
      timestamp: new Date().toISOString()
    })
  }
}