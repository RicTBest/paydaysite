import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Award types that use direct dollar amounts (not points * 5)
const DIRECT_AMOUNT_TYPES = [
  'PLAYOFF_BERTH', 'PLAYOFF_BYE', 'PLAYOFF_WC_WIN', 
  'PLAYOFF_DIV_WIN', 'PLAYOFF_CONF_WIN', 'PLAYOFF_SB_WIN',
  'FIRST_COACH_FIRED', 'DRAFT_PICK_1', 'MVP', 'DPOY', 
  'COTY', 'MOST_SACKS', 'MOST_INTS', 'MOST_RET_TDS',
  'COACH_FIRED' // Keep old type for backwards compatibility
]

// Playoff award types for the playoff bar
const PLAYOFF_TYPES = [
  'PLAYOFF_BERTH', 'PLAYOFF_BYE', 'PLAYOFF_WC_WIN', 
  'PLAYOFF_DIV_WIN', 'PLAYOFF_CONF_WIN', 'PLAYOFF_SB_WIN'
]

// EOY award types
const EOY_TYPES = [
  'FIRST_COACH_FIRED', 'COACH_FIRED', 'DRAFT_PICK_1', 'MVP', 'DPOY', 
  'COTY', 'MOST_SACKS', 'MOST_INTS', 'MOST_RET_TDS'
]

// Playoff milestone hierarchy (in order of achievement)
const PLAYOFF_MILESTONES = {
  'PLAYOFF_BERTH': { label: 'Made Playoffs', amount: 10, order: 1 },
  'PLAYOFF_BYE': { label: 'Made Div. Round', amount: 20, order: 2 },
  'PLAYOFF_WC_WIN': { label: 'Made Div. Round', amount: 20, order: 2 },
  'PLAYOFF_DIV_WIN': { label: 'Made Conf. Champ', amount: 35, order: 3 },
  'PLAYOFF_CONF_WIN': { label: 'Made Super Bowl', amount: 65, order: 4 },
  'PLAYOFF_SB_WIN': { label: 'Won Super Bowl 🏆', amount: 155, order: 5 }
}

export default function Home() {
  const [leaderboard, setLeaderboard] = useState([])
  const [probabilities, setProbabilities] = useState({})
  const [games, setGames] = useState({})
  const [gamesLoadedForWeek, setGamesLoadedForWeek] = useState(null) // Track which week's games we have
  const [loading, setLoading] = useState(true)
  const [currentSeason, setCurrentSeason] = useState(2025)
  const [currentWeek, setCurrentWeek] = useState(19)
  const [actualWeek, setActualWeek] = useState(19)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [weekInfo, setWeekInfo] = useState(null)
  const [userSelectedWeek, setUserSelectedWeek] = useState(false)
  const [isInitialLoad, setIsInitialLoad] = useState(true)

  useEffect(() => {
    loadCurrentWeek()
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      if (autoRefresh && !userSelectedWeek) {
        console.log('Auto-refreshing data...')
        loadCurrentWeek()
      }
    }, 1 * 60 * 1000)

    return () => {
      clearInterval(interval)
    }
  }, [autoRefresh, userSelectedWeek])

  function changeWeek(newWeek) {
    if (newWeek >= 1 && newWeek <= 22 && newWeek !== currentWeek) {
      console.log(`User manually changed week from ${currentWeek} to ${newWeek}`)
      setCurrentWeek(newWeek)
      setUserSelectedWeek(true)
      loadDataForWeek(newWeek, currentSeason)
    }
  }

  async function loadDataForWeek(weekNumber, season = currentSeason) {
    console.log(`=== LOADING DATA FOR WEEK ${weekNumber}, SEASON ${season} ===`)
    setLoading(true)
    
    // Clear existing game data immediately to prevent stale display
    setGames({})
    setGamesLoadedForWeek(null)
    setProbabilities({})
    
    try {
      const { ownerStats, teams, sortedLeaderboard } = await loadBaseData()
      setLeaderboard(sortedLeaderboard)

      // Load games and probabilities for the specific week
      await Promise.all([
        loadProbabilitiesForWeek(teams, weekNumber),
        loadGamesForWeek(weekNumber, season)
      ])

      setLastUpdate(new Date())
      setLoading(false)
      console.log(`=== WEEK ${weekNumber} DATA LOAD COMPLETE ===`)

    } catch (error) {
      console.error('Error loading data for week:', error)
      setLoading(false)
    }
  }

  async function loadData() {
    await loadDataForWeek(currentWeek, currentSeason)
  }

  // Helper function to calculate earnings from an award
  function calculateAwardEarnings(award) {
    if (DIRECT_AMOUNT_TYPES.includes(award.type)) {
      return award.points || 0
    } else {
      return (award.points || 1) * 5
    }
  }

  // Get the furthest playoff milestone for a team
  function getFurthestPlayoffMilestone(playoffDetails) {
    if (!playoffDetails || playoffDetails.length === 0) return null
    
    let furthest = null
    let highestOrder = 0
    
    playoffDetails.forEach(detail => {
      const milestone = PLAYOFF_MILESTONES[detail.type]
      if (milestone && milestone.order > highestOrder) {
        highestOrder = milestone.order
        furthest = {
          type: detail.type,
          label: milestone.label,
          amount: milestone.amount,
          order: milestone.order
        }
      }
    })
    
    return furthest
  }

  async function loadBaseData() {
    let awards = []
    try {
      const { data: awardsData, error } = await supabase
        .from('awards')
        .select('*')
        .eq('season', currentSeason)

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
    
    const { data: teams } = await supabase
      .from('teams')
      .select('abbr, name, owner_id')
      .eq('active', true)

    const { data: owners } = await supabase
      .from('owners')
      .select('id, name, num_gooses')

    const teamLookup = {}
    const ownerLookup = {}
    
    teams?.forEach(team => {
      teamLookup[team.abbr] = team
    })
    
    owners?.forEach(owner => {
      ownerLookup[owner.id] = owner
    })

    const ownerStats = {}
    
    // Process awards
    awards?.forEach(award => {
      const team = teamLookup[award.team_abbr]
      if (!team) return
      
      const ownerId = award.owner_id || team.owner_id
      const owner = ownerLookup[ownerId]
      if (!owner) return
      
      const teamAbbr = award.team_abbr
      
      if (!ownerStats[ownerId]) {
        ownerStats[ownerId] = {
          id: ownerId,
          name: owner.name,
          num_gooses: owner.num_gooses,
          totalEarnings: 0,
          wins: 0,
          obo: 0,
          dbo: 0,
          eoy: 0,
          eoyDollars: 0,
          playoffs: 0,
          playoffDetails: [],
          teams: {}
        }
      }
      
      if (!ownerStats[ownerId].teams[teamAbbr]) {
        ownerStats[ownerId].teams[teamAbbr] = {
          abbr: teamAbbr,
          name: team.name,
          earnings: 0,
          wins: 0,
          obo: 0,
          dbo: 0,
          eoy: 0,
          eoyDollars: 0,
          playoffs: 0,
          playoffDetails: []
        }
      }
      
      const earnings = calculateAwardEarnings(award)
      
      ownerStats[ownerId].totalEarnings += earnings
      ownerStats[ownerId].teams[teamAbbr].earnings += earnings
      
      if (PLAYOFF_TYPES.includes(award.type)) {
        ownerStats[ownerId].playoffs += earnings
        ownerStats[ownerId].teams[teamAbbr].playoffs += earnings
        ownerStats[ownerId].playoffDetails.push({
          team: teamAbbr,
          type: award.type,
          amount: earnings,
          notes: award.notes
        })
        ownerStats[ownerId].teams[teamAbbr].playoffDetails.push({
          type: award.type,
          amount: earnings,
          notes: award.notes
        })
      } else if (EOY_TYPES.includes(award.type)) {
        ownerStats[ownerId].eoy += 1
        ownerStats[ownerId].eoyDollars += earnings
        ownerStats[ownerId].teams[teamAbbr].eoy += 1
        ownerStats[ownerId].teams[teamAbbr].eoyDollars += earnings
      } else {
        switch (award.type) {
          case 'WIN':
          case 'TIE_AWAY':
            ownerStats[ownerId].wins += 1
            ownerStats[ownerId].teams[teamAbbr].wins += 1
            break
          case 'OBO':
            ownerStats[ownerId].obo += 1
            ownerStats[ownerId].teams[teamAbbr].obo += 1
            break
          case 'DBO':
            ownerStats[ownerId].dbo += 1
            ownerStats[ownerId].teams[teamAbbr].dbo += 1
            break
        }
      }
    })

    // Add teams without awards
    teams?.forEach(team => {
      const owner = ownerLookup[team.owner_id]
      if (!owner) return
      
      if (!ownerStats[team.owner_id]) {
        ownerStats[team.owner_id] = {
          id: team.owner_id,
          name: owner.name,
          totalEarnings: 0,
          num_gooses: owner.num_gooses || 0,
          wins: 0,
          obo: 0,
          dbo: 0,
          eoy: 0,
          eoyDollars: 0,
          playoffs: 0,
          playoffDetails: [],
          teams: {}
        }
      }
      
      if (!ownerStats[team.owner_id].teams[team.abbr]) {
        ownerStats[team.owner_id].teams[team.abbr] = {
          abbr: team.abbr,
          name: team.name,
          earnings: 0,
          wins: 0,
          obo: 0,
          dbo: 0,
          eoy: 0,
          eoyDollars: 0,
          playoffs: 0,
          playoffDetails: []
        }
      }
    })

    const sortedLeaderboard = Object.values(ownerStats)
      .sort((a, b) => b.totalEarnings - a.totalEarnings)
    
    let currentRank = 1
    sortedLeaderboard.forEach((owner, index) => {
      if (index > 0 && owner.totalEarnings < sortedLeaderboard[index - 1].totalEarnings) {
        currentRank = index + 1
      }
      owner.rank = currentRank
    })
    
    // Calculate performance percentiles
    const allTeams = []
    sortedLeaderboard.forEach(owner => {
      Object.values(owner.teams).forEach(team => {
        allTeams.push({ ...team, ownerName: owner.name })
      })
    })
    allTeams.sort((a, b) => b.earnings - a.earnings)
    
    const totalTeams = allTeams.length
    const quintileBoundaries = [
      Math.ceil(totalTeams * 0.2),
      Math.ceil(totalTeams * 0.4),
      Math.ceil(totalTeams * 0.6),
      Math.ceil(totalTeams * 0.8),
      totalTeams
    ]

    allTeams.forEach((team, index) => {
      let quintile = 5
      for (let i = 0; i < quintileBoundaries.length; i++) {
        if (index < quintileBoundaries[i]) {
          quintile = i + 1
          break
        }
      }
      
      const sameEarningsTeams = allTeams.filter(t => t.earnings === team.earnings)
      const bestPositionForThisEarning = Math.min(...sameEarningsTeams.map(t => allTeams.indexOf(t)))
      
      for (let i = 0; i < quintileBoundaries.length; i++) {
        if (bestPositionForThisEarning < quintileBoundaries[i]) {
          quintile = i + 1
          break
        }
      }
      
      team.performancePercentile = quintile === 1 ? 0.9 :
                                  quintile === 2 ? 0.7 :
                                  quintile === 3 ? 0.5 :
                                  quintile === 4 ? 0.3 : 0.1
    })
  
    const teamPerformanceMap = {}
    allTeams.forEach(team => {
      teamPerformanceMap[team.abbr] = team.performancePercentile
    })
    
    sortedLeaderboard.forEach(owner => {
      owner.teamsSorted = Object.values(owner.teams)
        .sort((a, b) => b.earnings - a.earnings)
        .map(team => ({
          ...team,
          performancePercentile: teamPerformanceMap[team.abbr] || 0
        }))
    })

    return { ownerStats, teams, sortedLeaderboard }
  }

  async function loadGamesForWeek(weekNumber, season = currentSeason) {
    console.log(`Loading games for Week ${weekNumber}, Season ${season}`)
    
    // Clear games first to prevent stale data
    setGames({})
    setGamesLoadedForWeek(null)
    
    try {
      const { data: gamesData, error: gamesError } = await supabase
        .from('games')
        .select('*')
        .eq('season', season)
        .eq('week', weekNumber)

      console.log(`Games query returned ${gamesData?.length || 0} games for week ${weekNumber}`)
      
      if (gamesError) {
        console.error('Error loading games:', gamesError)
        setGames({})
        setGamesLoadedForWeek(weekNumber)
        return
      }
      
      if (gamesData && gamesData.length > 0) {
        const gameMap = {}
        
        gamesData.forEach((game) => {
          const createEnhancedText = (isHome, opponent, status, kickoff, homeScore, awayScore) => {
            const base = isHome ? `vs ${opponent}` : `@ ${opponent}`
            
            if (status === 'STATUS_SCHEDULED' && kickoff) {
              try {
                const date = new Date(kickoff)
                const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
                const day = days[date.getDay()]
                const time = date.toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                })
                return `${base}|${day} ${time}`
              } catch (e) {
                return `${base}|scheduled`
              }
            }
            
            if (status === 'STATUS_IN_PROGRESS') {
              const myScore = isHome ? homeScore : awayScore
              const theirScore = isHome ? awayScore : homeScore
              if (myScore === theirScore) return `${base} | tied ${myScore}-${theirScore}`
              if (myScore > theirScore) return `${base} | leading ${myScore}-${theirScore}`
              return `${base} | trailing ${myScore}-${theirScore}`
            }
            
            if (status === 'STATUS_FINAL') {
              const myScore = isHome ? homeScore : awayScore
              const theirScore = isHome ? awayScore : homeScore
              if (myScore > theirScore) return `${base} | won ${myScore}-${theirScore}`
              if (myScore < theirScore) return `${base} | lost ${myScore}-${theirScore}`
              return `${base} | tied ${myScore}-${theirScore}`
            }
            
            return base
          }

          const getGameResult = (isHome, status, homeScore, awayScore) => {
            if (status !== 'STATUS_FINAL') return null
            const myScore = isHome ? homeScore : awayScore
            const theirScore = isHome ? awayScore : homeScore
            if (myScore > theirScore) return 'win'
            if (myScore < theirScore) return 'loss'
            return 'tie'
          }
          
          const homeText = createEnhancedText(true, game.away, game.status, game.kickoff, game.home_pts, game.away_pts)
          const awayText = createEnhancedText(false, game.home, game.status, game.kickoff, game.home_pts, game.away_pts)
          
          const homeResult = getGameResult(true, game.status, game.home_pts, game.away_pts)
          const awayResult = getGameResult(false, game.status, game.home_pts, game.away_pts)
          
          gameMap[game.home] = {
            opponent: game.away,
            isHome: true,
            status: game.status,
            enhancedStatus: homeText,
            result: homeResult
          }
          
          gameMap[game.away] = {
            opponent: game.home,
            isHome: false,
            status: game.status,
            enhancedStatus: awayText,
            result: awayResult
          }
        })
        
        setGames(gameMap)
        setGamesLoadedForWeek(weekNumber)
        console.log(`Games set for week ${weekNumber}:`, Object.keys(gameMap).length, 'teams have games')
      } else {
        setGames({})
        setGamesLoadedForWeek(weekNumber)
        console.log(`No games found for week ${weekNumber}`)
      }
    } catch (error) {
      console.log('Error loading games:', error)
      setGames({})
      setGamesLoadedForWeek(weekNumber)
    }
  }

  async function loadProbabilitiesForWeek(teams, weekNumber) {
    try {
      console.log(`Loading probabilities for Week ${weekNumber}`)
      const response = await fetch(`/api/kalshi-probabilities?week=${weekNumber}&season=${currentSeason}`)
      if (response.ok) {
        const data = await response.json()
        setProbabilities(data.probabilities || {})
        console.log(`Probabilities loaded for Week ${weekNumber}:`, Object.keys(data.probabilities || {}).length, 'teams')
      }
    } catch (error) {
      console.error('Error loading probabilities:', error)
      setProbabilities({})
    }
  }

  async function loadCurrentWeek() {
    console.log('Loading current week...')
    try {
      const [actualResponse, displayResponse] = await Promise.all([
        fetch('/api/current-week'),
        fetch('/api/current-week?display=true')
      ])
      
      if (actualResponse.ok && displayResponse.ok) {
        const actualData = await actualResponse.json()
        const displayData = await displayResponse.json()
        
        console.log('Actual week:', actualData)
        console.log('Display week:', displayData)
        
        const season = actualData.season
        const weekToLoad = displayData.week
        
        setCurrentSeason(season)
        setActualWeek(actualData.week)
        
        if (isInitialLoad) {
          setCurrentWeek(weekToLoad)
          setIsInitialLoad(false)
        }
        
        setWeekInfo({
          actual: actualData.week,
          display: weekToLoad,
          dayOfWeek: displayData.dayOfWeek
        })
        
        // Load data for the display week
        loadDataForWeek(weekToLoad, season)
      }
    } catch (error) {
      console.error('Error getting current week:', error)
      loadData()
    }
  }

  function getWeekDisplayName(week) {
    if (week <= 18) return `Week ${week}`
    if (week === 19) return 'Wild Card Weekend'
    if (week === 20) return 'Divisional Round'
    if (week === 21) return 'Conference Championships'
    if (week === 22) return 'Super Bowl'
    return `Week ${week}`
  }

  // Helper to format playoff progress for owner display
  function formatOwnerPlayoffProgress(playoffDetails) {
    if (!playoffDetails || playoffDetails.length === 0) return null
    
    // Group by team and find furthest milestone for each
    const byTeam = {}
    playoffDetails.forEach(d => {
      if (!byTeam[d.team]) byTeam[d.team] = []
      byTeam[d.team].push(d)
    })
    
    // Get furthest milestone per team
    const teamMilestones = {}
    Object.entries(byTeam).forEach(([team, details]) => {
      const furthest = getFurthestPlayoffMilestone(details)
      if (furthest) {
        teamMilestones[team] = furthest
      }
    })
    
    return teamMilestones
  }

  if (loading && leaderboard.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex justify-center items-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
          <div className="text-xl font-semibold text-emerald-800">Loading Payday Football League...</div>
        </div>
      </div>
    )
  }

  const isPlayoffs = currentWeek >= 19

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-green-100 to-teal-200">
      <div className="bg-white shadow-xl border-b-4 border-emerald-500 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-green-500/10"></div>
        <div className="container mx-auto px-4 py-8 relative">
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center space-y-6 lg:space-y-0">
            <div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-emerald-800 mb-3 tracking-tight">
                🏈 FOUNDERS (+ Max) LEAGUE
              </h1>
              <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-6 text-emerald-600">
                <span className="font-bold text-lg bg-emerald-100 px-3 py-1 rounded-full w-fit">
                  {getWeekDisplayName(currentWeek)} • {currentSeason} Season
                </span>
                {lastUpdate && (
                  <span className="text-sm bg-white px-2 py-1 rounded-full shadow w-fit">
                    🕐 Last updated: {lastUpdate.toLocaleTimeString()}
                  </span>
                )}
                <div className="flex items-center space-x-2 bg-white px-3 py-1 rounded-full shadow w-fit">
                  <div className={`w-3 h-3 rounded-full animate-pulse ${autoRefresh && !userSelectedWeek ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                  <span className="text-sm font-medium">
                    Live updates {autoRefresh && !userSelectedWeek ? 'ON' : 'OFF'}
                    {userSelectedWeek && ' (manual)'}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col space-y-3">
              {/* Week Navigation */}
              <div className="flex items-center space-x-2 bg-white rounded-xl px-4 py-2 shadow-lg">
                <button
                  onClick={() => changeWeek(currentWeek - 1)}
                  disabled={currentWeek <= 1}
                  className="bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400 text-gray-700 font-bold py-1 px-3 rounded transition-colors text-sm"
                >
                  ← Prev
                </button>
                <select
                  value={currentWeek}
                  onChange={(e) => changeWeek(parseInt(e.target.value))}
                  className="bg-emerald-100 text-emerald-800 font-bold px-3 py-1 rounded text-sm min-w-[140px] text-center"
                >
                  {Array.from({ length: 18 }, (_, i) => i + 1).map(w => (
                    <option key={w} value={w}>Week {w}</option>
                  ))}
                  <option value={19}>Wild Card</option>
                  <option value={20}>Divisional</option>
                  <option value={21}>Conf. Champ</option>
                  <option value={22}>Super Bowl</option>
                </select>
                <button
                  onClick={() => changeWeek(currentWeek + 1)}
                  disabled={currentWeek >= 22}
                  className="bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400 text-gray-700 font-bold py-1 px-3 rounded transition-colors text-sm"
                >
                  Next →
                </button>
              </div>

              {/* Reset to Smart Default */}
              {userSelectedWeek && weekInfo && (
                <button
                  onClick={() => {
                    setUserSelectedWeek(false)
                    changeWeek(weekInfo.display)
                  }}
                  className="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-medium py-1 px-3 rounded text-sm transition-colors"
                >
                  Reset to Smart Default ({getWeekDisplayName(weekInfo.display)})
                </button>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3">
                <a
                  href="/scoreboard"
                  className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold py-3 px-4 sm:px-6 rounded-xl transition-all transform hover:scale-105 shadow-lg text-center text-sm sm:text-base"
                >
                  📅 Scoreboard
                </a>

                <a
                  href="/minimal"
                  className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white font-bold py-3 px-4 sm:px-6 rounded-xl transition-all transform hover:scale-105 shadow-lg text-center text-sm sm:text-base"
                >
                  📊 Minimal
                </a>
                
                <button 
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={`px-4 sm:px-6 py-3 rounded-xl font-bold transition-all transform hover:scale-105 shadow-lg text-sm sm:text-base ${
                    autoRefresh 
                      ? 'bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:from-emerald-600 hover:to-green-700' 
                      : 'bg-gradient-to-r from-gray-400 to-gray-500 text-white hover:from-gray-500 hover:to-gray-600'
                  }`}
                >
                  🔄 Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
                </button>
                
                <button 
                  onClick={loadData}
                  disabled={loading}
                  className="bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-700 hover:to-green-800 disabled:from-emerald-400 disabled:to-green-500 text-white font-black py-3 px-4 sm:px-8 rounded-xl transition-all transform hover:scale-105 shadow-lg flex items-center justify-center space-x-2 text-sm sm:text-base"
                >
                  {loading && <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>}
                  <span>🔄 REFRESH</span>
                </button>
                
                <a
                  href="/admin"
                  className="bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-bold py-3 px-4 sm:px-6 rounded-xl transition-all transform hover:scale-105 shadow-lg text-center text-sm sm:text-base"
                >
                  ⚙️ Admin
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="space-y-8">
          {leaderboard.map((owner, index) => {
            const rank = owner.rank
            const name = owner.name
            const numGooses = owner.num_gooses ?? 0
            const gooseEggs = '🥚'.repeat(Math.max(0, numGooses))
            const isLeader = rank === 1
            const isTop3 = rank <= 3
            
            const ownerPlayoffMilestones = formatOwnerPlayoffProgress(owner.playoffDetails)
            const hasPlayoffs = owner.playoffs > 0
            
            const getRankEmoji = (rank) => {
              if (rank === 1) return '👑'
              if (rank === 2) return '🥈'
              if (rank === 3) return '🥉'
              return ''
            }

            const getTrophyEmoji = (name) => {
              if (name === 'Joel') return '🏆🏆🏆'
              if (name === 'Ric') return '🏆🏆🏆'
              if (name === 'Will') return '🏆🏆🏆'
              if (name === 'Joey') return '🏆🏆'
              if (name === 'Max') return '🏆'
              if (name === 'Zack') return ''
              return ''
            }

            const getDisplayName = (name) => {
              if (name === 'Will') return 'Dr. Finkel'
              if (name === 'Joey') return 'Sir Edmund Hillary'
              return name
            }
            
            return (
              <div 
                key={owner.id} 
                className={`relative overflow-hidden rounded-2xl shadow-2xl transition-all hover:shadow-3xl transform hover:-translate-y-1 ${
                  isLeader 
                    ? 'bg-gradient-to-br from-yellow-100 via-yellow-50 to-amber-100 ring-4 ring-yellow-400' 
                    : isTop3
                    ? 'bg-gradient-to-br from-emerald-50 via-white to-green-50 ring-2 ring-emerald-200'
                    : 'bg-gradient-to-br from-gray-50 via-white to-gray-50 ring-1 ring-gray-200'
                }`}
              >
                <div className={`p-4 sm:p-6 ${
                  isLeader 
                    ? 'bg-gradient-to-r from-yellow-200 via-amber-100 to-yellow-200' 
                    : isTop3
                    ? 'bg-gradient-to-r from-emerald-100 via-green-50 to-emerald-100'
                    : 'bg-gradient-to-r from-gray-100 via-gray-50 to-gray-100'
                }`}>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-4 sm:space-y-0">
                    <div className="flex items-center space-x-4 sm:space-x-6">
                      <div className={`text-2xl sm:text-3xl font-black px-3 sm:px-4 py-2 rounded-full shadow-lg transform rotate-3 ${
                        isLeader 
                          ? 'bg-gradient-to-br from-yellow-400 to-amber-500 text-yellow-900' 
                          : isTop3
                          ? 'bg-gradient-to-br from-emerald-400 to-green-500 text-emerald-900'
                          : 'bg-gradient-to-br from-gray-400 to-gray-500 text-gray-900'
                      }`}>
                        #{rank}
                      </div>
                      <div>
                        <h2 className="text-2xl sm:text-3xl font-black text-gray-800 flex items-center space-x-2 sm:space-x-3 mb-1">
                          <span>{getDisplayName(owner.name)}</span>
                          <span>{getTrophyEmoji(name)}</span>
                          {gooseEggs && <span className="text-3xl sm:text-4xl">{gooseEggs}</span>}
                          {getRankEmoji(rank) && <span className={`text-3xl sm:text-4xl ${rank === 1 ? 'animate-bounce' : ''}`}>{getRankEmoji(rank)}</span>}
                        </h2>
                        <div className="text-3xl sm:text-4xl font-black bg-gradient-to-r from-emerald-600 to-green-600 bg-clip-text text-transparent">
                          ${owner.totalEarnings}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col sm:text-right space-y-3">
                      {/* Regular Season Stats */}
                      <div className="flex flex-wrap gap-2">
                        <span className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-bold shadow">
                          🏆 {owner.wins}
                        </span>
                        <span className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-bold shadow">
                          🔥 {owner.obo}
                        </span>
                        <span className="bg-gradient-to-r from-purple-500 to-purple-600 text-white px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-bold shadow">
                          🛡️ {owner.dbo}
                        </span>
                        <span className="bg-gradient-to-r from-red-500 to-red-600 text-white px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-bold shadow">
                          🏁 ${owner.eoyDollars || 0}
                        </span>
                      </div>
                      
                      {/* Playoff Bar - Shows furthest milestone per team */}
                      {hasPlayoffs && ownerPlayoffMilestones && (
                        <div className="bg-gradient-to-r from-yellow-400 to-amber-500 text-yellow-900 px-3 py-2 rounded-lg shadow-lg">
                          <div className="flex flex-col gap-1">
                            <span className="font-black text-sm">🏈 PLAYOFFS: ${owner.playoffs}</span>
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(ownerPlayoffMilestones).map(([team, milestone]) => (
                                <span key={team} className="text-xs bg-yellow-200 px-2 py-0.5 rounded-full font-semibold">
                                  {team}: {milestone.label} (${milestone.amount})
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="p-4 sm:p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {owner.teamsSorted?.map(team => {
                      const prob = probabilities[team.abbr]
                      // Only use games data if it's loaded for the current week
                      const game = (gamesLoadedForWeek === currentWeek) ? games[team.abbr] : undefined
                      const winPercentage = prob ? (prob.winProbability * 100).toFixed(0) : null
                      
                      const teamIsPlaying = !!game
                      const gameIsComplete = game?.status === 'STATUS_FINAL'
                      const showLiveProbability = teamIsPlaying && prob && prob.confidence !== 'final' && !gameIsComplete
                      
                      let opponentText = ''
                      let enhancedStatusText = ''
                      
                      if (!game) {
                        opponentText = isPlayoffs ? '' : 'Bye Week'
                        enhancedStatusText = ''
                      } else {
                        const parts = game.enhancedStatus.split('|')
                        opponentText = parts[0]
                        enhancedStatusText = parts[1] || ''
                      }
                      
                      const gameResultIcon = !gameIsComplete ? null :
                        game?.result === 'win' ? '✅' :
                        game?.result === 'tie' && !game?.isHome ? '✅' : '❌'
                      
                      const performanceGradient = 
                        team.performancePercentile >= 0.8 ? 'from-emerald-600 to-green-600' :
                        team.performancePercentile >= 0.6 ? 'from-blue-600 to-indigo-600' :
                        team.performancePercentile >= 0.4 ? 'from-yellow-600 to-orange-600' :
                        team.performancePercentile >= 0.2 ? 'from-orange-600 to-red-600' :
                        'from-red-600 to-red-700'
                      
                      const performanceBorder = 
                        team.performancePercentile >= 0.8 ? 'border-emerald-300 ring-2 ring-emerald-200' :
                        team.performancePercentile >= 0.6 ? 'border-blue-300 ring-2 ring-blue-200' :
                        team.performancePercentile >= 0.4 ? 'border-yellow-300' :
                        team.performancePercentile >= 0.2 ? 'border-orange-300' :
                        'border-red-300'
                      
                      // Get furthest playoff milestone for this team
                      const teamPlayoffMilestone = getFurthestPlayoffMilestone(team.playoffDetails)
                      
                      return (
                        <div key={team.abbr} className={`bg-white rounded-xl p-3 sm:p-4 shadow-lg hover:shadow-xl transition-all transform hover:scale-105 border-2 ${performanceBorder}`}>
                          <div className="flex justify-between items-start mb-3 sm:mb-4">
                            <div className="flex items-center space-x-2 sm:space-x-3 flex-1 min-w-0">
                              <img 
                                src={`https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/${team.abbr.toLowerCase()}.png`}
                                alt={`${team.abbr} logo`}
                                className="w-8 h-8 sm:w-10 sm:h-10 object-contain flex-shrink-0"
                                onError={(e) => {
                                  e.target.src = `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/nfl.png`
                                }}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="font-black text-lg sm:text-xl text-gray-800">{team.abbr}</div>
                                {/* Show opponent info only if team is playing OR it's regular season bye */}
                                {teamIsPlaying ? (
                                  <>
                                    <div className="text-xs sm:text-sm text-gray-600 font-medium truncate">{opponentText}</div>
                                    {enhancedStatusText && (
                                      <div className="text-xs text-gray-500 font-medium truncate">{enhancedStatusText}</div>
                                    )}
                                  </>
                                ) : (
                                  !isPlayoffs && opponentText && (
                                    <div className="text-xs sm:text-sm text-gray-600 font-medium truncate">{opponentText}</div>
                                  )
                                )}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0 ml-2">
                              <div className={`font-black text-base sm:text-lg bg-gradient-to-r ${performanceGradient} bg-clip-text text-transparent`}>
                                ${team.earnings}
                              </div>
                              {/* Only show probability if team is playing */}
                              {showLiveProbability && winPercentage && (
                                <div className={`text-xs px-2 py-1 rounded-full font-bold shadow mt-1 ${
                                  prob.winProbability > 0.6 ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white' :
                                  prob.winProbability > 0.4 ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white' :
                                  'bg-gradient-to-r from-red-500 to-red-600 text-white'
                                }`}>
                                  {winPercentage}%
                                </div>
                              )}
                              {/* Only show result if team played */}
                              {teamIsPlaying && gameIsComplete && gameResultIcon && (
                                <div className={`text-base sm:text-lg font-bold mt-1 ${
                                  gameResultIcon === '✅' ? 'text-green-600' : 'text-red-600'
                                }`}>
                                  {gameResultIcon}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {/* Stats Grid */}
                          <div className="grid grid-cols-4 gap-1 sm:gap-1">
                            <div className="text-center bg-blue-50 rounded-lg p-1.5 sm:p-2">
                              <div className="font-black text-blue-600 text-sm sm:text-lg">{team.wins}</div>
                              <div className="text-xs text-blue-500 font-bold">WINS</div>
                            </div>
                            <div className="text-center bg-orange-50 rounded-lg p-1.5 sm:p-2">
                              <div className="font-black text-orange-600 text-sm sm:text-lg">{team.obo}</div>
                              <div className="text-xs text-orange-500 font-bold">OBO</div>
                            </div>
                            <div className="text-center bg-purple-50 rounded-lg p-1.5 sm:p-2">
                              <div className="font-black text-purple-600 text-sm sm:text-lg">{team.dbo}</div>
                              <div className="text-xs text-purple-500 font-bold">DBO</div>
                            </div>
                            <div className="text-center bg-red-50 rounded-lg p-1.5 sm:p-2">
                              <div className="font-black text-red-600 text-sm sm:text-lg">${team.eoyDollars || 0}</div>
                              <div className="text-xs text-red-500 font-bold">EOY</div>
                            </div>
                          </div>
                          
                          {/* Playoff Milestone - Shows ONE thing with dollar amount */}
                          {teamPlayoffMilestone && (
                            <div className={`mt-2 rounded-lg px-3 py-1.5 text-center ${
                              teamPlayoffMilestone.order >= 5 ? 'bg-gradient-to-r from-yellow-400 to-amber-500' :
                              teamPlayoffMilestone.order >= 4 ? 'bg-yellow-100' :
                              teamPlayoffMilestone.order >= 3 ? 'bg-yellow-50' :
                              'bg-gray-50'
                            }`}>
                              <span className={`font-black text-sm ${
                                teamPlayoffMilestone.order >= 5 ? 'text-yellow-900' : 'text-yellow-700'
                              }`}>
                                🏈 {teamPlayoffMilestone.label}: ${teamPlayoffMilestone.amount}
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {leaderboard.length === 0 && (
          <div className="text-center py-16">
            <div className="text-8xl mb-6">🏈</div>
            <h2 className="text-4xl font-black text-gray-700 mb-4">No Data Yet!</h2>
            <p className="text-xl text-gray-600">Add some awards to see the leaderboard.</p>
          </div>
        )}
      </div>
    </div>
  )
}
