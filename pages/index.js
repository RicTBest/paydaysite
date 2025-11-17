import { useEffect, useState } from ‘react’
import { supabase } from ‘../lib/supabase’

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
const [showWineToast, setShowWineToast] = useState(false)

useEffect(() => {
loadCurrentWeek()
// Show responsible wine toast on load
setShowWineToast(true)
setTimeout(() => setShowWineToast(false), 5000)
}, [])

useEffect(() => {
const interval = setInterval(() => {
if (autoRefresh && !userSelectedWeek) {
console.log(‘Auto-refreshing data…’)
loadCurrentWeek()
}
}, 1 * 60 * 1000)
return () => clearInterval(interval)
}, [autoRefresh, userSelectedWeek])

function changeWeek(newWeek) {
if (newWeek >= 1 && newWeek <= 18 && newWeek !== currentWeek) {
console.log(`User manually changed week from ${currentWeek} to ${newWeek}`)
setCurrentWeek(newWeek)
setUserSelectedWeek(true)
setGames({})
setProbabilities({})
setGooseData({})
setTimeout(() => loadDataForWeek(newWeek), 100)
}
}

async function loadDataForWeek(weekNumber) {
console.log(`=== LOADING DATA FOR WEEK ${weekNumber} ===`)
setLoading(true)

```
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
```

}

async function loadData() {
await loadDataForWeek(currentWeek)
}

async function loadBaseData() {
let awards = []
try {
const { data: awardsData, error } = await supabase
.from(‘awards’)
.select(’*’)
.eq(‘season’, currentSeason)
if (error) {
console.warn(‘Awards table access denied - using empty data:’, error)
awards = []
} else {
awards = awardsData || []
}
} catch (err) {
console.warn(‘Awards table error - using empty data:’, err)
awards = []
}

```
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
```

}

async function loadGamesForWeek(weekNumber) {
console.log(`Loading games for Week ${weekNumber}`)
try {
const { data: gamesData, error: gamesError } = await supabase
.from(‘games’)
.select(’*’)
.eq(‘season’, currentSeason)
.eq(‘week’, weekNumber)

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
const response = await fetch(`/api/kalshi-probabilities?week=${weekNumber}&season=${currentSeason}`)
if (response.ok) {
const data = await response.json()
const adjustedProbabilities = { …data.probabilities }
teams?.forEach(team => {
if (!adjustedProbabilities[team.abbr]) {
adjustedProbabilities[team.abbr] = { winProbability: 0, confidence: ‘bye_week’ }
}
})
setProbabilities(adjustedProbabilities || {})
}
} catch (error) {
console.error(‘Error loading probabilities:’, error)
setProbabilities({})
}
}

async function loadGooseProbabilitiesForWeek(owners, weekNumber) {
try {
console.log(`Loading goose probabilities for Week ${weekNumber}`)
const goosePromises = owners.map(async (owner) => {
const response = await fetch(`/api/goose-probability`, {
method: ‘POST’,
headers: { ‘Content-Type’: ‘application/json’ },
body: JSON.stringify({
owner_id: owner.id,
week: weekNumber,
season: currentSeason
})
})
if (response.ok) {
const data = await response.json()
return { ownerId: owner.id, …data }
}
return { ownerId: owner.id, gooseProbability: 0, reason: ‘Error loading’ }
})
const gooseResults = await Promise.all(goosePromises)
const gooseMap = {}
gooseResults.forEach(result => {
gooseMap[result.ownerId] = result
})
setGooseData({})
setTimeout(() => setGooseData(gooseMap), 50)
} catch (error) {
console.error(‘Error loading goose probabilities:’, error)
}
}

async function loadCurrentWeek() {
try {
const [actualResponse, displayResponse] = await Promise.all([
fetch(’/api/current-week’),
fetch(’/api/current-week?display=true’)
])
if (actualResponse.ok && displayResponse.ok) {
const actualData = await actualResponse.json()
const displayData = await displayResponse.json()
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
setTimeout(() => loadDataForWeek(displayData.week), 100)
}
} catch (error) {
console.error(‘Error getting current week:’, error)
loadData()
}
}

if (loading && leaderboard.length === 0) {
return (
<div className="min-h-screen bg-gradient-to-br from-gray-100 via-gray-200 to-stone-200 flex justify-center items-center">
<div className="text-center">
<div className="text-6xl mb-4">💼</div>
<div className="text-2xl font-medium text-gray-700">Compiling Quarterly Report…</div>
<div className="text-sm text-gray-500 mt-2">Please hold while we cross-reference the data</div>
</div>
</div>
)
}

const isWillInFirst = leaderboard.length > 0 && leaderboard[0]?.name?.toLowerCase().includes(‘will’)

return (
<div className="min-h-screen bg-gradient-to-br from-gray-50 via-stone-100 to-gray-200 relative">
{/* Floating briefcases and documents */}
<div className="fixed inset-0 pointer-events-none z-0 opacity-10">
<div className=“absolute top-10 left-10 text-4xl” style={{animation: ‘float 6s ease-in-out infinite’}}>💼</div>
<div className=“absolute top-20 right-20 text-3xl” style={{animation: ‘float 7s ease-in-out infinite’, animationDelay: ‘1s’}}>📊</div>
<div className=“absolute bottom-20 left-20 text-4xl” style={{animation: ‘float 8s ease-in-out infinite’, animationDelay: ‘2s’}}>📋</div>
<div className=“absolute bottom-40 right-40 text-3xl” style={{animation: ‘float 6.5s ease-in-out infinite’, animationDelay: ‘0.5s’}}>🍷</div>
</div>

```
  <style>{`
    @keyframes float {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-20px); }
    }
  `}</style>

  {/* Half Glass of Wine Toast */}
  {showWineToast && (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50">
      <div className="bg-gradient-to-r from-stone-200 to-gray-300 text-gray-700 px-6 py-4 rounded-lg shadow-lg border-2 border-gray-400">
        <div className="text-xl font-medium text-center">🍷 A modest half-glass of Pinot to Will's fiscal responsibility 📊</div>
      </div>
    </div>
  )}

  {/* Corporate Header */}
  <div className="bg-gradient-to-r from-gray-700 via-stone-600 to-gray-700 shadow-xl border-b-4 border-gray-500 relative">
    <div className="absolute inset-0 bg-black opacity-10"></div>
    
    <div className="container mx-auto px-4 py-8 relative z-10">
      <div className="text-center space-y-4">
        <div className="text-5xl sm:text-7xl font-bold text-gray-200" style={{
          textShadow: '2px 2px 4px rgba(0,0,0,0.3)',
          letterSpacing: '0.05em'
        }}>
          💼 FELDMAN & ASSOCIATES "GATHERING" 💼
        </div>
        
        <div className="text-2xl sm:text-4xl font-medium text-stone-300">
          📋 A Strictly Professional Acknowledgment of Performance Metrics 📋
        </div>
        
        <div className="flex justify-center gap-4 text-3xl opacity-70">
          <span>🍷</span>
          <span>📊</span>
          <span>🏢</span>
          <span>📈</span>
          <span>⚖️</span>
        </div>

        {isWillInFirst && (
          <div className="bg-gradient-to-r from-stone-300 to-gray-300 text-gray-800 px-8 py-4 rounded-lg inline-block text-xl font-medium border-2 border-gray-400 shadow-lg">
            📑 NOTICE: Will has achieved marginal YoY growth in fantasy standings 📑
          </div>
        )}
      </div>
    </div>
  </div>

  {/* Main Header Section */}
  <div className="bg-gradient-to-r from-stone-100 via-gray-100 to-stone-100 shadow-lg border-b-2 border-gray-300 relative">
    <div className="container mx-auto px-4 py-6 relative">
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center space-y-6 lg:space-y-0">
        <div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-700 mb-3 tracking-tight">
            🏈 FOUNDERS (+ Business Associate Will) LEAGUE 💼
          </h1>
          <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-6 text-gray-600">
            <span className="font-medium text-lg bg-stone-200 px-3 py-1 rounded border border-gray-400 w-fit">
              Week {currentWeek} • {currentSeason} Fiscal Year
            </span>
            {lastUpdate && (
              <span className="text-sm bg-white px-2 py-1 rounded border border-gray-300 shadow-sm w-fit">
                📅 Last updated: {lastUpdate.toLocaleTimeString()}
              </span>
            )}
            <div className="flex items-center space-x-2 bg-white px-3 py-1 rounded border border-gray-300 shadow-sm w-fit">
              <div className={`w-3 h-3 rounded-full ${autoRefresh && !userSelectedWeek ? 'bg-gray-500' : 'bg-gray-300'}`}></div>
              <span className="text-sm font-medium">
                Auto-refresh {autoRefresh && !userSelectedWeek ? 'ENABLED' : 'DISABLED'}
                {userSelectedWeek && ' (manual override)'}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col space-y-3">
          <div className="flex items-center space-x-2 bg-white rounded-lg px-4 py-2 shadow-md border-2 border-gray-300">
            <button
              onClick={() => changeWeek(currentWeek - 1)}
              disabled={currentWeek <= 1}
              className="bg-stone-200 hover:bg-stone-300 disabled:bg-gray-100 disabled:text-gray-400 text-gray-700 font-medium py-1 px-3 rounded transition-colors text-sm border border-gray-400"
            >
              ← Prev
            </button>
            <select
              value={currentWeek}
              onChange={(e) => changeWeek(parseInt(e.target.value))}
              className="bg-stone-200 text-gray-700 font-medium px-3 py-1 rounded text-sm min-w-[90px] text-center border border-gray-400"
            >
              {Array.from({ length: 18 }, (_, i) => i + 1).map(w => (
                <option key={w} value={w}>Week {w}</option>
              ))}
            </select>
            <button
              onClick={() => changeWeek(currentWeek + 1)}
              disabled={currentWeek >= 18}
              className="bg-stone-200 hover:bg-stone-300 disabled:bg-gray-100 disabled:text-gray-400 text-gray-700 font-medium py-1 px-3 rounded transition-colors text-sm border border-gray-400"
            >
              Next →
            </button>
          </div>

          {userSelectedWeek && weekInfo && (
            <button
              onClick={() => {
                setUserSelectedWeek(false)
                changeWeek(weekInfo.display)
              }}
              className="bg-stone-200 hover:bg-stone-300 text-gray-700 font-medium py-1 px-3 rounded text-sm transition-colors border border-gray-400"
            >
              Revert to Default View (Week {weekInfo.display})
            </button>
          )}

          <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3">
            <a
              href="/scoreboard"
              className="bg-gradient-to-r from-slate-500 to-slate-600 hover:from-slate-600 hover:to-slate-700 text-white font-medium py-3 px-4 sm:px-6 rounded-lg transition-all shadow-md text-center text-sm sm:text-base border border-gray-400"
            >
              📅 Scoreboard
            </a>

            <a
              href="/minimal"
              className="bg-gradient-to-r from-stone-500 to-stone-600 hover:from-stone-600 hover:to-stone-700 text-white font-medium py-3 px-4 sm:px-6 rounded-lg transition-all shadow-md text-center text-sm sm:text-base border border-gray-400"
            >
              📊 Minimal View
            </a>
            
            <button 
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-4 sm:px-6 py-3 rounded-lg font-medium transition-all shadow-md text-sm sm:text-base border border-gray-400 ${
                autoRefresh 
                  ? 'bg-gradient-to-r from-gray-500 to-gray-600 text-white' 
                  : 'bg-gradient-to-r from-gray-300 to-gray-400 text-gray-700'
              }`}
            >
              🔄 Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
            </button>
            
            <button 
              onClick={loadData}
              disabled={loading}
              className="bg-gradient-to-r from-stone-600 to-stone-700 hover:from-stone-700 hover:to-stone-800 disabled:from-gray-400 disabled:to-gray-500 text-white font-medium py-3 px-4 sm:px-8 rounded-lg transition-all shadow-md flex items-center justify-center space-x-2 text-sm sm:text-base border border-gray-500"
            >
              {loading && <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>}
              <span>🔄 REFRESH DATA</span>
            </button>
            
            <a
              href="/admin"
              className="bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-medium py-3 px-4 sm:px-6 rounded-lg transition-all shadow-md text-center text-sm sm:text-base border border-gray-500"
            >
              ⚙️ Admin
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div className="container mx-auto px-4 py-8 relative z-10">
    <div className="space-y-8">
      {leaderboard.map((owner, index) => {
        const goose = gooseData[owner.id] || {}
        const hasGooseRisk = goose.gooseProbability > 0.15
        const rank = owner.rank
        const numGooses = owner.num_gooses ?? 0
        const gooseEggs = '🥚'.repeat(Math.max(0, numGooses))
        const isLeader = rank === 1
        const isTop3 = rank <= 3
        const isWill = owner.name?.toLowerCase().includes('will')
        const displayName = owner.name

        
        const getRankEmoji = (rank) => {
          if (rank === 1) return isWill ? '💼📊⚖️' : '👑'
          if (rank === 2) return '🥈'
          if (rank === 3) return '🥉'
          return ''
        }
        
        return (
          <div 
            key={owner.id} 
            className={`relative overflow-hidden rounded-lg shadow-xl transition-all hover:shadow-2xl border-2 ${
              isWill && isLeader
                ? 'bg-gradient-to-br from-stone-100 via-gray-100 to-stone-200 ring-4 ring-gray-400 border-gray-500' 
                : isLeader 
                ? 'bg-gradient-to-br from-yellow-100 via-yellow-50 to-amber-100 ring-4 ring-yellow-400 border-yellow-400' 
                : isTop3
                ? 'bg-gradient-to-br from-stone-50 via-white to-gray-50 ring-2 ring-stone-300 border-stone-300'
                : 'bg-gradient-to-br from-gray-50 via-white to-gray-50 ring-1 ring-gray-300 border-gray-200'
            }`}
          >
            <div className={`p-4 sm:p-6 ${
              isWill && isLeader
                ? 'bg-gradient-to-r from-stone-200 via-gray-200 to-stone-200 border-b-2 border-gray-400' 
                : isLeader 
                ? 'bg-gradient-to-r from-yellow-200 via-amber-100 to-yellow-200' 
                : isTop3
                ? 'bg-gradient-to-r from-stone-100 via-gray-50 to-stone-100'
                : 'bg-gradient-to-r from-gray-100 via-gray-50 to-gray-100'
            }`}>
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-4 sm:space-y-0">
                <div className="flex items-center space-x-4 sm:space-x-6">
                  <div className={`text-2xl sm:text-3xl font-bold px-3 sm:px-4 py-2 rounded-lg shadow-md border-2 ${
                    isWill && isLeader
                      ? 'bg-gradient-to-br from-stone-300 to-gray-400 text-gray-800 border-gray-500' 
                      : isLeader 
                      ? 'bg-gradient-to-br from-yellow-400 to-amber-500 text-yellow-900 border-yellow-600' 
                      : isTop3
                      ? 'bg-gradient-to-br from-stone-300 to-gray-300 text-gray-800 border-stone-400'
                      : 'bg-gradient-to-br from-gray-400 to-gray-500 text-gray-900 border-gray-600'
                  }`}>
                    #{rank}
                  </div>
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 flex items-center space-x-2 sm:space-x-3 mb-1">
                      <span>{displayName}</span>
                      {isWill && <span className="text-2xl">💼🍷📊</span>}
                      {gooseEggs && <span className={`text-3xl sm:text-4xl ${numGooses > 0 ? 'animate-bounce' : ''}`}>{gooseEggs}</span>}
                      {getRankEmoji(rank) && <span className={`text-3xl sm:text-4xl`}>{getRankEmoji(rank)}</span>}
                    </h2>
                    {isWill && isLeader && (
                      <div className="text-base font-medium text-gray-700">
                        ⚖️ Managing Partner (Acting)
                      </div>
                    )}
                    <div className={`text-3xl sm:text-4xl font-bold ${
                      isWill && isLeader 
                        ? 'bg-gradient-to-r from-stone-600 via-gray-600 to-stone-600 bg-clip-text text-transparent'
                        : 'bg-gradient-to-r from-emerald-600 to-green-600 bg-clip-text text-transparent'
                    }`}>
                      ${owner.totalEarnings}
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col sm:text-right space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <span className="bg-gradient-to-r from-slate-500 to-slate-600 text-white px-2 sm:px-3 py-1 rounded text-xs sm:text-sm font-medium shadow border border-gray-400">
                      🏆 {owner.wins}
                    </span>
                    <span className="bg-gradient-to-r from-stone-500 to-stone-600 text-white px-2 sm:px-3 py-1 rounded text-xs sm:text-sm font-medium shadow border border-gray-400">
                      🔥 {owner.obo}
                    </span>
                    <span className="bg-gradient-to-r from-gray-500 to-gray-600 text-white px-2 sm:px-3 py-1 rounded text-xs sm:text-sm font-medium shadow border border-gray-400">
                      🛡️ {owner.dbo}
                    </span>
                    <span className="bg-gradient-to-r from-zinc-500 to-zinc-600 text-white px-2 sm:px-3 py-1 rounded text-xs sm:text-sm font-medium shadow border border-gray-400">
                      🏁 {owner.eoy}
                    </span>
                  </div>
                  
                  <div className={`text-xs sm:text-sm font-medium px-3 sm:px-4 py-2 rounded shadow-md w-fit border ${
                    goose.gooseProbability > 0.1 ? 'bg-gradient-to-r from-red-400 to-red-500 text-white border-red-600' :
                    goose.gooseProbability > 0.05 ? 'bg-gradient-to-r from-yellow-400 to-orange-400 text-gray-800 border-yellow-500' :
                    'bg-gradient-to-r from-stone-400 to-gray-400 text-white border-gray-500'
                  }`}>
                    🥚 Goose Risk: {goose.goosePercentage || '0%'}
                  </div>
                </div>
              </div>
              
              {isWill && isLeader && (
                <div className="mt-4 p-4 bg-gradient-to-r from-stone-200 via-gray-200 to-stone-200 border-2 border-gray-400 rounded shadow-md">
                  <div className="text-center space-y-2">
                    <div className="text-xl font-medium text-gray-800">
                      📋 Will Has Achieved First Place Status 📋
                    </div>
                    <div className="text-base font-normal text-gray-700">
                      🍷 Perhaps a modest celebratory tasting is in order. Half-glass recommended. 🍷
                    </div>
                    <div className="text-sm text-gray-600 italic">
                      Topics for discussion: Sonoma real estate valuations • Recent ROI on index funds • Billable hours efficiency
                    </div>
                    <div className="flex justify-center gap-3 text-2xl opacity-60">
                      <span>💼</span>
                      <span>📊</span>
                      <span>⚖️</span>
                      <span>🏢</span>
                      <span>📈</span>
                    </div>
                  </div>
                </div>
              )}

              {hasGooseRisk && (
                <div className="mt-4 p-3 sm:p-4 bg-gradient-to-r from-yellow-200 to-orange-200 border-l-4 border-yellow-600 rounded shadow-md">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
                    <span className="font-bold text-yellow-900 text-sm sm:text-lg">
                      ⚠️ RISK ADVISORY: {goose.goosePercentage} probability of zero-point outcome
                    </span>
                    <span className="text-xs text-yellow-800 bg-yellow-100 px-2 py-1 rounded w-fit border border-yellow-400">{goose.reason}</span>
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
                    opponentText = 'Scheduled Break Week'
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
                    team.performancePercentile >= 0.8 ? 'from-stone-600 to-gray-600' :
                    team.performancePercentile >= 0.6 ? 'from-slate-600 to-gray-600' :
                    team.performancePercentile >= 0.4 ? 'from-zinc-600 to-stone-600' :
                    team.performancePercentile >= 0.2 ? 'from-gray-600 to-slate-600' :
                    'from-gray-700 to-gray-800'
                  
                  const performanceBorder = 
                    team.performancePercentile >= 0.8 ? 'border-stone-300 ring-2 ring-gray-200' :
                    team.performancePercentile >= 0.6 ? 'border-slate-300 ring-2 ring-slate-200' :
                    team.performancePercentile >= 0.4 ? 'border-zinc-300' :
                    team.performancePercentile >= 0.2 ? 'border-gray-400' :
                    'border-gray-500'
                  
                  return (
                    <div key={team.abbr} className={`bg-white rounded-lg p-3 sm:p-4 shadow-md hover:shadow-lg transition-all border-2 ${performanceBorder}`}>
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
                            <div className="font-bold text-lg sm:text-xl text-gray-800">{team.abbr}</div>
                            <div className="text-xs sm:text-sm text-gray-600 font-medium truncate">{opponentText}</div>
                            {enhancedStatusText && (
                              <div className="text-xs text-gray-500 font-normal truncate">{enhancedStatusText}</div>
                            )}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <div className={`font-bold text-base sm:text-lg bg-gradient-to-r ${performanceGradient} bg-clip-text text-transparent`}>
                            ${team.earnings}
                          </div>
                          {showLiveProbability && (
                            <div className={`text-xs px-2 py-1 rounded font-medium shadow-sm mt-1 border ${
                              prob.winProbability > 0.6 ? 'bg-gradient-to-r from-stone-300 to-gray-300 text-gray-800 border-gray-400' :
                              prob.winProbability > 0.4 ? 'bg-gradient-to-r from-yellow-300 to-orange-300 text-gray-800 border-yellow-400' :
                              'bg-gradient-to-r from-red-400 to-red-500 text-white border-red-600'
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
                        <div className="text-center bg-slate-50 rounded p-1.5 sm:p-2 border border-slate-200">
                          <div className="font-bold text-slate-600 text-sm sm:text-lg">{team.wins}</div>
                          <div className="text-xs text-slate-500 font-medium">WINS</div>
                        </div>
                        <div className="text-center bg-stone-50 rounded p-1.5 sm:p-2 border border-stone-200">
                          <div className="font-bold text-stone-600 text-sm sm:text-lg">{team.obo}</div>
                          <div className="text-xs text-stone-500 font-medium">OBO</div>
                        </div>
                        <div className="text-center bg-gray-50 rounded p-1.5 sm:p-2 border border-gray-200">
                          <div className="font-bold text-gray-600 text-sm sm:text-lg">{team.dbo}</div>
                          <div className="text-xs text-gray-500 font-medium">DBO</div>
                        </div>
                        <div className="text-center bg-zinc-50 rounded p-1.5 sm:p-2 border border-zinc-200">
                          <div className="font-bold text-zinc-600 text-sm sm:text-lg">{team.eoy}</div>
                          <div className="text-xs text-zinc-500 font-medium">EOY</div>
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
        <div className="text-8xl mb-6">📊</div>
        <h2 className="text-4xl font-bold text-gray-700 mb-4">No Data Available</h2>
        <p className="text-xl text-gray-600">Awaiting quarterly input from stakeholders.</p>
      </div>
    )}
  </div>

  {/* Footer */}
  <div className="bg-gradient-to-r from-gray-700 via-stone-600 to-gray-700 py-6 border-t-2 border-gray-500 relative z-10">
    <div className="container mx-auto px-4 text-center">
      <div className="text-xl font-medium text-gray-200 mb-2">
        💼 Special Corporate Acknowledgment Edition 💼
      </div>
      <div className="text-gray-300 font-normal">
        In recognition of Will's achievement of first-place status
      </div>
      <div className="text-gray-400 text-sm mt-2">
        🍷 Suggested pairing: Half-glass of 2019 Sonoma Pinot • Conversation topics: Real estate valuations, tax efficiency strategies 📊
      </div>
    </div>
  </div>
</div>
```

)
}
