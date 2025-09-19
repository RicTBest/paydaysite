// Alternative approach using ESPN's calendar data
static async getCurrentWeek() {
  try {
    // Try the regular season scoreboard first
    const response = await axios.get(`${ESPN_BASE_URL}/scoreboard?seasontype=2`)
    const data = response.data
    
    // If we get regular season data, use it
    if (data.season && data.season.type === 2) {
      return {
        season: data.season.year,
        week: data.week.number,
        seasonType: 2
      }
    }
    
    // Fallback: Use date-based calculation
    const now = new Date()
    const currentYear = now.getFullYear()
    
    // 2025 NFL Regular season start: September 4, 2025 (Thursday)
    const seasonStart = new Date('2025-09-04')
    const daysSinceStart = Math.floor((now - seasonStart) / (1000 * 60 * 60 * 24))
    
    if (daysSinceStart < 0) {
      // We're still in preseason
      return { season: currentYear, week: 1, seasonType: 1 }
    }
    
    // Calculate week based on days since season start
    // Each week is 7 days, starting from Week 1
    const week = Math.floor(daysSinceStart / 7) + 1
    
    // Cap at 18 weeks for regular season
    const regularSeasonWeek = Math.min(week, 18)
    
    return {
      season: currentYear,
      week: regularSeasonWeek,
      seasonType: 2
    }
    
  } catch (error) {
    console.error('Error getting current week:', error)
    
    // Ultimate fallback for September 18, 2025
    return { season: 2025, week: 3, seasonType: 2 }
  }
}

// Helper function to calculate NFL week based on date
static calculateNFLWeek(date = new Date()) {
  const year = date.getFullYear()
  
  // NFL season typically starts first Thursday after Labor Day
  // For 2025: September 4, 2025
  const seasonStartDates = {
    2025: new Date('2025-09-04'),
    2026: new Date('2026-09-03'), // Estimated
    2024: new Date('2024-09-05')  // Historical
  }
  
  const seasonStart = seasonStartDates[year]
  if (!seasonStart) {
    throw new Error(`Season start date not defined for year ${year}`)
  }
  
  const daysSinceStart = Math.floor((date - seasonStart) / (1000 * 60 * 60 * 24))
  
  if (daysSinceStart < 0) {
    return { week: 1, seasonType: 1 } // Preseason
  }
  
  const week = Math.floor(daysSinceStart / 7) + 1
  return { 
    week: Math.min(week, 18), 
    seasonType: 2 // Regular season
  }
}
