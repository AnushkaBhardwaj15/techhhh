import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, afterEach } from 'vitest';
import { DevelopersPage } from './DevelopersPage';

describe('DevelopersPage', () => {
  afterEach(cleanup);

  function renderWithRouter() {
    return render(
      <MemoryRouter>
        <DevelopersPage />
      </MemoryRouter>
    );
  }

  it('renders the header, brand title, and main page headline', () => {
    renderWithRouter();

    expect(screen.getAllByText(/MEET THE DEVELOPER/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { level: 1, name: /Meet the Developers/i })).toBeInTheDocument();
    expect(screen.getAllByText(/TECH TOMBOLA/i).length).toBeGreaterThan(0);
  });

  it('renders all four team members with their exact assigned roles', () => {
    renderWithRouter();

    // Verify Saransh - Tech Head
    expect(screen.getByRole('heading', { level: 2, name: /Saransh Sharma/i })).toBeInTheDocument();
    expect(screen.getByText(/Tech Head/i)).toBeInTheDocument();

    // Verify Abhi - Tech Executive
    expect(screen.getByRole('heading', { level: 2, name: /Abhi/i })).toBeInTheDocument();

    // Verify Anushka - Tech Executive
    expect(screen.getByRole('heading', { level: 2, name: /Anushka Bhardwaj/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Tech Executive/i).length).toBe(2);

    // Verify Ashutosh Singh - Techno Ambassador
    expect(screen.getByRole('heading', { level: 2, name: /Ashutosh Singh/i })).toBeInTheDocument();
    expect(screen.getByText(/Techno Ambassador/i)).toBeInTheDocument();
  });

  it('renders profile photos for all team members', () => {
    renderWithRouter();

    const images = screen.getAllByRole('img');
    const srcs = images.map((img) => img.getAttribute('src'));

    expect(srcs.some((src) => src?.includes('saransh.jpg'))).toBe(true);
    expect(srcs.some((src) => src?.includes('abhi.jpg'))).toBe(true);
    expect(srcs.some((src) => src?.includes('anushka.jpg'))).toBe(true);
    expect(srcs.some((src) => src?.includes('ashutosh.jpg'))).toBe(true);
  });

  it('renders developer biographies and skills', () => {
    renderWithRouter();

    // Check specific focus areas/skills
    expect(screen.getAllByText(/System Architecture/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/WebSocket Streams/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/React 19 & Vite/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Tournament Operations/i).length).toBeGreaterThan(0);
  });

  it('renders working GitHub links for members who have one', () => {
    renderWithRouter();

    const githubLinks = screen.getAllByRole('link', { name: /github/i });
    expect(githubLinks.length).toBeGreaterThanOrEqual(4);

    const saranshLink = githubLinks.find((link) =>
      link.getAttribute('href')?.includes('saransh-sh')
    );
    expect(saranshLink).toBeDefined();
    expect(saranshLink).toHaveAttribute('target', '_blank');
  });

  it('provides navigation links back to the home page', () => {
    renderWithRouter();

    const homeLinks = screen.getAllByRole('link', { name: /home/i });
    expect(homeLinks.length).toBeGreaterThan(0);
    expect(homeLinks.some((link) => link.getAttribute('href') === '/')).toBe(true);
  });

  it('renders the project technology stack section', () => {
    renderWithRouter();

    expect(screen.getByRole('heading', { level: 2, name: /The Technology Stack/i })).toBeInTheDocument();
    expect(screen.getByText(/Bun \+ Fastify/i)).toBeInTheDocument();
    expect(screen.getByText(/PostgreSQL/i)).toBeInTheDocument();
  });
});
