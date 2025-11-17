import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Home() {
const [leaderboard, setLeaderboard] = useState([])
const [probabilities, setProbabilities] = useState({})
const [gooseData, setGooseData] = useState({})
const [games, setGames] = useState({})
const [loading, setLoading] = useState(true)
const [currentFiscalYear, setCurrentFiscalYear] = useState(2025)
const [currentWeek, setCurrentWeek] = useState(3)
const [actualWeek, setActualWeek] = useState(3)
const [lastUpdate, setLastUpdate] = useState(null)
const [autoSyncData, setAutoSyncData] = useState(true)
const [weekInfo, setWeekInfo] = useState(null)
const [userSelectedWeek, setUserSelectedWeek] = useState(false) // Track if user manually selected
const [isInitialLoad, setIsInitialLoad] = useState(true)
const [showWineToast, setShowWineToast] = useState(false)

useEffect(() => {
loadCurrentWeek()
}, [])

useEffect(() => {
// Only auto-refresh if user hasn't manually selected a week, or if enough time has passed
const interval = setInterval(() => {
if (autoSyncData && !userSelectedWeek) {
console.log('Auto-refreshing data…')
loadCurrentWeek() // Changed from loadData() to loadCurrentWeek()
}
}, 1 * 60 * 1000)

const isWillInFirst = leaderboard.length > 0 && leaderboard[0]?.name?.toLowerCase().includes('will')

return () => {
clearInterval(interval)
}
}, [autoSyncData, userSelectedWeek])

// Function to change week manually - this is the key fix
function changeWeek(newWeek) {
if (newWeek >= 1 && newWeek <= 18 && newWeek !== currentWeek) {
console.log(`User manually changed week from ${currentWeek} to ${newWeek}`)
setCurrentWeek(newWeek)
setUserSelectedWeek(true) // Remember that user made a manual selection

```
  // Clear current data to show loading state
  setGames({})
  setProbabilities({})
  setGooseData({})
  
  // Load data for the new week after state updates
  setTimeout(() => {
    loadDataForWeek(newWeek)
  }, 100)
}
```

}

// Separate function to load data for a specific week
async function loadDataForWeek(weekNumber) {
console.log(`=== LOADING DATA FOR WEEK ${weekNumber} ===`)
setLoading(true)

```
try {
  // Load all the base data first
  const { ownerStats, teams, sortedLeaderboard } = await loadBaseData()
  setLeaderboard(sortedLeaderboard)

  // Then load week-specific data with the correct week number
  await Promise.all([
    loadProbabilitiesForWeek(teams, weekNumber),
    loadGamesForWeek(weekNumber)
  ])

  // IMPORTANT: Load goose probabilities AFTER we have the correct probabilities
  // We need to wait a bit for probabilities state to update
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
```

}

// Modified loadData to use the current week in state
async function loadData() {
await loadDataForWeek(currentWeek)
}

// Extract base data loading (awards, owners, teams) into separate function
async function loadBaseData() {
let awards = []
try {
const { data: awardsData, error } = await supabase
.from('awards')
.select('*')
.eq('season', currentFiscalYear)

```
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

// Calculate performance percentiles
const allTeams = []
sortedLeaderboard.forEach(owner => {
  Object.values(owner.teams).forEach(team => {
    allTeams.push({ ...team, ownerName: owner.name })
  })
})
allTeams.sort((a, b) => b.earnings - a.earnings)
```

// Sort all teams by earnings (highest to lowest)
allTeams.sort((a, b) => b.earnings - a.earnings)

// Calculate quintile boundaries based on team positions, not unique values
const totalTeams = allTeams.length
const quintileBoundaries = [
Math.ceil(totalTeams * 0.2), // Top 20%
Math.ceil(totalTeams * 0.4), // Top 40%
Math.ceil(totalTeams * 0.6), // Top 60%
Math.ceil(totalTeams * 0.8), // Top 80%
totalTeams                    // Bottom 100%
]

// Assign quintiles based on team position, but ensure ties stay together
allTeams.forEach((team, index) => {
// Find which quintile this position falls into
let quintile = 5 // Default to bottom quintile
for (let i = 0; i < quintileBoundaries.length; i++) {
if (index < quintileBoundaries[i]) {
quintile = i + 1
break
}
}

```
// But if there are ties, promote lower-positioned tied teams to higher quintile
const sameEarningsTeams = allTeams.filter(t => t.earnings === team.earnings)
const bestPositionForThisEarning = Math.min(...sameEarningsTeams.map(t => allTeams.indexOf(t)))

// Recalculate quintile based on best position for this earnings group
for (let i = 0; i < quintileBoundaries.length; i++) {
  if (bestPositionForThisEarning < quintileBoundaries[i]) {
    quintile = i + 1
    break
  }
}

// Convert quintile to percentile for your existing gradient logic
team.performancePercentile = quintile === 1 ? 0.9 :
                            quintile === 2 ? 0.7 :
                            quintile === 3 ? 0.5 :
                            quintile === 4 ? 0.3 : 0.1
```

})

const teamPerformanceMap = {}
allTeams.forEach(team => {
teamPerformanceMap[team.abbr] = team.performancePercentile
})

```
sortedLeaderboard.forEach(owner => {
  owner.teamsSorted = Object.values(owner.teams)
    .sort((a, b) => b.earnings - a.earnings)
    .map(team => ({
      ...team,
      performancePercentile: teamPerformanceMap[team.abbr] || 0
    }))
})

return { ownerStats, teams, sortedLeaderboard }
```

}

async function loadGamesForWeek(weekNumber) {
console.log(`Loading games for Week ${weekNumber}`)
try {
const { data: gamesData, error: gamesError } = await supabase
.from('games')
.select('*')
.eq('season', currentFiscalYear)
.eq('week', weekNumber)

```
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
```

}

async function loadProbabilitiesForWeek(teams, weekNumber) {
try {
console.log(`Loading probabilities for Week ${weekNumber}`)
const response = await fetch(`/api/kalshi-probabilities?week=${weekNumber}&season=${currentFiscalYear}`)
if (response.ok) {
const data = await response.json()

```
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
```

}

async function loadGooseProbabilitiesForWeek(owners, weekNumber) {

```
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
        week: weekNumber, // Use the specific week number
        season: currentFiscalYear
        // Don't pass probabilities - let the API fetch them fresh for this week
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
  setGooseData({}) // Clear old data first
  setTimeout(() => {
    setGooseData(gooseMap) // Set new data after brief delay
  }, 50)
  console.log(`Goose probabilities loaded for Week ${weekNumber}`)
} catch (error) {
  console.error('Error loading goose probabilities:', error)
}
```

}

async function loadCurrentWeek() {
console.log('Loading current week…')
try {
const [actualResponse, displayResponse] = await Promise.all([
fetch('/api/current-week'),
fetch('/api/current-week?display=true')
])

```
  if (actualResponse.ok && displayResponse.ok) {
    const actualData = await actualResponse.json()
    const displayData = await displayResponse.json()
    
    console.log('Actual week:', actualData)
    console.log('Display week:', displayData)
    
    setCurrentFiscalYear(actualData.season)
    setActualWeek(actualData.week)
    
    // Only use smart default on initial load, not if user has made a selection
    if (isInitialLoad) {
      setCurrentWeek(displayData.week) // This sets it to 4
      setIsInitialLoad(false)
    }
    
    setWeekInfo({
      actual: actualData.week,
      display: displayData.week,
      dayOfWeek: displayData.dayOfWeek
    })
    
    // FIXED: Use displayData.week directly instead of relying on state
    setTimeout(() => {
      loadDataForWeek(displayData.week) // Pass Week 4 directly
    }, 100)
  }
} catch (error) {
  console.error('Error getting current week:', error)
  loadData()
}
```

}

function getDayOfWeekName(dayOfWeek) {
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
return days[dayOfWeek] || 'Unknown'
}

function getWeekDisplayLogic() {
if (!weekInfo) return ''

```
const dayName = getDayOfWeekName(weekInfo.dayOfWeek)

if (userSelectedWeek) {
  return `Manual selection: Week ${currentWeek}`
}

if (weekInfo.actual !== weekInfo.display) {
  return `${dayName}: Showing Week ${weekInfo.display} (NFL is currently in Week ${weekInfo.actual})`
}
return `${dayName}: Showing current NFL Week ${weekInfo.display}`
```

}

if (loading && leaderboard.length === 0) {
const isWillInFirst = leaderboard.length > 0 && leaderboard[0]?.name?.toLowerCase().includes('will')

return (
<div className="min-h-screen bg-gradient-to-br from-gray-100 via-gray-200 to-stone-200 flex justify-center items-center">
<div className="text-center">
<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-600 mx-auto mb-4"></div>
<div className="text-xl font-semibold text-gray-700">Compiling Quarterly Performance Report… Please stand by while we synergize stakeholder metrics.</div>
</div>
</div>
)
}

const isWillInFirst = leaderboard.length > 0 && leaderboard[0]?.name?.toLowerCase().includes('will')

return (
<div className="min-h-screen bg-gradient-to-br from-gray-50 via-stone-100 to-gray-200">
<div className="bg-white shadow-xl border-b-4 border-gray-500 relative overflow-hidden">
<div className="absolute inset-0 bg-gradient-to-r from-gray-400/10 to-stone-400/10"></div>
<div className="container mx-auto px-4 py-8 relative">
<div className="flex flex-col lg:flex-row lg:justify-between lg:items-center space-y-6 lg:space-y-0">
<div>
<h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-700 mb-3 tracking-tight">
🏈 FOUNDERS (+ Paralegal M. Nickbarg) LEAGUE
</h1>
<div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-6 text-gray-600">
<span className="font-bold text-lg bg-stone-200 px-3 py-1 rounded-full w-fit">
Week {currentWeek} • {currentFiscalYear} Fiscal Year
</span>
{lastUpdate && (
<span className="text-sm bg-white px-2 py-1 rounded-full shadow w-fit">
🕐 Last updated: {lastUpdate.toLocaleTimeString()}
</span>
)}
<div className="flex items-center space-x-2 bg-white px-3 py-1 rounded-full shadow w-fit">
<div className={`w-3 h-3 rounded-full animate-pulse ${autoSyncData && !userSelectedWeek ? 'bg-green-500' : 'bg-gray-400'}`}></div>
<span className="text-sm font-medium">
Live updates {autoSyncData && !userSelectedWeek ? 'ON' : 'OFF'}
{userSelectedWeek && ' (manual)'}
</span>
</div>
</div>
</div>

```
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
              className="bg-stone-200 text-gray-700 font-bold px-3 py-1 rounded text-sm min-w-[90px] text-center"
            >
              {Array.from({ length: 18 }, (_, i) => i + 1).map(w => (
                <option key={w} value={w}>Week {w}</option>
              ))}
            </select>
            <button
              onClick={() => changeWeek(currentWeek + 1)}
              disabled={currentWeek >= 18}
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
              className="bg-stone-200 hover:bg-emerald-200 text-emerald-700 font-medium py-1 px-3 rounded text-sm transition-colors"
            >
              Reset to Smart Default (Week {weekInfo.display})
            </button>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3">
            <a
              href="/scoreboard"
              className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold py-3 px-4 sm:px-6 rounded-xl transition-all transform hover:scale-105 shadow-lg text-center text-sm sm:text-base"
            >
              📅 Performance Dashboard
            </a>

            <a
              href="/minimal"
              className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white font-bold py-3 px-4 sm:px-6 rounded-xl transition-all transform hover:scale-105 shadow-lg text-center text-sm sm:text-base"
            >
              📊 Executive Summary
            </a>
            
            <button 
              onClick={() => setAutoSyncData(!autoSyncData)}
              className={`px-4 sm:px-6 py-3 rounded-xl font-bold transition-all transform hover:scale-105 shadow-lg text-sm sm:text-base ${
                autoSyncData 
                  ? 'bg-gradient-to-r from-gray-500 to-gray-600 text-white hover:from-emerald-600 hover:to-green-700' 
                  : 'bg-gradient-to-r from-gray-400 to-gray-500 text-white hover:from-gray-500 hover:to-gray-600'
              }`}
            >
              🔄 Auto-refresh {autoSync lData ? 'ON' : 'OFF'}
            </button>
            
            <button 
              onClick={loadData}
              disabled={loading}
              className="bg-gradient-to-r from-stone-600 to-stone-700 hover:from-emerald-700 hover:to-green-800 disabled:from-emerald-400 disabled:to-green-500 text-white font-black py-3 px-4 sm:px-8 rounded-xl transition-all transform hover:scale-105 shadow-lg flex items-center justify-center space-x-2 text-sm sm:text-base"
            >
              {loading && <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>}
              <span>🔄 REFRESH</span>
            </button>
            
            <a
              href="/admin"
              className="bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-bold py-3 px-4 sm:px-6 rounded-xl transition-all transform hover:scale-105 shadow-lg text-center text-sm sm:text-base"
            >
              ⚙️ Admin Portal
            </a>
          </div>
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
        const isWill = owner.name?.toLowerCase().includes('will')
        const isTop3 = rank <= 3
        
        const getRankEmoji = (rank) => {
          if (rank === 1) return isWill ? '💼📊⚖️' : '👑'
          if (rank === 2) return '🥈'
          if (rank === 3) return '🥉'
          return ''
        }
        
        const isWillInFirst = leaderboard.length > 0 && leaderboard[0]?.name?.toLowerCase().includes('will')
```

return (
<div
key={owner.id}
className={`relative overflow-hidden rounded-2xl shadow-2xl transition-all hover:shadow-3xl transform hover:-translate-y-1 ${ isLeader  ? 'bg-gradient-to-br from-yellow-100 via-yellow-50 to-amber-100 ring-4 ring-yellow-400'  : isTop3 ? 'bg-gradient-to-br from-emerald-50 via-white to-green-50 ring-2 ring-emerald-200' : 'bg-gradient-to-br from-gray-50 via-white to-gray-50 ring-1 ring-gray-200' }`}
>
<div className={`p-4 sm:p-6 ${ isLeader  ? 'bg-gradient-to-r from-yellow-200 via-amber-100 to-yellow-200'  : isTop3 ? 'bg-gradient-to-r from-emerald-100 via-green-50 to-emerald-100' : 'bg-gradient-to-r from-gray-100 via-gray-50 to-gray-100' }`}>
<div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-4 sm:space-y-0">
<div className="flex items-center space-x-4 sm:space-x-6">
<div className={`text-2xl sm:text-3xl font-black px-3 sm:px-4 py-2 rounded-full shadow-lg transform rotate-3 ${ isLeader  ? 'bg-gradient-to-br from-yellow-400 to-amber-500 text-yellow-900'  : isTop3 ? 'bg-gradient-to-br from-emerald-400 to-green-500 text-emerald-900' : 'bg-gradient-to-br from-gray-400 to-gray-500 text-gray-900' }`}>
#{rank}
</div>
<div>
<h2 className="text-2xl sm:text-3xl font-black text-gray-800 flex items-center space-x-2 sm:space-x-3 mb-1">
<span>{owner.name}</span>
{gooseEggs && <span className={`text-3xl sm:text-4xl ${numGooses > 0 ? 'animate-bounce' : ''}`}>{gooseEggs}</span>}
{getRankEmoji(rank) && <span className={`text-3xl sm:text-4xl ${rank === 1 ? 'animate-bounce' : ''}`}>{getRankEmoji(rank)}</span>}
</h2>
<div className="text-3xl sm:text-4xl font-black bg-gradient-to-r from-gray-600 to-gray-700 bg-clip-text text-transparent">
${owner.totalEarnings}
</div>
</div>
</div>

```
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
                    goose.gooseProbability > 0.1 ? 'bg-gradient-to-r from-red-500 to-red-600 text-white animate-pulse' :
                    goose.gooseProbability > 0.05 ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white' :
                    'bg-gradient-to-r from-green-500 to-emerald-500 text-white'
                  }`}>
                    🥚 Risk Assessment: {goose.goosePercentage || '0%'}
                  </div>
                </div>
              </div>
              
              {hasGooseRisk && (
                <div className="mt-4 p-3 sm:p-4 bg-gradient-to-r from-yellow-200 to-orange-200 border-l-4 border-yellow-500 rounded-lg shadow-lg">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
                    <span className="font-black text-yellow-800 text-sm sm:text-lg">
                      🚨 RISK ADVISORY: {goose.goosePercentage} probability of zero-point outcome 🚨
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
                  
                  const gameIsComplete = game?.status === 'STATUS_FINAL'
                  const showLiveProbability = prob && prob.confidence !== 'final' && !gameIsComplete && game
                  
                  let opponentText = ''
                  let enhancedStatusText = ''
                  
                  if (!game) {
                    opponentText = 'Scheduled Non-Operational Period'
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
                    team.performancePercentile >= 0.8 ? 'from-gray-600 to-gray-700' :
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
                  
                  const isWillInFirst = leaderboard.length > 0 && leaderboard[0]?.name?.toLowerCase().includes('will')
```

return (
<div key={team.abbr} className={`bg-white rounded-xl p-3 sm:p-4 shadow-lg hover:shadow-xl transition-all transform hover:scale-105 border-2 ${performanceBorder}`}>
<div className="flex justify-between items-start mb-3 sm:mb-4">
<div className="flex items-center space-x-2 sm:space-x-3 flex-1 min-w-0">
<img
src={`https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/${team.abbr.toLowerCase()}.png`}
alt={`${team.abbr} logo`}
className=“w-8 h-8 sm:w-10 sm:h-10 object-contain flex-shrink-0”
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
<div className={`text-xs px-2 py-1 rounded-full font-bold shadow mt-1 ${ prob.winProbability > 0.6 ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white' : prob.winProbability > 0.4 ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white' : 'bg-gradient-to-r from-red-500 to-red-600 text-white' }`}>
{winPercentage}%
</div>
)}
{gameIsComplete && gameResultIcon && (
<div className={`text-base sm:text-lg font-bold mt-1 ${ gameResultIcon === '✅' ? 'text-green-600' : 'text-red-600' }`}>
{gameResultIcon}
</div>
)}
</div>
</div>

```
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
        <h2 className="text-4xl font-black text-gray-700 mb-4">Awaiting Quarterly Data Input</h2>
        <p className="text-xl text-gray-600">Please submit performance metrics to generate stakeholder report.</p>
      </div>
    )}
  </div>
</div>
```
)
}
