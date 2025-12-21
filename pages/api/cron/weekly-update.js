import { NFLDataService } from '../../../lib/nfl-data'
import { PlayoffDataService } from '../../../lib/playoff-data'

export default async function handler(req, res) {
  // This endpoint will be called by Vercel Cron on Tuesdays
  console.log('Starting weekly automation...')
  
  try {
    // Get current NFL week
    const currentWeek = await NFLDataService.getCurrentWeek()
    const { season, week, seasonType } = currentWeek
    
    console.log(`Processing week ${week} of ${season} season (seasonType: ${seasonType})`)
    
    let regularSeasonResults = null
    let playoffResults = null
    
    // Process regular season games (seasonType 2)
    if (seasonType === 2 || week <= 18) {
      // Step 1: Fetch all games for the week
      console.log('Fetching games from ESPN...')
      const games = await NFLDataService.fetchWeekGames(season, week)
      
      if (games.length === 0) {
        regularSeasonResults = {
          success: false,
          message: 'No games found for this week'
        }
      } else {
        // Step 2: Update games in database
        console.log(`Updating ${games.length} games in database...`)
        const gameResults = await NFLDataService.updateGamesInDatabase(games)
        const successfulGames = gameResults.filter(r => r.success).length
        
        // Step 3: Calculate awards for completed games
        console.log('Calculating weekly awards...')
        const awardResults = await NFLDataService.calculateWeeklyAwards(season, week)
        
        regularSeasonResults = {
          success: true,
          gamesProcessed: games.length,
          gamesUpdated: successfulGames,
          awardsGiven: awardResults.awards || 0,
          completedGames: games.filter(g => g.final).length,
          pendingGames: games.filter(g => !g.final).length
        }
      }
    }
    
    // Process playoffs if we're past week 18 or in playoff season type (3)
    if (week >= 18 || seasonType === 3) {
      console.log('Processing playoff awards...')
      try {
        playoffResults = await PlayoffDataService.updateAllPlayoffs(season)
        console.log('Playoff processing complete:', playoffResults)
      } catch (playoffError) {
        console.error('Playoff processing error:', playoffError)
        playoffResults = {
          error: playoffError.message
        }
      }
    }
    
    // Build summary
    const summary = {
      success: true,
      message: 'Weekly update completed successfully',
      season,
      week,
      seasonType,
      regularSeason: regularSeasonResults,
      playoffs: playoffResults,
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
