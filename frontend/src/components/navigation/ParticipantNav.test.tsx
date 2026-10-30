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

  it('renders brand and Profile link, and removes intermediate game links from navbar', () => {
    render(
      <MemoryRouter initialEntries={['/participant/lobby']}>
        <ParticipantNav user={mockUser} onLogout={vi.fn()} />
      </MemoryRouter>
    );

    // Brand
    expect(screen.getByRole('link', { name: /Tech Tambola home page/i })).toBeInTheDocument();

    // Profile link
    expect(screen.getByRole('link', { name: /profile/i })).toHaveAttribute(
      'href',
      '/participant/profile'
    );

    // The 6 removed links must not be present
    expect(screen.queryByRole('link', { name: 'Lobby' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'My Ticket' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Live Game' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'My Claims' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Results' })).toBeNull();
    expect(screen.queryByRole('link', { name: /Live Board/i })).toBeNull();
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
