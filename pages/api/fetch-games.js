import type { NextApiRequest, NextApiResponse } from 'next';
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end('Method Not Allowed');
  }
  // ... your logic
  return res.status(200).json({ ok: true });
}
1:27
// pages/api/fetch-games.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { NFLDataService } from '../../lib/nfl-data'
// Optional: require a secret for cron calls
function isAuthorized(req: NextApiRequest) {
  const expected = process.env.CRON_SECRET
  if (!expected) return true
  const got = req.headers.authorization || ''
  return got === expected
}
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isAuthorized(req)) {
    return res.status(403).json({ message: 'Forbidden' })
  }
  // Accept GET (Vercel Cron) and POST (manual/other callers)
  const method = req.method || 'GET'
  if (method !== 'GET' && method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ message: 'Method Not Allowed' })
  }
  try {
    // Read params from query on GET, body on POST
    const getParam = (k: string) =>
      method === 'GET' ? (req.query[k] as string | undefined) : (req.body?.[k] as string | undefined)
    let season = getParam('season')
    let week = getParam('week')
    // If not provided, look up current week
    if (!season || !week) {
      const current = await NFLDataService.getCurrentWeek()
      season = season ?? current.season
      week = week ?? current.week
    }
    console.log(`[fetch-games] season=${season} week=${week}`)
    // Fetch from upstream
    const games = await NFLDataService.fetchWeekGames(season, week)
    if (!games?.length) {
      return res.status(200).json({
        message: 'No games found for this week',
        season,
        week,
        games: 0,
      })
    }
    // Update DB
    const results = await NFLDataService.updateGamesInDatabase(games)
    const successful = results.filter(r => r.success).length
    const failed = results.length - successful
    return res.status(200).json({
      message: `Fetched ${games.length} games for week ${week}`,
      season,
      week,
      totalGames: games.length,
      successful,
      failed,
      games: games.map(g => ({
        id: g.gid,
        matchup: `${g.away} @ ${g.home}`,
        score: `${g.away_pts}-${g.home_pts}`,
        status: g.status,
        final: g.final,
      })),
    })
  } catch (error: any) {
    console.error('[fetch-games] error:', error)
    return res.status(500).json({
      message: 'Error fetching games',
      error: error?.message ?? String(error),
    })
  }
}
