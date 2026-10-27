import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { listPlayRounds } from '../../lib/api/play';

export function AdminGameSelector() {
  const [params, setParams] = useSearchParams();
  const games = useQuery({ queryKey: ['play-rounds'], queryFn: ({ signal }) => listPlayRounds(signal) });
  const selected = params.get('gameId') ?? '';
  useEffect(() => {
    if (!selected && games.data?.games[0]) setParams((current) => { const next = new URLSearchParams(current); next.set('gameId', games.data.games[0].id); return next; }, { replace: true });
  }, [selected, games.data, setParams]);
  return <section aria-label="Selected game" style={{ marginBottom: 24 }}>
    <label>Game <select value={selected} disabled={games.isPending} onChange={(event) => setParams((current) => {
      const next = new URLSearchParams(current); next.set('gameId', event.target.value); next.delete('claimId'); next.delete('claimPage'); next.delete('winnerPage'); return next;
    })}><option value="">Choose a game</option>{games.data?.games.map((game) => <option key={game.id} value={game.id}>{game.name} · {game.code}</option>)}</select></label>
    {games.error && <p role="alert">Could not load games.</p>}
    {games.data?.games.length === 0 && <p>Create a game first.</p>}
  </section>;
}
