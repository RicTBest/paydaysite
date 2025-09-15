import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function ScoreboardBromo() {
  const [weeklyScores, setWeeklyScores] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentSeason, setCurrentSeason] = useState(2025)
  const [currentWeek, setCurrentWeek] = useState(2)
  const [selectedWeek, setSelectedWeek] = useState(2)

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

  async function loadWeeklyData() {
    setLoading(true)
    try {
      console.log('Loading bromo data for season:', currentSeason, 'week:', selectedWeek)
      
      // Load all data in parallel
      const [gamesResponse, awardsResponse, teamsResponse, ownersResponse] = await Promise.all([
        supabase.from('games').select('*').eq('season', currentSeason).eq('week', selectedWeek),
        supabase.from('awards').select('*').eq('season', currentSeason).eq('week', selectedWeek),
        supabase.from('teams_bromo').select('abbr, name, owner_id').eq('active', true),
        supabase.from('owners_bromo').select('id, name')
      ])

      const { data: gamesData } = gamesResponse
      const { data: awards } = awardsResponse
      const { data: teams } = teamsResponse
      const { data: owners } = ownersResponse

      console.log('Bromo games data:', gamesData?.length, 'games')
      console.log('Bromo awards data:', awards?.length, 'awards')
      console.log('Bromo teams data:', teams?.length, 'teams')

      // Process games data locally
      const gamesMap = {}
      if (gamesData) {
        gamesData.forEach(game => {
          const getResult = (isHome, status, homeScore, awayScore) => {
            if (status !== 'STATUS_FINAL') return null
            const myScore = isHome ? homeScore : awayScore
            const theirScore = isHome ? awayScore : homeScore
            if (myScore > theirScore) return 'win'
            if (myScore < theirScore) return 'loss'
            return 'tie'
          }

          gamesMap[game.home] = {
            opponent: game.away,
            isHome: true,
            status: game.status,
            result: getResult(true, game.status, game.home_pts, game.away_pts)
          }
          gamesMap[game.away] = {
            opponent: game.home,
            isHome: false,
            status: game.status,
            result: getResult(false, game.status, game.home_pts, game.away_pts)
          }
        })
      }

      console.log('Processed bromo games:', Object.keys(gamesMap).length)

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

      // Initialize all bromo owners with their teams
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

        ownerWeeklyStats[team.owner_id].teams.push({
          abbr: team.abbr,
          name: team.name,
          earnings: 0,
          awards: []
        })
      })

      console.log('Initialized bromo owner stats for', Object.keys(ownerWeeklyStats).length, 'owners')

      // Process awards for this week - map to bromo owners by team abbreviation
      awards?.forEach(award => {
        // Look up team in bromo league by abbreviation
        const team = teamLookup[award.team_abbr]
        if (!team) return // Skip if team doesn't exist in bromo league

        // Use the bromo team's owner_id (not the award's owner_id)
        const ownerId = team.owner_id
        const owner = ownerLookup[ownerId]
        if (!owner || !ownerWeeklyStats[ownerId]) return

        const points = award.points || 1
        const earnings = points * 5

        ownerWeeklyStats[ownerId].weeklyEarnings += earnings

        let teamEntry = ownerWeeklyStats[ownerId].teams.find(t => t.abbr === award.team_abbr)
        if (teamEntry) {
          teamEntry.earnings += earnings
          teamEntry.awards.push({
            type: award.type,
            points: points,
            earnings: earnings
          })
        }

        console.log(`Added bromo award: ${award.team_abbr} ${award.type} $${earnings} to ${owner.name}`)
      })

      // Add wins from completed games using the local gamesMap
      Object.entries(gamesMap).forEach(([teamAbbr, game]) => {
        if (game.status === 'STATUS_FINAL') {
          const team = teamLookup[teamAbbr]
          if (!team) return

          const isWin = game.result === 'win' || (game.result === 'tie' && !game.isHome)
          
          if (isWin) {
            // Check if we already have a WIN award for this team this week
            const existingWinAward = awards?.find(award => 
              award.team_abbr === teamAbbr && 
              (award.type === 'WIN' || award.type === 'TIE_AWAY')
            )

            if (!existingWinAward) {
              const ownerId = team.owner_id // This is already the bromo owner_id
              const owner = ownerLookup[ownerId]
              if (!owner || !ownerWeeklyStats[ownerId]) return

              const earnings = 5

              ownerWeeklyStats[ownerId].weeklyEarnings += earnings

              let teamEntry = ownerWeeklyStats[ownerId].teams.find(t => t.abbr === teamAbbr)
              if (teamEntry) {
                teamEntry.earnings += earnings
                teamEntry.awards.push({
                  type: game.result === 'tie' ? 'TIE_AWAY' : 'WIN',
                  points: 1,
                  earnings: earnings
                })
              }

              console.log(`Added bromo game win: ${teamAbbr} earned $${earnings} for ${owner.name}`)
            }
          }
        }
      })

      // Sort teams within each owner by earnings
      Object.values(ownerWeeklyStats).forEach(owner => {
        owner.teams.sort((a, b) => b.earnings - a.earnings)
      })

      // Sort owners by weekly earnings and assign ranks
      const sortedScores = Object.values(ownerWeeklyStats)
        .sort((a, b) => b.weeklyEarnings - a.weeklyEarnings)

      let currentRank = 1
      sortedScores.forEach((owner, index) => {
        if (index > 0 && owner.weeklyEarnings < sortedScores[index - 1].weeklyEarnings) {
          currentRank = index + 1
        }
        owner.rank = currentRank
      })

      console.log('Final bromo sorted scores:', sortedScores.map(o => `${o.name}: $${o.weeklyEarnings}`))

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
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 flex justify-center items-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <div className="text-lg font-semibold text-purple-800">Loading Bromo Scoreboard...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-lg border-b-4 border-purple-500">
        <div className="container mx-auto px-4 py-4">
          <div className="text-center">
            <div className="flex justify-between items-center mb-3">
              <a
                href="/bromo"
                className="text-purple-600 hover:text-purple-800 font-bold text-sm flex items-center space-x-1"
              >
                <span>←</span>
                <span>Back to Bromo League</span>
              </a>
              <h1 className="text-2xl font-black text-purple-800">
                📊 BROMO SCOREBOARD
              </h1>
              <div className="w-24"></div> {/* Spacer for centering */}
            </div>
            
            {/* Week Selector */}
            <div className="flex justify-center items-center space-x-2 mb-2">
              <label htmlFor="week-select" className="text-sm font-bold text-purple-700">
                Week:
              </label>
              <select
                id="week-select"
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(parseInt(e.target.value))}
                className="bg-purple-100 border border-purple-300 rounded-lg px-3 py-1 text-sm font-bold text-purple-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                {weekOptions.map(week => (
                  <option key={week} value={week}>
                    Week {week}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="text-sm text-purple-600 font-medium">
              {currentSeason} Season
            </div>
          </div>
        </div>
      </div>

      {/* Scoreboard */}
      <div className="container mx-auto px-4 py-6 space-y-4">
        {weeklyScores.map((owner) => (
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
