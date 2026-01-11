// pages/api/current-week.js
class NFLWeekCalculator {
  static async getCurrentWeek() {
    try {
      const now = new Date()
      
      const { week, seasonType, seasonYear } = this.calculateNFLWeek(now)
      
      return {
        season: seasonYear,
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
      
      const { week, seasonType, seasonYear } = this.calculateNFLWeek(now)
      
      return {
        season: seasonYear,
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
    const calendarYear = date.getFullYear()
    
    // Define the first Wednesday of each NFL season
    // Week 1 starts on the Wednesday before the first game
    const seasonStartWednesdays = {
      2024: new Date('2024-09-04'), // Wednesday before 9/5 Thursday game
      2025: new Date('2025-09-03'), // Wednesday before 9/4 Thursday game  
      2026: new Date('2026-09-09'), // Wednesday before estimated start
    }
    
    // Helper to get season start date (predefined or calculated)
    const getSeasonStartWednesday = (year) => {
      if (seasonStartWednesdays[year]) {
        return seasonStartWednesdays[year]
      }
      // Calculate dynamically if not predefined
      const laborDay = new Date(year, 8, 1) // September 1st
      while (laborDay.getDay() !== 1) { // Find first Monday
        laborDay.setDate(laborDay.getDate() + 1)
      }
      const firstGameDay = new Date(laborDay)
      firstGameDay.setDate(laborDay.getDate() + 3) // Thursday after Labor Day
      const startWednesday = new Date(firstGameDay)
      startWednesday.setDate(firstGameDay.getDate() - 1) // Wednesday before
      return startWednesday
    }
    
    // Determine which NFL season we're in
    // NFL seasons span two calendar years (Sept Year X through Feb Year X+1)
    let seasonStartWednesday = getSeasonStartWednesday(calendarYear)
    let seasonYear = calendarYear
    
    // If current date is before this year's season starts (Jan-Aug),
    // check if we're still in the previous year's season
    if (date < seasonStartWednesday) {
      const prevSeasonStart = getSeasonStartWednesday(calendarYear - 1)
      const daysSincePrevStart = Math.floor((date - prevSeasonStart) / (1000 * 60 * 60 * 24))
      const weekInPrevSeason = Math.floor(daysSincePrevStart / 7) + 1
      
      // Previous season covers weeks 1-22 (18 regular + 4 playoff weeks)
      // Add buffer for Super Bowl week and a bit after
      if (daysSincePrevStart >= 0 && weekInPrevSeason <= 25) {
        seasonStartWednesday = prevSeasonStart
        seasonYear = calendarYear - 1
      } else {
        // We're truly in the off-season waiting for current year's season
        return { week: 1, seasonType: 1, seasonYear: calendarYear } // Pre-season
      }
    }
    
    // Calculate days since the season's first Wednesday
    const daysSinceStart = Math.floor((date - seasonStartWednesday) / (1000 * 60 * 60 * 24))
    
    // Each NFL week runs from Wednesday to Tuesday (7 days)
    const week = Math.floor(daysSinceStart / 7) + 1
    
    // Determine season type based on week number
    if (week <= 18) {
      return { 
        week: week, 
        seasonType: 2, // Regular season
        seasonYear: seasonYear
      }
    } else if (week <= 22) { // Weeks 19-22 for playoffs
      return {
        week: week,
        seasonType: 3, // Playoffs
        seasonYear: seasonYear
      }
    } else {
      return {
        week: 1,
        seasonType: 4, // Off-season
        seasonYear: seasonYear
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
