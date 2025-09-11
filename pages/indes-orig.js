import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Home() {
  const [leaderboard, setLeaderboard] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentSeason] = useState(2025) // Changed to 2025 to match your data
  const [debugInfo, setDebugInfo] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      
      // Get all awards with team and owner info for the current season
      const { data: awards, error } = await supabase
        .from('awards')
        .select(`
          *,
          teams!inner(abbr, name, owner_id, owners!inner(name))
        `)
        .eq('season', currentSeason)

      console.log('Awards data:', awards)
      setDebugInfo(`Found ${awards?.length || 0} awards for season ${currentSeason}`)

      if (error) {
        console.error('Error fetching awards:', error)
        setDebugInfo(`Error: ${error.message}`)
        setLoading(false)
        return
      }

      // Process leaderboard data
      const ownerStats = {}
      
      awards?.forEach(award => {
        const ownerId = award.teams.owner_id
        const ownerName = award.teams.owners.name
        const teamAbbr = award.teams.abbr
        
        if (!ownerStats[ownerId]) {
          ownerStats[ownerId] = {
            id: ownerId,
            name: ownerName,
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
            name: award.teams.name,
            earnings: 0,
            wins: 0,
            obo: 0,
            dbo: 0,
            eoy: 0
          }
        }
        
        const points = award.points || 5
        const earnings = points * 5 // $5 per point
        
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

      // Add owners with no awards but with teams
      const { data: allTeams } = await supabase
        .from('teams')
        .select('abbr, name, owner_id, owners!inner(name)')
        .eq('active', true)

      allTeams?.forEach(team => {
        if (!ownerStats[team.owner_id]) {
          ownerStats[team.owner_id] = {
            id: team.owner_id,
            name: team.owners.name,
            totalEarnings: 0,
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
      
      setLeaderboard(sortedLeaderboard)
      setLoading(false)
    } catch (error) {
      console.error('Error loading data:', error)
      setDebugInfo(`Error: ${error.message}`)
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-xl">Loading Payday Football League...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-center mb-8">Payday Football League</h1>
      
      <div className="mb-6 text-center">
        <button 
          onClick={loadData}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mr-4"
        >
          Refresh Data
        </button>
        <span className="text-gray-600">Season {currentSeason}</span>
        <div className="text-sm text-gray-500 mt-2">{debugInfo}</div>
      </div>

      <div className="space-y-6">
        {leaderboard.map((owner, index) => (
          <div key={owner.id} className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                {index + 1}. {owner.name} • ${owner.totalEarnings}
              </h2>
              <div className="text-sm text-gray-600">
                WINS: {owner.wins} | OBO: {owner.obo} | DBO: {owner.dbo} | EOY: {owner.eoy}
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-left p-2">TEAM</th>
                    <th className="text-left p-2">EARNINGS</th>
                    <th className="text-left p-2">WINS</th>
                    <th className="text-left p-2">OBO</th>
                    <th className="text-left p-2">DBO</th>
                    <th className="text-left p-2">EOY</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(owner.teams).map(team => (
                    <tr key={team.abbr} className="border-b">
                      <td className="p-2 font-medium">{team.abbr}</td>
                      <td className="p-2">${team.earnings}</td>
                      <td className="p-2">{team.wins}</td>
                      <td className="p-2">{team.obo}</td>
                      <td className="p-2">{team.dbo}</td>
                      <td className="p-2">{team.eoy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {leaderboard.length === 0 && (
        <div className="text-center">
          <p className="text-lg mb-4">No leaderboard data found for season {currentSeason}!</p>
          <p className="text-gray-600">Add some awards to see the leaderboard.</p>
        </div>
      )}
    </div>
  )
}