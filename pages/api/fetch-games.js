// pages/api/fetch-games.js
import { NFLDataService } from '../../lib/nfl-data';
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  try {
    let { season, week } = req.query;
    if (!season || !week) {
      const current = await NFLDataService.getCurrentWeek();
      season = season || current.season;
      week = week || current.week;
    }
    console.log(`[fetch-games] season=${season} week=${week}`);
    const games = await NFLDataService.fetchWeekGames(season, week);
    if (!games?.length) {
      return res.status(200).json({
        message: 'No games found for this week',
        season,
        week,
        games: 0,
      });
    }
    const results = await NFLDataService.updateGamesInDatabase(games);
    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;
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
    });
  } catch (error) {
    console.error('[fetch-games] error:', error);
    return res.status(500).json({
      message: 'Error fetching games',
      error: error.message,
    });
  }
}
