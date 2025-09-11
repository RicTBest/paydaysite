import { useState } from 'react'

export default function Admin() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [season, setSeason] = useState(2025)
  const [week, setWeek] = useState(1)

  async function fetchGames() {
    setLoading(true)
    setResult(null)
    
    try {
      const response = await fetch('/api/fetch-games', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ season, week }),
      })
      
      const data = await response.json()
      setResult(data)
    } catch (error) {
      setResult({ error: error.message })
    }
    
    setLoading(false)
  }

  async function calculateScores() {
    setLoading(true)
    setResult(null)
    
    try {
      const response = await fetch('/api/update-scores', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ season, week }),
      })
      
      const data = await response.json()
      setResult(data)
    } catch (error) {
      setResult({ error: error.message })
    }
    
    setLoading(false)
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-center mb-8">Payday Football Admin</h1>
      
      <div className="max-w-2xl mx-auto">
        {/* Season/Week Controls */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Week Selection</h2>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Season
              </label>
              <input
                type="number"
                value={season}
                onChange={(e) => setSeason(parseInt(e.target.value))}
                className="w-full p-2 border border-gray-300 rounded-md"
                min="2020"
                max="2030"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Week
              </label>
              <input
                type="number"
                value={week}
                onChange={(e) => setWeek(parseInt(e.target.value))}
                className="w-full p-2 border border-gray-300 rounded-md"
                min="1"
                max="18"
              />
            </div>
          </div>
          
          <p className="text-sm text-gray-600">
            Leave blank in API calls to use current NFL week automatically
          </p>
        </div>

        {/* Action Buttons */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Actions</h2>
          
          <div className="space-y-4">
            <div>
              <button
                onClick={fetchGames}
                disabled={loading}
                className="w-full bg-blue-500 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-3 px-4 rounded"
              >
                {loading ? 'Fetching...' : `1. Fetch Games (Season ${season}, Week ${week})`}
              </button>
              <p className="text-sm text-gray-600 mt-2">
                Downloads game data from ESPN API and updates your database
              </p>
            </div>
            
            <div>
              <button
                onClick={calculateScores}
                disabled={loading}
                className="w-full bg-green-500 hover:bg-green-700 disabled:bg-green-300 text-white font-bold py-3 px-4 rounded"
              >
                {loading ? 'Calculating...' : `2. Calculate Scores (Season ${season}, Week ${week})`}
              </button>
              <p className="text-sm text-gray-600 mt-2">
                Calculates wins, OBO, DBO for completed games and updates awards
              </p>
            </div>
          </div>
        </div>

        {/* Results */}
        {result && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold mb-4">Results</h2>
            
            {result.error ? (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                <strong>Error:</strong> {result.error}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
                  <strong>Success:</strong> {result.message}
                </div>
                
                {result.games && (
                  <div>
                    <h3 className="font-bold mb-2">Games ({result.totalGames || result.games}):</h3>
                    <div className="bg-gray-100 p-3 rounded max-h-60 overflow-y-auto">
                      {result.games?.map ? (
                        result.games.map((game, index) => (
                          <div key={index} className="text-sm mb-1">
                            <strong>{game.matchup}</strong> - {game.score} ({game.status})
                            {game.final && <span className="text-green-600"> ✓ Final</span>}
                          </div>
                        ))
                      ) : (
                        <div className="text-sm">Games processed: {result.games}</div>
                      )}
                    </div>
                  </div>
                )}
                
                {result.awards !== undefined && (
                  <div>
                    <h3 className="font-bold mb-2">Awards Given: {result.awards}</h3>
                    {result.details && (
                      <div className="bg-gray-100 p-3 rounded max-h-60 overflow-y-auto">
                        {result.details.map((award, index) => (
                          <div key={index} className="text-sm mb-1">
                            <strong>{award.team_abbr}</strong> - {award.type} ({award.notes})
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Instructions */}
        <div className="mt-8 bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
          <h3 className="font-bold mb-2">Weekly Process:</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Run "Fetch Games" after games are played (usually Tuesday)</li>
            <li>Run "Calculate Scores" to award points for completed games</li>
            <li>Check the main leaderboard to see updated standings</li>
            <li>Manual awards (like coach fired) can be added directly in Supabase</li>
          </ol>
        </div>

        <div className="mt-4 text-center">
          <a
            href="/"
            className="text-blue-500 hover:text-blue-700 underline"
          >
            ← Back to Leaderboard
          </a>
        </div>
      </div>
    </div>
  )
}