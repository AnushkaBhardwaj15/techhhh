import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { GameStatusPanel } from './GameStatusPanel';

afterEach(cleanup);
it.each([
  ['READY', 'You’re in the lobby—waiting for other players'],
  ['ACTIVE', 'Game is live—mark matching keys'],
  ['PAUSED', 'The host paused play—your progress is saved'],
  ['COMPLETED', 'Game ended—your ticket and points are saved'],
  ['RECOVERY_REQUIRED', 'The host is checking an issue—your progress is safe'],
] as const)('shows %s in one compact sentence', (status, sentence) => {
  const notify = vi.fn();
  render(<GameStatusPanel gameId="game" status={status} onNotify={notify} />);
  const panel = screen.getByRole('region', { name: 'Game status' });
  expect(panel).toHaveTextContent(sentence);
  expect(panel.querySelectorAll('p')).toHaveLength(1);
  expect(screen.queryByText('What to do now')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  expect(notify).toHaveBeenCalledTimes(1);
});

it('announces each transition once and distinguishes resuming from starting', () => {
  const notify = vi.fn();
  const view = render(<GameStatusPanel gameId="game" status="READY" onNotify={notify} />);
  view.rerender(<GameStatusPanel gameId="game" status="READY" onNotify={notify} />);
  expect(notify).toHaveBeenCalledTimes(1);
  view.rerender(<GameStatusPanel gameId="game" status="ACTIVE" onNotify={notify} />);
  expect(notify).toHaveBeenCalledTimes(2);
  view.rerender(<GameStatusPanel gameId="game" status="PAUSED" onNotify={notify} />);
  view.rerender(<GameStatusPanel gameId="game" status="ACTIVE" onNotify={notify} />);
  expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Game resumed', tone: 'success' }));
  view.rerender(<GameStatusPanel gameId="game" status="COMPLETED" onNotify={notify} />);
  expect(notify).toHaveBeenCalledTimes(5);
  view.rerender(<GameStatusPanel gameId="different-game" status="READY" onNotify={notify} />);
  expect(notify).toHaveBeenCalledTimes(6);
});
