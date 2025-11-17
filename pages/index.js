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
        <div 
          className="text-center bg-white p-12 border border-gray-400 max-w-3xl mx-4 relative"
          style={{
            backgroundImage: 'url(https://images.unsplash.com/photo-1483653085484-eb63c9f02547?q=80&w=1740)',
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        >
          <div className="absolute inset-0 bg-white/90"></div>
          <div className="relative z-10">
            <div className="text-3xl font-bold text-gray-700 mb-4">
              PREPARING FELDMAN PARTY MATERIALS
            </div>
            <div className="text-lg text-gray-600 mb-2">
              Assembling approved networking event documentation...
            </div>
            <div className="text-sm text-gray-500">
              At Feldman & Associates, we strive to deliver measurable value through synergistic collaboration frameworks and best-in-class stakeholder engagement methodologies.
            </div>
            <div className="mt-6 text-xs text-gray-400 border-t border-gray-300 pt-4">
              Feldman & Associates LLC - Where Excellence Meets Professionalism
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Corporate Hero Section */}
      <div 
        className="relative border-b-2 border-gray-400"
        style={{
          backgroundImage: 'url(https://plus.unsplash.com/premium_photo-1682056762907-23d08f913805?q=80&w=1548)',
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        <div className="absolute inset-0 bg-white/85"></div>
        <div className="relative z-10 container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto text-center">
            <div className="mb-6">
              <img 
                src="https://plus.unsplash.com/premium_photo-1661347859297-859b8ae1d7c5?q=80&w=1498"
                alt="Professional consultation"
                className="w-32 h-32 mx-auto rounded-full border-4 border-gray-400 object-cover"
              />
            </div>
            <h1 className="text-4xl font-bold text-gray-800 mb-4">
              THE FELDMAN PARTY
            </h1>
            <div className="text-xl text-gray-600 mb-6">
              A Compliant, Work-Approved Social Networking Function
            </div>
            <div className="bg-white border border-gray-400 p-6 text-left">
              <p className="text-sm text-gray-700 leading-relaxed mb-4">
                Here at Feldman & Associates, we strive to cultivate an environment of professional excellence through strategic relationship-building initiatives. The Feldman Party represents our commitment to fostering collaborative synergies while maintaining the highest standards of corporate decorum.
              </p>
              <p className="text-sm text-gray-700 leading-relaxed">
                This quarterly team-building exercise leverages cross-functional performance metrics to drive stakeholder engagement and promote best practices in interpersonal professional development. All activities are conducted in full compliance with HR guidelines and applicable corporate policies.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Mission Statement Banner */}
      <div 
        className="relative border-b border-gray-300"
        style={{
          backgroundImage: 'url(https://images.unsplash.com/photo-1496588152823-86ff7695e68f?q=80&w=1740)',
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        <div className="absolute inset-0 bg-gray-100/90"></div>
        <div className="relative z-10 py-6">
          <div className="container mx-auto px-4 text-center">
            <div className="text-xs text-gray-600 uppercase tracking-wide mb-2">Our Corporate Mission</div>
            <div className="text-sm text-gray-700 max-w-3xl mx-auto">
              "To maximize synergistic value propositions through data-driven decision frameworks while maintaining operational excellence and fostering sustainable growth trajectories in alignment with core competency development objectives."
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Bar */}
      <div className="bg-white border-b-2 border-gray-400">
        <div className="container mx-auto px-4 py-4">
          <div className="mb-4">
            <div className="text-xs text-gray-500 uppercase mb-1">Approved Corporate Social Function</div>
            <h2 className="text-xl font-bold text-gray-800">
              Feldman Party - Performance Review Period {currentWeek} | FY {currentSeason}
            </h2>
            {lastUpdate && (
              <div className="text-xs text-gray-500 mt-1">
                Data synchronized: {lastUpdate.toLocaleTimeString()} | Refresh protocol: {autoRefresh && !userSelectedWeek ? 'ACTIVE' : 'SUSPENDED'}
              </div>
            )}
          </div>
          
          <div className="flex gap-2 flex-wrap text-sm">
            <button
              onClick={() => changeWeek(currentWeek - 1)}
              disabled={currentWeek <= 1}
              className="bg-gray-300 hover:bg-gray-400 disabled:bg-gray-200 text-gray-700 px-3 py-1 border border-gray-400"
            >
              Previous
            </button>
            <select
              value={currentWeek}
              onChange={(e) => changeWeek(parseInt(e.target.value))}
              className="bg-gray-200 text-gray-700 px-3 py-1 border border-gray-400"
            >
              {Array.from({ length: 18 }, (_, i) => i + 1).map(w => (
                <option key={w} value={w}>Period {w}</option>
              ))}
            </select>
            <button
              onClick={() => changeWeek(currentWeek + 1)}
              disabled={currentWeek >= 18}
              className="bg-gray-300 hover:bg-gray-400 disabled:bg-gray-200 text-gray-700 px-3 py-1 border border-gray-400"
            >
              Next
            </button>
            <button 
              onClick={loadData}
              disabled={loading}
              className="bg-gray-400 hover:bg-gray-500 text-white px-4 py-1 border border-gray-500"
            >
              Refresh
            </button>
            <a href="/scoreboard" className="bg-gray-400 hover:bg-gray-500 text-white px-4 py-1 border border-gray-500">Scoreboard</a>
            <a href="/minimal" className="bg-gray-400 hover:bg-gray-500 text-white px-4 py-1 border border-gray-500">Summary</a>
            <a href="/admin" className="bg-gray-400 hover:bg-gray-500 text-white px-4 py-1 border border-gray-500">Admin</a>
          </div>
        </div>
      </div>

      {/* Attendee Recognition Section */}
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6 bg-white border border-gray-300 p-4">
          <div 
            className="relative h-24 mb-4"
            style={{
              backgroundImage: 'url(https://images.unsplash.com/photo-1709715357520-5e1047a2b691?q=80&w=1742)',
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
          >
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
              <div className="text-center">
                <div className="text-lg font-bold text-gray-800">FELDMAN PARTY ATTENDEE ROSTER</div>
                <div className="text-xs text-gray-600">Current Networking Session Participants</div>
              </div>
            </div>
          </div>
          
          <div className="text-xs text-gray-600 leading-relaxed">
            The following professionals have been authorized to participate in this quarter's team-building exercise. 
            Performance metrics displayed below reflect cumulative contributions to organizational objectives and are 
            provided for informational purposes only, in accordance with our transparency and professional development guidelines.
          </div>
        </div>

        <div className="space-y-4">
          {leaderboard.map((owner, index) => {
            const goose = gooseData[owner.id] || {}
            const hasGooseRisk = goose.gooseProbability > 0.15
            const rank = owner.rank
            const numGooses = owner.num_gooses ?? 0
            const isWill = owner.name?.toLowerCase().includes('will')
            
            return (
              <div 
                key={owner.id} 
                className="bg-white border border-gray-300"
              >
                {/* Header with stock photo */}
                <div 
                  className="relative h-32 border-b border-gray-300"
                  style={{
                    backgroundImage: 'url(https://images.unsplash.com/photo-1686771416282-3888ddaf249b?q=80&w=1742)',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                  }}
                >
                  <div className="absolute inset-0 bg-white/80"></div>
                  <div className="relative z-10 p-4 flex items-center justify-between h-full">
                    <div className="flex items-center gap-4">
                      <div className="w-20 h-20 bg-gray-200 border-2 border-gray-400 flex items-center justify-center">
                        <div className="text-2xl font-bold text-gray-600">#{rank}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 uppercase mb-1">
                          Professional Attendee {isWill && '/ Legal Counsel'}
                        </div>
                        <h3 className="text-lg font-bold text-gray-800">
                          {owner.name}{isWill && ', Esq., MBA'}
                        </h3>
                        <div className="text-sm text-gray-600 mt-1">
                          Cumulative Performance Score: ${owner.totalEarnings}
                          {numGooses > 0 && <span className="ml-2">| Prior Risk Events: {numGooses}</span>}
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className={`text-xs px-3 py-1 border inline-block ${
                        goose.gooseProbability > 0.1 ? 'bg-red-50 border-red-400 text-red-700' :
                        goose.gooseProbability > 0.05 ? 'bg-yellow-50 border-yellow-400 text-yellow-700' :
                        'bg-gray-50 border-gray-300 text-gray-600'
                      }`}>
                        Risk Level: {goose.goosePercentage || '0%'}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="p-4 bg-gray-50 border-b border-gray-300">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white border border-gray-300 p-3">
                      <div className="text-xs text-gray-500 uppercase mb-1">Win Events</div>
                      <div className="text-2xl font-bold text-gray-800">{owner.wins}</div>
                    </div>
                    <div className="bg-white border border-gray-300 p-3">
                      <div className="text-xs text-gray-500 uppercase mb-1">Offensive Metrics</div>
                      <div className="text-2xl font-bold text-gray-800">{owner.obo}</div>
                    </div>
                    <div className="bg-white border border-gray-300 p-3">
                      <div className="text-xs text-gray-500 uppercase mb-1">Defensive Metrics</div>
                      <div className="text-2xl font-bold text-gray-800">{owner.dbo}</div>
                    </div>
                    <div className="bg-white border border-gray-300 p-3">
                      <div className="text-xs text-gray-500 uppercase mb-1">EOY Achievements</div>
                      <div className="text-2xl font-bold text-gray-800">{owner.eoy}</div>
                    </div>
                  </div>
                  
                  {hasGooseRisk && (
                    <div className="mt-3 p-3 bg-white border border-gray-400">
                      <div className="text-xs text-gray-700">
                        <strong>ATTENDANCE ADVISORY:</strong> Current portfolio exhibits {goose.goosePercentage} probability of zero-point outcome this period. 
                        Recommendation: Review asset allocation strategy. Contributing factors: {goose.reason}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="p-4">
                  <div className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-300">
                    DETAILED PERFORMANCE BREAKDOWN - FELDMAN PARTY EDITION
                  </div>
                  <table className="w-full text-left border-collapse border border-gray-300">
                    <thead>
                      <tr className="bg-gray-200">
                        <th className="py-2 px-2 text-xs font-semibold text-gray-700 border border-gray-300">Asset</th>
                        <th className="py-2 px-2 text-xs font-semibold text-gray-700 border border-gray-300">Status</th>
                        <th className="py-2 px-2 text-xs font-semibold text-gray-700 border border-gray-300">Win %</th>
                        <th className="py-2 px-2 text-xs font-semibold text-gray-700 text-right border border-gray-300">Value</th>
                        <th className="py-2 px-2 text-xs font-semibold text-gray-700 text-center border border-gray-300">W</th>
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
                          opponentText = 'Scheduled Break Period'
                          enhancedStatusText = ''
                        } else {
                          const parts = game.enhancedStatus.split('|')
                          opponentText = parts[0]
                          enhancedStatusText = parts[1] || ''
                        }
                        
                        const gameResultText = !gameIsComplete ? 'In Progress' :
                          game?.result === 'win' ? 'Completed Successfully' :
                          game?.result === 'tie' && !game?.isHome ? 'Completed Successfully (Away Tie)' : 'Completed Unsuccessfully'
                        
                        return (
                          <tr key={team.abbr} className={teamIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="py-2 px-2 text-sm border border-gray-300">
                              <div className="font-bold text-gray-800">{team.abbr}</div>
                              <div className="text-xs text-gray-500">{team.name}</div>
                            </td>
                            <td className="py-2 px-2 text-xs text-gray-600 border border-gray-300">
                              <div>{opponentText}</div>
                              {enhancedStatusText && <div className="text-gray-500">{enhancedStatusText}</div>}
                            </td>
                            <td className="py-2 px-2 text-xs text-gray-600 border border-gray-300">
                              {showLiveProbability ? `${winPercentage}%` : gameIsComplete ? gameResultText : 'Scheduled'}
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
          <div 
            className="text-center py-16 bg-white border border-gray-300 relative"
            style={{
              backgroundImage: 'url(https://plus.unsplash.com/premium_photo-1682436594687-922216809102?q=80&w=687)',
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
          >
            <div className="absolute inset-0 bg-white/85"></div>
            <div className="relative z-10">
              <h2 className="text-2xl font-bold text-gray-700 mb-2">FELDMAN PARTY ATTENDANCE PENDING</h2>
              <p className="text-gray-600">Awaiting attendee roster confirmation and performance data compilation.</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div 
        className="mt-8 relative border-t-2 border-gray-600"
        style={{
          backgroundImage: 'url(https://plus.unsplash.com/premium_photo-1661346080169-1839b2af02aa?q=80&w=1738)',
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        <div className="absolute inset-0 bg-gray-800/95"></div>
        <div className="relative z-10 py-8">
          <div className="container mx-auto px-4">
            <div className="text-xs text-gray-400 leading-relaxed space-y-3 max-w-4xl mx-auto">
              <p className="text-center font-semibold text-gray-300 mb-4">
                Feldman & Associates, LLC - Corporate Social Networking Events Division
              </p>
              
              <p>
                At Feldman & Associates, we believe that strategic networking opportunities drive measurable value through synergistic stakeholder engagement. The Feldman Party represents our ongoing commitment to fostering professional development in a compliant, work-appropriate environment that aligns with our core values of excellence, integrity, and collaborative problem-solving.
              </p>

              <p>
                <strong>PROFESSIONAL DEVELOPMENT NOTICE:</strong> All Feldman Party activities are conducted in accordance with applicable corporate policies, HR guidelines, and industry best practices. Attendance is voluntary and subject to manager approval. Light refreshments (half-glass wine maximum) may be provided in accordance with company alcohol policy.
              </p>

              <p>
                <strong>DISCLAIMER:</strong> Performance metrics displayed are for informational and team-building purposes only. Past performance does not guarantee future results. All data is subject to verification and may be adjusted pending audit review.
              </p>

              <p className="text-center pt-4 border-t border-gray-700">
                123 Corporate Plaza, Suite 4000 | Sonoma Valley, CA 94559 | feldmanparty@feldmanassociates.legal
              </p>

              <p className="text-center text-gray-500 text-xs">
                © 2025 Feldman & Associates, LLC. All Rights Reserved. | "Excellence Through Measured Professionalism"
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
