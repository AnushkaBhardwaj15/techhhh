import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ParticipantNav } from './ParticipantNav';
import type { AuthenticatedUser } from '../../types/auth';

const mockUser: AuthenticatedUser = {
  id: 'p1',
  email: 'player@example.test',
  name: 'Sam Altman',
  role: 'PARTICIPANT',
  status: 'ACTIVE',
};

describe('ParticipantNav', () => {
  afterEach(cleanup);

  it('renders navigation links to all key participant routes', () => {
    render(
      <MemoryRouter initialEntries={['/participant/lobby']}>
        <ParticipantNav user={mockUser} onLogout={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Lobby' })).toHaveAttribute(
      'href',
      '/participant/lobby'
    );
    expect(screen.getByRole('link', { name: 'My Ticket' })).toHaveAttribute(
      'href',
      '/participant/ticket'
    );
    expect(screen.getByRole('link', { name: 'Live Game' })).toHaveAttribute(
      'href',
      '/participant/game'
    );
    expect(screen.getByRole('link', { name: 'My Claims' })).toHaveAttribute(
      'href',
      '/participant/claims'
    );
    expect(screen.getByRole('link', { name: 'Results' })).toHaveAttribute(
      'href',
      '/participant/results'
    );
    expect(screen.getByRole('link', { name: /Live Board/i })).toHaveAttribute('href', '/live');
  });

  it('displays user first name and participant role indicator', () => {
    render(
      <MemoryRouter>
        <ParticipantNav user={mockUser} onLogout={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.getByText('Sam')).toBeInTheDocument();
    expect(screen.getByText('PARTICIPANT')).toBeInTheDocument();
  });

  it('triggers onLogout callback when the sign out button is pressed', async () => {
    const onLogout = vi.fn();
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ParticipantNav user={mockUser} onLogout={onLogout} />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it('shows busy state when logging out is pending', () => {
    render(
      <MemoryRouter>
        <ParticipantNav user={mockUser} onLogout={vi.fn()} isLoggingOut={true} />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: 'Signing out…' })).toBeDisabled();
  });
});
