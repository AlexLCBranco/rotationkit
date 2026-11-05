/** Games (one game, whole) | Q4 (same game, 4th quarter + OT) | Averages. */
export function Tabs({
  active,
  onGames,
  onQ4,
  onAverages,
}: {
  active: 'games' | 'q4' | 'averages';
  onGames: () => void;
  onQ4: () => void;
  onAverages: () => void;
}) {
  const tab = (id: typeof active, label: string, on: () => void) => (
    <button aria-current={active === id ? 'page' : undefined} onClick={on} data-testid={`tab-${id}`}>
      {label}
    </button>
  );
  return (
    <nav className="tabs" aria-label="View">
      {tab('games', 'Games', onGames)}
      {tab('q4', 'Q4', onQ4)}
      {tab('averages', 'Averages', onAverages)}
    </nav>
  );
}
