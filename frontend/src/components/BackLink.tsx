import { Link, useLocation } from 'react-router-dom';

export function BackLink({ fallback = '/', label = 'Back' }: { fallback?: string; label?: string }) {
  const location = useLocation();
  const gameId = new URLSearchParams(location.search).get('gameId');
  const target = gameId && ['/admin/claims', '/admin/winners'].includes(location.pathname)
    ? `/game?gameId=${encodeURIComponent(gameId)}` : fallback;
  return <nav className="page-back-nav" aria-label="Back navigation"><Link className="page-back-link" to={target}><span aria-hidden="true">← </span>{label}</Link></nav>;
}
