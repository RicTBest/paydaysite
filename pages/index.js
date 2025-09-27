// pages/api/current-week.js
class NFLWeekCalculator {
  static async getCurrentWeek() {
    try {
      const now = new Date()
      const currentYear = now.getFullYear()
      
      const { week, seasonType } = this.calculateNFLWeek(now)
      
      return {
        season: currentYear,
        week: week,
        seasonType: seasonType
      }
    } catch (error) {
      console.error('Error getting current week:', error)
      return { season: 2025, week: 3, seasonType: 2 }
    }
  }

  static async getDefaultDisplayWeek() {
    try {
      const now = new Date()
      const currentYear = now.getFullYear()
      
      const { week, seasonType } = this.calculateNFLWeek(now)
      
      return {
        season: currentYear,
        week: week,
        seasonType: seasonType,
        actualWeek: week
      }
    } catch (error) {
      console.error('Error getting default display week:', error)
      return { season: 2025, week: 3, seasonType: 2, actualWeek: 3 }
    }
  }
  
  static calculateNFLWeek(date = new Date()) {
    const year = date.getFullYear()
    
    // Define the first Wednesday of each NFL season
    // Week 1 starts on the Wednesday before the first game
    const seasonStartWednesdays = {
      2025: new Date('2025-09-03'), // Wednesday before 9/5 Thursday game
      2026: new Date('2026-09-09'), // Wednesday before estimated start
      2024: new Date('2024-09-04')  // Wednesday before 9/5 Thursday game
    }
    
    let seasonStartWednesday = seasonStartWednesdays[year]
    
    // If we don't have a predefined date, calculate it
    if (!seasonStartWednesday) {
      // Find Labor Day (first Monday in September)
      const laborDay = new Date(year, 8, 1) // September 1st
      while (laborDay.getDay() !== 1) { // Find first Monday
        laborDay.setDate(laborDay.getDate() + 1)
      }
      
      // NFL typically starts the Thursday after Labor Day
      // So we want the Wednesday before that Thursday
      const firstGameDay = new Date(laborDay)
      firstGameDay.setDate(laborDay.getDate() + 3) // Thursday after Labor Day
      
      seasonStartWednesday = new Date(firstGameDay)
      seasonStartWednesday.setDate(firstGameDay.getDate() - 1) // Wednesday before
    }
    
    // If the current date is before the season starts, return week 1
    if (date < seasonStartWednesday) {
      return { week: 1, seasonType: 1 } // Pre-season
    }
    
    // Calculate days since the first Wednesday
    const daysSinceStart = Math.floor((date - seasonStartWednesday) / (1000 * 60 * 60 * 24))
    
    // Each NFL week runs from Wednesday to Tuesday (7 days)
    const week = Math.floor(daysSinceStart / 7) + 1
    
    // Determine season type based on week number
    if (week <= 18) {
      return { 
        week: week, 
        seasonType: 2 // Regular season
      }
    } else if (week <= 22) { // Weeks 19-22 for playoffs
      return {
        week: week - 18,
        seasonType: 3 // Playoffs
      }
    } else {
      return {
        week: 1,
        seasonType: 4 // Off-season
      }
    }
  }
}

export default async function handler(req, res) {
  try {
    const { display } = req.query
    
    if (display === 'true') {
      const defaultWeek = await NFLWeekCalculator.getDefaultDisplayWeek()
      res.status(200).json(defaultWeek)
    } else {
      const currentWeek = await NFLWeekCalculator.getCurrentWeek()
      res.status(200).json(currentWeek)
    }
  } catch (error) {
    console.error('API error:', error)
    res.status(500).json({ error: 'Failed to get current week' })
  }
}

export { NFLWeekCalculator }
