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

    console.log(`Calculating awards for season ${targetSeason}, week ${targetWeek}`)

    // Calculate and award points
    const result = await NFLDataService.calculateWeeklyAwards(targetSeason, targetWeek)

    res.status(200).json({
      ...result,
      season: targetSeason,
      week: targetWeek
    })

  } catch (error) {
    console.error('Error calculating awards:', error)
    res.status(500).json({ 
      message: 'Error calculating awards', 
      error: error.message 
    })
  }
}