import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Scoreboard() {
  const [weeklyScores, setWeeklyScores] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentSeason, setCurrentSeason] = useState(2025)
  const [currentWeek, setCurrentWeek] = useState(2)
  const [selectedWeek, setSelectedWeek] = useState(2)
  const [probabilities, setProbabilities] = useState({})

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

  async function loadProbabilities() {
    try {
      const response = await fetch(`/api/kalshi-probabilities?week=${selectedWeek}&season=${currentSeason}`)
      if (response.ok) {
        const data = await response.json()
        setProbabilities(data.probabilities || {})
      }
    } catch (error) {
      console.error('Error loading probabilities:', error)
      setProbabilities({})
    }
  }

  async function loadWeeklyData() {
    setLoading(true)
    try {
      // Load probabilities first
      await loadProbabilities()
      
      // Load all data in parallel
      const [gamesResponse, awardsResponse, teamsResponse, ownersResponse] = await Promise.all([
        supabase.from('games').select('*').eq('season', currentSeason).eq('week', selectedWeek),
        supabase.from('awards').select('*').eq('season', currentSeason).eq('week', selectedWeek),
        supabase.from('teams').select('abbr, name, owner_id').eq('active', true),
        supabase.from('owners').select('id, name')
      ])

      const { data: gamesData } = gamesResponse
      const { data: awards } = awardsResponse
      const { data: teams } = teamsResponse
      const { data: owners } = ownersResponse

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
            result: getResult(true, game.status, game.home_pts, game.away_pts),
            homeScore: game.home_pts,
            awayScore: game.away_pts
          }
          gamesMap[game.away] = {
            opponent: game.home,
            isHome: false,
            status: game.status,
            result: getResult(false, game.status, game.home_pts, game.away_pts),
            homeScore: game.home_pts,
            awayScore: game.away_pts
          }
        })
      }

      const teamLookup = {}
      const ownerLookup = {}
      
      teams?.forEach(team => {
        teamLookup[team.abbr] = team
      })
      
      owners?.forEach(owner => {
        ownerLookup[owner.id] = owner
      })

      // Process weekly scores by team
      const teamStats = {}

      // Initialize all teams
      teams?.forEach(team => {
        const owner = ownerLookup[team.owner_id]
        if (!owner) return

        teamStats[team.abbr] = {
          abbr: team.abbr,
          name: team.name,
          ownerId: team.owner_id,
          ownerName: owner.name,
          earnings: 0,
          hasWin: false,
          hasOBO: false,
          hasDBO: false,
          hasEOY: false,
          game: gamesMap[team.abbr] || null,
          probability: probabilities[team.abbr] || null
        }
      })

      // Process awards for this week
      awards?.forEach(award => {
        const team = teamStats[award.team_abbr]
        if (!team) return

        const points = award.points || 1
        const earnings = points * 5
        team.earnings += earnings

        switch (award.type) {
          case 'WIN':
          case 'TIE_AWAY':
            team.hasWin = true
            break
          case 'OBO':
            team.hasOBO = true
            break
          case 'DBO':
            team.hasDBO = true
            break
          case 'COACH_FIRED':
            team.hasEOY = true
            break
        }
      })

      // Add wins from completed games
      Object.values(teamStats).forEach(team => {
        if (team.game?.status === 'STATUS_FINAL') {
          const isWin = team.game.result === 'win' || (team.game.result === 'tie' && !team.game.isHome)
          
          if (isWin && !team.hasWin) {
            team.earnings += 5
            team.hasWin = true
          }
        }
      })

      // Group by owner and calculate totals
      const ownerStats = {}
      Object.values(teamStats).forEach(team => {
        if (!ownerStats[team.ownerId]) {
          ownerStats[team.ownerId] = {
            id: team.ownerId,
            name: team.ownerName,
            totalEarnings: 0,
            teams: []
          }
        }
        ownerStats[team.ownerId].totalEarnings += team.earnings
        ownerStats[team.ownerId].teams.push(team)
      })

      // Sort owners by total earnings
      const sortedScores = Object.values(ownerStats)
        .sort((a, b) => b.totalEarnings - a.totalEarnings)

      // Assign ranks
      let currentRank = 1
      sortedScores.forEach((owner, index) => {
        if (index > 0 && owner.totalEarnings < sortedScores[index - 1].totalEarnings) {
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

  const getTeamStatus = (team) => {
    if (!team.game) return { text: 'BYE', className: 'text-gray-500' }
    
    if (team.game.status === 'STATUS_FINAL') {
      const isWin = team.game.result === 'win' || (team.game.result === 'tie' && !team.game.isHome)
      return {
        text: isWin ? '✓' : '✗',
        className: isWin ? 'text-green-600 font-bold' : 'text-red-600 font-bold'
      }
    }
    
    if (team.probability) {
      const winProb = (team.probability.winProbability * 100).toFixed(0)
      return {
        text: `${winProb}%`,
        className: team.probability.winProbability > 0.5 ? 'text-green-600' : 'text-red-600'
      }
    }
    
    return { text: '—', className: 'text-gray-400' }
  }

  const getOBODBOStatus = (team, type) => {
    const hasAward = type === 'OBO' ? team.hasOBO : team.hasDBO
    const emoji = type === 'OBO' ? '🔥' : '🛡️'
    
    if (hasAward) {
      return { text: emoji, className: 'font-bold' }
    }
    
    // Show probabilities or indicators based on game status
    if (team.game?.status === 'STATUS_FINAL') {
      return { text: '✗', className: 'text-gray-400' }
    }
    
    return { text: '—', className: 'text-gray-300' }
  }

  const weekOptions = Array.from({ length: 18 }, (_, i) => i + 1)

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-lg font-semibold text-gray-800">Loading Scoreboard...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow border-b">
        <div className="container mx-auto px-4 py-6">
          <div className="text-center">
            <div className="flex justify-between items-center mb-4">
              <a
                href="/"
                className="text-blue-600 hover:text-blue-800 font-semibold text-sm flex items-center space-x-1"
              >
                <span>←</span>
                <span>Back to League</span>
              </a>
              <h1 className="text-3xl font-bold text-gray-900">
                Payday Football League
              </h1>
              <div className="w-20"></div>
            </div>
            
            <div className="flex justify-center items-center space-x-4 mb-2">
              <label htmlFor="week-select" className="text-lg font-semibold text-gray-700">
                Week:
              </label>
              <select
                id="week-select"
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(parseInt(e.target.value))}
                className="bg-white border border-gray-300 rounded px-3 py-1 text-lg font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {weekOptions.map(week => (
                  <option key={week} value={week}>
                    {week}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="text-lg text-gray-600">
              {currentSeason} Season
            </div>
          </div>
        </div>
      </div>

      {/* Scoreboard Table */}
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rank</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Owner</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Teams</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {weeklyScores.map((owner) => (
                <tr key={owner.id} className={owner.rank === 1 ? 'bg-yellow-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`text-lg font-bold ${owner.rank === 1 ? 'text-yellow-600' : 'text-gray-900'}`}>
                      #{owner.rank}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`text-lg font-semibold ${owner.rank === 1 ? 'text-yellow-800' : 'text-gray-900'}`}>
                      {owner.name}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-xl font-bold text-green-600">
                      ${owner.totalEarnings}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {owner.teams.map(team => {
                        const status = getTeamStatus(team)
                        const oboStatus = getOBODBOStatus(team, 'OBO')
                        const dboStatus = getOBODBOStatus(team, 'DBO')
                        const isComplete = team.game?.status === 'STATUS_FINAL'
                        
                        return (
                          <div key={team.abbr} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                            <div className="flex items-center space-x-2">
                              <img 
                                src={`https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/${team.abbr.toLowerCase()}.png`}
                                alt={`${team.abbr} logo`}
                                className="w-6 h-6 object-contain"
                                onError={(e) => {
                                  e.target.src = `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/nfl.png`
                                }}
                              />
                              <span className={`font-bold text-sm ${isComplete ? 'font-extrabold' : ''}`}>
                                {team.abbr}
                              </span>
                            </div>
                            
                            <div className="flex items-center space-x-2 text-sm">
                              <span className={status.className}>{status.text}</span>
                              <span className={oboStatus.className}>{oboStatus.text}</span>
                              <span className={dboStatus.className}>{dboStatus.text}</span>
                              <span className="font-bold text-green-600">${team.earnings}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {weeklyScores.length === 0 && (
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-gray-700 mb-2">No Scores Yet</h2>
            <p className="text-gray-600">No awards for Week {selectedWeek}</p>
          </div>
        )}
      </div>
    </div>
  )
}
