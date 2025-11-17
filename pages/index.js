import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Home() {
  const [leaderboard, setLeaderboard] = useState([])
  const [probabilities, setProbabilities] = useState({})
  const [gooseData, setGooseData] = useState({})
  const [games, setGames] = useState({})
  const [loading, setLoading] = useState(true)
  const [currentSeason, setCurrentSeason] = useState(2025)
  const [currentWeek, setCurrentWeek] = useState(3)
  const [actualWeek, setActualWeek] = useState(3)
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
    if (newWeek >= 1 && newWeek <= 18 && newWeek !== currentWeek) {
      console.log(`User manually changed week from ${currentWeek} to ${newWeek}`)
      setCurrentWeek(newWeek)
      setUserSelectedWeek(true)
      
      setGames({})
      setProbabilities({})
      setGooseData({})
      
      setTimeout(() => {
        loadDataForWeek(newWeek)
      }, 100)
    }
  }

  async function loadDataForWeek(weekNumber) {
    console.log(`=== LOADING DATA FOR WEEK ${weekNumber} ===`)
    setLoading(true)
    
    try {
      const { ownerStats, teams, sortedLeaderboard } = await loadBaseData()
      setLeaderboard(sortedLeaderboard)

      await Promise.all([
        loadProbabilitiesForWeek(teams, weekNumber),
        loadGamesForWeek(weekNumber)
      ])

      setTimeout(async () => {
        await loadGooseProbabilitiesForWeek(sortedLeaderboard, weekNumber)
        setLastUpdate(new Date())
        setLoading(false)
        console.log(`=== WEEK ${weekNumber} DATA LOAD COMPLETE ===`)
      }, 500)

    } catch (error) {
      console.error('Error loading data for week:', error)
      setLoading(false)
    }
  }

  async function loadData() {
    await loadDataForWeek(currentWeek)
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

  async function loadGamesForWeek(weekNumber) {
    console.log(`Loading games for Week ${weekNumber}`)
    try {
      const { data: gamesData, error: gamesError } = await supabase
        .from('games')
        .select('*')
        .eq('season', currentSeason)
        .eq('week', weekNumber)

      if (!gamesError && gamesData && gamesData.length > 0) {
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
      } else {
        setGames({})
      }
    } catch (error) {
      console.log('Error loading games:', error)
      setGames({})
    }
  }

  async function loadProbabilitiesForWeek(teams, weekNumber) {
    try {
      console.log(`Loading probabilities for Week ${weekNumber}`)
      const response = await fetch(`/api/kalshi-probabilities?week=${weekNumber}&season=${currentSeason}`)
      if (response.ok) {
        const data = await response.json()
        
        const adjustedProbabilities = { ...data.probabilities }
        
        teams?.forEach(team => {
          if (!adjustedProbabilities[team.abbr]) {
            adjustedProbabilities[team.abbr] = { winProbability: 0, confidence: 'bye_week' }
          }
        })
        
        setProbabilities(adjustedProbabilities || {})
        console.log(`Probabilities loaded for Week ${weekNumber}:`, Object.keys(adjustedProbabilities).length, 'teams')
      }
    } catch (error) {
      console.error('Error loading probabilities:', error)
      setProbabilities({})
    }
  }

  async function loadGooseProbabilitiesForWeek(owners, weekNumber) {
    try {
      console.log(`Loading goose probabilities for Week ${weekNumber}`)
      
      const goosePromises = owners.map(async (owner) => {
        const response = await fetch(`/api/goose-probability`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            owner_id: owner.id,
            week: weekNumber,
            season: currentSeason
          })
        })
        
        if (response.ok) {
          const data = await response.json()
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
      setGooseData({})
      setTimeout(() => {
        setGooseData(gooseMap)
      }, 50)
      console.log(`Goose probabilities loaded for Week ${weekNumber}`)
    } catch (error) {
      console.error('Error loading goose probabilities:', error)
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
        
        setCurrentSeason(actualData.season)
        setActualWeek(actualData.week)
        
        if (isInitialLoad) {
          setCurrentWeek(displayData.week)
          setIsInitialLoad(false)
        }
        
        setWeekInfo({
          actual: actualData.week,
          display: displayData.week,
          dayOfWeek: displayData.dayOfWeek
        })
        
        setTimeout(() => {
          loadDataForWeek(displayData.week)
        }, 100)
      }
    } catch (error) {
      console.error('Error getting current week:', error)
      loadData()
    }
  }

  function getDayOfWeekName(dayOfWeek) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    return days[dayOfWeek] || 'Unknown'
  }

  function getWeekDisplayLogic() {
    if (!weekInfo) return ''
    
    const dayName = getDayOfWeekName(weekInfo.dayOfWeek)
    
    if (userSelectedWeek) {
      return `Manual selection: Week ${currentWeek}`
    }
    
    if (weekInfo.actual !== weekInfo.display) {
      return `${dayName}: Showing Week ${weekInfo.display} (NFL is currently in Week ${weekInfo.actual})`
    }
    return `${dayName}: Showing current NFL Week ${weekInfo.display}`
  }

  if (loading && leaderboard.length === 0) {
    return (
      <div className="min-h-screen bg-gray-100 flex justify-center items-center">
        <div className="text-center bg-white p-12 border border-gray-400 max-w-2xl mx-4">
          <div className="text-3xl font-bold text-gray-700 mb-4">
            AGGREGATING PERFORMANCE METRICS
          </div>
          <div className="text-lg text-gray-600 mb-2">
            Compiling cross-functional KPI data streams...
          </div>
          <div className="text-sm text-gray-500">
            Leveraging enterprise-grade analytics infrastructure to optimize stakeholder visibility
          </div>
          <div className="mt-6 text-xs text-gray-400 border-t border-gray-300 pt-4">
            Feldman & Associates LLC - Professional Services Division
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b-2 border-gray-400">
        <div className="container mx-auto px-4 py-6">
          <div className="mb-4">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">
              FELDMAN & ASSOCIATES - WORK APPROVED SOCIAL FUNCTION (a.k.a. "Feldman Party")
            </h1>
            <div className="text-sm text-gray-600">
              Quarterly Review Period: Week {currentWeek} | Fiscal Year {currentSeason}
            </div>
            {lastUpdate && (
              <div className="text-xs text-gray-500 mt-1">
                Data last synchronized: {lastUpdate.toLocaleTimeString()} | Auto-refresh status: {autoRefresh && !userSelectedWeek ? 'ENABLED' : 'DISABLED'}
              </div>
            )}
          </div>
          
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => changeWeek(currentWeek - 1)}
              disabled={currentWeek <= 1}
              className="bg-gray-300 hover:bg-gray-400 disabled:bg-gray-200 disabled:text-gray-400 text-gray-700 px-3 py-1 text-sm border border-gray-400"
            >
              Previous Period
            </button>
            <select
              value={currentWeek}
              onChange={(e) => changeWeek(parseInt(e.target.value))}
              className="bg-gray-200 text-gray-700 px-3 py-1 text-sm border border-gray-400"
            >
              {Array.from({ length: 18 }, (_, i) => i + 1).map(w => (
                <option key={w} value={w}>Review Period {w}</option>
              ))}
            </select>
            <button
              onClick={() => changeWeek(currentWeek + 1)}
              disabled={currentWeek >= 18}
              className="bg-gray-300 hover:bg-gray-400 disabled:bg-gray-200 disabled:text-gray-400 text-gray-700 px-3 py-1 text-sm border border-gray-400"
            >
              Next Period
            </button>
            <button 
              onClick={loadData}
              disabled={loading}
              className="bg-gray-400 hover:bg-gray-500 disabled:bg-gray-300 text-white px-4 py-1 text-sm border border-gray-500"
            >
              Refresh Data
            </button>
            <a
              href="/scoreboard"
              className="bg-gray-400 hover:bg-gray-500 text-white px-4 py-1 text-sm border border-gray-500"
            >
              Detailed Scoreboard
            </a>
            <a
              href="/minimal"
              className="bg-gray-400 hover:bg-gray-500 text-white px-4 py-1 text-sm border border-gray-500"
            >
              Executive Summary
            </a>
            <a
              href="/admin"
              className="bg-gray-400 hover:bg-gray-500 text-white px-4 py-1 text-sm border border-gray-500"
            >
              Administration Portal
            </a>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="space-y-4">
          {leaderboard.map((owner, index) => {
            const goose = gooseData[owner.id] || {}
            const hasGooseRisk = goose.gooseProbability > 0.15
            const rank = owner.rank
            const numGooses = owner.num_gooses ?? 0
            const isLeader = rank === 1
            const isWill = owner.name?.toLowerCase().includes('will')
            
            return (
              <div 
                key={owner.id} 
                className="bg-white border border-gray-300"
              >
                <div className="p-4 bg-gray-50 border-b border-gray-300">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-xs text-gray-500 uppercase mb-1">Portfolio Manager / Strategic Consultant</div>
                      <h2 className="text-lg font-bold text-gray-800">{owner.name}{isWill && ', Esq., MBA'}</h2>
                      <div className="text-sm text-gray-600 mt-1">
                        Performance Ranking: <span className="font-bold">#{rank}</span> | 
                        Cumulative Portfolio Value: <span className="font-bold">${owner.totalEarnings}</span>
                        {numGooses > 0 && <span> | Historical Risk Events: {numGooses}</span>}
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <table className="text-xs text-gray-600 border-collapse border border-gray-300">
                        <tbody>
                          <tr className="border-b border-gray-300 bg-white">
                            <td className="py-1 px-2 border-r border-gray-300">Key Performance Indicators:</td>
                            <td className="py-1 px-2 font-semibold"></td>
                          </tr>
                          <tr className="border-b border-gray-300 bg-white">
                            <td className="py-1 px-2 border-r border-gray-300">Win Events</td>
                            <td className="py-1 px-2 font-semibold text-right">{owner.wins}</td>
                          </tr>
                          <tr className="border-b border-gray-300 bg-white">
                            <td className="py-1 px-2 border-r border-gray-300">Offensive Benchmarks</td>
                            <td className="py-1 px-2 font-semibold text-right">{owner.obo}</td>
                          </tr>
                          <tr className="border-b border-gray-300 bg-white">
                            <td className="py-1 px-2 border-r border-gray-300">Defensive Benchmarks</td>
                            <td className="py-1 px-2 font-semibold text-right">{owner.dbo}</td>
                          </tr>
                          <tr className="bg-white">
                            <td className="py-1 px-2 border-r border-gray-300">End-of-Year Metrics</td>
                            <td className="py-1 px-2 font-semibold text-right">{owner.eoy}</td>
                          </tr>
                        </tbody>
                      </table>
                      
                      <div className={`text-xs mt-2 px-2 py-1 border ${
                        goose.gooseProbability > 0.1 ? 'bg-red-50 border-red-400 text-red-700' :
                        goose.gooseProbability > 0.05 ? 'bg-yellow-50 border-yellow-400 text-yellow-700' :
                        'bg-gray-50 border-gray-300 text-gray-600'
                      }`}>
                        Risk Assessment Profile: {goose.goosePercentage || '0%'}
                      </div>
                    </div>
                  </div>
                  
                  {hasGooseRisk && (
                    <div className="mt-3 p-2 bg-white border border-gray-400">
                      <div className="text-xs text-gray-700">
                        <strong>RISK MANAGEMENT ADVISORY:</strong> Current portfolio composition exhibits {goose.goosePercentage} statistical probability of zero-point outcome during this reporting period. 
                        Contributing factors: {goose.reason}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="p-4">
                  <div className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-300">
                    STRATEGIC ASSET ALLOCATION - DETAILED PERFORMANCE BREAKDOWN
                  </div>
                  <table className="w-full text-left border-collapse border border-gray-300">
                    <thead>
                      <tr className="bg-gray-200">
                        <th className="py-2 px-2 text-xs font-semibold text-gray-700 border border-gray-300">Asset ID</th>
                        <th className="py-2 px-2 text-xs font-semibold text-gray-700 border border-gray-300">Matchup Data</th>
                        <th className="py-2 px-2 text-xs font-semibold text-gray-700 border border-gray-300">Win Probability</th>
                        <th className="py-2 px-2 text-xs font-semibold text-gray-700 text-right border border-gray-300">Portfolio Value</th>
                        <th className="py-2 px-2 text-xs font-semibold text-gray-700 text-center border border-gray-300">Win</th>
                        <th className="py-2 px-2 text-xs font-semibold text-gray-700 text-center border border-gray-300">OBO</th>
                        <th className="py-2 px-2 text-xs font-semibold text-gray-700 text-center border border-gray-300">DBO</th>
                        <th className="py-2 px-2 text-xs font-semibold text-gray-700 text-center border border-gray-300">EOY</th>
                      </tr>
                    </thead>
                    <tbody>
                      {owner.teamsSorted?.map((team, teamIndex) => {
                        const prob = probabilities[team.abbr]
                        const game = games[team.abbr]
                        const winPercentage = prob ? (prob.winProbability * 100).toFixed(0) : 'N/A'
                        
                        const gameIsComplete = game?.status === 'STATUS_FINAL'
                        const showLiveProbability = prob && prob.confidence !== 'final' && !gameIsComplete && game
                        
                        let opponentText = ''
                        let enhancedStatusText = ''
                        
                        if (!game) {
                          opponentText = 'Non-Operational Period (Bye Week)'
                          enhancedStatusText = ''
                        } else {
                          const parts = game.enhancedStatus.split('|')
                          opponentText = parts[0]
                          enhancedStatusText = parts[1] || ''
                        }
                        
                        const gameResultText = !gameIsComplete ? 'In Progress' :
                          game?.result === 'win' ? 'Win' :
                          game?.result === 'tie' && !game?.isHome ? 'Win (Tie/Away)' : 'Loss'
                        
                        return (
                          <tr key={team.abbr} className={teamIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="py-2 px-2 text-sm border border-gray-300">
                              <div className="font-bold text-gray-800">{team.abbr}</div>
                              <div className="text-xs text-gray-500">{team.name}</div>
                            </td>
                            <td className="py-2 px-2 text-xs text-gray-600 border border-gray-300">
                              <div>{opponentText}</div>
                              {enhancedStatusText && (
                                <div className="text-gray-500">{enhancedStatusText}</div>
                              )}
                            </td>
                            <td className="py-2 px-2 text-xs text-gray-600 border border-gray-300">
                              {showLiveProbability ? `${winPercentage}% likelihood` : gameIsComplete ? gameResultText : 'Scheduled'}
                            </td>
                            <td className="py-2 px-2 text-sm font-bold text-gray-800 text-right border border-gray-300">
                              ${team.earnings}
                            </td>
                            <td className="py-2 px-2 text-xs text-center border border-gray-300">{team.wins}</td>
                            <td className="py-2 px-2 text-xs text-center border border-gray-300">{team.obo}</td>
                            <td className="py-2 px-2 text-xs text-center border border-gray-300">{team.dbo}</td>
                            <td className="py-2 px-2 text-xs text-center border border-gray-300">{team.eoy}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>

        {leaderboard.length === 0 && (
          <div className="text-center py-16 bg-white border border-gray-300">
            <h2 className="text-2xl font-bold text-gray-700 mb-2">DATA AGGREGATION IN PROGRESS</h2>
            <p className="text-gray-600">Awaiting performance metrics input to generate comprehensive stakeholder report.</p>
          </div>
        )}
      </div>

      <div className="mt-8 bg-gray-800 py-8 border-t-2 border-gray-600">
        <div className="container mx-auto px-4">
          <div className="text-xs text-gray-400 leading-relaxed space-y-2">
            <p className="text-center font-semibold text-gray-300 mb-3">
              Feldman & Associates, LLC - Professional Consulting Services
            </p>
            
            <p>
              <strong>DISCLAIMER:</strong> The information provided herein is for informational and analytical purposes only. Feldman & Associates, LLC makes no representations or warranties regarding completeness, accuracy, or reliability of data. Past performance does not guarantee future results.
            </p>

            <p>
              <strong>COMPLIANCE NOTICE:</strong> This platform operates in full compliance with applicable federal and state regulations including SOX, GDPR, CCPA, and SEC filing requirements. All stakeholder communications are subject to attorney-client privilege where applicable.
            </p>

            <p className="text-center pt-3 border-t border-gray-700">
              123 Corporate Plaza, Suite 4000 | Sonoma Valley, CA 94559 | info@feldmanassociates.legal
            </p>

            <p className="text-center text-gray-500">
              © 2025 Feldman & Associates, LLC. All Rights Reserved. Terms subject to change without notice.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
