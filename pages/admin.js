import { useState, useEffect } from 'react'

export default function Admin() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [season, setSeason] = useState(2025)
  const [week, setWeek] = useState(4)
  const [actualWeek, setActualWeek] = useState(4)
  const [defaultWeek, setDefaultWeek] = useState(4)
  const [weekInfo, setWeekInfo] = useState(null)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkResult, setBulkResult] = useState(null)

  useEffect(() => {
    getCurrentWeek()
  }, [])

  async function getCurrentWeek() {
    try {
      const [actualResponse, displayResponse] = await Promise.all([
        fetch('/api/current-week'),
        fetch('/api/current-week?display=true')
      ])
      
      if (actualResponse.ok && displayResponse.ok) {
        const actualData = await actualResponse.json()
        const displayData = await displayResponse.json()
        
        setSeason(actualData.season)
        setActualWeek(actualData.week)
        setDefaultWeek(displayData.week)
        setWeek(displayData.week)
        
        setWeekInfo({
          actual: actualData.week,
          display: displayData.week,
          dayOfWeek: displayData.dayOfWeek
        })
      }
    } catch (error) {
      console.error('Error getting current week:', error)
    }
  }

  function getDayOfWeekName(dayOfWeek) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    return days[dayOfWeek] || 'Unknown'
  }

  function getWeekSelectionHelp() {
    if (!weekInfo) return ''
    
    const dayName = getDayOfWeekName(weekInfo.dayOfWeek)
    
    if (weekInfo.dayOfWeek <= 2) {
      return `${dayName}: Defaulting to previous week (${weekInfo.display}) - games just finished`
    } else {
      return `${dayName}: Defaulting to current week (${weekInfo.display}) - preparing for upcoming games`
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

  async function fetchAllGames() {
    setBulkLoading(true)
    setBulkResult(null)
    
    try {
      const response = await fetch('/api/fetch-all-games', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          season,
          startWeek: 1,
          endWeek: 18,
          forceRefetch: false
        }),
      })
      
      const data = await response.json()
      setBulkResult(data)
    } catch (error) {
      setBulkResult({ error: error.message })
    }
    
    setBulkLoading(false)
  }

  async function forceRefetchAllGames() {
    setBulkLoading(true)
    setBulkResult(null)
    
    try {
      const response = await fetch('/api/fetch-all-games', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          season,
          startWeek: 1,
          endWeek: 18,
          forceRefetch: true
        }),
      })
      
      const data = await response.json()
      setBulkResult(data)
    } catch (error) {
      setBulkResult({ error: error.message })
    }
    
    setBulkLoading(false)
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

  const weekOptions = Array.from({ length: 18 }, (_, i) => i + 1)

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

          {/* Week Selection */}
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
            <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start space-y-4 lg:space-y-0">
              <div className="flex-1">
                <h2 className="text-xl font-bold text-gray-800 mb-2">Week Selection</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="text-sm font-medium text-blue-800 mb-1">NFL Calendar Week</div>
                    <div className="text-2xl font-bold text-blue-600">
                      Week {actualWeek}
                    </div>
                    <div className="text-xs text-blue-500">(Actual current week)</div>
                  </div>
                  
                  <div className="bg-emerald-50 rounded-lg p-4">
                    <div className="text-sm font-medium text-emerald-800 mb-1">Smart Default Week</div>
                    <div className="text-2xl font-bold text-emerald-600">
                      Week {defaultWeek}
                    </div>
                    <div className="text-xs text-emerald-500">(Recommended display)</div>
                  </div>
                </div>
                
                {weekInfo && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                    <div className="text-sm text-yellow-800">
                      <strong>Logic:</strong> {getWeekSelectionHelp()}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex flex-col space-y-3 lg:ml-6">
                <div className="flex items-center space-x-3">
                  <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                    Selected Week:
                  </label>
                  <select
                    value={week}
                    onChange={(e) => setWeek(parseInt(e.target.value))}
                    className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-900 min-w-[100px]"
                  >
                    {weekOptions.map(w => (
                      <option key={w} value={w}>Week {w}</option>
                    ))}
                  </select>
                </div>
                
                <div className="flex space-x-2">
                  <button
                    onClick={() => setWeek(Math.max(1, week - 1))}
                    disabled={week <= 1}
                    className="bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400 text-gray-700 font-medium py-1 px-3 rounded text-sm transition-colors"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => setWeek(Math.min(18, week + 1))}
                    disabled={week >= 18}
                    className="bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400 text-gray-700 font-medium py-1 px-3 rounded text-sm transition-colors"
                  >
                    Next →
                  </button>
                </div>
                
                <button
                  onClick={() => setWeek(defaultWeek)}
                  className="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-medium py-1 px-3 rounded text-sm transition-colors"
                >
                  Reset to Smart Default
                </button>
              </div>
            </div>
          </div>

          {/* Bulk Games Management */}
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
            <h2 className="text-xl font-bold text-gray-800 mb-4">🎯 Season Games Management</h2>
            <p className="text-sm text-gray-600 mb-4">
              For a fully functional scoreboard that can navigate to any week, all games must be pre-loaded into the database.
            </p>
            
            <div className="space-y-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <button
                  onClick={fetchAllGames}
                  disabled={bulkLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-3 px-4 rounded-lg transition-colors mb-2"
                >
                  {bulkLoading ? 'Fetching All Games...' : '📦 Fetch All Season Games (Weeks 1-18)'}
                </button>
                <p className="text-sm text-blue-600">
                  Intelligently fetches games for all weeks. Skips weeks that already have games loaded.
                </p>
              </div>
              
              <div className="bg-orange-50 rounded-lg p-4">
                <button
                  onClick={forceRefetchAllGames}
                  disabled={bulkLoading}
                  className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white font-bold py-3 px-4 rounded-lg transition-colors mb-2"
                >
                  {bulkLoading ? 'Force Refetching...' : '🔄 Force Refetch All Games'}
                </button>
                <p className="text-sm text-orange-600">
                  Forces a complete refresh of all games for all weeks. Use if you need to update existing games.
                </p>
              </div>
            </div>
          </div>

          {/* Bulk Results */}
          {bulkResult && (
            <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
              <h2 className="text-xl font-bold text-gray-800 mb-4">📊 Bulk Operation Results</h2>
              
              {bulkResult.error ? (
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <span className="text-red-500">❌</span>
                    <strong>Error:</strong>
                    <span>{bulkResult.error}</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <span className="text-green-500">✅</span>
                      <strong>Success:</strong>
                      <span>{bulkResult.message}</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-blue-50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-blue-600">{bulkResult.weeksProcessed}</div>
                      <div className="text-xs text-blue-500">Weeks Processed</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-green-600">{bulkResult.successful}</div>
                      <div className="text-xs text-green-500">Successful Weeks</div>
                    </div>
                    <div className="bg-yellow-50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-yellow-600">{bulkResult.skipped}</div>
                      <div className="text-xs text-yellow-500">Skipped Weeks</div>
                    </div>
                    <div className="bg-emerald-50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-emerald-600">{bulkResult.totalGames}</div>
                      <div className="text-xs text-emerald-500">Total Games</div>
                    </div>
                  </div>

                  {bulkResult.results && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="font-bold mb-3 text-gray-800">Week-by-Week Results:</h3>
                      <div className="max-h-60 overflow-y-auto space-y-2">
                        {bulkResult.results.map((weekResult, index) => (
                          <div key={index} className="bg-white p-3 rounded border flex justify-between items-center">
                            <span className="font-medium">Week {weekResult.week}</span>
                            <div className="flex items-center space-x-2">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                weekResult.status === 'success' ? 'bg-green-100 text-green-800' :
                                weekResult.status === 'skipped' ? 'bg-yellow-100 text-yellow-800' :
                                weekResult.status === 'error' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {weekResult.status}
                              </span>
                              <span className="text-gray-600">{weekResult.games} games</span>
                              {weekResult.message && (
                                <span className="text-xs text-gray-500">({weekResult.message})</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {bulkResult.errors && bulkResult.errors.length > 0 && (
                    <div className="bg-red-50 rounded-lg p-4">
                      <h3 className="font-bold mb-3 text-red-800">Errors:</h3>
                      <div className="space-y-2">
                        {bulkResult.errors.map((error, index) => (
                          <div key={index} className="bg-white p-3 rounded border border-red-200">
                            <div className="text-red-800">
                              <strong>Week {error.week}:</strong> {error.error}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Current Operation Target */}
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-800 mb-2">Single Week Operations</h2>
                <div className="text-3xl font-bold text-emerald-600">
                  Week {week} • {season} Season
                </div>
              </div>
              <button
                onClick={getCurrentWeek}
                disabled={loading}
                className="bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors"
              >
                {loading ? 'Updating...' : 'Refresh Week Info'}
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

          {/* Single Week Results */}
          {result && (
            <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
              <h2 className="text-xl font-bold text-gray-800 mb-4">📊 Single Week Results</h2>
              
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
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
            <h3 className="font-bold mb-3 text-yellow-800">📋 How It Works</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
              <div>
                <h4 className="font-medium text-yellow-800 mb-2">🎯 Season Setup (One-Time)</h4>
                <ul className="space-y-1 text-yellow-700">
                  <li>• Use "Fetch All Season Games" to populate your database</li>
                  <li>• This enables full scoreboard navigation (Weeks 1-18)</li>
                  <li>• Smart detection skips weeks already loaded</li>
                  <li>• Required for proper week navigation functionality</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-yellow-800 mb-2">🤖 Ongoing Operations</h4>
                <ul className="space-y-1 text-yellow-700">
                  <li>• Automated: Tuesday 10am updates + live scoring</li>
                  <li>• Manual: Select any week for targeted operations</li>
                  <li>• Test Kalshi connection before major operations</li>
                  <li>• Use single-week operations for troubleshooting</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
