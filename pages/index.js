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

  function formatCorporateName(name) {
    const nameLower = name.toLowerCase()
    
    if (nameLower.includes('will')) return 'W. Feldman, Esq. (Associate)'
    if (nameLower.includes('max')) return 'M. Nickbarg (Paralegal)'
    if (nameLower.includes('joel')) return 'J. Sircus (VP)'
    if (nameLower.includes('ric')) return 'R. Best (EVP)'
    if (nameLower.includes('joey')) return 'J.H. Rosenberg, Esq. (Of Counsel)'
    if (nameLower.includes('zack')) return 'Z. Reneau-Wedeen, MBA (intern)'
    
    return name
  }

  // Get professional headshot photo (alternating stock photos)
  function getHeadshotPhoto(index) {
    const photos = [
      'https://plus.unsplash.com/premium_photo-1661347859297-859b8ae1d7c5?q=80&w=1498',
      'https://plus.unsplash.com/premium_photo-1682056762907-23d08f913805?q=80&w=1548',
      'https://images.unsplash.com/photo-1709715357520-5e1047a2b691?q=80&w=1742'
    ]
    return photos[index % photos.length]
  }

  if (loading && leaderboard.length === 0) {
    return (
      <div className="min-h-screen bg-gray-100 flex justify-center items-center relative overflow-hidden">
        {/* Stock photo background */}
        <div 
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'url(https://images.unsplash.com/photo-1483653085484-eb63c9f02547?q=80&w=1740)',
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        ></div>
        
        <div className="text-center bg-white p-12 border-2 border-gray-400 max-w-3xl mx-4 relative">
          <div className="mb-6">
            <img 
              src="https://plus.unsplash.com/premium_photo-1682056762907-23d08f913805?q=80&w=1548"
              alt="Professional consultation"
              className="w-full h-48 object-cover border-b-2 border-gray-400 mb-4"
            />
          </div>
          
          <div className="text-3xl font-bold text-gray-700 mb-4">
            COORDINATING ATTENDEE METRICS FOR FELDMAN PARTY
          </div>
          <div className="text-lg text-gray-600 mb-2">
            A Work-Approved Social Function
          </div>
          <div className="text-sm text-gray-500 leading-relaxed">
            Here at Feldman & Associates, we strive for excellence through methodical coordination of stakeholder engagement initiatives. Currently aggregating participant performance data streams in accordance with our ISO 9001-certified event planning protocols.
          </div>
          <div className="mt-6 text-xs text-gray-400 border-t border-gray-300 pt-4">
            Feldman & Associates LLC - Professional Services Division | Event Coordination Department
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Corporate Hero with stock photo */}
      <div className="relative bg-white border-b-4 border-gray-500 overflow-hidden">
        <div 
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage: 'url(https://images.unsplash.com/photo-1496588152823-86ff7695e68f?q=80&w=1740)',
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        ></div>
        
        <div className="relative container mx-auto px-4 py-12">
          <div className="text-center mb-8">
            <div className="inline-block mb-6">
              <img 
                src="https://plus.unsplash.com/premium_photo-1661347859297-859b8ae1d7c5?q=80&w=1498"
                alt="Corporate handshake"
                className="w-32 h-32 object-cover border-4 border-gray-400"
              />
            </div>
            
            <h1 className="text-4xl font-bold text-gray-800 mb-4">
              AS JEFE, PLEASE BE ADVISED A FELDMAN PARTY* HAS BEEN DECLARED
            </h1>
            <div className="text-xl text-gray-600 mb-2">
              A Work-Approved** Social Function for Professional Networking
            </div>
            <div className="text-sm text-gray-500 max-w-2xl mx-auto leading-relaxed">
              Here at Feldman & Associates, we strive for excellence in fostering collaborative team synergies through structured networking opportunities. The Feldman Party represents our commitment to maintaining appropriate work-life integration while adhering to company social event guidelines and HR-approved entertainment protocols.
            </div>
            <div className="text-xs text-gray-400 mt-4 italic max-w-xl mx-auto">
              *The term "Party" as used herein does not imply, suggest, warrant, or give rise to any legally binding arrangement, expectation, or obligation that entertainment, enjoyment, or "fun" (as subjectively defined) will be experienced by attendees. Feldman & Associates, LLC disclaims all liability for dissatisfaction with event proceedings.
            </div>
            <div className="text-xs text-gray-400 mt-4 italic max-w-xl mx-auto">
              **Participants are required to adhere to the half-drink maximum for social functions as outlined in the Feldman & Associates employee handbook
            </div>
          </div>

          <div className="bg-gray-50 border-2 border-gray-400 p-6 max-w-4xl mx-auto">
            <div className="text-center mb-4">
              <div className="text-lg font-semibold text-gray-700 mb-2">
                Event Oversight: William Feldman, Esq., MBA - Managing Partner (Acting)
              </div>
              <div className="text-sm text-gray-600">
                Reporting Period: Week {currentWeek} | Fiscal Year {currentSeason}
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
              <div className="bg-white border border-gray-300 p-4">
                <div className="font-semibold mb-2">Function Objectives:</div>
                <ul className="space-y-1 text-xs">
                  <li>• Facilitate cross-functional stakeholder alignment</li>
                  <li>• Enhance team cohesion metrics through measured interaction</li>
                  <li>• Demonstrate commitment to work-life balance compliance</li>
                  <li>• Leverage networking opportunities for synergy optimization</li>
                </ul>
              </div>
              
              <div className="bg-white border border-gray-300 p-4">
                <div className="font-semibold mb-2">Event Specifications:</div>
                <ul className="space-y-1 text-xs">
                  <li>• Venue: Conference Room B (pending availability)</li>
                  <li>• Refreshments: Half-glass wine service (optional)</li>
                  <li>• Dress Code: Business casual (blazers encouraged)</li>
                  <li>• Topics: Quarterly reviews, market trends, real estate</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border-b-2 border-gray-400">
        <div className="container mx-auto px-4 py-6">
          <div className="mb-4">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">
              FELDMAN & ASSOCIATES - FANTASY FOOTBALL PERFORMANCE DASHBOARD
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
                <option key={w} value={w}>Week {w} Function</option>
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
              Refresh Attendee Data
            </button>
            <a
              href="/scoreboard"
              className="bg-gray-400 hover:bg-gray-500 text-white px-4 py-1 text-sm border border-gray-500"
            >
              Detailed Event Log
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

      {/* Meeting room divider photo */}
      <div className="relative h-48 overflow-hidden border-y-2 border-gray-400">
        <img 
          src="https://images.unsplash.com/photo-1709715357520-5e1047a2b691?q=80&w=1742"
          alt="Meeting room"
          className="w-full h-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-gray-700/90 via-gray-600/90 to-gray-700/90 flex items-center justify-center">
          <div className="text-center max-w-3xl px-4">
            <div className="text-2xl font-bold text-white mb-2">
              Attendee Performance Tracking Dashboard
            </div>
            <div className="text-sm text-gray-300">
              Here at Feldman & Associates, we strive for measurable outcomes through data-driven event management. Our proprietary attendee engagement metrics facilitate optimal resource allocation and demonstrate our unwavering commitment to stakeholder value creation through structured social programming.
            </div>
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
                    <div className="flex items-start gap-4 flex-1">
                      <div className="flex-shrink-0">
                        <img 
                          src={getHeadshotPhoto(index)}
                          alt="Professional headshot"
                          className="w-20 h-20 object-cover border-2 border-gray-400"
                        />
                      </div>
                      <div className="flex-1">
                        <div className="text-xs text-gray-500 uppercase mb-1">Feldman Party Attendee</div>
                        <h2 className="text-lg font-bold text-gray-800">{formatCorporateName(owner.name)}</h2>
                        <div className="text-sm text-gray-600 mt-1">
                          Networking Ranking: <span className="font-bold">#{rank}</span> | 
                          Total Engagement Points: <span className="font-bold">${owner.totalEarnings}</span>
                          {numGooses > 0 && <span> | Prior Event Incidents: {numGooses}</span>}
                        </div>
                        {isWill && (
                          <div className="text-xs text-gray-500 mt-2">
                            Currently engaging in substantive discussions regarding Sonoma Valley real estate market trends and optimal portfolio diversification strategies.
                          </div>
                        )}
                        {!isWill && (
                          <div className="text-xs text-gray-500 mt-2">
                            Actively participating in work-approved networking initiatives and professional development opportunities.
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <table className="text-xs text-gray-600 border-collapse border border-gray-300">
                        <tbody>
                          <tr className="border-b border-gray-300 bg-white">
                            <td colSpan="2" className="py-1 px-2 font-semibold text-center">Key Performance Indicators</td>
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
                        Attendance Risk: {goose.goosePercentage || '0%'}
                      </div>
                    </div>
                  </div>
                  
                  {hasGooseRisk && (
                    <div className="mt-3 p-2 bg-white border border-gray-400">
                      <div className="text-xs text-gray-700">
                        <strong>EVENT PLANNING ADVISORY:</strong> Current attendance projection models indicate {goose.goosePercentage} probability of zero-engagement outcome. Contributing factors: {goose.reason}. Please coordinate with HR regarding contingency protocols.
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="p-4">
                  <div className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-300">
                    DETAILED ENGAGEMENT BREAKDOWN - FELDMAN PARTY PARTICIPATION METRICS
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
                              <div className="flex items-center gap-2">
                                <img 
                                  src={`https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/${team.abbr.toLowerCase()}.png`}
                                  alt={`${team.abbr} logo`}
                                  className="w-8 h-8 object-contain"
                                  onError={(e) => {
                                    e.target.src = `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/nfl.png`
                                  }}
                                />
                                <div>
                                  <div className="font-bold text-gray-800">{team.abbr}</div>
                                </div>
                              </div>
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
          <div className="text-center py-16 bg-white border-2 border-gray-300">
            <h2 className="text-2xl font-bold text-gray-700 mb-2">FELDMAN PARTY ATTENDEE DATA PENDING</h2>
            <p className="text-gray-600">Awaiting participant registration and engagement metrics input. Please coordinate with event planning committee.</p>
          </div>
        )}
      </div>

      {/* Corporate team meeting photo divider */}
      <div className="my-8">
        <img 
          src="https://images.unsplash.com/photo-1686771416282-3888ddaf249b?q=80&w=1742"
          alt="Corporate meeting"
          className="w-full h-64 object-cover border-y-2 border-gray-400 opacity-50"
        />
      </div>

      <div className="mt-8 bg-gray-800 py-8 border-t-4 border-gray-600">
        <div className="container mx-auto px-4">
          <div className="mb-6">
            <img 
              src="https://plus.unsplash.com/premium_photo-1661346080169-1839b2af02aa?q=80&w=1738"
              alt="City skyline"
              className="w-full h-32 object-cover opacity-30 mb-6"
            />
          </div>
          
          <div className="text-xs text-gray-400 leading-relaxed space-y-3 max-w-4xl mx-auto">
            <p className="text-center font-semibold text-gray-300 mb-4">
              Feldman & Associates, LLC - Professional Consulting Services & Event Coordination
            </p>
            
            <div className="bg-gray-700 border border-gray-600 p-4 mb-4">
              <div className="font-semibold text-gray-300 mb-2">About the Feldman Party:</div>
              <p className="text-gray-400">
                Here at Feldman & Associates, we strive for excellence in creating memorable yet appropriate work-approved social functions. The Feldman Party represents our commitment to fostering professional relationships through structured networking opportunities, always conducted in accordance with company policies regarding workplace entertainment and social gatherings. Our events feature measured refreshment service (half-glass wine portions available), business casual attire requirements, and conversation topics pre-approved by our compliance department, including but not limited to: quarterly financial reviews, residential real estate market analysis, and index fund performance metrics.
              </p>
            </div>
            
            <p>
              <strong>IMPORTANT LEGAL DISCLAIMER:</strong> The information provided on this platform is for entertainment and analytical purposes only and should not be construed as professional advice. Feldman & Associates, LLC makes no representations or warranties of any kind, express or implied, about the completeness, accuracy, reliability, suitability, or availability of the information contained herein. Any reliance you place on such information is strictly at your own risk.
            </p>

            <p>
              <strong>INVESTMENT DISCLAIMER:</strong> Past performance is not indicative of future results. The value of fantasy football investments can go down as well as up. References to wine consumption or real estate discussions are for illustrative purposes only and do not constitute financial, legal, or lifestyle advice. Please consult with a qualified professional before making any investment decisions.
            </p>

            <p>
              <strong>COMPLIANCE NOTICE:</strong> This platform and all associated Feldman Party events operate in accordance with all applicable federal, state, and local regulations including but not limited to: the Sarbanes-Oxley Act of 2002, Gramm-Leach-Bliley Act, California Consumer Privacy Act (CCPA), General Data Protection Regulation (GDPR), and all relevant SEC filing requirements. For questions regarding compliance, please contact our General Counsel.
            </p>

            <p>
              <strong>ARBITRATION CLAUSE:</strong> By accessing this platform or attending any Feldman Party event, you agree to resolve any disputes through binding arbitration in accordance with the rules of the American Arbitration Association. You waive any right to participate in a class action lawsuit or class-wide arbitration. All arbitration proceedings shall be conducted in Sonoma County, California.
            </p>

            <p>
              <strong>LIMITATION OF LIABILITY:</strong> In no event shall Feldman & Associates, LLC, its officers, directors, employees, or agents be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses resulting from your access to or use of this platform or attendance at Feldman Party events.
            </p>

            <p>
              <strong>EVENT DISCLAIMER:</strong> The Feldman Party is a work-approved social function organized for professional networking purposes only. Attendance is voluntary. All participants are expected to maintain professional decorum in accordance with company handbook section 4.7(b). Feldman & Associates, LLC makes no representations regarding the entertainment value or social enjoyment of this function.
            </p>

            <p className="text-center pt-4 border-t border-gray-700 mt-4">
              🍷 <em>Suggested pairing for data review: Half-glass of 2019 Sonoma Pinot Noir. Must be 21+ to consume. Drink responsibly.</em> 📊
            </p>

            <p className="text-center text-gray-600 text-xs pt-2">
              Website last updated: {new Date().toLocaleDateString()} | Terms subject to change without notice
            </p>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-700 flex flex-wrap justify-center gap-4 text-xs text-gray-500">
            <a href="#" className="hover:text-white transition-colors">Sitemap</a>
            <span>•</span>
            <a href="#" className="hover:text-white transition-colors">Accessibility</a>
            <span>•</span>
            <a href="#" className="hover:text-white transition-colors">Do Not Sell My Personal Information</a>
            <span>•</span>
            <a href="#" className="hover:text-white transition-colors">Manage Cookies</a>
            <span>•</span>
            <a href="#" className="hover:text-white transition-colors">Contact Legal</a>
          </div>

          <p className="text-center text-gray-500 text-xs mt-4">
            123 Corporate Plaza, Suite 4000 | Sonoma Valley, CA 94559 | events@feldmanassociates.legal
          </p>

          <p className="text-center text-gray-500 text-xs mt-2">
            © 2025 Feldman & Associates, LLC. All Rights Reserved.
          </p>
        </div>
      </div>
    </div>
  )
}
