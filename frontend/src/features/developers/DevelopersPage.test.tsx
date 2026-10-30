import { render, screen, cleanup, within } from '@testing-library/react';
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
    expect(within(screen.getByRole('banner')).getByText('TECH TAMBOLA')).toBeVisible();
    expect(screen.getByTestId('developers-container')).not.toHaveTextContent(/tombola/i);
  });

  it('renders all four team members with their exact names and roles', () => {
    renderWithRouter();

    // Verify Saransh - Tech Head
    expect(screen.getByRole('heading', { level: 2, name: /Saransh Sharma/i })).toBeInTheDocument();
    expect(screen.getByText(/Tech Head/i)).toBeInTheDocument();

    // Verify Abhi Dubey - Tech Executive
    expect(screen.getByRole('heading', { level: 2, name: /Abhi Dubey/i })).toBeInTheDocument();

    // Verify Anushka Bhardwaj - Tech Executive
    expect(screen.getByRole('heading', { level: 2, name: /Anushka Bhardwaj/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Tech Executive/i).length).toBe(2);

    // Verify Ashutosh Singh - Techno Ambassador
    expect(screen.getByRole('heading', { level: 2, name: /Ashutosh Singh/i })).toBeInTheDocument();
    expect(screen.getByText(/Techno Ambassador/i)).toBeInTheDocument();
  });

  it('renders correctly swapped photos for all team members per specification', () => {
    renderWithRouter();

    // Saransh Sharma -> anushka.jpg
    const saranshImg = screen.getByRole('img', { name: /Saransh Sharma/i });
    expect(saranshImg.getAttribute('src')).toContain('anushka.jpg');

    // Abhi Dubey -> ashutosh.jpg
    const abhiImg = screen.getByRole('img', { name: /Abhi Dubey/i });
    expect(abhiImg.getAttribute('src')).toContain('ashutosh.jpg');

    // Anushka Bhardwaj -> abhi.jpg
    const anushkaImg = screen.getByRole('img', { name: /Anushka Bhardwaj/i });
    expect(anushkaImg.getAttribute('src')).toContain('abhi.jpg');

    // Ashutosh Singh -> saransh.jpg
    const ashutoshImg = screen.getByRole('img', { name: /Ashutosh Singh/i });
    expect(ashutoshImg.getAttribute('src')).toContain('saransh.jpg');
  });

  it('renders working GitHub links for each team member', () => {
    renderWithRouter();

    const githubLinks = screen.getAllByRole('link', { name: /github/i });
    expect(githubLinks.length).toBe(4);

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
});
