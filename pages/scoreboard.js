import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Scoreboard() {
  const [weeklyScores, setWeeklyScores] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentSeason, setCurrentSeason] = useState(2025)
  const [currentWeek, setCurrentWeek] = useState(2)
  const [selectedWeek, setSelectedWeek] = useState(2)
  const [games, setGames] = useState({})

  useEffect(() => {
    loadCurrentWeek()
  }, [])

  useEffect(() => {
    if (currentSeason && selectedWeek) {
      loadWeeklyData()
    }
  }, [currentSeason, selectedWeek])

  async function loadCurrentWeek() {
    try {
      const response = await fetch('/api/current-week')
      if (response.ok) {
        const data = await response.json()
        setCurrentSeason(data.season)
        setCurrentWeek(data.week)
        setSelectedWeek(data.week)
      }
    } catch (error) {
      console.error('Error getting current week:', error)
      loadWeeklyData()
    }
  }

  async function loadGames() {
    try {
      const { data: gamesData, error } = await supabase
        .from('games')
        .select('*')
        .eq('season', currentSeason)
        .eq('week', selectedWeek)

      if (!error && gamesData) {
        const gameMap = {}
        gamesData.forEach(game => {
          const getResult = (isHome, status, homeScore, awayScore) => {
            if (status !== 'STATUS_FINAL') return null
            const myScore = isHome ? homeScore : awayScore
            const theirScore = isHome ? awayScore : homeScore
            if (myScore > theirScore) return 'win'
            if (myScore < theirScore) return 'loss'
            return 'tie'
          }

          gameMap[game.home] = {
            opponent: game.away,
            isHome: true,
            status: game.status,
            result: getResult(true, game.status, game.home_pts, game.away_pts)
          }
          gameMap[game.away] = {
            opponent: game.home,
            isHome: false,
            status: game.status,
            result: getResult(false, game.status, game.home_pts, game.away_pts)
          }
        })
        setGames(gameMap)
      }
    } catch (error) {
      console.error('Error loading games:', error)
    }
  }

  async function loadWeeklyData() {
    setLoading(true)
    try {
      // Load games for the week first
      await loadGames()

      // Load awards for the selected week
      const { data: awards } = await supabase
        .from('awards')
        .select('*')
        .eq('season', currentSeason)
        .eq('week', selectedWeek)

      // Load teams and owners
      const { data: teams } = await supabase
        .from('teams')
        .select('abbr, name, owner_id')
        .eq('active', true)

      const { data: owners } = await supabase
        .from('owners')
        .select('id, name')

      const teamLookup = {}
      const ownerLookup = {}
      
      teams?.forEach(team => {
        teamLookup[team.abbr] = team
      })
      
      owners?.forEach(owner => {
        ownerLookup[owner.id] = owner
      })

      // Process weekly scores
      const ownerWeeklyStats = {}

      // Initialize all owners
      owners?.forEach(owner => {
        ownerWeeklyStats[owner.id] = {
          id: owner.id,
          name: owner.name,
          weeklyEarnings: 0,
          teams: []
        }
      })

      // Process awards for this week
      awards?.forEach(award => {
        const team = teamLookup[award.team_abbr]
        if (!team) return

        const ownerId = award.owner_id || team.owner_id
        const owner = ownerLookup[ownerId]
        if (!owner) return

        const points = award.points || 1
        const earnings = points * 5

        if (!ownerWeeklyStats[ownerId]) {
          ownerWeeklyStats[ownerId] = {
            id: ownerId,
            name: owner.name,
            weeklyEarnings: 0,
            teams: []
          }
        }

        ownerWeeklyStats[ownerId].weeklyEarnings += earnings

        // Find or create team entry
        let teamEntry = ownerWeeklyStats[ownerId].teams.find(t => t.abbr === award.team_abbr)
        if (!teamEntry) {
          teamEntry = {
            abbr: award.team_abbr,
            name: team.name,
            earnings: 0,
            awards: []
          }
          ownerWeeklyStats[ownerId].teams.push(teamEntry)
        }

        teamEntry.earnings += earnings
        teamEntry.awards.push({
          type: award.type,
          points: points,
          earnings: earnings
        })
      })

      // Add wins from completed games that aren't in awards table yet
      Object.entries(games).forEach(([teamAbbr, game]) => {
        if (game.status === 'STATUS_FINAL') {
          const team = teamLookup[teamAbbr]
          if (!team) return

          // Check if this team won
          const isWin = game.result === 'win' || (game.result === 'tie' && !game.isHome)
          
          if (isWin) {
            // Check if we already have a WIN award for this team this week
            const existingWinAward = awards?.find(award => 
              award.team_abbr === teamAbbr && 
              (award.type === 'WIN' || award.type === 'TIE_AWAY')
            )

            if (!existingWinAward) {
              // Add the win to our display
              const ownerId = team.owner_id
              const owner = ownerLookup[ownerId]
              if (!owner) return

              const earnings = 5 // $5 for a win

              if (!ownerWeeklyStats[ownerId]) {
                ownerWeeklyStats[ownerId] = {
                  id: ownerId,
                  name: owner.name,
                  weeklyEarnings: 0,
                  teams: []
                }
              }

              ownerWeeklyStats[ownerId].weeklyEarnings += earnings

              let teamEntry = ownerWeeklyStats[ownerId].teams.find(t => t.abbr === teamAbbr)
              if (!teamEntry) {
                teamEntry = {
                  abbr: teamAbbr,
                  name: team.name,
                  earnings: 0,
                  awards: []
                }
                ownerWeeklyStats[ownerId].teams.push(teamEntry)
              }

              teamEntry.earnings += earnings
              teamEntry.awards.push({
                type: game.result === 'tie' ? 'TIE_AWAY' : 'WIN',
                points: 1,
                earnings: earnings
              })
            }
          }
        }
      })

      // Add teams with no awards but ensure they show up
      teams?.forEach(team => {
        const owner = ownerLookup[team.owner_id]
        if (!owner) return

        if (!ownerWeeklyStats[team.owner_id]) {
          ownerWeeklyStats[team.owner_id] = {
            id: team.owner_id,
            name: owner.name,
            weeklyEarnings: 0,
            teams: []
          }
        }

        const hasTeamEntry = ownerWeeklyStats[team.owner_id].teams.find(t => t.abbr === team.abbr)
        if (!hasTeamEntry) {
          ownerWeeklyStats[team.owner_id].teams.push({
            abbr: team.abbr,
            name: team.name,
            earnings: 0,
            awards: []
          })
        }
      })

      // Sort owners by weekly earnings, then teams by earnings
      // Handle ties properly in ranking
      const sortedScores = Object.values(ownerWeeklyStats)
        .sort((a, b) => b.weeklyEarnings - a.weeklyEarnings)
        .map(owner => ({
          ...owner,
          teams: owner.teams.sort((a, b) => b.earnings - a.earnings)
        }))

      // Assign ranks properly handling ties
      let currentRank = 1
      sortedScores.forEach((owner, index) => {
        if (index > 0 && owner.weeklyEarnings < sortedScores[index - 1].weeklyEarnings) {
          currentRank = index + 1
        }
        owner.rank = currentRank
      })

      setWeeklyScores(sortedScores)
      setLoading(false)
    } catch (error) {
      console.error('Error loading weekly data:', error)
      setLoading(false)
    }
  }

  const getAwardEmoji = (type) => {
    switch (type) {
      case 'WIN': return '🏆'
      case 'TIE_AWAY': return '🏆'
      case 'OBO': return '🔥'
      case 'DBO': return '🛡️'
      case 'COACH_FIRED': return '🏁'
      default: return '⭐'
    }
  }

  const getAwardLabel = (type) => {
    switch (type) {
      case 'WIN': return 'WIN'
      case 'TIE_AWAY': return 'TIE'
      case 'OBO': return 'OBO'
      case 'DBO': return 'DBO'
      case 'COACH_FIRED': return 'EOY'
      default: return type
    }
  }

  const weekOptions = Array.from({ length: 18 }, (_, i) => i + 1)

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex justify-center items-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-lg font-semibold text-blue-800">Loading Scoreboard...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-lg border-b-4 border-blue-500">
        <div className="container mx-auto px-4 py-4">
          <div className="text-center">
            <h1 className="text-2xl font-black text-blue-800 mb-3">
              📊 SCOREBOARD
            </h1>
            
            {/* Week Selector */}
            <div className="flex justify-center items-center space-x-2 mb-2">
              <label htmlFor="week-select" className="text-sm font-bold text-blue-700">
                Week:
              </label>
              <select
                id="week-select"
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(parseInt(e.target.value))}
                className="bg-blue-100 border border-blue-300 rounded-lg px-3 py-1 text-sm font-bold text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {weekOptions.map(week => (
                  <option key={week} value={week}>
                    Week {week}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="text-sm text-blue-600 font-medium">
              {currentSeason} Season
            </div>
          </div>
        </div>
      </div>

      {/* Scoreboard */}
      <div className="container mx-auto px-4 py-6 space-y-4">
        {weeklyScores.map((owner, index) => (
          <div
            key={owner.id}
            className={`bg-white rounded-xl shadow-lg border-2 overflow-hidden ${
              owner.rank === 1 ? 'border-yellow-400 ring-2 ring-yellow-200' : 'border-gray-200'
            }`}
          >
            {/* Owner Header */}
            <div className={`px-4 py-3 ${
              owner.rank === 1 ? 'bg-gradient-to-r from-yellow-100 to-amber-100' : 'bg-gray-50'
            }`}>
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-3">
                  <div className={`text-lg font-black px-2 py-1 rounded-full ${
                    owner.rank === 1 ? 'bg-yellow-400 text-yellow-900' : 'bg-gray-400 text-gray-900'
                  }`}>
                    #{owner.rank}
                  </div>
                  <h2 className="text-lg font-black text-gray-800">{owner.name}</h2>
                </div>
                <div className="text-xl font-black text-green-600">
                  ${owner.weeklyEarnings}
                </div>
              </div>
            </div>

            {/* Teams */}
            <div className="p-4">
              <div className="space-y-3">
                {owner.teams.map(team => {
                  const game = games[team.abbr]
                  const isGameComplete = game?.status === 'STATUS_FINAL'
                  
                  return (
                    <div key={team.abbr} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
                      <div className="flex items-center space-x-3 flex-1">
                        <img 
                          src={`https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/${team.abbr.toLowerCase()}.png`}
                          alt={`${team.abbr} logo`}
                          className="w-8 h-8 object-contain"
                          onError={(e) => {
                            e.target.src = `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/nfl.png`
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-gray-800">{team.abbr}</div>
                          {game && (
                            <div className="text-xs text-gray-500">
                              {game.isHome ? 'vs' : '@'} {game.opponent}
                              {isGameComplete && (
                                <span className={`ml-2 ${
                                  game.result === 'win' ? 'text-green-600' : 
                                  game.result === 'tie' && !game.isHome ? 'text-green-600' : 'text-red-600'
                                }`}>
                                  {game.result === 'win' ? '✅' : 
                                   game.result === 'tie' && !game.isHome ? '✅' : '❌'}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {team.awards.map((award, awardIndex) => (
                          <div key={awardIndex} className="flex items-center space-x-1">
                            <span className="text-sm">{getAwardEmoji(award.type)}</span>
                            <span className="text-xs font-bold text-gray-600">
                              {getAwardLabel(award.type)}
                            </span>
                          </div>
                        ))}
                        <div className="text-right ml-3">
                          <div className="font-black text-green-600">${team.earnings}</div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ))}

        {weeklyScores.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📊</div>
            <h2 className="text-2xl font-black text-gray-700 mb-2">No Scores Yet</h2>
            <p className="text-gray-600">No awards for Week {selectedWeek}</p>
          </div>
        )}
      </div>
    </div>
  )
}
