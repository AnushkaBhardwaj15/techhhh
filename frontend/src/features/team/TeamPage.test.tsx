import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TeamPage } from './TeamPage';
import { TEAM_MEMBERS } from './teamData';

describe('TeamPage', () => {
  afterEach(cleanup);

  it('renders a card for every team member with name and role', () => {
    render(
      <MemoryRouter initialEntries={['/team']}>
        <TeamPage />
      </MemoryRouter>
    );

    for (const member of TEAM_MEMBERS) {
      expect(screen.getByRole('heading', { level: 3, name: member.name })).toBeInTheDocument();
      expect(screen.getByText(member.role)).toBeInTheDocument();
    }
  });

  it('renders the hero headline and subtitle', () => {
    render(
      <MemoryRouter>
        <TeamPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Meet the Developers.');
    expect(screen.getByText(/engineers who designed/i)).toBeInTheDocument();
  });

  it('renders GitHub links for members who have them', () => {
    render(
      <MemoryRouter>
        <TeamPage />
      </MemoryRouter>
    );

    const membersWithGithub = TEAM_MEMBERS.filter((m) => m.github.length > 0);
    for (const member of membersWithGithub) {
      const link = screen.getByLabelText(`${member.name} on GitHub`);
      expect(link).toHaveAttribute('href', member.github);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noreferrer');
    }
  });

  it('renders navigation links pointing to /', () => {
    render(
      <MemoryRouter>
        <TeamPage />
      </MemoryRouter>
    );

    const homeLinks = screen.getAllByRole('link', { name: /home/i });
    expect(homeLinks.length).toBeGreaterThanOrEqual(1);
    for (const link of homeLinks) {
      expect(link).toHaveAttribute('href', '/');
    }
  });

  it('renders tech stack badges in the tribute section', () => {
    render(
      <MemoryRouter>
        <TeamPage />
      </MemoryRouter>
    );

    const expectedBadges = ['BUN', 'TYPESCRIPT', 'REACT', 'VITE', 'FASTIFY', 'POSTGRESQL', 'WEBSOCKET'];
    for (const badge of expectedBadges) {
      expect(screen.getByText(badge)).toBeInTheDocument();
    }
  });

  it('renders avatar initials when no photo URL is provided', () => {
    render(
      <MemoryRouter>
        <TeamPage />
      </MemoryRouter>
    );

    const membersWithoutPhoto = TEAM_MEMBERS.filter((m) => m.photoUrl.length === 0);
    for (const member of membersWithoutPhoto) {
      const initials = member.name
        .split(' ')
        .map((p) => p[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
      expect(screen.getByText(initials)).toBeInTheDocument();
    }
  });

  it('renders the banner and footer navigation', () => {
    render(
      <MemoryRouter>
        <TeamPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign In' })).toHaveAttribute('href', '/login');
  });
});
