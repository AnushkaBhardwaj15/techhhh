import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { LandingPage } from './LandingPage';
import { ApiError } from '../../lib/api/client';
import * as authApi from '../../lib/api/auth';

vi.mock('../../lib/api/auth', () => ({ getMe: vi.fn() }));

function renderLanding() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('LandingPage', () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the hero section with the core Tech Tombola message', async () => {
    vi.mocked(authApi.getMe).mockRejectedValue(new ApiError(401, 'Authentication required'));
    renderLanding();

    expect(
      screen.getByRole('heading', { name: /Listen for the clue\..*Spot the key\..*Claim the win\./i })
    ).toBeInTheDocument();
    expect(screen.getByText(/Tech Tombola is/i)).toBeInTheDocument();
    expect(screen.getByText(/not a quiz/i)).toBeInTheDocument();
  });

  it('provides navigation links and CTA for an unauthenticated visitor', async () => {
    vi.mocked(authApi.getMe).mockRejectedValue(new ApiError(401, 'Authentication required'));
    renderLanding();

    const signIns = screen.getAllByRole('link', { name: /sign in/i });
    expect(signIns.length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /How to Play/i })).toHaveAttribute('href', '#how-it-works');
    expect(screen.getByRole('link', { name: /Interactive Card/i })).toHaveAttribute('href', '#sample-ticket');
    expect(screen.getByRole('link', { name: /Winning Patterns/i })).toHaveAttribute('href', '#patterns');
    expect(screen.getAllByRole('link', { name: /Live Board/i }).length).toBeGreaterThan(0);
  });

  it('adapts CTAs for an authenticated participant', async () => {
    vi.mocked(authApi.getMe).mockResolvedValue({
      id: 'p1',
      email: 'alex@example.test',
      name: 'Alex Rivera',
      role: 'PARTICIPANT',
      status: 'ACTIVE',
    });
    renderLanding();

    const lobbyLinks = await screen.findAllByRole('link', { name: /ENTER LOBBY/i });
    expect(lobbyLinks.length).toBeGreaterThanOrEqual(1);
    expect(lobbyLinks[0]).toHaveAttribute('href', '/lobby');
  });

  it('adapts CTAs for an authenticated admin', async () => {
    vi.mocked(authApi.getMe).mockResolvedValue({
      id: 'a1',
      email: 'admin@example.test',
      name: 'Admin User',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    renderLanding();

    const dashboardLinks = await screen.findAllByRole('link', { name: /ENTER DASHBOARD/i });
    expect(dashboardLinks.length).toBeGreaterThanOrEqual(1);
    expect(dashboardLinks[0]).toHaveAttribute('href', '/admin');
  });

  it('displays the 5 winning pattern configurations and their explanations', async () => {
    vi.mocked(authApi.getMe).mockRejectedValue(new ApiError(401, 'Authentication required'));
    renderLanding();

    expect(screen.getByRole('heading', { name: 'Early 5' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Top Line' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Middle Line' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bottom Line' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Full House' })).toBeInTheDocument();
  });
});
