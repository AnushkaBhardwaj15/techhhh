import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotFoundPage } from './NotFoundPage';
import { ForbiddenPage } from './ForbiddenPage';

describe('Custom Error Pages', () => {
  afterEach(cleanup);
  it('renders NotFoundPage with 404 badge, requested path, and navigation actions', () => {
    render(
      <MemoryRouter initialEntries={['/unknown-path-xyz']}>
        <NotFoundPage />
      </MemoryRouter>
    );

    expect(screen.getByText('404 // NOT_FOUND')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Page Not Found' })).toBeInTheDocument();
    expect(screen.getByText('/unknown-path-xyz')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Go to Game Lobby' })).toHaveAttribute('href', '/participant/lobby');
    expect(screen.getByRole('link', { name: 'Host Portal' })).toHaveAttribute('href', '/admin');
  });

  it('renders ForbiddenPage with 403 badge, reason, and recovery actions', () => {
    render(
      <MemoryRouter initialEntries={['/admin/system']}>
        <ForbiddenPage reason="Only Super Admins can access system health." />
      </MemoryRouter>
    );

    expect(screen.getByText('403 // FORBIDDEN')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Access Restricted' })).toBeInTheDocument();
    expect(screen.getByText('Only Super Admins can access system health.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Participant Lobby' })).toHaveAttribute('href', '/participant/lobby');
    expect(screen.getByRole('link', { name: 'Switch Account' })).toHaveAttribute('href', '/login');
  });
});
