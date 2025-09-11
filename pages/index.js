import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Home() {
  const [leaderboard, setLeaderboard] = useState([])
  const [probabilities, setProbabilities] = useState({})
  const [gooseData, setGooseData] = useState({})
  const [games, setGames] = useState({})
  const [loading, setLoading] = useState(true)
  const [currentSeason, setCurrentSeason] = useState(2025)
  const [currentWeek, setCurrentWeek] = useState(2)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  useEffect(() => {
    loadCurrentWeek()
    
    // Set up auto-refresh every 5 minutes
    const interval = setInterval(() => {
      if (autoRefresh) {
        console.log('Auto-refreshing data...')
        loadData()
      }
    }, 5 * 60 * 1000) // 5 minutes

    return () => {
      clearInterval(interval)
    }
  }, [autoRefresh])

  // Consolidated function to load games data
  async function loadGames() {
    console.log('=== STARTING LOADGAMES ===')
    console.log('Current season:', currentSeason, 'Current week:', currentWeek)
    try {
      const { data: gamesData, error: gamesError } = await supabase
        .from('games')
        .select('*')
        .eq('season', currentSeason)
        .eq('week', currentWeek)

      console.log('Games query completed. Error:', gamesError, 'Data count:', gamesData?.length)
      console.log('Raw games data:', gamesData)

      if (!gamesError && gamesData && gamesData.length > 0) {
        console.log('Processing', gamesData.length, 'games...')
        const gameMap = {}
        
        gamesData.forEach((game, index) => {
          console.log(`Game ${index + 1}: ${game.home} vs ${game.away}, status: ${game.status}`)
          
          // Create enhanced status for each team
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

          // Determine game result for each team
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
          
          console.log(`Home team ${game.home} enhanced text: "${homeText}"`)
          console.log(`Away team ${game.away} enhanced text: "${awayText}"`)
          
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
        
        console.log('Final game map:', gameMap)
        setGames(gameMap)
        console.log('Games state updated with enhanced status!')
        console.log('=== LOADGAMES COMPLETE ===')
      } else {
        console.log('No games data available - clearing games state')
        setGames({}) // Clear games if no data
      }
    } catch (error) {
      console.log('Error in loadGames:', error)
    }
  }

  async function loadCurrentWeek() {
    console.log('Loading current week...')
    try {
      const response = await fetch('/api/current-week')
      if (response.ok) {
        const data = await response.json()
        console.log('Current week API response:', data)
        setCurrentSeason(data.season)
        setCurrentWeek(data.week)
        
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

  async function loadData() {
    console.log('=== STARTING LOADDATA ===')
    console.log('Season:', currentSeason, 'Week:', currentWeek)
    try {
      setLoading(true)
      
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
            eoy: 0
          }
        }
        
        const points = award.points || 1
        const earnings = points * 5
        
        ownerStats[ownerId].totalEarnings += earnings
        ownerStats[ownerId].teams[teamAbbr].earnings += earnings
        
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
          case 'COACH_FIRED':
            ownerStats[ownerId].eoy += 1
            ownerStats[ownerId].teams[teamAbbr].eoy += 1
            break
        }
      })

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
            eoy: 0
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
      
      const allTeams = []
      sortedLeaderboard.forEach(owner => {
        Object.values(owner.teams).forEach(team => {
          allTeams.push({ ...team, ownerName: owner.name })
        })
      })
      allTeams.sort((a, b) => b.earnings - a.earnings)
      
      // Create earnings ranges for gradient consistency (handles ties)
      const earningsRanges = []
      allTeams.forEach(team => {
        if (!earningsRanges.find(range => range.earnings === team.earnings)) {
          earningsRanges.push({ earnings: team.earnings })
        }
      })
      earningsRanges.sort((a, b) => b.earnings - a.earnings)
      
      // Assign percentiles based on unique earnings values
      earningsRanges.forEach((range, index) => {
        const percentile = (earningsRanges.length - index) / earningsRanges.length
        range.performancePercentile = percentile
      })
      
      // Apply same percentile to teams with same earnings
      allTeams.forEach(team => {
        const range = earningsRanges.find(r => r.earnings === team.earnings)
        team.performancePercentile = range.performancePercentile
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
      
      setLeaderboard(sortedLeaderboard)

      // Load all data in parallel
      console.log('Loading probabilities, goose data, and games...')
      await Promise.all([
        loadProbabilities(teams),
        loadGooseProbabilities(sortedLeaderboard),
        loadGames() // Now games are loaded every time
      ])
      
      console.log('All data loaded, games state should be updated')
      setLastUpdate(new Date())
      setLoading(false)
      console.log('=== LOADDATA COMPLETE ===')
    } catch (error) {
      console.error('Error loading data:', error)
      setLoading(false)
    }
  }

  async function loadProbabilities(teams) {
    try {
      const response = await fetch(`/api/kalshi-probabilities?week=${currentWeek}&season=${currentSeason}`)
      if (response.ok) {
        const data = await response.json()
        console.log(`Loading probabilities for Week ${currentWeek}:`, data.probabilities)
        
        // Set probability to 0 for teams without games (bye weeks)
        const adjustedProbabilities = { ...data.probabilities }
        
        teams?.forEach(team => {
          if (!games[team.abbr] && !adjustedProbabilities[team.abbr]) {
            adjustedProbabilities[team.abbr] = { winProbability: 0, confidence: 'bye_week' }
          }
        })
        
        setProbabilities(adjustedProbabilities || {})
      }
    } catch (error) {
      console.error('Error loading probabilities:', error)
    }
  }

  async function loadGooseProbabilities(owners) {
    try {
      console.log('Starting goose probability calculation...')
      console.log('Current probabilities state:', Object.keys(probabilities).length, 'teams have probabilities')
      
      const goosePromises = owners.map(async (owner) => {
        // Pass current probabilities to avoid API making another Kalshi call
        const response = await fetch(`/api/goose-probability`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            owner_id: owner.id,
            week: currentWeek,
            season: currentSeason,
            probabilities: probabilities // Pass fresh probabilities
          })
        })
        
        if (response.ok) {
          const data = await response.json()
          console.log(`Goose data for ${owner.name}:`, data.goosePercentage, '- Reason:', data.reason)
          return { ownerId: owner.id, ...data }
        }
        console.error(`Goose API failed for ${owner.name}:`, response.status)
        return { ownerId: owner.id, gooseProbability: 0, reason: 'Error loading' }
      })

      const gooseResults = await Promise.all(goosePromises)
      const gooseMap = {}
      gooseResults.forEach(result => {
        gooseMap[result.ownerId] = result
      })
      console.log('Final goose map:', gooseMap)
      setGooseData(gooseMap)
    } catch (error) {
      console.error('Error loading goose probabilities:', error)
    }
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-green-100 to-teal-200">
      <div className="bg-white shadow-xl border-b-4 border-emerald-500 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-green-500/10"></div>
        <div className="container mx-auto px-4 py-8 relative">
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center space-y-6 lg:space-y-0">
            <div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-emerald-800 mb-3 tracking-tight">
                🏈 PAYDAY FOOTBALL LEAGUE
              </h1>
              <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-6 text-emerald-600">
                <span className="font-bold text-lg bg-emerald-100 px-3 py-1 rounded-full w-fit">
                  Week {currentWeek} • {currentSeason} Season
                </span>
                {lastUpdate && (
                  <span className="text-sm bg-white px-2 py-1 rounded-full shadow w-fit">
                    🕐 Last updated: {lastUpdate.toLocaleTimeString()}
                  </span>
                )}
                <div className="flex items-center space-x-2 bg-white px-3 py-1 rounded-full shadow w-fit">
                  <div className={`w-3 h-3 rounded-full animate-pulse ${autoRefresh ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                  <span className="text-sm font-medium">Live updates {autoRefresh ? 'ON' : 'OFF'}</span>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3">
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

      <div className="container mx-auto px-4 py-8">
        <div className="space-y-8">
          {leaderboard.map((owner, index) => {
            const goose = gooseData[owner.id] || {}
            const hasGooseRisk = goose.gooseProbability > 0.15
            const rank = owner.rank
            const numGooses = owner.num_gooses ?? 0
            const gooseEggs = '🥚'.repeat(Math.max(0, numGooses))
            const isLeader = rank === 1
            const isTop3 = rank <= 3
            
            const getRankEmoji = (rank) => {
              if (rank === 1) return '👑'
              if (rank === 2) return '🥈'
              if (rank === 3) return '🥉'
              return ''
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
                          <span>{owner.name}</span>
                          ${numGooses}
                          {gooseEggs && <span className={`text-3xl sm:text-4xl ${numGooses > 0 ? 'animate-bounce' : ''}`}>{gooseEgges}</span>}
                          {getRankEmoji(rank) && <span className={`text-3xl sm:text-4xl ${rank === 1 ? 'animate-bounce' : ''}`}>{getRankEmoji(rank)}</span>}
                        </h2>
                        <div className="text-3xl sm:text-4xl font-black bg-gradient-to-r from-emerald-600 to-green-600 bg-clip-text text-transparent">
                          ${owner.totalEarnings}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col sm:text-right space-y-3">
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
                          🏁 {owner.eoy}
                        </span>
                      </div>
                      
                      <div className={`text-xs sm:text-sm font-bold px-3 sm:px-4 py-2 rounded-full shadow-lg w-fit ${
                        goose.gooseProbability > 0.3 ? 'bg-gradient-to-r from-red-500 to-red-600 text-white animate-pulse' :
                        goose.gooseProbability > 0.1 ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white' :
                        'bg-gradient-to-r from-green-500 to-emerald-500 text-white'
                      }`}>
                        🥚 Goose Risk: {goose.goosePercentage || '0%'}
                      </div>
                    </div>
                  </div>
                  
                  {hasGooseRisk && (
                    <div className="mt-4 p-3 sm:p-4 bg-gradient-to-r from-yellow-200 to-orange-200 border-l-4 border-yellow-500 rounded-lg shadow-lg">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
                        <span className="font-black text-yellow-800 text-sm sm:text-lg">
                          🚨 HIGH GOOSE ALERT: {goose.goosePercentage} chance of scoring 0 points! 🚨
                        </span>
                        <span className="text-xs text-yellow-700 bg-yellow-100 px-2 py-1 rounded-full w-fit">{goose.reason}</span>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="p-4 sm:p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {owner.teamsSorted?.map(team => {
                      const prob = probabilities[team.abbr]
                      const game = games[team.abbr]
                      const winPercentage = prob ? (prob.winProbability * 100).toFixed(0) : 'N/A'
                      
                      // Debug logging for each team
                      if (team.abbr === 'BUF' || team.abbr === 'KC' || team.abbr === 'LAR') {
                        console.log(`=== RENDERING ${team.abbr} ===`)
                        console.log('Game data:', game)
                        console.log('Enhanced status:', game?.enhancedStatus)
                        console.log('All games keys:', Object.keys(games))
                      }
                      
                      const gameIsComplete = game?.status === 'STATUS_FINAL'
                      const showLiveProbability = prob && prob.confidence !== 'final' && !gameIsComplete && game // Only show if game exists
                      
                      // Handle bye weeks and split enhanced status
                      let opponentText = ''
                      let enhancedStatusText = ''
                      
                      if (!game) {
                        opponentText = 'Bye Week'
                        enhancedStatusText = ''
                      } else {
                        const parts = game.enhancedStatus.split('|')
                        opponentText = parts[0] // "vs LAR" or "@ KC"
                        enhancedStatusText = parts[1] || '' // Everything after the "|"
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
                                <div className="text-xs sm:text-sm text-gray-600 font-medium truncate">{opponentText}</div>
                                {enhancedStatusText && (
                                  <div className="text-xs text-gray-500 font-medium truncate">{enhancedStatusText}</div>
                                )}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0 ml-2">
                              <div className={`font-black text-base sm:text-lg bg-gradient-to-r ${performanceGradient} bg-clip-text text-transparent`}>
                                ${team.earnings}
                              </div>
                              {showLiveProbability && (
                                <div className={`text-xs px-2 py-1 rounded-full font-bold shadow mt-1 ${
                                  prob.winProbability > 0.6 ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white' :
                                  prob.winProbability > 0.4 ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white' :
                                  'bg-gradient-to-r from-red-500 to-red-600 text-white'
                                }`}>
                                  {winPercentage}%
                                </div>
                              )}
                              {gameIsComplete && gameResultIcon && (
                                <div className={`text-base sm:text-lg font-bold mt-1 ${
                                  gameResultIcon === '✅' ? 'text-green-600' : 'text-red-600'
                                }`}>
                                  {gameResultIcon}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 sm:gap-1">
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
                              <div className="font-black text-red-600 text-sm sm:text-lg">{team.eoy}</div>
                              <div className="text-xs text-red-500 font-bold">EOY</div>
                            </div>
                          </div>
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
}// Rebuild Thu Sep 11 10:31:04 EDT 2025
// Rebuild Thu Sep 11 10:40:09 EDT 2025
// Rebuild Thu Sep 11 10:43:42 EDT 2025
// Rebuild Thu Sep 11 10:45:38 EDT 2025
// Rebuild Thu Sep 11 10:46:12 EDT 2025
