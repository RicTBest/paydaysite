import { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'

// NFL Team logos from ESPN CDN
const TEAM_LOGOS = {
  NYG: 'https://a.espncdn.com/i/teamlogos/nfl/500/nyg.png',
  LV: 'https://a.espncdn.com/i/teamlogos/nfl/500/lv.png',
  NYJ: 'https://a.espncdn.com/i/teamlogos/nfl/500/nyj.png',
  CLE: 'https://a.espncdn.com/i/teamlogos/nfl/500/cle.png'
}

const TEAM_COLORS = {
  NYG: { primary: '#0B2265', secondary: '#A71930', bg: 'from-blue-900 to-red-800' },
  LV: { primary: '#000000', secondary: '#A5ACAF', bg: 'from-black to-gray-600' },
  NYJ: { primary: '#125740', secondary: '#000000', bg: 'from-green-800 to-green-950' },
  CLE: { primary: '#311D00', secondary: '#FF3C00', bg: 'from-orange-700 to-amber-900' }
}

const OWNER_COLORS = {
  Ric: 'from-purple-600 to-purple-800',
  Zack: 'from-blue-600 to-blue-800',
  Joey: 'from-emerald-600 to-emerald-800'
}

const currentSeason = 2025

export default function LOTATracker() {
  const [lotaData, setLotaData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [debugInfo, setDebugInfo] = useState(null)

  // Helper to check if a game result is locked (from Kalshi confidence field)
  const isGameLocked = (prob) => {
    return prob?.confidence === 'final'
  }

  // Calculate LOTA odds from Kalshi probability data
  const calculateLOTAOdds = (week17Probs, week18Probs) => {
    // Get win probability for a team
    const getWinProb = (probs, team) => {
      return probs[team]?.winProbability ?? 0.5
    }

    // Track game statuses for display (null = pending, 0 = lost, 1 = won)
    const getGameStatus = (probs, team) => {
      const prob = probs[team]
      if (prob?.confidence === 'final') {
        return prob.winProbability // Will be 1 or 0
      }
      return null // Game not finished
    }

    const gameStatuses = {
      week17: {
        raiders_vs_giants: getGameStatus(week17Probs, 'LV'),
        jets_vs_patriots: getGameStatus(week17Probs, 'NYJ'),
        browns_vs_steelers: getGameStatus(week17Probs, 'CLE')
      },
      week18: {
        giants_vs_cowboys: getGameStatus(week18Probs, 'NYG'),
        raiders_vs_chiefs: getGameStatus(week18Probs, 'LV'),
        jets_vs_bills: getGameStatus(week18Probs, 'NYJ'),
        browns_vs_bengals: getGameStatus(week18Probs, 'CLE')
      }
    }

    // W17 probabilities
    const P_raiders_w17 = getWinProb(week17Probs, 'LV')
    const P_jets_w17_win = getWinProb(week17Probs, 'NYJ')
    const P_browns_w17_win = getWinProb(week17Probs, 'CLE')

    // W18 probabilities
    const P_giants_w18 = getWinProb(week18Probs, 'NYG')
    const P_raiders_w18 = getWinProb(week18Probs, 'LV')
    const P_jets_w18_win = getWinProb(week18Probs, 'NYJ')
    const P_browns_w18_win = getWinProb(week18Probs, 'CLE')

    // Derived probabilities
    const P_browns_0_2 = (1 - P_browns_w17_win) * (1 - P_browns_w18_win)
    const P_jets_0_2 = (1 - P_jets_w17_win) * (1 - P_jets_w18_win)

    // Apply formulas
    const P_giants = 
      P_raiders_w17 * (1 - P_giants_w18) +
      P_raiders_w17 * P_giants_w18 * (1 - P_browns_0_2) +
      (1 - P_raiders_w17) * P_raiders_w18 * (1 - P_browns_0_2) * (1 - P_giants_w18)

    const P_raiders = 
      (1 - P_raiders_w17) * (1 - P_raiders_w18) +
      (1 - P_raiders_w17) * P_raiders_w18 * (1 - P_browns_0_2) * P_giants_w18 * (1 - P_jets_0_2)

    const P_browns = 
      P_raiders_w17 * P_giants_w18 * P_browns_0_2 +
      (1 - P_raiders_w17) * P_raiders_w18 * P_browns_0_2

    const P_jets = 
      (1 - P_raiders_w17) * P_raiders_w18 * (1 - P_browns_0_2) * P_giants_w18 * P_jets_0_2

    // Owner mappings
    const teamOwners = {
      NYG: { name: 'Zack' },
      LV: { name: 'Ric' },
      NYJ: { name: 'Joey' },
      CLE: { name: 'Ric' }
    }

    const ownerProbs = {}
    const teamProbs = { NYG: P_giants, LV: P_raiders, NYJ: P_jets, CLE: P_browns }
    
    Object.entries(teamOwners).forEach(([team, owner]) => {
      if (!ownerProbs[owner.name]) {
        ownerProbs[owner.name] = { probability: 0, teams: [] }
      }
      ownerProbs[owner.name].probability += teamProbs[team]
      ownerProbs[owner.name].teams.push(team)
    })

    const totalProb = P_giants + P_raiders + P_browns + P_jets

    return {
      timestamp: new Date().toISOString(),
      season: currentSeason,
      gameStatuses,
      inputProbabilities: {
        week17: {
          raiders_beat_giants: P_raiders_w17,
          jets_beat_patriots: P_jets_w17_win,
          browns_beat_steelers: P_browns_w17_win
        },
        week18: {
          giants_beat_cowboys: P_giants_w18,
          raiders_beat_chiefs: P_raiders_w18,
          jets_beat_bills: P_jets_w18_win,
          browns_beat_bengals: P_browns_w18_win
        },
        derived: {
          browns_go_0_2: P_browns_0_2,
          jets_go_0_2: P_jets_0_2
        }
      },
      teamProbabilities: {
        NYG: { probability: P_giants, name: 'New York Giants', currentWins: 2 },
        LV: { probability: P_raiders, name: 'Las Vegas Raiders', currentWins: 2 },
        CLE: { probability: P_browns, name: 'Cleveland Browns', currentWins: 3 },
        NYJ: { probability: P_jets, name: 'New York Jets', currentWins: 3 }
      },
      ownerProbabilities: ownerProbs,
      probabilityCheck: {
        total: totalProb,
        isValid: Math.abs(totalProb - 1) < 0.01
      },
      notes: [
        'Giants and Raiders play each other W17, so exactly one stays at 2 wins entering W18',
        'Tiebreaker order: Browns > Giants > Jets > Raiders',
        'Browns need to go 0-2 AND the 2-win team to win W18 to have a chance',
        'Jets only get #1 in a very specific scenario chain'
      ]
    }
  }

  const fetchLOTAData = useCallback(async () => {
    try {
      setDebugInfo({ status: 'fetching LOTA probabilities...' })
      
      // Use dedicated LOTA endpoint that only fetches the 4 teams we need
      const response = await fetch(`/api/lota-probabilities?season=${currentSeason}`)
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`)
      }
      
      const data = await response.json()
      console.log('LOTA data:', data)

      setDebugInfo({
        week17: data.week17,
        week18: data.week18,
        gamesFound: data.gamesFound
      })

      const calculatedData = calculateLOTAOdds(data.week17 || {}, data.week18 || {})
      setLotaData(calculatedData)
      setLastUpdate(new Date())
      setError(null)
    } catch (err) {
      console.error('LOTA fetch error:', err)
      setError(`${err.name}: ${err.message}`)
      setDebugInfo({ error: err.toString() })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLOTAData()
  }, [fetchLOTAData])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(fetchLOTAData, 60000) // Refresh every 60 seconds
    return () => clearInterval(interval)
  }, [autoRefresh, fetchLOTAData])

  const formatPercent = (prob) => {
    if (prob === undefined || prob === null) return '—'
    return `${(prob * 100).toFixed(1)}%`
  }

  const formatPercentLarge = (prob) => {
    if (prob === undefined || prob === null) return '—'
    const pct = prob * 100
    if (pct >= 10) return `${pct.toFixed(0)}%`
    if (pct >= 1) return `${pct.toFixed(1)}%`
    return `${pct.toFixed(2)}%`
  }

  // Format probability with lock indicator if game is finished
  const formatProbWithStatus = (prob, status) => {
    const pctStr = formatPercent(prob)
    if (status === null) return { text: pctStr, isLocked: false }
    return { 
      text: status === 1 ? '✅ WON' : status === 0 ? '❌ LOST' : '🟡 TIE',
      isLocked: true 
    }
  }

  // Sort teams by probability descending
  const sortedTeams = lotaData?.teamProbabilities 
    ? Object.entries(lotaData.teamProbabilities)
        .sort(([,a], [,b]) => b.probability - a.probability)
    : []

  // Sort owners by probability descending
  const sortedOwners = lotaData?.ownerProbabilities
    ? Object.entries(lotaData.ownerProbabilities)
        .sort(([,a], [,b]) => b.probability - a.probability)
    : []

  return (
    <>
      <Head>
        <title>LOTA Tracker | Luck of the Andrew</title>
        <meta name="description" content="#1 NFL Draft Pick Odds Tracker" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500 py-6 shadow-2xl">
          <div className="max-w-6xl mx-auto px-4">
            <div className="text-center">
              <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight">
                🍀 LOTA TRACKER 🍀
              </h1>
              <p className="text-lg md:text-xl text-slate-800 font-semibold mt-2">
                Luck of the Andrew — #1 Overall Pick Odds
              </p>
              <p className="text-sm text-slate-700 mt-1">
                Live probabilities based on Kalshi betting markets
              </p>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* Status Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-center mb-8 bg-slate-800/50 rounded-xl p-4 backdrop-blur">
            <div className="flex items-center space-x-4 mb-4 sm:mb-0">
              <button
                onClick={fetchLOTAData}
                disabled={loading}
                className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-bold px-4 py-2 rounded-lg shadow-lg transition-all disabled:opacity-50"
              >
                {loading ? '⏳ Loading...' : '🔄 Refresh'}
              </button>
              <label className="flex items-center space-x-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm">Auto-refresh (60s)</span>
              </label>
            </div>
            <div className="text-sm text-slate-400">
              {lastUpdate && (
                <span>Last updated: {lastUpdate.toLocaleTimeString()}</span>
              )}
              {lotaData?.probabilityCheck && (
                <span className={`ml-4 px-2 py-1 rounded text-xs ${
                  lotaData.probabilityCheck.isValid 
                    ? 'bg-green-900/50 text-green-300' 
                    : 'bg-red-900/50 text-red-300'
                }`}>
                  Σ = {formatPercent(lotaData.probabilityCheck.total)}
                </span>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-red-900/50 border border-red-500 text-red-200 rounded-xl p-4 mb-8">
              <strong>Error:</strong> {error}
              {debugInfo && (
                <pre className="mt-2 text-xs overflow-auto">
                  {JSON.stringify(debugInfo, null, 2)}
                </pre>
              )}
            </div>
          )}
          
          {debugInfo && !error && (
            <div className="bg-blue-900/50 border border-blue-500 text-blue-200 rounded-xl p-4 mb-8 text-xs">
              <strong>Debug:</strong> <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
            </div>
          )}

          {/* Owner Probabilities - Hero Section */}
          <div className="mb-10">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
              <span className="text-3xl mr-3">👑</span>
              Owner Odds for #1 Pick
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {sortedOwners.map(([name, data], index) => (
                <div
                  key={name}
                  className={`relative overflow-hidden rounded-2xl shadow-2xl transform transition-all hover:scale-105 ${
                    index === 0 ? 'ring-4 ring-yellow-400 ring-opacity-50' : ''
                  }`}
                >
                  <div className={`bg-gradient-to-br ${OWNER_COLORS[name] || 'from-gray-600 to-gray-800'} p-6`}>
                    {index === 0 && (
                      <div className="absolute top-2 right-2 text-4xl animate-bounce">👑</div>
                    )}
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-3xl font-black text-white">{name}</h3>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {data.teams.map(team => (
                            <img
                              key={team}
                              src={TEAM_LOGOS[team]}
                              alt={team}
                              className="w-8 h-8 bg-white rounded-full p-0.5"
                            />
                          ))}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-5xl font-black text-white drop-shadow-lg">
                          {formatPercentLarge(data.probability)}
                        </div>
                        <div className="text-sm text-white/70 mt-1">
                          chance at #1
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="h-2 bg-black/30">
                    <div 
                      className="h-full bg-gradient-to-r from-yellow-400 to-amber-500 transition-all duration-1000"
                      style={{ width: `${Math.min(data.probability * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Team Probabilities */}
          <div className="mb-10">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
              <span className="text-3xl mr-3">🏈</span>
              Team-by-Team Breakdown
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {sortedTeams.map(([abbr, data], index) => (
                <div
                  key={abbr}
                  className={`relative overflow-hidden rounded-2xl shadow-xl transition-all hover:shadow-2xl transform hover:-translate-y-1 ${
                    index === 0 ? 'ring-4 ring-yellow-400' : 'ring-1 ring-slate-600'
                  }`}
                >
                  <div className={`bg-gradient-to-br ${TEAM_COLORS[abbr]?.bg || 'from-gray-700 to-gray-900'} p-5`}>
                    {index === 0 && (
                      <div className="absolute top-2 right-2">
                        <span className="bg-yellow-400 text-yellow-900 text-xs font-black px-2 py-1 rounded-full">
                          FAVORITE
                        </span>
                      </div>
                    )}
                    <div className="flex items-center space-x-4">
                      <img
                        src={TEAM_LOGOS[abbr]}
                        alt={data.name}
                        className="w-20 h-20 bg-white rounded-xl p-2 shadow-lg"
                      />
                      <div>
                        <div className="text-lg font-bold text-white/90">{abbr}</div>
                        <div className="text-4xl font-black text-white">
                          {formatPercentLarge(data.probability)}
                        </div>
                        <div className="text-sm text-white/70">
                          {data.currentWins} wins
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="h-1.5 bg-black/40">
                    <div 
                      className="h-full bg-gradient-to-r from-yellow-300 to-amber-400 transition-all duration-1000"
                      style={{ width: `${Math.min(data.probability * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Input Probabilities - Collapsible Details */}
          <details className="mb-10 bg-slate-800/50 rounded-xl overflow-hidden">
            <summary className="p-4 cursor-pointer text-white font-bold hover:bg-slate-700/50 transition-colors">
              📊 Underlying Game Probabilities (Kalshi Data)
            </summary>
            <div className="p-6 border-t border-slate-700">
              {lotaData?.inputProbabilities && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Week 17 */}
                  <div>
                    <h3 className="text-lg font-bold text-amber-400 mb-4">Week 17</h3>
                    <div className="space-y-3">
                      {(() => {
                        const status = lotaData.gameStatuses?.week17?.raiders_vs_giants
                        const display = formatProbWithStatus(lotaData.inputProbabilities.week17.raiders_beat_giants, status)
                        return (
                          <div className={`flex justify-between items-center rounded-lg p-3 ${display.isLocked ? 'bg-slate-600/70 ring-2 ring-amber-500/50' : 'bg-slate-700/50'}`}>
                            <span className="text-slate-300">
                              <img src={TEAM_LOGOS.LV} alt="LV" className="w-6 h-6 inline mr-2 bg-white rounded-full" />
                              Raiders beat Giants
                              {display.isLocked && <span className="ml-2 text-xs text-amber-400">🔒 FINAL</span>}
                            </span>
                            <span className={`font-mono font-bold ${display.isLocked ? 'text-amber-300' : 'text-white'}`}>
                              {display.text}
                            </span>
                          </div>
                        )
                      })()}
                      {(() => {
                        const status = lotaData.gameStatuses?.week17?.jets_vs_patriots
                        const display = formatProbWithStatus(lotaData.inputProbabilities.week17.jets_beat_patriots, status)
                        return (
                          <div className={`flex justify-between items-center rounded-lg p-3 ${display.isLocked ? 'bg-slate-600/70 ring-2 ring-amber-500/50' : 'bg-slate-700/50'}`}>
                            <span className="text-slate-300">
                              <img src={TEAM_LOGOS.NYJ} alt="NYJ" className="w-6 h-6 inline mr-2 bg-white rounded-full" />
                              Jets beat Patriots
                              {display.isLocked && <span className="ml-2 text-xs text-amber-400">🔒 FINAL</span>}
                            </span>
                            <span className={`font-mono font-bold ${display.isLocked ? 'text-amber-300' : 'text-white'}`}>
                              {display.text}
                            </span>
                          </div>
                        )
                      })()}
                      {(() => {
                        const status = lotaData.gameStatuses?.week17?.browns_vs_steelers
                        const display = formatProbWithStatus(lotaData.inputProbabilities.week17.browns_beat_steelers, status)
                        return (
                          <div className={`flex justify-between items-center rounded-lg p-3 ${display.isLocked ? 'bg-slate-600/70 ring-2 ring-amber-500/50' : 'bg-slate-700/50'}`}>
                            <span className="text-slate-300">
                              <img src={TEAM_LOGOS.CLE} alt="CLE" className="w-6 h-6 inline mr-2 bg-white rounded-full" />
                              Browns beat Steelers
                              {display.isLocked && <span className="ml-2 text-xs text-amber-400">🔒 FINAL</span>}
                            </span>
                            <span className={`font-mono font-bold ${display.isLocked ? 'text-amber-300' : 'text-white'}`}>
                              {display.text}
                            </span>
                          </div>
                        )
                      })()}
                    </div>
                  </div>

                  {/* Week 18 */}
                  <div>
                    <h3 className="text-lg font-bold text-amber-400 mb-4">Week 18</h3>
                    <div className="space-y-3">
                      {(() => {
                        const status = lotaData.gameStatuses?.week18?.giants_vs_cowboys
                        const display = formatProbWithStatus(lotaData.inputProbabilities.week18.giants_beat_cowboys, status)
                        return (
                          <div className={`flex justify-between items-center rounded-lg p-3 ${display.isLocked ? 'bg-slate-600/70 ring-2 ring-amber-500/50' : 'bg-slate-700/50'}`}>
                            <span className="text-slate-300">
                              <img src={TEAM_LOGOS.NYG} alt="NYG" className="w-6 h-6 inline mr-2 bg-white rounded-full" />
                              Giants beat Cowboys
                              {display.isLocked && <span className="ml-2 text-xs text-amber-400">🔒 FINAL</span>}
                            </span>
                            <span className={`font-mono font-bold ${display.isLocked ? 'text-amber-300' : 'text-white'}`}>
                              {display.text}
                            </span>
                          </div>
                        )
                      })()}
                      {(() => {
                        const status = lotaData.gameStatuses?.week18?.raiders_vs_chiefs
                        const display = formatProbWithStatus(lotaData.inputProbabilities.week18.raiders_beat_chiefs, status)
                        return (
                          <div className={`flex justify-between items-center rounded-lg p-3 ${display.isLocked ? 'bg-slate-600/70 ring-2 ring-amber-500/50' : 'bg-slate-700/50'}`}>
                            <span className="text-slate-300">
                              <img src={TEAM_LOGOS.LV} alt="LV" className="w-6 h-6 inline mr-2 bg-white rounded-full" />
                              Raiders beat Chiefs
                              {display.isLocked && <span className="ml-2 text-xs text-amber-400">🔒 FINAL</span>}
                            </span>
                            <span className={`font-mono font-bold ${display.isLocked ? 'text-amber-300' : 'text-white'}`}>
                              {display.text}
                            </span>
                          </div>
                        )
                      })()}
                      {(() => {
                        const status = lotaData.gameStatuses?.week18?.jets_vs_bills
                        const display = formatProbWithStatus(lotaData.inputProbabilities.week18.jets_beat_bills, status)
                        return (
                          <div className={`flex justify-between items-center rounded-lg p-3 ${display.isLocked ? 'bg-slate-600/70 ring-2 ring-amber-500/50' : 'bg-slate-700/50'}`}>
                            <span className="text-slate-300">
                              <img src={TEAM_LOGOS.NYJ} alt="NYJ" className="w-6 h-6 inline mr-2 bg-white rounded-full" />
                              Jets beat Bills
                              {display.isLocked && <span className="ml-2 text-xs text-amber-400">🔒 FINAL</span>}
                            </span>
                            <span className={`font-mono font-bold ${display.isLocked ? 'text-amber-300' : 'text-white'}`}>
                              {display.text}
                            </span>
                          </div>
                        )
                      })()}
                      {(() => {
                        const status = lotaData.gameStatuses?.week18?.browns_vs_bengals
                        const display = formatProbWithStatus(lotaData.inputProbabilities.week18.browns_beat_bengals, status)
                        return (
                          <div className={`flex justify-between items-center rounded-lg p-3 ${display.isLocked ? 'bg-slate-600/70 ring-2 ring-amber-500/50' : 'bg-slate-700/50'}`}>
                            <span className="text-slate-300">
                              <img src={TEAM_LOGOS.CLE} alt="CLE" className="w-6 h-6 inline mr-2 bg-white rounded-full" />
                              Browns beat Bengals
                              {display.isLocked && <span className="ml-2 text-xs text-amber-400">🔒 FINAL</span>}
                            </span>
                            <span className={`font-mono font-bold ${display.isLocked ? 'text-amber-300' : 'text-white'}`}>
                              {display.text}
                            </span>
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                </div>
              )}

              {/* Derived Probabilities */}
              {lotaData?.inputProbabilities?.derived && (
                <div className="mt-6 pt-6 border-t border-slate-700">
                  <h3 className="text-lg font-bold text-amber-400 mb-4">Derived Scenarios</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex justify-between items-center bg-slate-700/50 rounded-lg p-3">
                      <span className="text-slate-300">Browns go 0-2</span>
                      <span className="font-mono font-bold text-white">
                        {formatPercent(lotaData.inputProbabilities.derived.browns_go_0_2)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-700/50 rounded-lg p-3">
                      <span className="text-slate-300">Jets go 0-2</span>
                      <span className="font-mono font-bold text-white">
                        {formatPercent(lotaData.inputProbabilities.derived.jets_go_0_2)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </details>

          {/* Scenario Explainer */}
          <div className="bg-slate-800/50 rounded-xl p-6 mb-10">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center">
              <span className="text-2xl mr-3">🧮</span>
              How the #1 Pick is Determined
            </h2>
            <div className="space-y-4 text-slate-300">
              <div className="bg-slate-700/50 rounded-lg p-4">
                <h3 className="font-bold text-amber-400 mb-2">Current Standings</h3>
                <p>Giants (2-13) • Raiders (2-13) • Jets (3-12) • Browns (3-12)</p>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-4">
                <h3 className="font-bold text-amber-400 mb-2">Tiebreaker Order</h3>
                <p>If teams finish with the same record: <strong>Browns → Giants → Jets → Raiders</strong></p>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-4">
                <h3 className="font-bold text-amber-400 mb-2">Key Week 17 Game</h3>
                <p>Giants @ Raiders — these two play each other! Exactly one team will stay at 2 wins entering Week 18.</p>
              </div>
              {lotaData?.notes && (
                <div className="bg-slate-700/50 rounded-lg p-4">
                  <h3 className="font-bold text-amber-400 mb-2">Scenario Notes</h3>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    {lotaData.notes.map((note, i) => (
                      <li key={i}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="text-center text-slate-500 text-sm pb-8">
            <p>LOTA Tracker • Payday Football League</p>
            <p className="mt-1">Probabilities sourced from Kalshi prediction markets</p>
            <a href="/" className="text-amber-400 hover:text-amber-300 mt-2 inline-block">
              ← Back to Payday Dashboard
            </a>
          </div>
        </div>
      </div>
    </>
  )
}
