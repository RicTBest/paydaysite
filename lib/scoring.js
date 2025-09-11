import { supabase } from './supabase'

export async function calculateWeeklyScores(season, week) {
  // Get all games for the week
  const { data: games } = await supabase
    .from('games')
    .select('*')
    .eq('season', season)
    .eq('week', week)
    .eq('final', true)

  if (!games || games.length === 0) return

  // Clear existing awards for this week
  await supabase
    .from('awards')
    .delete()
    .eq('season', season)
    .eq('week', week)

  const awards = []

  // Process each game for wins/ties
  for (const game of games) {
    const { home, away, home_pts, away_pts } = game
    
    if (home_pts > away_pts) {
      // Home team wins
      awards.push({
        season,
        week,
        type: 'WIN',
        team_abbr: home,
        points: 5
      })
    } else if (away_pts > home_pts) {
      // Away team wins
      awards.push({
        season,
        week,
        type: 'WIN',
        team_abbr: away,
        points: 5
      })
    } else {
      // Tie - away team gets points
      awards.push({
        season,
        week,
        type: 'TIE_AWAY',
        team_abbr: away,
        points: 5
      })
    }
  }

  // Find highest scoring team
  const highestScore = Math.max(...games.flatMap(g => [g.home_pts, g.away_pts]))
  const highestScoreTeams = []
  
  games.forEach(game => {
    if (game.home_pts === highestScore) highestScoreTeams.push({ team: game.home, margin: game.home_pts - game.away_pts })
    if (game.away_pts === highestScore) highestScoreTeams.push({ team: game.away, margin: game.away_pts - game.home_pts })
  })

  if (highestScoreTeams.length === 1) {
    awards.push({
      season,
      week,
      type: 'OBO',
      team_abbr: highestScoreTeams[0].team,
      points: 5
    })
  } else {
    // Tiebreaker by margin of victory
    const winner = highestScoreTeams.reduce((max, team) => 
      team.margin > max.margin ? team : max
    )
    awards.push({
      season,
      week,
      type: 'OBO',
      team_abbr: winner.team,
      points: 5
    })
  }

  // Find lowest opponent score (DBO)
  const lowestOppScore = Math.min(...games.flatMap(g => [g.home_pts, g.away_pts]))
  const lowestOppTeams = []
  
  games.forEach(game => {
    if (game.away_pts === lowestOppScore) lowestOppTeams.push({ team: game.home, margin: game.home_pts - game.away_pts })
    if (game.home_pts === lowestOppScore) lowestOppTeams.push({ team: game.away, margin: game.away_pts - game.home_pts })
  })

  if (lowestOppTeams.length === 1) {
    awards.push({
      season,
      week,
      type: 'DBO',
      team_abbr: lowestOppTeams[0].team,
      points: 5
    })
  } else {
    // Tiebreaker by margin of victory
    const winner = lowestOppTeams.reduce((max, team) => 
      team.margin > max.margin ? team : max
    )
    awards.push({
      season,
      week,
      type: 'DBO',
      team_abbr: winner.team,
      points: 5
    })
  }

  // Insert awards with owner_id lookup
  for (const award of awards) {
    const { data: team } = await supabase
      .from('teams')
      .select('owner_id')
      .eq('abbr', award.team_abbr)
      .single()

    if (team) {
      await supabase
        .from('awards')
        .insert({
          ...award,
          owner_id: team.owner_id
        })
    }
  }
}

export async function getLeaderboard(season) {
  const { data } = await supabase
    .from('awards')
    .select(`
      *,
      teams!inner(owner_id, owners!inner(name))
    `)
    .eq('season', season)

  if (!data) return []

  // Group by owner
  const ownerStats = {}
  
  data.forEach(award => {
    const ownerId = award.teams.owner_id
    const ownerName = award.teams.owners.name
    
    if (!ownerStats[ownerId]) {
      ownerStats[ownerId] = {
        name: ownerName,
        totalEarnings: 0,
        wins: 0,
        obo: 0,
        dbo: 0,
        eoy: 0,
        teams: new Set()
      }
    }
    
    ownerStats[ownerId].totalEarnings += award.points * 5 // $5 per point
    ownerStats[ownerId].teams.add(award.team_abbr)
    
    switch (award.type) {
      case 'WIN':
      case 'TIE_AWAY':
        ownerStats[ownerId].wins += 1
        break
      case 'OBO':
        ownerStats[ownerId].obo += 1
        break
      case 'DBO':
        ownerStats[ownerId].dbo += 1
        break
      case 'COACH_FIRED':
        ownerStats[ownerId].eoy += 1
        break
    }
  })

  return Object.values(ownerStats)
    .sort((a, b) => b.totalEarnings - a.totalEarnings)
}