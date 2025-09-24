// Replace your entire current-week.js file with this:

class NFLWeekCalculator {
  static async getCurrentWeek() {
    // ... (the class code from the enhanced calculator)
  }
  
  static async getDefaultDisplayWeek() {
    // ... (smart default logic)
  }
  
  static calculateNFLWeek(date = new Date()) {
    // ... (calculation logic)
  }
}

// API route handler
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

// Export functions for use in other files
export { NFLWeekCalculator }
