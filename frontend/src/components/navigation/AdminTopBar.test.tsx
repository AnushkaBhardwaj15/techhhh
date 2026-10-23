import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdminTopBar } from './AdminTopBar';
import type { AuthenticatedUser } from '../../types/auth';

const adminUser: AuthenticatedUser = {
  id: 'a1',
  email: 'admin@example.test',
  name: 'Taylor Swift',
  role: 'ADMIN',
  status: 'ACTIVE',
};

describe('AdminTopBar', () => {
  afterEach(cleanup);

  it('renders admin branding, live links, and ADMIN role badge', () => {
    render(
      <MemoryRouter>
        <AdminTopBar user={adminUser} onLogout={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /Admin operations dashboard/i })).toHaveAttribute(
      'href',
      '/admin'
    );
    expect(screen.getByText('ADMIN')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Live Projector/i })).toHaveAttribute('href', '/live');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('triggers onLogout callback when sign out button is pressed', async () => {
    const onLogout = vi.fn();
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <AdminTopBar user={adminUser} onLogout={onLogout} />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onLogout).toHaveBeenCalledOnce();
  });
});
