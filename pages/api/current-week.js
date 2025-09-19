// Fixed getCurrentWeek function with proper syntax
static async getCurrentWeek() {
  try {
    // Use the helper function for consistency
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
    
    // Ultimate fallback for September 18, 2025
    return { season: 2025, week: 3, seasonType: 2 }
  }
}

// Helper function to calculate NFL week based on date
static calculateNFLWeek(date = new Date()) {
  const year = date.getFullYear()
  
  // NFL season typically starts first Thursday after Labor Day
  // For 2025: September 5, 2025 (Thursday) - corrected date
  const seasonStartDates = {
    2025: new Date('2025-09-05'),
    2026: new Date('2026-09-10'), // Estimated - first Thursday after Labor Day
    2024: new Date('2024-09-05')  // Historical
  }
  
  const seasonStart = seasonStartDates[year]
  if (!seasonStart) {
    // Fallback calculation for unknown years
    // Labor Day is first Monday in September, season starts Thursday after
    const laborDay = new Date(year, 8, 1) // September 1st
    while (laborDay.getDay() !== 1) { // Find first Monday
      laborDay.setDate(laborDay.getDate() + 1)
    }
    const seasonStartFallback = new Date(laborDay)
    seasonStartFallback.setDate(laborDay.getDate() + 3) // Thursday after Labor Day
    
    console.warn(`Season start date not defined for year ${year}, using calculated date: ${seasonStartFallback.toDateString()}`)
    seasonStart = seasonStartFallback
  }
  
  const daysSinceStart = Math.floor((date - seasonStart) / (1000 * 60 * 60 * 24))
  
  if (daysSinceStart < 0) {
    return { week: 1, seasonType: 1 } // Preseason
  }
  
  const week = Math.floor(daysSinceStart / 7) + 1
  
  // Handle different season phases
  if (week <= 18) {
    return { 
      week: week, 
      seasonType: 2 // Regular season
    }
  } else if (week <= 21) {
    return {
      week: week - 18, // Playoff weeks 1-3
      seasonType: 3 // Playoffs
    }
  } else {
    return {
      week: 1, // Super Bowl week
      seasonType: 4 // Super Bowl
    }
  }
}

// Alternative version if you want to keep the original logic in getCurrentWeek
static async getCurrentWeekAlternative() {
  try {
    const now = new Date()
    const currentYear = now.getFullYear()
    
    // 2025 NFL Regular season start: September 5, 2025 (Thursday) - corrected
    const seasonStart = new Date('2025-09-05')
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

// Test function to verify the calculations
static testWeekCalculations() {
  const testDates = [
    new Date('2025-09-01'), // Before season
    new Date('2025-09-05'), // Week 1 start
    new Date('2025-09-11'), // Week 1 end
    new Date('2025-09-12'), // Week 2 start
    new Date('2025-09-18'), // Current date (Week 2)
    new Date('2025-12-29'), // End of regular season
  ]
  
  console.log('Week calculation tests:')
  testDates.forEach(date => {
    const result = this.calculateNFLWeek(date)
    console.log(`${date.toDateString()}: Week ${result.week}, Season Type ${result.seasonType}`)
  })
}
