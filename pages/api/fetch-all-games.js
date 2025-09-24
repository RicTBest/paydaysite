// pages/api/fetch-all-games.js
// API to bulk fetch and populate all NFL games for the season

import { NFLDataService } from '../../lib/nfl-data';

function isAuthorized(req) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return true;
  const got = req.headers.authorization || '';
  return got === expected;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  if (!isAuthorized(req)) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    const { season, startWeek = 1, endWeek = 18, forceRefetch = false } = req.body;
    
    const currentSeason = season || 2025;
    let results = [];
    let totalGames = 0;
    let errors = [];

    console.log(`Starting bulk fetch for season ${currentSeason}, weeks ${startWeek}-${endWeek}`);

    for (let week = startWeek; week <= endWeek; week++) {
      try {
        console.log(`Fetching games for Week ${week}...`);
        
        // Check if games already exist for this week (unless force refetch)
        if (!forceRefetch) {
          const existingGames = await NFLDataService.getGamesFromDatabase(currentSeason, week);
          if (existingGames && existingGames.length > 0) {
            console.log(`Week ${week}: ${existingGames.length} games already exist, skipping`);
            results.push({
              week,
              status: 'skipped',
              games: existingGames.length,
              message: 'Games already exist'
            });
            totalGames += existingGames.length;
            continue;
          }
        }

        // Fetch games from ESPN API
        const games = await NFLDataService.fetchWeekGames(currentSeason, week);
        
        if (!games || games.length === 0) {
          console.log(`Week ${week}: No games found`);
          results.push({
            week,
            status: 'empty',
            games: 0,
            message: 'No games found for this week'
          });
          continue;
        }

        // Save to database
        const updateResults = await NFLDataService.updateGamesInDatabase(games);
        const successful = updateResults.filter(r => r.success).length;
        const failed = updateResults.length - successful;

        console.log(`Week ${week}: ${successful} games saved, ${failed} failed`);
        
        results.push({
          week,
          status: successful > 0 ? 'success' : 'failed',
          games: successful,
          failed,
          totalAttempted: games.length
        });

        totalGames += successful;

        // Small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (weekError) {
        console.error(`Error processing Week ${week}:`, weekError);
        errors.push({
          week,
          error: weekError.message
        });
        results.push({
          week,
          status: 'error',
          games: 0,
          error: weekError.message
        });
      }
    }

    const successfulWeeks = results.filter(r => r.status === 'success').length;
    const skippedWeeks = results.filter(r => r.status === 'skipped').length;
    const errorWeeks = results.filter(r => r.status === 'error').length;

    return res.status(200).json({
      message: `Bulk fetch complete: ${totalGames} total games processed`,
      season: currentSeason,
      weeksProcessed: endWeek - startWeek + 1,
      successful: successfulWeeks,
      skipped: skippedWeeks,
      errors: errorWeeks,
      totalGames,
      results,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('[fetch-all-games] error:', error);
    return res.status(500).json({ 
      message: 'Error during bulk fetch', 
      error: error.message 
    });
  }
}

// Helper function to add to your NFLDataService
// Add this method to your existing NFLDataService class:

// static async getGamesFromDatabase(season, week) {
//   try {
//     const { data, error } = await supabase
//       .from('games')
//       .select('*')
//       .eq('season', season)
//       .eq('week', week);
//     
//     if (error) throw error;
//     return data;
//   } catch (error) {
//     console.error('Error getting games from database:', error);
//     return null;
//   }
// }
