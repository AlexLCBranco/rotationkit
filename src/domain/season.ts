// NBA game IDs encode the season: 002YY##### → regular season starting in 20YY.

export function seasonOf(gameId: string): string {
  const yy = Number(gameId.slice(3, 5));
  return `20${String(yy).padStart(2, '0')}-${String((yy + 1) % 100).padStart(2, '0')}`;
}
