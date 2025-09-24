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
      const dayOfWeek = now.getDay() // 0 = Sunday, 1 = Monday, etc.
      
      const { week, seasonType } = this.calculateNFLWeek(now)
      
      let displayWeek = week
      
      // Smart logic: Sunday, Monday, Tuesday show previous week
      if (dayOfWeek <= 2 && week > 1) {
        displayWeek = week - 1
      }
      
      return {
        season: currentYear,
        week: displayWeek,
        seasonType: seasonType,
        actualWeek: week,
        dayOfWeek: dayOfWeek
      }
    } catch (error) {
      console.error('Error getting default display week:', error)
      return { season: 2025, week: 3, seasonType: 2, actualWeek: 3 }
    }
  }

  static calculateNFLWeek(date = new Date()) {
    const year = date.getFullYear()
    
    const seasonStartDates = {
      2025: new Date('2025-09-05'),
      2026: new Date('2026-09-10'),
      2024: new Date('2024-09-05')
    }
    
    let seasonStart = seasonStartDates[year]
    if (!seasonStart) {
      const laborDay = new Date(year, 8, 1)
      while (laborDay.getDay() !== 1) {
        laborDay.setDate(laborDay.getDate() + 1)
      }
      seasonStart = new Date(laborDay)
      seasonStart.setDate(laborDay.getDate() + 3)
    }
    
    const daysSinceStart = Math.floor((date - seasonStart) / (1000 * 60 * 60 * 24))
    
    if (daysSinceStart < 0) {
      return { week: 1, seasonType: 1 }
    }
    
    const week = Math.floor(daysSinceStart / 7) + 1
    
    if (week <= 18) {
      return { 
        week: week, 
        seasonType: 2
      }
    } else if (week <= 21) {
      return {
        week: week - 18,
        seasonType: 3
      }
    } else {
      return {
        week: 1,
        seasonType: 4
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
