import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Scoreboard() {
  const [ownerRankings, setOwnerRankings] = useState([])
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentSeason, setCurrentSeason] = useState(2025)
  const [currentWeek, setCurrentWeek] = useState(2)
  const [selectedWeek, setSelectedWeek] = useState(2)
  const [probabilities, setProbabilities] = useState({})

  useEffect(() => {
    loadCurrentWeek()
    
    // Set up auto-refresh every 1 minute
    const interval = setInterval(() => {
      console.log('Auto-refreshing scoreboard data...')
      loadWeeklyData()
    }, 60 * 1000) // 1 minute

    return () => {
      clearInterval(interval)
    }
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
      console.log('Loading data for season:', currentSeason, 'week:', selectedWeek)
      
      // Load probabilities FIRST and get the return value
      const freshProbabilities = await loadProbabilities()
      console.log('Fresh probabilities loaded:', Object.keys(freshProbabilities).length, 'teams')
      
      // Load all other data in parallel
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

      console.log('Games data:', gamesData?.length, 'games')
      console.log('Awards data:', awards?.length, 'awards')
      console.log('Teams data:', teams?.length, 'teams')

      const teamLookup = {}
      const ownerLookup = {}
      
      teams?.forEach(team => {
        teamLookup[team.abbr] = team
      })
      
      owners?.forEach(owner => {
        ownerLookup[owner.id] = owner
      })

      // Process team stats
      const teamStats = {}
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
          hasDBO: false
        }
      })

      // Process awards
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
        }
      })

      // Process games and add missing wins
      const processedGames = []
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

          const homeResult = getResult(true, game.status, game.home_pts, game.away_pts)
          const awayResult = getResult(false, game.status, game.home_pts, game.away_pts)

          // Add missing wins
          if (game.status === 'STATUS_FINAL') {
            const homeTeam = teamStats[game.home]
            const awayTeam = teamStats[game.away]
            
            const homeIsWin = homeResult === 'win'
            const awayIsWin = awayResult === 'win' || (awayResult === 'tie')
            
            if (homeTeam && homeIsWin && !homeTeam.hasWin) {
              homeTeam.earnings += 5
              homeTeam.hasWin = true
            }
            if (awayTeam && awayIsWin && !awayTeam.hasWin) {
              awayTeam.earnings += 5
              awayTeam.hasWin = true
            }
          }

          const homeTeam = teamStats[game.home]
          const awayTeam = teamStats[game.away]

          // Use the fresh probabilities directly
          const homeProb = freshProbabilities[game.home]
          const awayProb = freshProbabilities[game.away]
          
          processedGames.push({
            id: `${game.home}-${game.away}`,
            kickoff: game.kickoff,
            status: game.status,
            homeTeam: game.home,
            awayTeam: game.away,
            homeScore: game.home_pts,
            awayScore: game.away_pts,
            homeResult,
            awayResult,
            homeOwner: homeTeam?.ownerName || 'Unknown',
            awayOwner: awayTeam?.ownerName || 'Unknown',
            homeEarnings: homeTeam?.earnings || 0,
            awayEarnings: awayTeam?.earnings || 0,
            homeWin: homeTeam?.hasWin || false,
            awayWin: awayTeam?.hasWin || false,
            homeOBO: homeTeam?.hasOBO || false,
            awayOBO: awayTeam?.hasOBO || false,
            homeDBO: homeTeam?.hasDBO || false,
            awayDBO: awayTeam?.hasDBO || false,
            homeProb: homeProb,
            awayProb: awayProb
          })
          
          console.log(`Game ${game.home} vs ${game.away}:`, {
            homeProb: homeProb ? `${(homeProb.winProbability * 100).toFixed(0)}%` : 'none',
            awayProb: awayProb ? `${(awayProb.winProbability * 100).toFixed(0)}%` : 'none',
            status: game.status
          })
        })
      }

      // Sort games by kickoff time
      processedGames.sort((a, b) => {
        if (!a.kickoff && !b.kickoff) return 0
        if (!a.kickoff) return 1
        if (!b.kickoff) return -1
        return new Date(a.kickoff) - new Date(b.kickoff)
      })

      // Calculate owner totals
      const ownerTotals = {}
      Object.values(teamStats).forEach(team => {
        if (!ownerTotals[team.ownerId]) {
          ownerTotals[team.ownerId] = {
            id: team.ownerId,
            name: team.ownerName,
            total: 0
          }
        }
        ownerTotals[team.ownerId].total += team.earnings
      })

      // Sort owners by earnings
      const sortedOwners = Object.values(ownerTotals)
        .sort((a, b) => b.total - a.total)

      // Add ranks
      let currentRank = 1
      sortedOwners.forEach((owner, index) => {
        if (index > 0 && owner.total < sortedOwners[index - 1].total) {
          currentRank = index + 1
        }
        owner.rank = currentRank
      })

      setOwnerRankings(sortedOwners)
      setGames(processedGames)
      setLoading(false)
      
      console.log('Final processed games with probabilities:', processedGames.length)
      console.log('Sample game probs:', processedGames.slice(0, 2).map(g => ({
        teams: `${g.awayTeam}@${g.homeTeam}`,
        homeProb: g.homeProb,
        awayProb: g.awayProb
      })))
    } catch (error) {
      console.error('Error loading weekly data:', error)
      setLoading(false)
    }
  }

  const formatGameTime = (kickoff) => {
    if (!kickoff) return 'TBD'
    try {
      const date = new Date(kickoff)
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const day = days[date.getDay()]
      const time = date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
      return `${day} ${time}`
    } catch (e) {
      return 'TBD'
    }
  }

  const getGameStatusDisplay = (game, isHome) => {
    const result = isHome ? game.homeResult : game.awayResult
    const prob = isHome ? game.homeProb : game.awayProb

    // Final games - show check or X emoji based on game result
    if (game.status === 'STATUS_FINAL') {
      if (result === 'win' || (result === 'tie' && !isHome)) {
        return <span className="text-green-600">✅</span>
      } else {
        return <span className="text-red-600">❌</span>
      }
    }

    // Live probability display for ongoing and scheduled games (like index.js)
    if (prob && prob.confidence !== 'final') {
      const winProb = prob.winProbability
      const percentage = (winProb * 100).toFixed(0)
      
      // Use same logic as your index.js showLiveProbability
      const showLiveProbability = prob.confidence !== 'final' && game.status !== 'STATUS_FINAL'
      
      if (showLiveProbability) {
        return (
          <div className={`text-xs px-2 py-1 rounded-full font-bold shadow ${
            winProb > 0.6 ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white' :
            winProb > 0.4 ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white' :
            'bg-gradient-to-r from-red-500 to-red-600 text-white'
          }`}>
            {percentage}%
          </div>
        )
      }
    }

    // Fallback for games without probability data
    return <span className="text-gray-400 text-xs">—</span>
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
                Week {selectedWeek} Scoreboard
              </h1>
              <div className="w-20"></div>
            </div>
            
            <div className="flex justify-center items-center space-x-4">
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
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Owner Rankings */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Rankings</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {ownerRankings.map((owner) => (
              <div
                key={owner.id}
                className={`p-4 rounded-lg border-2 ${
                  owner.rank === 1 
                    ? 'bg-yellow-50 border-yellow-400' 
                    : 'bg-white border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className={`text-lg font-bold ${
                      owner.rank === 1 ? 'text-yellow-800' : 'text-gray-900'
                    }`}>
                      #{owner.rank} {owner.name}
                    </div>
                  </div>
                  <div className="text-xl font-bold text-green-600">
                    ${owner.total}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Games */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Games</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {games.map((game) => (
              <div key={game.id} className="bg-white rounded-lg border shadow p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-gray-700">
                    {formatGameTime(game.kickoff)}
                  </div>
                  <div className="text-xs font-bold text-blue-600">
                    {game.status === 'STATUS_FINAL' ? 'Final' :
                     game.status === 'STATUS_IN_PROGRESS' ? 'In Progress' : 
                     'Not Started'}
                  </div>
                </div>

                <div className="space-y-2">
                  {/* Away Team */}
                  <div className="flex items-center justify-between py-1">
                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                      <img 
                        src={`https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/${game.awayTeam.toLowerCase()}.png`}
                        alt={`${game.awayTeam} logo`}
                        className="w-5 h-5 object-contain flex-shrink-0"
                        onError={(e) => {
                          e.target.src = `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/nfl.png`
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-xs text-gray-900 truncate">@ {game.awayTeam}</div>
                        <div className="text-xs text-gray-600 truncate">{game.awayOwner}</div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <div className="text-right">
                        <div className="font-bold text-green-600 text-xs">${game.awayEarnings}</div>
                        <div className="flex items-center justify-end space-x-1 text-xs">
                          {getGameStatusDisplay(game, false)}
                          {game.awayOBO && <span>🔥</span>}
                          {game.awayDBO && <span>🛡️</span>}
                        </div>
                      </div>
                      <div className="text-sm font-bold text-gray-900 w-5 text-center">
                        {game.status === 'STATUS_FINAL' || game.status === 'STATUS_IN_PROGRESS' 
                          ? game.awayScore 
                          : '0'}
                      </div>
                    </div>
                  </div>

                  {/* Home Team */}
                  <div className="flex items-center justify-between py-1">
                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                      <img 
                        src={`https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/${game.homeTeam.toLowerCase()}.png`}
                        alt={`${game.homeTeam} logo`}
                        className="w-5 h-5 object-contain flex-shrink-0"
                        onError={(e) => {
                          e.target.src = `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/nfl.png`
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-xs text-gray-900 truncate">{game.homeTeam}</div>
                        <div className="text-xs text-gray-600 truncate">{game.homeOwner}</div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <div className="text-right">
                        <div className="font-bold text-green-600 text-xs">${game.homeEarnings}</div>
                        <div className="flex items-center justify-end space-x-1 text-xs">
                          {getGameStatusDisplay(game, true)}
                          {game.homeOBO && <span>🔥</span>}
                          {game.homeDBO && <span>🛡️</span>}
                        </div>
                      </div>
                      <div className="text-sm font-bold text-gray-900 w-5 text-center">
                        {game.status === 'STATUS_FINAL' || game.status === 'STATUS_IN_PROGRESS' 
                          ? game.homeScore 
                          : '0'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {games.length === 0 && (
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-gray-700 mb-2">No Games Yet</h2>
            <p className="text-gray-600">No games scheduled for Week {selectedWeek}</p>
          </div>
        )}
      </div>
    </div>
  )
}
