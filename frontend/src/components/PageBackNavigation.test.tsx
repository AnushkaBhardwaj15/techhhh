import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it } from 'vitest';
import { PageBackNavigation } from './PageBackNavigation';
import type { AuthenticatedUser } from '../types/auth';

afterEach(cleanup);
it.each([
  ['PARTICIPANT', '/participant/game', '/lobby', 'Back to lobby'],
  ['PARTICIPANT', '/play', '/lobby', 'Back to lobby'],
  ['PARTICIPANT', '/participant/ticket', '/lobby', 'Back to lobby'],
  ['PARTICIPANT', '/participant/ticket-entry', '/lobby', 'Back to lobby'],
] as const)('provides a safe destination for %s on %s', (role, path, target, label) => {
  render(<MemoryRouter initialEntries={[path]}><PageBackNavigation role={role} /></MemoryRouter>);
  expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', target);
});
it.each([
  ['PARTICIPANT', '/lobby'], ['PARTICIPANT', '/participant/lobby'],
  ['ADMIN', '/admin'], ['SUPER_ADMIN', '/admin'],
] as const)('does not show a home back button for %s on %s', (role, path) => {
  render(<MemoryRouter initialEntries={[path]}><PageBackNavigation role={role} /></MemoryRouter>);
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
it.each(['ADMIN', 'SUPER_ADMIN'] as AuthenticatedUser['role'][])('keeps the existing nested admin back link for %s', role => {
  render(<MemoryRouter initialEntries={['/admin/participants']}><PageBackNavigation role={role} /></MemoryRouter>);
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
});
