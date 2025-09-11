import { supabase } from '../../../lib/supabase'
import axios from 'axios'

// Check if it's game time (Thursday 8pm - Monday 11pm EST)
function isGameTime() {
  const now = new Date()
  const day = now.getDay() // 0 = Sunday, 1 = Monday, etc.
  const hour = now.getHours()
  
  // Thursday 8pm - Sunday 11:59pm
  if (day === 4 && hour >= 20) return true // Thursday 8pm+
  if (day === 5 || day === 6) return true // Friday, Saturday all day
  if (day === 0) return true // Sunday all day
  if (day === 1) return true // Monday until 11pm
  
  return false
}

export default async function handler(req, res) {
  console.log('Live updates cron job running...')
  
  try {
    // Only run during game times to save API calls
    if (!isGameTime()) {
      return res.status(200).json({
        message: 'Not game time, skipping live updates',
        isGameTime: false,
        timestamp: new Date().toISOString()
      })
    }

    // Get current week
    const currentWeekResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/current-week`)
    const { season, week } = await currentWeekResponse.json()

    // Check for game updates
    const gamesResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/fetch-games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ season, week })
    })
    const gamesResult = await gamesResponse.json()

    // Update scores for any newly completed games
    const scoresResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/update-scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ season, week })
    })
    const scoresResult = await scoresResponse.json()

    // Store fresh probabilities in database (optional - for caching)
    const probsResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/kalshi-probabilities?week=${week}&season=${season}`)
    const probsResult = await probsResponse.json()

    res.status(200).json({
      success: true,
      message: 'Live updates completed',
      isGameTime: true,
      season,
      week,
      gamesUpdated: gamesResult.totalGames || 0,
      newAwards: scoresResult.awards || 0,
      probabilitiesUpdated: Object.keys(probsResult.probabilities || {}).length,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Live updates failed:', error)
    
    res.status(500).json({
      success: false,
      message: 'Live updates failed',
      error: error.message,
      timestamp: new Date().toISOString()
    })
  }
}