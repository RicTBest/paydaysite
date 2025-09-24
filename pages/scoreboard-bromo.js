import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

export default function BromoScoreboard() {
  const [ownerRankings, setOwnerRankings] = useState([])
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentSeason, setCurrentSeason] = useState(2025)
  const [currentWeek, setCurrentWeek] = useState(null)
  const [selectedWeek, setSelectedWeek] = useState(null)
  const [probabilities, setProbabilities] = useState({})
  const [gameState, setGameState] = useState({})
  const [weekFinished, setWeekFinished] = useState(false)
  
  // Track if this is the initial load to avoid overwriting user selections
  const hasInitializedWeek = useRef(false)
  // Track if we're currently doing a background refresh
  const isBackgroundRefresh = useRef(false)

  // Inline week calculation for speed
  const calculateCurrentWeek = () => {
    try {
      const now = new Date()
      const year = now.getFullYear()
      
      // Calculate Labor Day (first Monday in September) and season start (Tuesday after)
      const calculateSeasonStart = (year) => {
        const laborDay = new Date(year, 8, 1) // September 1st
        // Find first Monday in September
        while (laborDay.getDay() !== 1) { // 1 = Monday
          laborDay.setDate(laborDay.getDate() + 1)
        }
        // Season starts Tuesday after Labor Day (week runs Tuesday to Tuesday)
        const seasonStart = new Date(laborDay)
        seasonStart.setDate(laborDay.getDate() + 1) // +1 day = Tuesday
        return seasonStart
      }
      
      // Pre-calculated for accuracy, but fallback available
      const seasonStartDates = {
        2024: new Date('2024-09-03'), // Tuesday, Sept 3, 2024 (Labor Day was Sept 2)
        2025: new Date('2025-09-02'), // Tuesday, Sept 2, 2025 (Labor Day is Sept 1)
        2026: new Date('2026-09-08'), // Tuesday, Sept 8, 2026 (Labor Day is Sept 7)
        2027: new Date('2027-09-07'), // Tuesday, Sept 7, 2027 (Labor Day is Sept 6)
        2028: new Date('2028-09-05'), // Tuesday, Sept 5, 2028 (Labor Day is Sept 4)
        2029: new Date('2029-09-04'), // Tuesday, Sept 4, 2029 (Labor Day is Sept 3)
        2030: new Date('2030-09-03'), // Tuesday, Sept 3, 2030 (Labor Day is Sept 2)
      }
      
      let seasonStart = seasonStartDates[year]
      if (!seasonStart) {
        // Fallback calculation for any year not pre-defined
        seasonStart = calculateSeasonStart(year)
        console.warn(`Season start date not defined for year ${year}, calculated: ${seasonStart.toDateString()}`)
      }
      
      const daysSinceStart = Math.floor((now - seasonStart) / (1000 * 60 * 60 * 24))
      
      if (daysSinceStart < 0) {
        return { season: year, week: 1 }
      }
      
      const week = Math.floor(daysSinceStart / 7) + 1
      
      if (week <= 18) {
        return { season: year, week: week }
      }
      
      return { season: year, week: 18 } // Cap at week 18
    } catch (error) {
      console.error('Error calculating current week:', error)
      // Return null to indicate calculation failed, let the component handle gracefully
      return { season: 2025, week: null }
    }
  }

  useEffect(() => {
    loadCurrentWeek()
    
    const interval = setInterval(() => {
      // Only auto-refresh if we're viewing the current week and both values are set
      if (currentSeason && selectedWeek && currentWeek && selectedWeek === currentWeek) {
        console.log('Auto-refreshing bromo scoreboard data (background)...')
        isBackgroundRefresh.current = true
        loadData()
      }
    }, 60 * 1000)

    return () => {
      clearInterval(interval)
    }
  }, [currentWeek, selectedWeek])

  useEffect(() => {
    if (currentSeason && selectedWeek && selectedWeek !== null) {
      loadData()
    }
  }, [currentSeason, selectedWeek])

  async function loadCurrentWeek() {
    console.log('Loading current week...')
    try {
      // Use inline calculation instead of API call for speed
      const currentWeekData = calculateCurrentWeek()
      
      console.log('Current week calculated:', currentWeekData)
      setCurrentSeason(currentWeekData.season)
      setCurrentWeek(currentWeekData.week)
      
      // Only set selectedWeek on the very first load and if we got a valid week
      if (!hasInitializedWeek.current && currentWeekData.week !== null) {
        setSelectedWeek(currentWeekData.week)
        hasInitializedWeek.current = true
      }
      
      // Only proceed with data loading if we have a valid week
      if (currentWeekData.week !== null) {
        setTimeout(() => {
          loadData()
        }, 100)
      }
    } catch (error) {
      console.error('Error getting current week:', error)
      // If we fail to get current week, try to load data anyway with fallback
      // This allows the component to still function even if week calculation fails
      if (!hasInitializedWeek.current) {
        // Set a reasonable fallback based on current date
        const now = new Date()
        const month = now.getMonth() + 1 // 0-indexed, so add 1
        let fallbackWeek = 1
        
        if (month >= 9) { // September or later
          fallbackWeek = Math.min(Math.floor((now.getDate() - 5) / 7) + 1, 18)
          fallbackWeek = Math.max(fallbackWeek, 1) // Ensure at least week 1
        }
        
        console.log('Using fallback week:', fallbackWeek)
        setCurrentWeek(fallbackWeek)
        setSelectedWeek(fallbackWeek)
        hasInitializedWeek.current = true
      }
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
    console.log('=== STARTING BROMO SCOREBOARD DATA LOAD ===')
    console.log('Season:', currentSeason, 'Selected Week:', selectedWeek)
    console.log('Background refresh:', isBackgroundRefresh.current)
    
    try {
      // Only show loading spinner if this is not a background refresh
      if (!isBackgroundRefresh.current) {
        setLoading(true)
      }
      
      // 1. Load base data from bromo tables
      const [teamsResult, ownersResult] = await Promise.all([
        supabase.from('teams_bromo').select('abbr, name, owner_id').eq('active', true),
        supabase.from('owners_bromo').select('id, name')
      ])
      
      const teams = teamsResult.data || []
      const owners = ownersResult.data || []
      
      console.log('Loaded bromo base data:', teams.length, 'teams,', owners.length, 'owners')
      
      // 2. Create lookup maps
      const teamLookup = {}
      const ownerLookup = {}
      const teamToOwnerLookup = {} // Maps team abbr to bromo owner info
      
      teams.forEach(team => {
        teamLookup[team.abbr] = team
      })
      
      owners.forEach(owner => {
        ownerLookup[owner.id] = owner
      })

      // Create team abbr to bromo owner mapping
      teams.forEach(team => {
        const owner = ownerLookup[team.owner_id]
        if (owner) {
          teamToOwnerLookup[team.abbr] = owner
        }
      })
      
      // 3. Load games and probabilities
      const currentGameState = await loadGames()
      const currentProbabilities = await loadProbabilities(teams, currentGameState)
      
      // 4. Load awards for the selected week (awards reference team_abbr, not owner_id)
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
      
      // 7. Initialize team stats for bromo teams only
      console.log('=== PROCESSING BROMO TEAM STATS ===')
      const teamStats = {}
      
      teams.forEach(team => {
        const owner = ownerLookup[team.owner_id]
        if (!owner) {
          console.warn(`No bromo owner found for team ${team.abbr}`)
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
      
      console.log('Initialized stats for', Object.keys(teamStats).length, 'bromo teams')
      
      // 8. Process awards - only count awards for teams that have bromo owners
      console.log('=== PROCESSING AWARDS FOR BROMO TEAMS ===')
      awards.forEach(award => {
        const team = teamStats[award.team_abbr]
        if (!team) {
          // This team is not owned by a bromo owner, skip
          console.log(`Skipping award for non-bromo team: ${award.team_abbr}`)
          return
        }

        const points = award.points || 1
        const earnings = points * 5
        
        console.log(`Processing bromo award: ${award.type} for ${award.team_abbr} = ${earnings} earnings`)
        
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
      
      // 9. Add wins from completed games - only for bromo teams
      console.log('=== ADDING GAME WINS FOR BROMO TEAMS ===')
      Object.entries(currentGameState).forEach(([teamAbbr, game]) => {
        if (game.status === 'STATUS_FINAL') {
          const team = teamStats[teamAbbr]
          if (!team) return // Not a bromo team

          const isWin = game.result === 'win' || (game.result === 'tie' && !game.isHome)
          
          if (isWin && !team.hasWin) {
            team.earnings += 5
            team.hasWin = true
            console.log(`Added game win for bromo team ${teamAbbr}: +$5`)
          }
        }
      })
      
      // 10. Build games array for display - only show games involving bromo teams
      console.log('=== BUILDING BROMO GAMES DISPLAY ===')
      const processedGames = []
      if (gamesData) {
        gamesData.forEach(game => {
          // Check if either team is owned by a bromo owner
          const homeTeam = teamStats[game.home]
          const awayTeam = teamStats[game.away]
          
          // Only include games where at least one team is bromo-owned
          if (!homeTeam && !awayTeam) {
            return // Neither team is bromo-owned, skip this game
          }
          
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
            homeOwner: homeTeam?.ownerName || 'Non-Bromo',
            awayOwner: awayTeam?.ownerName || 'Non-Bromo',
            homeEarnings: homeTeam?.earnings || 0,
            awayEarnings: awayTeam?.earnings || 0,
            homeWin: homeTeam?.hasWin || false,
            awayWin: awayTeam?.hasWin || false,
            homeOBO: (homeTeam?.oboCount || 0) > 0,
            awayOBO: (awayTeam?.oboCount || 0) > 0,
            homeDBO: (homeTeam?.dboCount || 0) > 0,
            awayDBO: (awayTeam?.dboCount || 0) > 0,
            homeProb: homeProb,
            awayProb: awayProb,
            isBromoGame: !!(homeTeam && awayTeam) // Both teams are bromo-owned
          })
        })
      }

      processedGames.sort((a, b) => {
        if (!a.kickoff && !b.kickoff) return 0
        if (!a.kickoff) return 1
        if (!b.kickoff) return -1
        return new Date(a.kickoff) - new Date(b.kickoff)
      })
      
      // 11. Calculate bromo owner totals
      console.log('=== CALCULATING BROMO OWNER TOTALS ===')
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
      
      // Log final bromo owner totals
      Object.values(ownerTotals).forEach(owner => {
        if (owner.oboCount > 0 || owner.dboCount > 0 || owner.total > 0) {
          console.log(`Bromo ${owner.name}: ${owner.total} (OBO: ${owner.oboCount}, DBO: ${owner.dboCount})`)
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
      
      // Reset loading state and background refresh flag
      setLoading(false)
      isBackgroundRefresh.current = false
      
      console.log('=== BROMO SCOREBOARD DATA LOAD COMPLETE ===')
      console.log('Final results:', sortedOwners.length, 'bromo owners,', processedGames.length, 'games')
      
    } catch (error) {
      console.error('Error in bromo loadData:', error)
      setLoading(false)
      isBackgroundRefresh.current = false
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
    const owner = isHome ? game.homeOwner : game.awayOwner

    // Don't show status for non-bromo teams
    if (owner === 'Non-Bromo') {
      return <span className="text-gray-400 text-xs">—</span>
    }

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

  if (loading || selectedWeek === null) {
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
                {selectedWeek === currentWeek && (
                  <span className="ml-2 text-sm font-normal text-blue-600">
                    (Live Updates)
                  </span>
                )}
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
                    {week} {week === currentWeek ? '(Current)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Bromo Rankings</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {ownerRankings.map((owner) => (
              <div
                key={owner.id}
                className={`p-4 rounded-lg border-2 transition-all duration-300 ${
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
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Bromo Games</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {games.map((game) => (
              <div key={game.id} className={`bg-white rounded-lg border shadow p-3 transition-all duration-300 ${
                game.isBromoGame ? 'border-blue-300 bg-blue-50' : ''
              }`}>
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
                        <div className={`text-xs truncate ${
                          game.awayOwner === 'Non-Bromo' ? 'text-gray-400 italic' : 'text-gray-600'
                        }`}>
                          {game.awayOwner}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <div className="text-right">
                        {/* Only show earnings if game is finished */}
                        {game.status === 'STATUS_FINAL' && (
                          <div className="font-bold text-green-600 text-xs">${game.awayEarnings}</div>
                        )}
                        <div className="flex items-center justify-end space-x-1 text-xs">
                          {game.awayOBO && <span>🔥</span>}
                          {game.awayDBO && <span>🛡️</span>}
                          {getGameStatusDisplay(game, false)}
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
                        <div className={`text-xs truncate ${
                          game.homeOwner === 'Non-Bromo' ? 'text-gray-400 italic' : 'text-gray-600'
                        }`}>
                          {game.homeOwner}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <div className="text-right">
                        {/* Only show earnings if game is finished */}
                        {game.status === 'STATUS_FINAL' && (
                          <div className="font-bold text-green-600 text-xs">${game.homeEarnings}</div>
                        )}
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
            <h2 className="text-2xl font-bold text-gray-700 mb-2">No Bromo Games Yet</h2>
            <p className="text-gray-600">No games involving bromo teams for Week {selectedWeek}</p>
          </div>
        )}
      </div>
    </div>
  )
