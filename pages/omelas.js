import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Omelas() {
  const [leaderboard, setLeaderboard] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentSeason, setCurrentSeason] = useState(2025)

  // Owner initials mapping
  const ownerInitials = {
    'Ric': 'RB',
    'Zack': 'ZRW', 
    'Joel': 'JS',
    'Joey': 'JR',
    'Max': 'MN',
    'Will': 'WF'
  }

  useEffect(() => {
    loadData()
    
    // Auto-refresh every 2 minutes
    const interval = setInterval(() => {
      loadData()
    }, 2 * 60 * 1000)

    return () => clearInterval(interval)
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      
      // Load awards
      let awards = []
      try {
        const { data: awardsData, error } = await supabase
          .from('awards')
          .select('*')
          .eq('season', currentSeason)

        if (!error) {
          awards = awardsData || []
        }
      } catch (err) {
        console.warn('Awards table error:', err)
      }
      
      // Load teams and owners (main league tables)
      const { data: teams } = await supabase
        .from('teams')
        .select('abbr, name, owner_id')
        .eq('active', true)

      const { data: owners } = await supabase
        .from('owners')
        .select('id, name, num_gooses')

      // Create lookup maps
      const teamLookup = {}
      const ownerLookup = {}
      
      teams?.forEach(team => {
        teamLookup[team.abbr] = team
      })
      
      owners?.forEach(owner => {
        ownerLookup[owner.id] = owner
      })

      // Calculate owner stats
      const ownerStats = {}
      
      awards?.forEach(award => {
        const team = teamLookup[award.team_abbr]
        if (!team) return
        
        const ownerId = award.owner_id || team.owner_id
        const owner = ownerLookup[ownerId]
        if (!owner) return
        
        if (!ownerStats[ownerId]) {
          ownerStats[ownerId] = {
            id: ownerId,
            name: owner.name,
            num_gooses: owner.num_gooses,
            totalEarnings: 0
          }
        }
        
        const points = award.points || 1
        const earnings = points * 5
        ownerStats[ownerId].totalEarnings += earnings
      })

      // Add owners without awards
      owners?.forEach(owner => {
        if (!ownerStats[owner.id]) {
          ownerStats[owner.id] = {
            id: owner.id,
            name: owner.name,
            totalEarnings: 0,
            num_gooses: owner.num_gooses || 0
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
      
      setLeaderboard(sortedLeaderboard)
      setLoading(false)
    } catch (error) {
      console.error('Error loading data:', error)
      setLoading(false)
    }
  }

  // Determine floor placement based on earnings and rules
  const getFloorAssignments = (leaderboard) => {
    if (leaderboard.length === 0) return {}
    
    // Group by earnings (same earnings = same floor)
    const earningsGroups = {}
    leaderboard.forEach(owner => {
      const earnings = owner.totalEarnings
      if (!earningsGroups[earnings]) {
        earningsGroups[earnings] = []
      }
      earningsGroups[earnings].push(owner)
    })
    
    // Sort earnings groups from highest to lowest
    const sortedEarnings = Object.keys(earningsGroups)
      .map(e => parseInt(e))
      .sort((a, b) => b - a)
    
    const assignments = {}
    const floors = { penthouse: [], middle: [], basement: [] }
    
    // Try to assign groups to floors following the rules
    for (let i = 0; i < sortedEarnings.length; i++) {
      const earnings = sortedEarnings[i]
      const group = earningsGroups[earnings]
      
      if (i === 0) {
        // Highest earners - try for penthouse if possible
        if (group.length === 1) {
          floors.penthouse = group
        } else {
          // Multiple people tied for first - they go to middle
          floors.middle = floors.middle.concat(group)
        }
      } else if (i === sortedEarnings.length - 1) {
        // Lowest earners - try for basement but respect max 4 rule
        if (floors.basement.length + group.length <= 4) {
          floors.basement = floors.basement.concat(group)
        } else {
          // Too many for basement, put in middle
          floors.middle = floors.middle.concat(group)
        }
      } else {
        // Middle groups go to middle floor
        floors.middle = floors.middle.concat(group)
      }
    }
    
    // Ensure at least one in penthouse
    if (floors.penthouse.length === 0 && floors.middle.length > 0) {
      // Move highest earner from middle to penthouse
      const highestInMiddle = floors.middle.reduce((max, owner) => 
        owner.totalEarnings > max.totalEarnings ? owner : max
      )
      floors.penthouse = [highestInMiddle]
      floors.middle = floors.middle.filter(owner => owner.id !== highestInMiddle.id)
    }
    
    // Ensure at least two in basement if possible without violating other rules
    if (floors.basement.length < 2 && floors.middle.length > 1) {
      // Move lowest earners from middle to basement
      const sortedMiddle = floors.middle.sort((a, b) => a.totalEarnings - b.totalEarnings)
      const toMove = Math.min(2 - floors.basement.length, floors.middle.length - 1, 4 - floors.basement.length)
      
      for (let i = 0; i < toMove; i++) {
        floors.basement.push(sortedMiddle[i])
      }
      floors.middle = sortedMiddle.slice(toMove)
    }
    
    // Create final assignments
    floors.penthouse.forEach(owner => assignments[owner.id] = 'penthouse')
    floors.middle.forEach(owner => assignments[owner.id] = 'first-floor')
    floors.basement.forEach(owner => assignments[owner.id] = 'basement')
    
    return assignments
  }
  
  const floorAssignments = getFloorAssignments(leaderboard)
  const getFloorAssignment = (owner) => floorAssignments[owner.id] || 'first-floor'

  // Get color based on performance
  const getOwnerColor = (rank, totalPlayers) => {
    if (rank === 1) return 'from-yellow-400 to-amber-500' // Gold for king
    if (rank === totalPlayers) return 'from-gray-600 to-gray-800' // Dark for basement
    return 'from-blue-400 to-blue-600' // Blue for middle class
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-800 to-gray-900 flex justify-center items-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400 mx-auto mb-4"></div>
          <div className="text-xl font-semibold text-yellow-400">Loading the City of Omelas...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-800 via-gray-900 to-black overflow-hidden">
      {/* Header */}
      <div className="relative z-10 bg-black bg-opacity-50 border-b border-yellow-400">
        <div className="container mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <a
              href="/"
              className="text-yellow-400 hover:text-yellow-300 font-semibold text-sm flex items-center space-x-2"
            >
              <span>←</span>
              <span>Back to League</span>
            </a>
            <div className="text-center">
              <h1 className="text-4xl font-black text-yellow-400 mb-2 tracking-wide">
                THE CITY OF OMELAS
              </h1>
              <p className="text-gray-300 text-sm italic">
                "The happiness of millions depends on the misery of one"
              </p>
            </div>
            <div className="w-20"></div>
          </div>
        </div>
      </div>

      {/* The House */}
      <div className="relative flex-1 flex items-center justify-center p-4">
        <div className="relative w-full max-w-2xl mx-auto">
          
          {/* Roof */}
          <div className="relative mb-0">
            <div className="w-0 h-0 mx-auto"
                 style={{
                   borderLeft: '200px solid transparent',
                   borderRight: '200px solid transparent', 
                   borderBottom: '80px solid #fbbf24'
                 }}>
            </div>
            {/* Remove chimney - it didn't work well */}
          </div>

          {/* Attic/Top Floor */}
          <div className="relative -mt-2">
            <div className="bg-gradient-to-r from-yellow-400 to-amber-500 border-4 border-yellow-300 h-24 flex items-center justify-center relative">
              <div className="absolute inset-0 bg-gradient-to-r from-yellow-200/20 to-amber-300/20 animate-pulse"></div>
              
              {/* Place top floor dweller */}
              <div className="flex flex-wrap gap-4 items-center justify-center">
                {leaderboard
                  .filter(owner => getFloorAssignment(owner) === 'penthouse')
                  .map(owner => (
                    <div key={owner.id} className="flex flex-col items-center animate-bounce">
                      <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${getOwnerColor(owner.rank, leaderboard.length)} flex items-center justify-center text-white font-bold text-xs border-2 border-yellow-200 shadow-lg transform hover:scale-110 transition-transform`}>
                        {ownerInitials[owner.name] || owner.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="text-xs font-bold text-yellow-900 mt-1 bg-yellow-200 px-1 py-0.5 rounded">
                        ${owner.totalEarnings}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Main Floor */}
          <div className="relative">
            <div className="bg-gradient-to-r from-blue-400 to-blue-600 border-4 border-blue-300 border-t-0 h-32 flex items-center justify-center relative">
              {/* Comfortable home elements */}
              <div className="absolute top-2 left-4 w-8 h-6 bg-blue-100 border border-blue-800 opacity-90">
                <div className="absolute inset-1 bg-gradient-to-br from-yellow-200 to-yellow-300 opacity-60"></div>
              </div>
              <div className="absolute top-2 right-4 w-8 h-6 bg-blue-100 border border-blue-800 opacity-90">
                <div className="absolute inset-1 bg-gradient-to-br from-yellow-200 to-yellow-300 opacity-60"></div>
              </div>
              
              {/* Furniture scattered naturally around the room */}
              <div className="absolute bottom-4 left-6 text-sm transform -rotate-3">🛋️</div>
              <div className="absolute bottom-3 right-8 text-sm transform rotate-12">📺</div>
              <div className="absolute top-8 left-1/2 text-xs transform -rotate-6">💡</div>
              <div className="absolute bottom-5 left-16 text-xs transform rotate-15">🪑</div>
              <div className="absolute top-6 right-12 text-xs transform -rotate-8">📚</div>
              <div className="absolute top-4 left-8 text-xs transform rotate-5">🖼️</div>
              <div className="absolute bottom-6 right-16 text-xs transform -rotate-12">🪑</div>
              <div className="absolute top-7 right-6 text-xs transform rotate-20">🌱</div>
              
              {/* Place main floor dwellers */}
              <div className="flex flex-wrap gap-2 items-center justify-center z-10 relative">
                {leaderboard
                  .filter(owner => getFloorAssignment(owner) === 'first-floor')
                  .map((owner, index) => (
                    <div key={owner.id} className="flex flex-col items-center" style={{
                      animation: `float ${2 + index * 0.3}s ease-in-out infinite`
                    }}>
                      <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getOwnerColor(owner.rank, leaderboard.length)} flex items-center justify-center text-white font-bold text-xs border-2 border-blue-200 shadow-lg transform hover:scale-110 transition-transform`}>
                        {ownerInitials[owner.name] || owner.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="text-xs font-bold text-blue-900 mt-1 bg-blue-200 px-1 py-0.5 rounded text-center">
                        ${owner.totalEarnings}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Door */}
          <div className="relative -mt-8 mx-auto w-12 h-8 bg-brown-600 border-2 border-brown-800 z-10">
            <div className="absolute right-1 top-1/2 transform -translate-y-1/2 w-1 h-1 bg-yellow-400 rounded-full"></div>
          </div>

          {/* Basement */}
          <div className="relative mt-0">
            <div className="bg-gradient-to-r from-slate-800 to-gray-900 border-4 border-gray-800 border-t-0 h-28 flex items-center justify-center relative overflow-hidden">
              {/* Cold, damp effects */}
              <div className="absolute inset-0 bg-gradient-to-b from-gray-900/60 to-black/80"></div>
              
              {/* Dirty basement windows with condensation */}
              <div className="absolute top-1 left-4 w-4 h-2 bg-gray-500 border border-gray-900 opacity-40">
                <div className="absolute inset-0 bg-gradient-to-b from-gray-400 to-gray-600"></div>
              </div>
              <div className="absolute top-1 right-4 w-4 h-2 bg-gray-500 border border-gray-900 opacity-40">
                <div className="absolute inset-0 bg-gradient-to-b from-gray-400 to-gray-600"></div>
              </div>
              
              {/* Water stains and mold */}
              <div className="absolute top-0 left-1/4 w-3 h-6 bg-gradient-to-b from-green-900/30 to-green-800/40 rounded-b-full opacity-60"></div>
              <div className="absolute top-0 right-1/3 w-2 h-4 bg-gradient-to-b from-gray-700/40 to-gray-800/50 rounded-b-full opacity-70"></div>
              
              {/* Dripping water effect */}
              <div className="absolute top-2 left-1/4 w-0.5 h-1 bg-gray-400 opacity-50 animate-pulse"></div>
              <div className="absolute top-4 left-1/4 w-0.5 h-0.5 bg-gray-400 opacity-30 rounded-full animate-ping" style={{animationDelay: '1s'}}></div>
              
              {/* Cold air wisps */}
              <div className="absolute bottom-2 left-2 w-4 h-0.5 bg-gray-400/20 rounded-full animate-pulse"></div>
              <div className="absolute bottom-4 right-3 w-3 h-0.5 bg-gray-400/15 rounded-full animate-pulse" style={{animationDelay: '0.5s'}}></div>
              
              {/* Spiders and scary creatures */}
              <div className="absolute top-1 left-1 text-xs opacity-70">🕷️</div>
              <div className="absolute top-2 right-1 text-xs opacity-60">🕸️</div>
              <div className="absolute bottom-1 left-1 text-xs opacity-50">🧌</div>
              <div className="absolute bottom-2 right-2 text-xs opacity-60">🕷️</div>
              <div className="absolute top-1 left-1/2 text-xs opacity-40">🦇</div>
              <div className="absolute bottom-1 right-1/4 text-xs opacity-50">💀</div>
              
              {/* Place basement dwellers */}
              <div className="flex flex-wrap gap-2 items-center justify-center">
                {leaderboard
                  .filter(owner => getFloorAssignment(owner) === 'basement')
                  .map((owner, index) => (
                    <div key={owner.id} className="flex flex-col items-center animate-pulse">
                      <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getOwnerColor(owner.rank, leaderboard.length)} flex items-center justify-center text-white font-bold text-xs border-2 border-red-900 shadow-2xl transform hover:scale-110 transition-transform opacity-90`}>
                        {ownerInitials[owner.name] || owner.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="text-xs font-bold text-red-200 mt-1 bg-red-900/80 px-1 py-0.5 rounded">
                        ${owner.totalEarnings}
                      </div>
                      {owner.num_gooses > 0 && (
                        <div className="text-xs animate-bounce mt-1 opacity-80">
                          {'🥚'.repeat(owner.num_gooses)}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Foundation */}
          <div className="bg-stone-600 border-4 border-stone-800 border-t-0 h-4"></div>
        </div>
      </div>

      {/* Footer Quote */}
      <div className="relative z-10 bg-black bg-opacity-50 border-t border-yellow-400 p-4">
        <div className="text-center">
          <p className="text-gray-400 text-sm italic max-w-2xl mx-auto">
            "They all know it is there, all the people of Omelas... They all know that it has to be there. 
            Some of them understand why, and some do not, but they all understand that their happiness, 
            the beauty of their city... depend wholly on this child's abominable misery."
          </p>
          <p className="text-yellow-400 text-xs mt-2">- Ursula K. Le Guin</p>
        </div>
      </div>

      {/* CSS for floating animation */}
      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
    </div>
  )
}
