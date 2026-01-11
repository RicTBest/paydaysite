import axios from 'axios'
import { supabase } from './supabase'

// ESPN API endpoints
const ESPN_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl'

// Team abbreviation mapping (ESPN to your format)
const TEAM_MAPPING = {
  'ARI': 'ARI', 'ATL': 'ATL', 'BAL': 'BAL', 'BUF': 'BUF',
  'CAR': 'CAR', 'CHI': 'CHI', 'CIN': 'CIN', 'CLE': 'CLE',
  'DAL': 'DAL', 'DEN': 'DEN', 'DET': 'DET', 'GB': 'GB',
  'HOU': 'HOU', 'IND': 'IND', 'JAX': 'JAC', 'KC': 'KC',
  'LV': 'LV', 'LAC': 'LAC', 'LAR': 'LAR', 'MIA': 'MIA',
  'MIN': 'MIN', 'NE': 'NE', 'NO': 'NO', 'NYG': 'NYG',
  'NYJ': 'NYJ', 'PHI': 'PHI', 'PIT': 'PIT', 'SF': 'SF',
  'SEA': 'SEA', 'TB': 'TB', 'TEN': 'TEN', 'WSH': 'WAS'
}

// Map internal week numbers (19-22) to ESPN playoff format
// ESPN uses seasontype=3 with weeks 1-5 for playoffs
function getESPNPlayoffParams(internalWeek) {
  // Internal week 19 = Wild Card = ESPN week 1
  // Internal week 20 = Divisional = ESPN week 2
  // Internal week 21 = Conference = ESPN week 3
  // Internal week 22 = Super Bowl = ESPN week 5 (week 4 is Pro Bowl)
  const mapping = {
    19: { seasonType: 3, week: 1 },  // Wild Card
    20: { seasonType: 3, week: 2 },  // Divisional
    21: { seasonType: 3, week: 3 },  // Conference Championships
    22: { seasonType: 3, week: 5 },  // Super Bowl
  }
  return mapping[internalWeek] || null
}

export class NFLDataService {
  
  // Get current NFL season and week
  static async getCurrentWeek() {
    try {
      const response = await axios.get(`${ESPN_BASE_URL}/scoreboard`)
      const data = response.data
      
      let week = data.week.number
      const seasonType = data.season.type
      
      // Convert ESPN playoff weeks to internal format
      // ESPN: seasontype=3, week 1-5
      // Internal: week 19-22
      if (seasonType === 3) {
        if (week === 1) week = 19      // Wild Card
        else if (week === 2) week = 20  // Divisional
        else if (week === 3) week = 21  // Conference
        else if (week >= 4) week = 22   // Super Bowl (ESPN week 5, but 4 is Pro Bowl)
      }
      
      return {
        season: data.season.year,
        week: week,
        seasonType: seasonType
      }
    } catch (error) {
      console.error('Error getting current week:', error)
      return { season: 2025, week: 1, seasonType: 2 }
    }
  }

  // Fetch games for a specific week
  static async fetchWeekGames(season = 2025, week = 1) {
    try {
      let url
      
      // Check if this is a playoff week
      if (week >= 19) {
        const playoffParams = getESPNPlayoffParams(week)
        if (!playoffParams) {
          console.log(`Invalid playoff week: ${week}`)
          return []
        }
        
        // For playoffs, ESPN uses the season year when playoffs START
        // e.g., 2024-25 season playoffs are under year=2024
        // But if your internal season is 2025, the playoffs would be year=2024
        // This depends on your convention - adjust if needed
        const espnYear = season // or season - 1 if your season represents the end year
        
        url = `${ESPN_BASE_URL}/scoreboard?seasontype=${playoffParams.seasonType}&week=${playoffParams.week}&year=${espnYear}`
        console.log(`Fetching playoff games (Week ${week} -> ESPN seasontype=${playoffParams.seasonType}, week=${playoffParams.week}):`, url)
      } else {
        // Regular season
        url = `${ESPN_BASE_URL}/scoreboard?seasontype=2&week=${week}&year=${season}`
        console.log('Fetching regular season games from:', url)
      }
      
      const response = await axios.get(url)
      const games = response.data.events || []
      
      console.log(`Found ${games.length} games`)
      
      return games.map(event => {
        const competition = event.competitions[0]
        const homeTeam = competition.competitors.find(c => c.homeAway === 'home')
        const awayTeam = competition.competitors.find(c => c.homeAway === 'away')
        
        // Get team abbreviations
        const homeAbbr = TEAM_MAPPING[homeTeam.team.abbreviation] || homeTeam.team.abbreviation
        const awayAbbr = TEAM_MAPPING[awayTeam.team.abbreviation] || awayTeam.team.abbreviation
        
        return {
          gid: event.id,
          season: parseInt(season),
          week: parseInt(week),  // Store as internal week (19-22 for playoffs)
          home: homeAbbr,
          away: awayAbbr,
          home_pts: parseInt(homeTeam.score) || 0,
          away_pts: parseInt(awayTeam.score) || 0,
          status: competition.status.type.name,
          final: competition.status.type.completed,
          kickoff: new Date(event.date).toISOString()
        }
      })
    } catch (error) {
      console.error('Error fetching NFL games:', error)
      return []
    }
  }

  static async getGamesFromDatabase(season, week) {
    try {
      const { createClient } = require('@supabase/supabase-js')
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      )
      
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('season', season)
        .eq('week', week)
      
      if (error) throw error
      return data
    } catch (error) {
      console.error('Error getting games from database:', error)
      return null
    }
  }

  // Update games in database
  static async updateGamesInDatabase(games) {
    const results = []
    
    for (const game of games) {
      try {
        const { data, error } = await supabase
          .from('games')
          .upsert(game, {
            onConflict: 'gid',
            returning: 'minimal'
          })
        
        if (error) {
          console.error(`Error upserting game ${game.gid}:`, error)
          results.push({ game: game.gid, success: false, error: error.message })
        } else {
          results.push({ game: game.gid, success: true })
        }
      } catch (error) {
        console.error(`Error processing game ${game.gid}:`, error)
        results.push({ game: game.gid, success: false, error: error.message })
      }
    }
    
    return results
  }

  // Calculate and award points for completed games
  // NOTE: This should NOT be called during playoffs - awards are entered manually
  static async calculateWeeklyAwards(season, week) {
    // Skip playoff weeks - awards are entered manually
    if (week >= 19) {
      console.log(`Skipping automatic awards for playoff week ${week}`)
      return {
        message: 'Playoff week - awards are entered manually',
        awards: [],
        skipped: true
      }
    }
    
    try {
      // Get all final games for the week
      const { data: games, error } = await supabase
        .from('games')
        .select('*')
        .eq('season', season)
        .eq('week', week)
        .eq('final', true)

      if (error) {
        throw new Error(`Database error: ${error.message}`)
      }

      if (!games || games.length === 0) {
        return { message: 'No completed games found', awards: [] }
      }

      // Clear existing awards for this week to avoid duplicates
      await supabase
        .from('awards')
        .delete()
        .eq('season', season)
        .eq('week', week)

      const awards = []

      // 1. WIN and TIE awards
      for (const game of games) {
        if (game.home_pts > game.away_pts) {
          // Home team wins
          awards.push({
            season,
            week,
            type: 'WIN',
            team_abbr: game.home,
            points: 1,
            notes: `Beat ${game.away} ${game.home_pts}-${game.away_pts}`
          })
        } else if (game.away_pts > game.home_pts) {
          // Away team wins
          awards.push({
            season,
            week,
            type: 'WIN',
            team_abbr: game.away,
            points: 1,
            notes: `Beat ${game.home} ${game.away_pts}-${game.home_pts}`
          })
        } else {
          // Tie - away team gets points
          awards.push({
            season,
            week,
            type: 'TIE_AWAY',
            team_abbr: game.away,
            points: 1,
            notes: `Tied with ${game.home} ${game.away_pts}-${game.home_pts}`
          })
        }
      }

      // 2. OBO (Offensive Bonus) - Highest scoring team
      const allScores = games.flatMap(g => [
        { team: g.home, score: g.home_pts, margin: g.home_pts - g.away_pts, opponent: g.away },
        { team: g.away, score: g.away_pts, margin: g.away_pts - g.home_pts, opponent: g.home }
      ])
      
      const highestScore = Math.max(...allScores.map(s => s.score))
      const highestScoreTeams = allScores.filter(s => s.score === highestScore)
      
      if (highestScoreTeams.length === 1) {
        awards.push({
          season,
          week,
          type: 'OBO',
          team_abbr: highestScoreTeams[0].team,
          points: 1,
          notes: `Highest score: ${highestScore} points`
        })
      } else {
        // Tiebreaker: margin of victory
        const winner = highestScoreTeams.reduce((max, team) => 
          team.margin > max.margin ? team : max
        )
        awards.push({
          season,
          week,
          type: 'OBO',
          team_abbr: winner.team,
          points: 1,
          notes: `Highest score: ${highestScore} points (tiebreaker: +${winner.margin} margin)`
        })
      }

      // 3. DBO (Defensive Bonus) - Team that held opponent to lowest score
      const lowestOppScore = Math.min(...allScores.map(s => s.score))
      const defensiveTeams = []
      
      games.forEach(game => {
        if (game.away_pts === lowestOppScore) {
          defensiveTeams.push({ 
            team: game.home, 
            margin: game.home_pts - game.away_pts, 
            oppScore: game.away_pts,
            opponent: game.away
          })
        }
        if (game.home_pts === lowestOppScore) {
          defensiveTeams.push({ 
            team: game.away, 
            margin: game.away_pts - game.home_pts, 
            oppScore: game.home_pts,
            opponent: game.home
          })
        }
      })

      if (defensiveTeams.length === 1) {
        awards.push({
          season,
          week,
          type: 'DBO',
          team_abbr: defensiveTeams[0].team,
          points: 1,
          notes: `Held ${defensiveTeams[0].opponent} to ${lowestOppScore} points`
        })
      } else if (defensiveTeams.length > 1) {
        // Tiebreaker: margin of victory
        const winner = defensiveTeams.reduce((max, team) => 
          team.margin > max.margin ? team : max
        )
        awards.push({
          season,
          week,
          type: 'DBO',
          team_abbr: winner.team,
          points: 1,
          notes: `Held opponent to ${lowestOppScore} points (tiebreaker: +${winner.margin} margin)`
        })
      }

      // Insert awards with owner lookup
      const finalAwards = []
      for (const award of awards) {
        const { data: team } = await supabase
          .from('teams')
          .select('owner_id')
          .eq('abbr', award.team_abbr)
          .eq('active', true)
          .single()

        if (team) {
          const finalAward = { ...award, owner_id: team.owner_id }
          
          const { data: insertedAward, error } = await supabase
            .from('awards')
            .insert(finalAward)
            .select()
            .single()

          if (error) {
            console.error('Error inserting award:', error)
          } else {
            finalAwards.push(insertedAward)
          }
        }
      }

      return {
        message: `Successfully processed ${games.length} games and awarded ${finalAwards.length} bonuses`,
        games: games.length,
        awards: finalAwards.length,
        details: finalAwards
      }

    } catch (error) {
      console.error('Error calculating weekly awards:', error)
      throw error
    }
  }
}
