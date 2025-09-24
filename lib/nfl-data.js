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

export class NFLDataService {
  
  // Get current NFL season and week
  static async getCurrentWeek() {
    try {
      const response = await axios.get(`${ESPN_BASE_URL}/scoreboard`)
      const data = response.data
      
      return {
        season: data.season.year,
        week: data.week.number,
        seasonType: data.season.type // 2 = regular season, 3 = playoffs
      }
    } catch (error) {
      console.error('Error getting current week:', error)
      return { season: 2025, week: 1, seasonType: 2 }
    }
  }

  // Fetch games for a specific week
  static async fetchWeekGames(season = 2025, week = 1) {
    try {
      const url = `${ESPN_BASE_URL}/scoreboard?seasontype=2&week=${week}&year=${season}`
      console.log('Fetching games from:', url)
      
      const response = await axios.get(url)
      const games = response.data.events || []
      
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
          week: parseInt(week),
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
  static async calculateWeeklyAwards(season, week) {
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
