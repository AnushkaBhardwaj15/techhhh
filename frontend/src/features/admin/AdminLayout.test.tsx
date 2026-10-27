import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import type { AuthenticatedUser } from '../../types/auth';
import { AdminLayout } from './AdminLayout';

const user: AuthenticatedUser = {
  id: 'admin-1',
  email: 'admin@example.test',
  name: 'Admin User',
  role: 'SUPER_ADMIN',
  status: 'ACTIVE',
};

function UserContext() {
  return <Outlet context={user} />;
}

describe('AdminLayout contextual back navigation', () => {
  afterEach(cleanup);

  it('returns Questions to Event management and preserves the selected Event', () => {
    render(
      <MemoryRouter initialEntries={['/admin/questions?eventId=event-42']}>
        <Routes>
          <Route element={<UserContext />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route path="questions" element={<h1>Questions &amp; Keys</h1>} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Questions & Keys' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Participants' })).toHaveAttribute(
      'href', '/admin/participants?eventId=event-42',
    );
    expect(screen.getByRole('link', { name: 'Back to event management' })).toHaveAttribute(
      'href',
      '/admin/event?eventId=event-42',
    );
  });
});
