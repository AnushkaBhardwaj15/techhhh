import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NotificationHost } from './NotificationHost';
import { mutationFailed, mutationSucceeded, notify } from '../lib/notifications';

afterEach(cleanup);
it('shows contextual success and error notifications and lets the user dismiss them', () => {
  render(<NotificationHost />);
  act(() => mutationSucceeded('/admin/participants', 'POST'));
  expect(screen.getByRole('status')).toHaveTextContent('Player added');
  act(() => mutationFailed('/admin/participants', 'POST', 409, 'That email is already registered.'));
  expect(screen.getByRole('alert')).toHaveTextContent('That email is already registered.');
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('keeps background refreshes, ordinary marks and custom game claim feedback quiet', () => {
  render(<NotificationHost />);
  act(() => {
    mutationSucceeded('/participant/ticket', 'GET');
    mutationFailed('/participant/ticket', 'GET', 500);
    mutationSucceeded('/participant/play/rounds/one/marks', 'PUT');
    mutationSucceeded('/participant/play/join', 'POST');
    mutationSucceeded('/participant/play/rounds/one/claims', 'POST');
    mutationFailed('/participant/play/rounds/one/claims', 'POST', 422);
  });
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('reports partial imports without incorrectly declaring success', () => {
  render(<NotificationHost />);
  act(() => mutationSucceeded('/admin/participants/import', 'POST', { createdCount: 8, skippedCount: 1, failedCount: 1 }));
  expect(screen.getByRole('status')).toHaveTextContent('8 players added, 1 skipped, 1 failed');
});
it('keeps errors visible until dismissed', () => {
  vi.useFakeTimers();
  try {
    render(<NotificationHost />);
    act(() => notify({ message: 'Check your connection.', tone: 'error' }));
    act(() => vi.advanceTimersByTime(60000));
    expect(screen.getByRole('alert')).toHaveTextContent('Check your connection.');
  } finally { vi.useRealTimers(); }
});
