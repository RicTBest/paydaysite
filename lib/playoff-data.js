import axios from 'axios'
import { supabase } from './supabase'

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

// Playoff award amounts (direct dollars, not multiplied)
export const PLAYOFF_AMOUNTS = {
  PLAYOFF_BERTH: 10,      // Making playoffs
  PLAYOFF_BYE: 10,        // Getting first-round bye (seeds 1)
  PLAYOFF_WC_WIN: 10,     // Winning wild card round
  PLAYOFF_DIV_WIN: 15,    // Winning divisional round
  PLAYOFF_CONF_WIN: 30,   // Winning conference championship
  PLAYOFF_SB_WIN: 90      // Winning Super Bowl
}

// EOY award amounts (for reference - entered manually)
export const EOY_AMOUNTS = {
  FIRST_COACH_FIRED: 5,
  DRAFT_PICK_1: 35,
  MVP: 20,
  DPOY: 15,
  COTY: 5,
  MOST_SACKS: 15,
  MOST_INTS: 10,
  MOST_RET_TDS: 15
}

// Award types that use direct dollar amounts (not points * 5)
export const DIRECT_AMOUNT_TYPES = [
  'PLAYOFF_BERTH', 'PLAYOFF_BYE', 'PLAYOFF_WC_WIN', 
  'PLAYOFF_DIV_WIN', 'PLAYOFF_CONF_WIN', 'PLAYOFF_SB_WIN',
  'FIRST_COACH_FIRED', 'DRAFT_PICK_1', 'MVP', 'DPOY', 
  'COTY', 'MOST_SACKS', 'MOST_INTS', 'MOST_RET_TDS'
]

export class PlayoffDataService {
  
  // Get current playoff standings after Week 18
  static async getPlayoffTeams(season = 2025) {
    try {
      const url = `https://site.api.espn.com/apis/v2/sports/football/nfl/standings?season=${season}`
      console.log('Fetching standings from:', url)
      
      const response = await axios.get(url)
      const data = response.data
      
      const playoffTeams = {
        AFC: [],
        NFC: []
      }
      
      // Parse standings to get playoff teams (top 7 from each conference)
      data.children?.forEach(conference => {
        const confName = conference.abbreviation // 'AFC' or 'NFC'
        const teams = []
        
        conference.standings?.entries?.forEach(entry => {
          const team = entry.team
          const abbr = TEAM_MAPPING[team.abbreviation] || team.abbreviation
          const stats = {}
          
          entry.stats?.forEach(stat => {
            stats[stat.name] = stat.value
          })
          
          teams.push({
            abbr,
            name: team.displayName,
            seed: parseInt(stats.playoffSeed) || 99,
            wins: parseInt(stats.wins) || 0,
            losses: parseInt(stats.losses) || 0,
            clinched: stats.clincher || null
          })
        })
        
        // Sort by seed and take top 7
        teams.sort((a, b) => a.seed - b.seed)
        playoffTeams[confName] = teams.filter(t => t.seed <= 7)
      })
      
      return playoffTeams
    } catch (error) {
      console.error('Error fetching playoff standings:', error)
      return { AFC: [], NFC: [] }
    }
  }

  // Get playoff bracket/games for a specific round
  static async getPlayoffGames(season = 2025, round = null) {
    try {
      // seasontype=3 is playoffs
      const url = `${ESPN_BASE_URL}/scoreboard?seasontype=3&year=${season}`
      console.log('Fetching playoff games from:', url)
      
      const response = await axios.get(url)
      const events = response.data.events || []
      
      const games = events.map(event => {
        const competition = event.competitions[0]
        const homeTeam = competition.competitors.find(c => c.homeAway === 'home')
        const awayTeam = competition.competitors.find(c => c.homeAway === 'away')
        
        const homeAbbr = TEAM_MAPPING[homeTeam?.team?.abbreviation] || homeTeam?.team?.abbreviation
        const awayAbbr = TEAM_MAPPING[awayTeam?.team?.abbreviation] || awayTeam?.team?.abbreviation
        
        // Determine round from the EVENT's week, not the overall response week
        // Each event has its own week property
        const eventWeek = event.week?.number || event.season?.slug || null
        
        // Also check the event name/shortName for round indicators
        const eventName = (event.name || event.shortName || '').toLowerCase()
        
        let playoffRound = 'WILD_CARD' // default
        
        // First try to detect from event name (most reliable)
        if (eventName.includes('super bowl') || eventName.includes('championship game')) {
          playoffRound = 'SUPER_BOWL'
        } else if (eventName.includes('conference') || eventName.includes('nfc championship') || eventName.includes('afc championship')) {
          playoffRound = 'CONFERENCE'
        } else if (eventName.includes('divisional')) {
          playoffRound = 'DIVISIONAL'
        } else if (eventName.includes('wild card') || eventName.includes('wild-card')) {
          playoffRound = 'WILD_CARD'
        } else if (eventWeek) {
          // Fallback to week number if name doesn't help
          // Playoff weeks: 1 = Wild Card, 2 = Divisional, 3 = Conference, 4+ = Super Bowl
          if (eventWeek === 1) playoffRound = 'WILD_CARD'
          else if (eventWeek === 2) playoffRound = 'DIVISIONAL'
          else if (eventWeek === 3) playoffRound = 'CONFERENCE'
          else if (eventWeek >= 4) playoffRound = 'SUPER_BOWL'
        }
        
        // Additional check: Super Bowl only has 2 teams, and is typically in February
        // Conference championship has 2 games, Divisional has 4, Wild Card has 6
        const gameDate = new Date(event.date)
        const numTeamsInGame = 2 // Always 2, but we can check total games in round
        
        console.log(`Game: ${homeAbbr} vs ${awayAbbr}, eventWeek: ${eventWeek}, name: "${eventName}", detected round: ${playoffRound}`)
        
        return {
          id: event.id,
          round: playoffRound,
          week: eventWeek,
          home: homeAbbr,
          away: awayAbbr,
          homeScore: parseInt(homeTeam?.score) || 0,
          awayScore: parseInt(awayTeam?.score) || 0,
          status: competition.status?.type?.name,
          completed: competition.status?.type?.completed,
          winner: competition.status?.type?.completed 
            ? (parseInt(homeTeam?.score) > parseInt(awayTeam?.score) ? homeAbbr : awayAbbr)
            : null,
          eventName: event.name || event.shortName || ''
        }
      })
      
      // Filter by round if specified
      if (round) {
        return games.filter(g => g.round === round)
      }
      
      return games
    } catch (error) {
      console.error('Error fetching playoff games:', error)
      return []
    }
  }

  // Check if an award already exists (to prevent duplicates)
  static async awardExists(season, type, teamAbbr) {
    try {
      const { data, error } = await supabase
        .from('awards')
        .select('id')
        .eq('season', season)
        .eq('type', type)
        .eq('team_abbr', teamAbbr)
        .limit(1)
      
      if (error) throw error
      return data && data.length > 0
    } catch (error) {
      console.error('Error checking award exists:', error)
      return false
    }
  }

  // Award playoff berth to all playoff teams (run after Week 18)
  static async awardPlayoffBerths(season = 2025) {
    const results = { awarded: [], skipped: [], errors: [] }
    
    try {
      const playoffTeams = await this.getPlayoffTeams(season)
      const allTeams = [...playoffTeams.AFC, ...playoffTeams.NFC]
      
      console.log(`Found ${allTeams.length} playoff teams`)
      
      for (const team of allTeams) {
        // Check if already awarded
        const exists = await this.awardExists(season, 'PLAYOFF_BERTH', team.abbr)
        if (exists) {
          results.skipped.push({ team: team.abbr, reason: 'Already awarded' })
          continue
        }
        
        // Get owner for this team
        const { data: teamData } = await supabase
          .from('teams')
          .select('owner_id')
          .eq('abbr', team.abbr)
          .eq('active', true)
          .single()
        
        if (!teamData) {
          results.errors.push({ team: team.abbr, error: 'Team not found in database' })
          continue
        }
        
        // Insert award
        const { error } = await supabase
          .from('awards')
          .insert({
            season,
            week: 18, // Playoff berths determined after week 18
            type: 'PLAYOFF_BERTH',
            team_abbr: team.abbr,
            owner_id: teamData.owner_id,
            points: PLAYOFF_AMOUNTS.PLAYOFF_BERTH,
            notes: `Playoff berth - #${team.seed} seed`
          })
        
        if (error) {
          results.errors.push({ team: team.abbr, error: error.message })
        } else {
          results.awarded.push({ team: team.abbr, seed: team.seed })
        }
      }
      
      // Award byes to #1 seeds
      for (const conf of ['AFC', 'NFC']) {
        const topSeed = playoffTeams[conf].find(t => t.seed === 1)
        if (topSeed) {
          const byeExists = await this.awardExists(season, 'PLAYOFF_BYE', topSeed.abbr)
          if (!byeExists) {
            const { data: teamData } = await supabase
              .from('teams')
              .select('owner_id')
              .eq('abbr', topSeed.abbr)
              .eq('active', true)
              .single()
            
            if (teamData) {
              const { error } = await supabase
                .from('awards')
                .insert({
                  season,
                  week: 18,
                  type: 'PLAYOFF_BYE',
                  team_abbr: topSeed.abbr,
                  owner_id: teamData.owner_id,
                  points: PLAYOFF_AMOUNTS.PLAYOFF_BYE,
                  notes: `#1 seed bye - ${conf}`
                })
              
              if (!error) {
                results.awarded.push({ team: topSeed.abbr, type: 'BYE' })
              }
            }
          }
        }
      }
      
      return results
    } catch (error) {
      console.error('Error awarding playoff berths:', error)
      throw error
    }
  }

  // Award wins for a specific playoff round
  static async awardPlayoffRoundWins(season = 2025, round = 'WILD_CARD') {
    const results = { awarded: [], skipped: [], errors: [] }
    
    const roundToAwardType = {
      'WILD_CARD': 'PLAYOFF_WC_WIN',
      'DIVISIONAL': 'PLAYOFF_DIV_WIN',
      'CONFERENCE': 'PLAYOFF_CONF_WIN',
      'SUPER_BOWL': 'PLAYOFF_SB_WIN'
    }
    
    const awardType = roundToAwardType[round]
    if (!awardType) {
      throw new Error(`Invalid round: ${round}`)
    }
    
    try {
      const games = await this.getPlayoffGames(season, round)
      const completedGames = games.filter(g => g.completed && g.winner)
      
      console.log(`Found ${completedGames.length} completed ${round} games`)
      
      for (const game of completedGames) {
        const winner = game.winner
        
        // Check if already awarded
        const exists = await this.awardExists(season, awardType, winner)
        if (exists) {
          results.skipped.push({ team: winner, reason: 'Already awarded' })
          continue
        }
        
        // Get owner
        const { data: teamData } = await supabase
          .from('teams')
          .select('owner_id')
          .eq('abbr', winner)
          .eq('active', true)
          .single()
        
        if (!teamData) {
          results.errors.push({ team: winner, error: 'Team not found' })
          continue
        }
        
        // Determine week for the award
        const weekMapping = {
          'WILD_CARD': 19,
          'DIVISIONAL': 20,
          'CONFERENCE': 21,
          'SUPER_BOWL': 22
        }
        
        const loser = game.home === winner ? game.away : game.home
        
        const { error } = await supabase
          .from('awards')
          .insert({
            season,
            week: weekMapping[round],
            type: awardType,
            team_abbr: winner,
            owner_id: teamData.owner_id,
            points: PLAYOFF_AMOUNTS[awardType],
            notes: `${round.replace('_', ' ')} win vs ${loser} (${game.homeScore}-${game.awayScore})`
          })
        
        if (error) {
          results.errors.push({ team: winner, error: error.message })
        } else {
          results.awarded.push({ team: winner, round, amount: PLAYOFF_AMOUNTS[awardType] })
        }
      }
      
      return results
    } catch (error) {
      console.error(`Error awarding ${round} wins:`, error)
      throw error
    }
  }

  // Main function to run all playoff updates
  static async updateAllPlayoffs(season = 2025) {
    const summary = {
      berths: null,
      wildCard: null,
      divisional: null,
      conference: null,
      superBowl: null
    }
    
    try {
      // Always try to award berths (idempotent)
      summary.berths = await this.awardPlayoffBerths(season)
      
      // Try each round (will skip if games not complete)
      summary.wildCard = await this.awardPlayoffRoundWins(season, 'WILD_CARD')
      summary.divisional = await this.awardPlayoffRoundWins(season, 'DIVISIONAL')
      summary.conference = await this.awardPlayoffRoundWins(season, 'CONFERENCE')
      summary.superBowl = await this.awardPlayoffRoundWins(season, 'SUPER_BOWL')
      
      return summary
    } catch (error) {
      console.error('Error in updateAllPlayoffs:', error)
      throw error
    }
  }
}
