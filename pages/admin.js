import { useState, useEffect } from 'react'

export default function Admin() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [season, setSeason] = useState(2025)
  const [week, setWeek] = useState(2)

  useEffect(() => {
    getCurrentWeek()
  }, [])

  async function getCurrentWeek() {
    try {
      const response = await fetch('/api/current-week')
      if (response.ok) {
        const data = await response.json()
        setSeason(data.season)
        setWeek(data.week)
      }
    } catch (error) {
      console.error('Error getting current week:', error)
    }
  }

  async function runWeeklyUpdate() {
    setLoading(true)
    setResult(null)
    
    try {
      const response = await fetch('/api/cron/weekly-update')
      const data = await response.json()
      setResult(data)
    } catch (error) {
      setResult({ error: error.message })
    }
    
    setLoading(false)
  }

  async function testKalshi() {
    setLoading(true)
    setResult(null)
    
    try {
      const response = await fetch('/api/test-kalshi')
      const data = await response.json()
      setResult(data)
    } catch (error) {
      setResult({ error: error.message })
    }
    
    setLoading(false)
  }

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
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          
          {/* Header */}
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold text-emerald-800 mb-2">🛠️ Admin Panel</h1>
                <p className="text-emerald-600">Manage your Payday Football League</p>
              </div>
              <a
                href="/"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                ← Back to Leaderboard
              </a>
            </div>
          </div>

          {/* Current Week Display */}
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-800 mb-2">Current NFL Week</h2>
                <div className="text-3xl font-bold text-emerald-600">
                  Week {week} • {season} Season
                </div>
              </div>
              <button
                onClick={getCurrentWeek}
                disabled={loading}
                className="bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors"
              >
                {loading ? 'Updating...' : 'Refresh Week'}
              </button>
            </div>
          </div>

          {/* Automation Status */}
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
            <h2 className="text-xl font-bold text-gray-800 mb-4">🤖 Automation Status</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-emerald-50 rounded-lg p-4">
                <div className="flex items-center space-x-3 mb-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="font-medium text-emerald-800">Weekly Updates</span>
                </div>
                <p className="text-sm text-emerald-600">Runs every Tuesday at 10am EST</p>
                <p className="text-xs text-emerald-500 mt-1">Fetches games + calculates scores automatically</p>
              </div>
              
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-center space-x-3 mb-2">
                  <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                  <span className="font-medium text-blue-800">Live Updates</span>
                </div>
                <p className="text-sm text-blue-600">Every 5 minutes during games</p>
                <p className="text-xs text-blue-500 mt-1">Updates probabilities + scores in real-time</p>
              </div>
            </div>
          </div>

          {/* Manual Actions */}
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Manual Actions</h2>
            
            <div className="space-y-4">
              <div className="bg-purple-50 rounded-lg p-4">
                <button
                  onClick={testKalshi}
                  disabled={loading}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                >
                  {loading ? 'Testing...' : '🔗 Test Kalshi API Connection'}
                </button>
                <p className="text-sm text-purple-600 mt-2">
                  Verify that Kalshi API is working and authenticated properly
                </p>
              </div>
              
              <div className="bg-blue-50 rounded-lg p-4">
                <button
                  onClick={fetchGames}
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                >
                  {loading ? 'Fetching...' : `🏈 Fetch Games (Week ${week})`}
                </button>
                <p className="text-sm text-blue-600 mt-2">
                  Downloads game data from ESPN API and updates your database
                </p>
              </div>
              
              <div className="bg-green-50 rounded-lg p-4">
                <button
                  onClick={calculateScores}
                  disabled={loading}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                >
                  {loading ? 'Calculating...' : `🏆 Calculate Scores (Week ${week})`}
                </button>
                <p className="text-sm text-green-600 mt-2">
                  Calculates wins, OBO, DBO for completed games and updates awards
                </p>
              </div>
              
              <div className="bg-orange-50 rounded-lg p-4">
                <button
                  onClick={runWeeklyUpdate}
                  disabled={loading}
                  className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                >
                  {loading ? 'Running...' : '⚡ Run Full Weekly Update'}
                </button>
                <p className="text-sm text-orange-600 mt-2">
                  Manually trigger the complete weekly automation (fetch + calculate)
                </p>
              </div>
            </div>
          </div>

          {/* Results */}
          {result && (
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">📊 Results</h2>
              
              {result.error ? (
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <span className="text-red-500">❌</span>
                    <strong>Error:</strong>
                    <span>{result.error}</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <span className="text-green-500">✅</span>
                      <strong>Success:</strong>
                      <span>{result.message}</span>
                    </div>
                  </div>
                  
                  {result.games && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="font-bold mb-3 text-gray-800">
                        🏈 Games ({result.totalGames || result.games}):
                      </h3>
                      <div className="max-h-60 overflow-y-auto space-y-2">
                        {result.games?.map ? (
                          result.games.map((game, index) => (
                            <div key={index} className="bg-white p-3 rounded border flex justify-between items-center">
                              <span className="font-medium">{game.matchup}</span>
                              <div className="flex items-center space-x-2">
                                <span className="text-gray-600">{game.score}</span>
                                <span className="text-xs text-gray-500">({game.status})</span>
                                {game.final && <span className="text-green-600 text-xs">✓ Final</span>}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-sm text-gray-600">Games processed: {result.games}</div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {result.awards !== undefined && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="font-bold mb-3 text-gray-800">🏆 Awards Given: {result.awards}</h3>
                      {result.details && (
                        <div className="max-h-60 overflow-y-auto space-y-2">
                          {result.details.map((award, index) => (
                            <div key={index} className="bg-white p-3 rounded border">
                              <div className="flex justify-between items-center">
                                <span className="font-medium">{award.team_abbr}</span>
                                <div className="flex items-center space-x-2">
                                  <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-xs font-medium">
                                    {award.type}
                                  </span>
                                  <span className="text-emerald-600 font-medium">$5</span>
                                </div>
                              </div>
                              {award.notes && <p className="text-xs text-gray-500 mt-1">{award.notes}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {result.markets_found && (
                    <div className="bg-purple-50 rounded-lg p-4">
                      <h3 className="font-bold mb-2 text-purple-800">📊 Kalshi API Test</h3>
                      <p className="text-sm text-purple-600">Found {result.markets_found} markets</p>
                      {result.sample_market && (
                        <p className="text-xs text-purple-500 mt-1">
                          Sample: {result.sample_market.title}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Instructions */}
          <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-xl p-6">
            <h3 className="font-bold mb-3 text-yellow-800">📋 How It Works</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
              <div>
                <h4 className="font-medium text-yellow-800 mb-2">🤖 Automated (Recommended)</h4>
                <ul className="space-y-1 text-yellow-700">
                  <li>• Every Tuesday 10am: Fetch games + calculate scores</li>
                  <li>• Every 5 minutes during games: Live updates</li>
                  <li>• Zero maintenance required!</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-yellow-800 mb-2">👨‍💻 Manual (If Needed)</h4>
                <ul className="space-y-1 text-yellow-700">
                  <li>• Test Kalshi connection</li>
                  <li>• Manually fetch games</li>
                  <li>• Force score calculation</li>
                  <li>• Trigger full weekly update</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}