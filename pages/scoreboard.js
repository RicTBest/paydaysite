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
  const [gameState, setGameState] = useState({})
  const [weekFinished, setWeekFinished] = useState(false)

  useEffect(() => {
    loadCurrentWeek()
    
    const interval = setInterval(() => {
      console.log('Auto-refreshing scoreboard data...')
      if (currentSeason && selectedWeek) {
        loadData()
      }
    }, 60 * 1000)

    return () => {
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (currentSeason && selectedWeek) {
      loadData()
    }
  }, [currentSeason, selectedWeek])

  async function loadCurrentWeek() {
    console.log('Loading current week...')
    try {
      const response = await fetch('/api/current-week')
      if (response.ok) {
        const data = await response.json()
        console.log('Current week API response:', data)
        setCurrentSeason(data.season)
        setCurrentWeek(data.week)
        
        // Only set selectedWeek if it's still the default (not manually changed)
        if (selectedWeek === currentWeek || selectedWeek === 2) {
          setSelectedWeek(data.week)
        }
        
        setTimeout(() => {
          loadData()
        }, 100)
      }
    } catch (error) {
      console.error('Error getting current week:', error)
      loadData()
    }
  }

  async function loadGames() {
    console.log('=== LOADING GAMES ===')
    console.log('Loading games for season:', currentSeason, 'week:', selectedWeek)
    
    try {
      const { data: gamesData, error: gamesError } = await supabase
        .from('games')
        .select('*')
        .eq('season', currentSeason)
        .eq('week', selectedWeek)

      console.log('Games query result - Error:', gamesError, 'Count:', gamesData?.length)

      if (!gamesError && gamesData && gamesData.length > 0) {
        const gameMap = {}
        
        gamesData.forEach((game, index) => {
          console.log(`Game ${index + 1}: ${game.home} ${game.home_pts} - ${game.away} ${game.away_pts} (${game.status})`)
          
          const getResult = (isHome, status, homeScore, awayScore) => {
            if (status !== 'STATUS_FINAL') return null
            const myScore = isHome ? homeScore : awayScore
            const theirScore = isHome ? awayScore : homeScore
            return myScore > theirScore ? 'win' : myScore < theirScore ? 'loss' : 'tie'
          }
          
          const homeResult = getResult(true, game.status, game.home_pts, game.away_pts)
          const awayResult = getResult(false, game.status, game.home_pts, game.away_pts)
          
          gameMap[game.home] = {
            opponent: game.away,
            isHome: true,
            status: game.status,
            result: homeResult
          }
          
          gameMap[game.away] = {
            opponent: game.home,
            isHome: false,
            status: game.status,
            result: awayResult
          }
        })
        
        console.log('Game results processed:', Object.keys(gameMap).length, 'teams')
        setGameState(gameMap)
        return gameMap
      } else {
        console.log('No games found')
        setGameState({})
        return {}
      }
    } catch (error) {
      console.error('Error loading games:', error)
      return {}
    }
  }

  async function loadProbabilities(teams, currentGameState = {}) {
    try {
      const response = await fetch(`/api/kalshi-probabilities?week=${selectedWeek}&season=${currentSeason}`)
      if (response.ok) {
        const data = await response.json()
        console.log(`Probabilities loaded for Week ${selectedWeek}:`, Object.keys(data.probabilities || {}).length, 'teams')
        
        const adjustedProbabilities = { ...data.probabilities }
        
        teams?.forEach(team => {
          if (!currentGameState[team.abbr] && !adjustedProbabilities[team.abbr]) {
            adjustedProbabilities[team.abbr] = { winProbability: 0, confidence: 'bye_week' }
          }
        })
        
        setProbabilities(adjustedProbabilities || {})
        return adjustedProbabilities
      }
    } catch (error) {
      console.error('Error loading probabilities:', error)
      return {}
    }
  }

  function checkWeekFinished(gamesData, awards) {
    console.log('=== CHECKING IF WEEK IS FINISHED ===')
    
    if (!gamesData || gamesData.length === 0) {
      console.log('No games found, week not finished')
      return false
    }

    // Check if all games are final
    const allGamesFinal = gamesData.every(game => game.status === 'STATUS_FINAL')
    console.log('All games final:', allGamesFinal)

    if (!allGamesFinal) {
      console.log('Not all games are final, week not finished')
      return false
    }

    // Check if there's at least one OBO and one DBO award
    const hasOBO = awards.some(award => award.type === 'OBO')
    const hasDBO = awards.some(award => award.type === 'DBO')
    
    console.log('Has OBO award:', hasOBO)
    console.log('Has DBO award:', hasDBO)

    const weekFinished = allGamesFinal && hasOBO && hasDBO
    console.log('Week finished:', weekFinished)
    
    return weekFinished
  }

  async function loadData() {
    console.log('=== STARTING SCOREBOARD DATA LOAD ===')
    console.log('Season:', currentSeason, 'Selected Week:', selectedWeek)
    
    try {
      setLoading(true)
      
      // 1. Load base data
      const [teamsResult, ownersResult] = await Promise.all([
        supabase.from('teams').select('abbr, name, owner_id').eq('active', true),
        supabase.from('owners').select('id, name')
      ])
      
      const teams = teamsResult.data || []
      const owners = ownersResult.data || []
      
      console.log('Loaded base data:', teams.length, 'teams,', owners.length, 'owners')
      
      // 2. Create lookup maps
      const teamLookup = {}
      const ownerLookup = {}
      
      teams.forEach(team => {
        teamLookup[team.abbr] = team
      })
      
      owners.forEach(owner => {
        ownerLookup[owner.id] = owner
      })
      
      // 3. Load games and probabilities
      const currentGameState = await loadGames()
      const currentProbabilities = await loadProbabilities(teams, currentGameState)
      
      // 4. Load awards for the selected week
      console.log('=== LOADING AWARDS ===')
      console.log('Querying awards for season:', currentSeason, 'week:', selectedWeek)
      
      let awards = []
      try {
        const { data: awardsData, error } = await supabase
          .from('awards')
          .select('*')
          .eq('season', currentSeason)
          .eq('week', selectedWeek)

        console.log('Awards query result:')
        console.log('  Error:', error)
        console.log('  Raw data:', awardsData)
        console.log('  Count:', awardsData?.length || 0)
        
        if (error) {
          console.warn('Awards query failed:', error)
          awards = []
        } else {
          awards = awardsData || []
          console.log('Successfully loaded', awards.length, 'awards')
          
          // Log each award for debugging
          awards.forEach((award, index) => {
            console.log(`Award ${index + 1}:`, {
              type: award.type,
              team: award.team_abbr,
              points: award.points,
              week: award.week,
              season: award.season
            })
          })
        }
      } catch (err) {
        console.error('Awards query exception:', err)
        awards = []
      }

      // 5. Get games data again for week finished check
      const { data: gamesData } = await supabase
        .from('games')
        .select('*')
        .eq('season', currentSeason)
        .eq('week', selectedWeek)

      // 6. Check if week is finished
      const isWeekFinished = checkWeekFinished(gamesData, awards)
      setWeekFinished(isWeekFinished)
      
      // 7. Initialize team stats
      console.log('=== PROCESSING TEAM STATS ===')
      const teamStats = {}
      
      teams.forEach(team => {
        const owner = ownerLookup[team.owner_id]
        if (!owner) {
          console.warn(`No owner found for team ${team.abbr}`)
          return
        }

        teamStats[team.abbr] = {
          abbr: team.abbr,
          name: team.name,
          ownerId: team.owner_id,
          ownerName: owner.name,
          earnings: 0,
          hasWin: false,
          oboCount: 0,
          dboCount: 0
        }
      })
      
      console.log('Initialized stats for', Object.keys(teamStats).length, 'teams')
      
      // 8. Process awards
      console.log('=== PROCESSING AWARDS ===')
      awards.forEach(award => {
        const team = teamStats[award.team_abbr]
        if (!team) {
          console.warn(`Award for unknown team: ${award.team_abbr}`)
          return
        }

        const points = award.points || 1
        const earnings = points * 5
        
        console.log(`Processing award: ${award.type} for ${award.team_abbr} = ${earnings} earnings`)
        
        team.earnings += earnings

        switch (award.type) {
          case 'WIN':
          case 'TIE_AWAY':
            team.hasWin = true
            console.log(`  ${award.team_abbr} marked as having win`)
            break
          case 'OBO':
            team.oboCount += 1
            console.log(`  ${award.team_abbr} OBO count: ${team.oboCount}`)
            break
          case 'DBO':
            team.dboCount += 1
            console.log(`  ${award.team_abbr} DBO count: ${team.dboCount}`)
            break
          default:
            console.log(`  Unknown award type: ${award.type}`)
        }
      })
      
      // 9. Add wins from completed games
      console.log('=== ADDING GAME WINS ===')
      Object.entries(currentGameState).forEach(([teamAbbr, game]) => {
        if (game.status === 'STATUS_FINAL') {
          const team = teamStats[teamAbbr]
          if (!team) return

          const isWin = game.result === 'win' || (game.result === 'tie' && !game.isHome)
          
          if (isWin && !team.hasWin) {
            team.earnings += 5
            team.hasWin = true
            console.log(`Added game win for ${teamAbbr}: +$5`)
          }
        }
      })
      
      // 10. Build games array for display
      console.log('=== BUILDING GAMES DISPLAY ===')
      const processedGames = []
      if (gamesData) {
        gamesData.forEach(game => {
          const homeTeam = teamStats[game.home]
          const awayTeam = teamStats[game.away]
          
          const homeGameState = currentGameState[game.home]
          const awayGameState = currentGameState[game.away]
          const homeProb = currentProbabilities[game.home] || null
          const awayProb = currentProbabilities[game.away] || null

          processedGames.push({
            id: `${game.home}-${game.away}`,
            kickoff: game.kickoff,
            status: game.status,
            homeTeam: game.home,
            awayTeam: game.away,
            homeScore: game.home_pts,
            awayScore: game.away_pts,
            homeResult: homeGameState?.result,
            awayResult: awayGameState?.result,
            homeOwner: homeTeam?.ownerName || 'Unknown',
            awayOwner: awayTeam?.ownerName || 'Unknown',
            homeEarnings: homeTeam?.earnings || 0,
            awayEarnings: awayTeam?.earnings || 0,
            homeWin: homeTeam?.hasWin || false,
            awayWin: awayTeam?.hasWin || false,
            homeOBO: (homeTeam?.oboCount || 0) > 0,
            awayOBO: (awayTeam?.oboCount || 0) > 0,
            homeDBO: (homeTeam?.dboCount || 0) > 0,
            awayDBO: (awayTeam?.dboCount || 0) > 0,
            homeProb: homeProb,
            awayProb: awayProb
          })
        })
      }

      processedGames.sort((a, b) => {
        if (!a.kickoff && !b.kickoff) return 0
        if (!a.kickoff) return 1
        if (!b.kickoff) return -1
        return new Date(a.kickoff) - new Date(b.kickoff)
      })
      
      // 11. Calculate owner totals
      console.log('=== CALCULATING OWNER TOTALS ===')
      const ownerTotals = {}
      
      Object.values(teamStats).forEach(team => {
        if (!ownerTotals[team.ownerId]) {
          ownerTotals[team.ownerId] = {
            id: team.ownerId,
            name: team.ownerName,
            total: 0,
            oboCount: 0,
            dboCount: 0
          }
        }
        ownerTotals[team.ownerId].total += team.earnings
        ownerTotals[team.ownerId].oboCount += team.oboCount
        ownerTotals[team.ownerId].dboCount += team.dboCount
      })
      
      // Log final owner totals
      Object.values(ownerTotals).forEach(owner => {
        if (owner.oboCount > 0 || owner.dboCount > 0 || owner.total > 0) {
          console.log(`${owner.name}: $${owner.total} (OBO: ${owner.oboCount}, DBO: ${owner.dboCount})`)
        }
      })

      const sortedOwners = Object.values(ownerTotals).sort((a, b) => b.total - a.total)
      
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
      
      console.log('=== SCOREBOARD DATA LOAD COMPLETE ===')
      console.log('Final results:', sortedOwners.length, 'owners,', processedGames.length, 'games')
      
    } catch (error) {
      console.error('Error in loadData:', error)
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

    if (game.status === 'STATUS_FINAL') {
      if (result === 'win' || (result === 'tie' && !isHome)) {
        return <span className="text-green-600">✅</span>
      } else {
        return <span className="text-red-600">❌</span>
      }
    }

    if (prob && prob.winProbability !== undefined) {
      const winProb = prob.winProbability
      const percentage = (winProb * 100).toFixed(0)
      
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
                  <div className="text-right">
                    <div className="text-xl font-bold text-green-600">
                      {/* Only show goose egg if week is finished and owner scored zero */}
                      {weekFinished && owner.total === 0 && <span>🥚</span>}
                      {(owner.oboCount || 0) > 0 && <span>🔥</span>}
                      {(owner.dboCount || 0) > 0 && <span>🛡️</span>}
                      ${owner.total}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

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
                     game.status === 'STATUS_HALFTIME' ? 'Halftime' :
                     'Not Started'}
                  </div>
                </div>

                <div className="space-y-2">
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
                        {game.status === 'STATUS_FINAL' || game.status === 'STATUS_IN_PROGRESS' || game.status === 'STATUS_HALFTIME'
                          ? game.awayScore 
                          : '0'}
                      </div>
                    </div>
                  </div>

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
                          {game.homeOBO && <span>🔥</span>}
                          {game.homeDBO && <span>🛡️</span>}
                          {getGameStatusDisplay(game, true)}
                        </div>
                      </div>
                      <div className="text-sm font-bold text-gray-900 w-5 text-center">
                        {game.status === 'STATUS_FINAL' || game.status === 'STATUS_IN_PROGRESS' || game.status === 'STATUS_HALFTIME'
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
