import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function MinimalistScoreboard() {
  const [ownerRankings, setOwnerRankings] = useState([])
  const [teamEarnings, setTeamEarnings] = useState({})
  const [loading, setLoading] = useState(true)
  const [currentSeason, setCurrentSeason] = useState(2025)
  const [currentWeek, setCurrentWeek] = useState(2)
  const [selectedWeek, setSelectedWeek] = useState('overall')

  useEffect(() => {
    loadCurrentWeek()
    
    const interval = setInterval(() => {
      console.log('Auto-refreshing minimalist scoreboard...')
      // Only auto-refresh if we're viewing the current week or overall
      if (currentSeason && (selectedWeek === 'overall' || (selectedWeek === currentWeek))) {
        loadData()
      }
    }, 60 * 1000)

    return () => {
      clearInterval(interval)
    }
  }, [currentWeek, selectedWeek])

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
        
        // Only set selectedWeek if it hasn't been manually changed by the user
        if (selectedWeek === 'overall') { // Keep default as overall
          // Don't auto-change from overall to current week
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

  async function loadData() {
    console.log('=== STARTING MINIMALIST SCOREBOARD DATA LOAD ===')
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

      if (selectedWeek === 'overall') {
        // Load overall totals across all weeks
        await loadOverallData(teams, owners, teamLookup, ownerLookup)
      } else {
        // Load specific week data
        await loadWeekData(teams, owners, teamLookup, ownerLookup, selectedWeek)
      }
      
    } catch (error) {
      console.error('Error in minimalist loadData:', error)
      setLoading(false)
    }
  }

  async function loadOverallData(teams, owners, teamLookup, ownerLookup) {
    console.log('Loading overall data across all weeks...')
    
    // Load all awards across all weeks for current season
    const { data: allAwardsData } = await supabase
      .from('awards')
      .select('*')
      .eq('season', currentSeason)

    const allAwards = allAwardsData || []
    
    // Load all games across all weeks for current season to get wins
    const { data: allGamesData } = await supabase
      .from('games')
      .select('*')
      .eq('season', currentSeason)
      .eq('status', 'STATUS_FINAL')

    // Initialize team stats
    const teamStats = {}
    
    teams.forEach(team => {
      const owner = ownerLookup[team.owner_id]
      if (!owner) return

      teamStats[team.abbr] = {
        abbr: team.abbr,
        name: team.name,
        ownerId: team.owner_id,
        ownerName: owner.name,
        earnings: 0,
        wins: 0
      }
    })
    
    // Process all awards
    allAwards.forEach(award => {
      const team = teamStats[award.team_abbr]
      if (!team) return

      const points = award.points || 1
      const earnings = points * 5
      
      team.earnings += earnings

      if (award.type === 'WIN' || award.type === 'TIE_AWAY') {
        team.wins += 1
      }
    })
    
    // Process game wins (only count wins not already counted by awards)
    const winsByWeek = {}
    allAwards.forEach(award => {
      if (award.type === 'WIN' || award.type === 'TIE_AWAY') {
        if (!winsByWeek[award.week]) winsByWeek[award.week] = new Set()
        winsByWeek[award.week].add(award.team_abbr)
      }
    })

    if (allGamesData) {
      allGamesData.forEach(game => {
        const getWinner = (game) => {
          if (game.home_pts > game.away_pts) return game.home
          if (game.away_pts > game.home_pts) return game.away
          return game.away // Tie goes to away team
        }
        
        const winner = getWinner(game)
        const team = teamStats[winner]
        if (!team) return
        
        // Only add win earnings if this win wasn't already counted by awards
        const weekWinners = winsByWeek[game.week] || new Set()
        if (!weekWinners.has(winner)) {
          team.earnings += 5
          team.wins += 1
        }
      })
    }

    buildOwnerRankings(teamStats)
  }

  async function loadWeekData(teams, owners, teamLookup, ownerLookup, week) {
    console.log('Loading week data for week:', week)
    
    // 3. Load games for game state
    const { data: gamesData } = await supabase
      .from('games')
      .select('*')
      .eq('season', currentSeason)
      .eq('week', week)

    const gameState = {}
    if (gamesData) {
      gamesData.forEach(game => {
        const getResult = (isHome, status, homeScore, awayScore) => {
          if (status !== 'STATUS_FINAL') return null
          const myScore = isHome ? homeScore : awayScore
          const theirScore = isHome ? awayScore : homeScore
          return myScore > theirScore ? 'win' : myScore < theirScore ? 'loss' : 'tie'
        }
        
        const homeResult = getResult(true, game.status, game.home_pts, game.away_pts)
        const awayResult = getResult(false, game.status, game.home_pts, game.away_pts)
        
        gameState[game.home] = {
          status: game.status,
          result: homeResult,
          isHome: true
        }
        
        gameState[game.away] = {
          status: game.status,
          result: awayResult,
          isHome: false
        }
      })
    }
    
    // 4. Load awards for the specific week
    const { data: awardsData } = await supabase
      .from('awards')
      .select('*')
      .eq('season', currentSeason)
      .eq('week', week)

    const awards = awardsData || []
    
    // 5. Initialize team stats
    const teamStats = {}
    
    teams.forEach(team => {
      const owner = ownerLookup[team.owner_id]
      if (!owner) return

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
    
    // 6. Process awards
    awards.forEach(award => {
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
          team.oboCount += 1
          break
        case 'DBO':
          team.dboCount += 1
          break
      }
    })
    
    // 7. Add wins from completed games
    Object.entries(gameState).forEach(([teamAbbr, game]) => {
      if (game.status === 'STATUS_FINAL') {
        const team = teamStats[teamAbbr]
        if (!team) return

        const isWin = game.result === 'win' || (game.result === 'tie' && !game.isHome)
        
        if (isWin && !team.hasWin) {
          team.earnings += 5
          team.hasWin = true
        }
      }
    })

    buildOwnerRankings(teamStats)
  }

  function buildOwnerRankings(teamStats) {
    // 8. Calculate owner totals and team earnings
    const ownerTotals = {}
    const teamEarningsMap = {}
    
    Object.values(teamStats).forEach(team => {
      if (!ownerTotals[team.ownerId]) {
        ownerTotals[team.ownerId] = {
          id: team.ownerId,
          name: team.ownerName,
          total: 0,
          teams: []
        }
      }
      ownerTotals[team.ownerId].total += team.earnings
      ownerTotals[team.ownerId].teams.push({
        abbr: team.abbr,
        earnings: team.earnings,
        oboCount: team.oboCount || 0,
        dboCount: team.dboCount || 0,
        wins: team.wins || 0
      })
      
      teamEarningsMap[team.abbr] = team.earnings
    })

    const sortedOwners = Object.values(ownerTotals).sort((a, b) => b.total - a.total)
    
    let currentRank = 1
    sortedOwners.forEach((owner, index) => {
      if (index > 0 && owner.total < sortedOwners[index - 1].total) {
        currentRank = index + 1
      }
      owner.rank = currentRank
      
      // Sort teams by earnings within each owner
      owner.teams.sort((a, b) => b.earnings - a.earnings)
    })

    setOwnerRankings(sortedOwners)
    setTeamEarnings(teamEarningsMap)
    setLoading(false)
    
    console.log('=== MINIMALIST SCOREBOARD LOAD COMPLETE ===')
  }

  const weekOptions = ['overall', ...Array.from({ length: 18 }, (_, i) => i + 1)]

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <div className="text-sm font-semibold text-gray-800">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-3">
          <a
            href="/"
            className="text-blue-600 hover:text-blue-800 font-semibold text-sm"
          >
            ← Back to League
          </a>
          <h1 className="text-xl font-bold text-gray-900">
            {selectedWeek === 'overall' ? 'Overall Standings' : `Week ${selectedWeek}`}
          </h1>
          <select
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(e.target.value === 'overall' ? 'overall' : parseInt(e.target.value))}
            className="bg-white border border-gray-300 rounded px-2 py-1 text-sm font-semibold text-gray-900"
          >
            {weekOptions.map(week => (
              <option key={week} value={week}>
                {week === 'overall' ? 'Overall' : `Week ${week}`}
              </option>
            ))}
          </select>
        </div>
        
        {/* One-line summary */}
        <div className="bg-white rounded-lg border p-3 mb-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            {ownerRankings.map((owner, index) => (
              <span key={owner.id} className="whitespace-nowrap">
                <span className="font-semibold text-gray-900">
                  {owner.name}:
                </span>
                <span className="ml-1 font-bold text-green-600">
                  ${owner.total}
                </span>
                {index < ownerRankings.length - 1 && (
                  <span className="ml-4 text-gray-300">|</span>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Detailed breakdown */}
      <div className="space-y-3">
        {ownerRankings.map((owner) => (
          <div key={owner.id} className="bg-white rounded-lg border p-4">
            <div className="flex items-start justify-between">
              {/* Left side: Owner name and total */}
              <div className="flex items-center space-x-3">
                <div className="text-lg font-bold text-gray-900">
                  #{owner.rank}
                </div>
                <div>
                  <div className="font-semibold text-gray-900">{owner.name}</div>
                  <div className="text-xl font-bold text-green-600">${owner.total}</div>
                </div>
              </div>
              
              {/* Right side: Teams */}
              <div className="flex flex-wrap gap-2">
                {owner.teams.map((team) => (
                  <div key={team.abbr} className="flex items-center space-x-1 bg-gray-50 rounded px-2 py-1">
                    <img 
                      src={`https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/${team.abbr.toLowerCase()}.png`}
                      alt={`${team.abbr} logo`}
                      className="w-4 h-4 object-contain"
                      onError={(e) => {
                        e.target.src = `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/nfl.png`
                      }}
                    />
                    <span className="text-xs font-semibold text-gray-700">{team.abbr}</span>
                    {selectedWeek !== 'overall' && (team.oboCount > 0) && <span className="text-xs">🔥</span>}
                    {selectedWeek !== 'overall' && (team.dboCount > 0) && <span className="text-xs">🛡️</span>}
                    <span className="text-xs font-bold text-green-600">${team.earnings}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {ownerRankings.length === 0 && (
        <div className="text-center py-12">
          <div className="text-lg font-bold text-gray-700 mb-2">No Data</div>
          <p className="text-gray-600">No data available for {selectedWeek === 'overall' ? 'overall standings' : `Week ${selectedWeek}`}</p>
        </div>
      )}
    </div>
  )
}
