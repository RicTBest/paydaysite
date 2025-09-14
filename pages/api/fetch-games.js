// pages/api/fetch-games.js
import { NFLDataService } from '../../lib/nfl-data';
function isAuthorized(req) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return true; // secret not configured => open
  const got = req.headers.authorization || '';
  return got === expected;
}
export default async function handler(req, res) {
  // Allow GET (Cron) and POST (manual)
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  if (!isAuthorized(req)) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  try {
    // Read params from query on GET, body on POST
    const getParam = (k) => (method === 'GET' ? req.query[k] : req.body?.[k]);
    let season = getParam('season');
    let week = getParam('week');
    if (!season || !week) {
      const current = await NFLDataService.getCurrentWeek();
      season = season || current.season;
      week = week || current.week;
    }
    const games = await NFLDataService.fetchWeekGames(season, week);
    if (!games?.length) {
      return res.status(200).json({
        message: 'No games found for this week',
        season, week, games: 0,
      });
    }
    const results = await NFLDataService.updateGamesInDatabase(games);
    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;
    return res.status(200).json({
      message: `Fetched ${games.length} games for week ${week}`,
      season, week, totalGames: games.length, successful, failed,
      games: games.map(g => ({
        id: g.gid,
        matchup: `${g.away} @ ${g.home}`,
        score: `${g.away_pts}-${g.home_pts}`,
        status: g.status,
        final: g.final,
      })),
    });
  } catch (error) {
    console.error('[fetch-games] error:', error);
    return res.status(500).json({ message: 'Error fetching games', error: error.message });
  }
}
