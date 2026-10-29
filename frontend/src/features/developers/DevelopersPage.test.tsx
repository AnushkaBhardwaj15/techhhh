import { render, screen, fireEvent, cleanup } from '@testing-library/react';
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

  it('renders the broadcast header, live on-air badge, and headline', () => {
    renderWithRouter();

    expect(screen.getByText(/LIVE BROADCAST/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: /MEET THE DEVELOPERS/i })).toBeInTheDocument();
  });

  it('renders all four team members with their exact assigned roles', () => {
    renderWithRouter();

    // Verify Saransh - Tech Head
    expect(screen.getAllByText(/Saransh/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Tech Head/i).length).toBeGreaterThan(0);

    // Verify Abhi - Tech Executive
    expect(screen.getAllByText(/Abhi/i).length).toBeGreaterThan(0);

    // Verify Anushka - Tech Executive
    expect(screen.getAllByText(/Anushka/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Tech Executive/i).length).toBeGreaterThanOrEqual(2);

    // Verify Ashutosh Singh - Techno Ambassador
    expect(screen.getAllByText(/Ashutosh Singh/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Techno Ambassador/i).length).toBeGreaterThan(0);
  });

  it('renders photos for all team members', () => {
    renderWithRouter();

    const images = screen.getAllByRole('img');
    const srcs = images.map((img) => img.getAttribute('src'));

    expect(srcs.some((src) => src?.includes('saransh.jpg'))).toBe(true);
    expect(srcs.some((src) => src?.includes('abhi.jpg'))).toBe(true);
    expect(srcs.some((src) => src?.includes('anushka.jpg'))).toBe(true);
    expect(srcs.some((src) => src?.includes('ashutosh.jpg'))).toBe(true);
  });

  it('allows switching the spotlight developer via channel selector', () => {
    renderWithRouter();

    // Find channel tab for Abhi
    const abhiTab = screen.getByRole('tab', { name: /Abhi/i });
    expect(abhiTab).toBeInTheDocument();

    fireEvent.click(abhiTab);

    // Now Abhi should be prominently displayed in the spotlight stage
    const spotlightHeading = screen.getByTestId('spotlight-name');
    expect(spotlightHeading).toHaveTextContent(/Abhi/i);
  });

  it('allows pausing and resuming the moving TV banner ticker', () => {
    renderWithRouter();

    const pauseButton = screen.getByRole('button', { name: /pause ticker/i });
    expect(pauseButton).toBeInTheDocument();

    fireEvent.click(pauseButton);
    expect(screen.getByRole('button', { name: /resume ticker/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /resume ticker/i }));
    expect(screen.getByRole('button', { name: /pause ticker/i })).toBeInTheDocument();
  });

  it('toggles CRT scanlines when scanlines button is clicked', () => {
    renderWithRouter();

    const scanlinesToggle = screen.getByRole('button', { name: /scanlines/i });
    expect(scanlinesToggle).toBeInTheDocument();

    // Default: scanlines on
    const container = screen.getByTestId('developers-container');
    expect(container).toHaveClass(/scanlinesActive/);

    fireEvent.click(scanlinesToggle);
    expect(container).not.toHaveClass(/scanlinesActive/);

    fireEvent.click(scanlinesToggle);
    expect(container).toHaveClass(/scanlinesActive/);
  });

  it('provides a return navigation link to home / lobby', () => {
    renderWithRouter();

    const backLinks = screen.getAllByRole('link', { name: /return|back/i });
    expect(backLinks.length).toBeGreaterThan(0);
    expect(backLinks[0]).toHaveAttribute('href', '/');
  });
});
