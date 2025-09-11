import { NFLDataService } from '../../lib/nfl-data'

export default async function handler(req, res) {
  try {
    // Get current NFL week from ESPN
    const currentWeek = await NFLDataService.getCurrentWeek()
    
    res.status(200).json({
      season: currentWeek.season,
      week: currentWeek.week,
      seasonType: currentWeek.seasonType,
      message: `Current NFL week: ${currentWeek.week} of ${currentWeek.season} season`
    })
  } catch (error) {
    console.error('Error getting current week:', error)
    res.status(500).json({ 
      message: 'Error getting current week', 
      error: error.message,
      // Fallback to manual calculation
      season: 2025,
      week: 2,
      seasonType: 2
    })
  }
}