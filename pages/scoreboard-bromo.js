import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function BromoScoreboard() {
  const [ownerRankings, setOwnerRankings] = useState([])
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentSeason, setCurrentSeason] = useState(2025)
  const [currentWeek, setCurrentWeek] = useState(2)
  const [selectedWeek, setSelectedWeek] = useState(2)
  const [probabilities, setProbabilities] = useState({})
  const [gameState, setGameState] = useState({}) // For the bye week logic

  useEffect(() => {
    loadCurrentWeek()
    
    // Set up auto-refresh every 1 minute
    const interval = setInterval(() => {
      console.log('Auto-refreshing bromo scoreboard data...')
      if (currentSeason && selectedWeek) {
        loadData()
      }
    }, 60 * 1000) // 1 minute

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
        setSelectedWeek(data.week)
        
        // Wait for state to update, then load data
        setTimeout(() => {
          loadData()
        }, 100)
      }
    } catch (error) {
      console.error('Error getting current week:', error)
      // Fallback to loading data anyway
      loadData()
    }
  }

  // Fixed loadGames function that returns the gameState
  async function loadGames() {
    console.log('=== STARTING LOADGAMES ===')
    console.log('Current season:', currentSeason, 'Current week:', selectedWeek)
    try {
      const { data: gamesData, error: gamesError } = await supabase
        .from('games')
        .select('*')
        .eq('season', currentSeason)
        .eq('week', selectedWeek)

      console.log('Games query completed. Error:', gamesError, 'Data count:', gamesData?.length)

      if (!gamesError && gamesData && gamesData.length > 0) {
        console.log('Processing', gamesData.length, 'games...')
        const gameMap = {}
        
        gamesData.forEach((game, index) => {
          console.log(`Game ${index + 1}: ${game.home} vs ${game.away}, status: ${game.status}`)
          console.log(`Scores: ${game.home} ${game.home_pts} - ${game.away} ${game.away_pts}`)
          
          const getGameResult = (isHome, status, homeScore, awayScore) => {
            if (status !== 'STATUS_FINAL') return null
            
            const myScore = isHome ? homeScore : awayScore
            const theirScore = isHome ? awayScore : homeScore
            
            console.log(`Calculating result for ${isHome ? 'home' : 'away'}: myScore=${myScore}, theirScore=${theirScore}`)
            
            if (myScore > theirScore) return 'win'
            if (myScore < theirScore) return 'loss'
            return 'tie'
          }
          
          const homeResult = getGameResult(true, game.status, game.home_pts, game.away_pts)
          const awayResult = getGameResult(false, game.status, game.home_pts, game.away_pts)
          
          console.log(`Results: ${game.home} = ${homeResult}, ${game.away} = ${awayResult}`)
          
          gameMap[game.home] = {
            opponent: game.away,
            isHome: true,
            status: game.status,
            result: homeResult,
            homeScore: game.home_pts,
            awayScore: game.away_pts
          }
          
          gameMap[game.away] = {
            opponent: game.home,
            isHome: false,
            status: game.status,
            result: awayResult,
            homeScore: game.home_pts,
            awayScore: game.away_pts
          }
        })
        
        console.log('Final game map:', gameMap)
        setGameState(gameMap)
        console.log('Games state updated!')
        return gameMap // Return the gameMap directly
      } else {
        console.log('No games data available - clearing games state')
        setGameState({})
        return {}
      }
    } catch (error) {
      console.log('Error in loadGames:', error)
      return {}
    }
  }

  // Fixed loadProbabilities function that accepts gameState as parameter
  async function loadProbabilities(teams, currentGameState = {}) {
    try {
      const response = await fetch(`/api/kalshi-probabilities?week=${selectedWeek}&season=${currentSeason}`)
      if (response.ok) {
        const data = await response.json()
        console.log(`Loading probabilities for Week ${selectedWeek}:`, data.probabilities)
        
        // Set probability to 0 for teams without games (bye weeks)
        const adjustedProbabilities = { ...data.probabilities }
        
        teams?.forEach(team => {
          if (!currentGameState[team.abbr] && !adjustedProbabilities[team.abbr]) {
            adjustedProbabilities[team.abbr] = { winProbability: 0, confidence: 'bye_week' }
          }
        })
        
        setProbabilities(adjustedProbabilities || {})
        console.log('Probabilities set in state:', adjustedProbabilities)
        return adjustedProbabilities // Return the probabilities
      }
    } catch (error) {
      console.error('Error loading probabilities:', error)
      return {}
    }
  }

  // Bromo-specific data loading
  async function loadData() {
    console.log('=== STARTING BROMO LOADDATA ===')
    console.log('Season:', currentSeason, 'Week:', selectedWeek)
    try {
      setLoading(true)
      
      // Load awards for the selected week
      let awards = []
      try {
        const { data: awardsData, error } = await supabase
          .from('awards')
          .select('*')
          .eq('season', currentSeason)
          .eq('week', selectedWeek)

        if (error) {
          console.warn('Awards table access denied - using empty data:', error)
          awards = []
        } else {
          awards = awardsData || []
        }
      } catch (err) {
        console.warn('Awards table error - using empty data:', err)
        awards = []
      }
      
      // Load bromo teams and owners
      const { data: bromoTeams } = await supabase
        .from('teams_bromo')
        .select('abbr, name, owner_id')
        .eq('active', true)

      const { data: bromoOwners } = await supabase
        .from('owners_bromo')
        .select('id, name')

      // Also load main teams to map from team abbr to main owner_id for awards lookup
      const { data: mainTeams } = await supabase
        .from('teams')
        .select('abbr, owner_id')
        .eq('active', true)

      const bromoTeamLookup = {}
      const bromoOwnerLookup = {}
      const mainTeamToOwnerLookup = {}
      
      bromoTeams?.forEach(team => {
        bromoTeamLookup[team.abbr] = team
      })
      
      bromoOwners?.forEach(owner => {
        bromoOwnerLookup[owner.id] = owner
      })

      mainTeams?.forEach(team => {
        mainTeamToOwnerLookup[team.abbr] = team.owner_id
      })

      // Load games first and get the gameState directly
      console.log('Loading games...')
      const currentGameState = await loadGames()
      console.log('Games loaded, gameState keys:', Object.keys(currentGameState))
      
      // Then load probabilities and get them directly
      console.log('Loading probabilities...')
      const currentProbabilities = await loadProbabilities(bromoTeams, currentGameState)
      console.log('Probabilities loaded:', currentProbabilities)
      console.log('About to build processed games with probabilities:', Object.keys(currentProbabilities || {}))

      // Process team stats for this week
      const teamStats = {}
      bromoTeams?.forEach(team => {
        const owner = bromoOwnerLookup[team.owner_id]
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

      // Process awards for this week - map through team abbr since awards have main league owner_ids
      awards?.forEach(award => {
        const bromoTeam = bromoTeamLookup[award.team_abbr]
        if (!bromoTeam) return // Skip if this team isn't in bromo league

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

      // Add wins from completed games (using currentGameState)
      Object.entries(currentGameState).forEach(([teamAbbr, game]) => {
        if (game.status === 'STATUS_FINAL') {
          const team = teamStats[teamAbbr]
          if (!team) return // Skip if team not in bromo league

          const isWin = game.result === 'win' || (game.result === 'tie' && !game.isHome)
          
          if (isWin && !team.hasWin) {
            team.earnings += 5
            team.hasWin = true
          }
        }
      })

      // Build games array for display - only include games where both teams are in bromo
      console.log('Starting to build processed games array...')
      const { data: gamesData } = await supabase
        .from('games')
        .select('*')
        .eq('season', currentSeason)
        .eq('week', selectedWeek)

      console.log('Retrieved games data for processing:', gamesData?.length, 'games')
      const processedGames = []
      if (gamesData) {
        console.log('Processing games with currentGameState keys:', Object.keys(currentGameState || {}).length, 'teams')
        console.log('Processing games with currentProbabilities keys:', Object.keys(currentProbabilities || {}).length, 'teams')
        
        gamesData.forEach(game => {
          const homeTeam = teamStats[game.home]
          const awayTeam = teamStats[game.away]
          
          // Only include games where both teams are in the bromo league
          if (!homeTeam || !awayTeam) return

          // Get the game results from currentGameState
          const homeGameState = currentGameState[game.home]
          const awayGameState = currentGameState[game.away]

          // Use the probabilities we just loaded
          const homeProb = currentProbabilities[game.home] || null
          const awayProb = currentProbabilities[game.away] || null
          
          console.log(`Bromo Game ${game.home} vs ${game.away}:`)
          console.log(`  Home result: ${homeGameState?.result}, Away result: ${awayGameState?.result}`)
          console.log(`  Home prob: ${homeProb?.winProbability}, Away prob: ${awayProb?.winProbability}`)

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
            homeOBO: homeTeam?.hasOBO || false,
            awayOBO: awayTeam?.hasOBO || false,
            homeDBO: homeTeam?.hasDBO || false,
            awayDBO: awayTeam?.hasDBO || false,
            // Use the probabilities directly from the API call
            homeProb: homeProb,
            awayProb: awayProb
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
      console.log('=== BROMO LOADDATA COMPLETE ===')
    } catch (error) {
      console.error('Error loading bromo data:', error)
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

  // FIXED getGameStatusDisplay function
  const getGameStatusDisplay = (game, isHome) => {
    const result = isHome ? game.homeResult : game.awayResult
    const prob = isHome ? game.homeProb : game.awayProb

    // Final games - show check or X emoji
    if (game.status === 'STATUS_FINAL') {
      // For final games, check if this team won or if it's an away tie
      if (result === 'win' || (result === 'tie' && !isHome)) {
        return <span className="text-green-600">✅</span>
      } else {
        return <span className="text-red-600">❌</span>
      }
    }

    // For in-progress or scheduled games, show probability if available
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
          <div className="text-lg font-semibold text-gray-800">Loading Bromo Scoreboard...</div>
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
                href="/bromo"
                className="text-blue-600 hover:text-blue-800 font-semibold text-sm flex items-center space-x-1"
              >
                <span>←</span>
                <span>Back to Bromo League</span>
              </a>
              <h1 className="text-3xl font-bold text-gray-900">
                Bromo Week {selectedWeek} Scoreboard
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
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Bromo Rankings</h2>
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
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Bromo Games</h2>
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
                        {game.status === 'STATUS_FINAL' || game.status === 'STATUS_IN_PROGRESS' || game.status === 'STATUS_HALFTIME'
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
            <h2 className="text-2xl font-bold text-gray-700 mb-2">No Bromo Games Yet</h2>
            <p className="text-gray-600">No games with bromo teams for Week {selectedWeek}</p>
          </div>
        )}
      </div>
    </div>
  )
}
