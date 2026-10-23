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

const superAdminUser: AuthenticatedUser = {
  id: 'sa1',
  email: 'super@example.test',
  name: 'Ada Lovelace',
  role: 'SUPER_ADMIN',
  status: 'ACTIVE',
};

describe('AdminTopBar', () => {
  afterEach(cleanup);

  it('renders admin branding, live links, and user info for ADMIN', () => {
    render(
      <MemoryRouter>
        <AdminTopBar user={adminUser} onLogout={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /Admin operations dashboard/i })).toHaveAttribute(
      'href',
      '/admin'
    );
    expect(screen.getByText('ADMIN OPS')).toBeInTheDocument();
    expect(screen.getByText('Taylor Swift')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Live Projector/i })).toHaveAttribute('href', '/live');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('renders SUPER ADMIN badge when role is SUPER_ADMIN', () => {
    render(
      <MemoryRouter>
        <AdminTopBar user={superAdminUser} onLogout={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.getByText('SUPER ADMIN')).toBeInTheDocument();
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
