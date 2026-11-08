export function calculatePoints(winnerId, homeId, awayId, winPoints = 3, lossPoints = 0) {
  if (![homeId, awayId].includes(winnerId) || homeId === awayId) throw new Error('Invalid winner or opponents');
  return {
    home: winnerId === homeId ? winPoints : lossPoints,
    away: winnerId === awayId ? winPoints : lossPoints
  };
}
export function calculateStandings(teams, matches, winPoints = 3, lossPoints = 0) {
  const rows = new Map(teams.map(t => [t.id, { id:t.id, name:t.name, played:0, wins:0, losses:0, points:0 }]));
  for (const m of matches) {
    if (m.status !== 'confirmed') continue;
    const home = rows.get(m.home_team_id), away = rows.get(m.away_team_id);
    if (!home || !away) continue;
    const awarded = calculatePoints(m.winner_team_id, m.home_team_id, m.away_team_id, winPoints, lossPoints);
    home.played++; away.played++;
    home.points += awarded.home; away.points += awarded.away;
    if (m.winner_team_id === home.id) { home.wins++; away.losses++; }
    else { away.wins++; home.losses++; }
  }
  return [...rows.values()].sort((a,b)=>b.points-a.points || b.wins-a.wins || a.losses-b.losses || a.name.localeCompare(b.name));
}
