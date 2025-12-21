import { PlayoffDataService } from '../../../lib/playoff-data'

function isAuthorized(req) {
  const expected = process.env.CRON_SECRET
  if (!expected) return true
  const got = req.headers.authorization || ''
  return got === expected
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ message: 'Method Not Allowed' })
  }

  if (!isAuthorized(req)) {
    return res.status(403).json({ message: 'Forbidden' })
  }

  try {
    const { season = 2025, round = null, force = false } = req.body
    
    console.log(`Processing playoff updates for season ${season}${round ? `, round: ${round}` : ''}${force ? ' (FORCED)' : ''}`)
    
    let results
    
    if (round) {
      // Process specific round only (bypasses playoff time check)
      if (round === 'BERTHS') {
        results = await PlayoffDataService.awardPlayoffBerths(season)
      } else {
        results = await PlayoffDataService.awardPlayoffRoundWins(season, round)
      }
    } else {
      // Process all playoff awards
      results = await PlayoffDataService.updateAllPlayoffs(season, force)
      
      // If skipped due to timing, return early with explanation
      if (results.skippedReason) {
        return res.status(200).json({
          success: false,
          message: `Playoff update skipped: ${results.skippedReason}`,
          season,
          hint: 'Use "force": true to override this check (not recommended)',
          timestamp: new Date().toISOString()
        })
      }
    }
    
    const totalAwarded = countAwarded(results)
    const totalSkipped = countSkipped(results)
    const totalErrors = countErrors(results)
    
    return res.status(200).json({
      success: true,
      message: `Playoff update complete: ${totalAwarded} awards given, ${totalSkipped} skipped, ${totalErrors} errors`,
      season,
      round: round || 'ALL',
      results,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('[playoff-update] error:', error)
    return res.status(500).json({ 
      success: false,
      message: 'Error during playoff update', 
      error: error.message 
    })
  }
}

function countAwarded(results) {
  if (Array.isArray(results?.awarded)) return results.awarded.length
  let total = 0
  for (const key of Object.keys(results || {})) {
    if (results[key]?.awarded) total += results[key].awarded.length
  }
  return total
}

function countSkipped(results) {
  if (Array.isArray(results?.skipped)) return results.skipped.length
  let total = 0
  for (const key of Object.keys(results || {})) {
    if (results[key]?.skipped) total += results[key].skipped.length
  }
  return total
}

function countErrors(results) {
  if (Array.isArray(results?.errors)) return results.errors.length
  let total = 0
  for (const key of Object.keys(results || {})) {
    if (results[key]?.errors) total += results[key].errors.length
  }
  return total
}
