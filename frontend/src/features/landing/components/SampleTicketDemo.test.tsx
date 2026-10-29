import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SampleTicketDemo } from './SampleTicketDemo';

describe('SampleTicketDemo', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('uses the game ticket mobile layout with three row headers and all 27 positions', async () => {
    vi.stubGlobal('innerWidth', 390);
    render(<SampleTicketDemo />);
    const ticket = screen.getByRole('table', { name: 'Your mobile Tombola ticket' });
    expect(within(ticket).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['ROW 1', 'ROW 2', 'ROW 3']);
    expect(within(ticket).getAllByRole('row')).toHaveLength(10);
    expect(within(ticket).getAllByRole('cell')).toHaveLength(27);
    expect(within(ticket).getAllByRole('button')).toHaveLength(15);
    const user = userEvent.setup();
    const rust = within(ticket).getByRole('button', { name: /Mark RUST/ });
    await user.click(rust);
    expect(rust.closest('td')).toHaveAttribute('data-marked', 'true');
    await user.click(screen.getByRole('button', { name: /Reset/ }));
    expect(rust.closest('td')).toHaveAttribute('data-marked', 'false');
  });

  it('renders the 3x9 grid and interactive controls', () => {
    render(<SampleTicketDemo />);

    expect(screen.getByText('SAMPLE PARTICIPANT TICKET')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Simulate Next Clue/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reset/i })).toBeInTheDocument();
    expect(screen.getByText('DOCKER')).toBeInTheDocument();
    expect(screen.getByText('RUST')).toBeInTheDocument();
    expect(screen.getByText('BUN')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getAllByRole('cell')).toHaveLength(27);
    expect(screen.getAllByRole('button', { name: /^Mark / })).toHaveLength(15);
    expect(screen.getAllByText('Empty')).toHaveLength(12);
  });

  it('allows tapping cells to toggle markings and tracks total count', async () => {
    const user = userEvent.setup();
    render(<SampleTicketDemo />);

    // Initially DOCKER and POSTGRES are marked (2 marked)
    expect(screen.getByText('2')).toBeInTheDocument();

    const rustCell = screen.getByRole('button', { name: /RUST/i });
    await user.click(rustCell);

    // After clicking RUST, 3 are marked
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(rustCell.closest('td')).toHaveAttribute('data-marked', 'true');

    // Click again to unmark
    await user.click(rustCell);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(rustCell.closest('td')).toHaveAttribute('data-marked', 'false');
  });

  it('simulates a clue reveal when the simulation button is clicked', async () => {
    const user = userEvent.setup();
    render(<SampleTicketDemo />);

    await user.click(screen.getByRole('button', { name: /Simulate Next Clue/i }));

    expect(screen.getByText('SIMULATED DRAW')).toBeInTheDocument();
    expect(screen.getByText(/High-performance all-in-one JS\/TS runtime/i)).toBeInTheDocument();
    expect(screen.getAllByText('BUN').length).toBeGreaterThanOrEqual(2);
  });

  it('resets all marks when the reset button is clicked', async () => {
    const user = userEvent.setup();
    render(<SampleTicketDemo />);

    await user.click(screen.getByRole('button', { name: /Reset/i }));
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('supports keyboard marking and keeps pattern names separate from descriptions', async () => {
    const user = userEvent.setup();
    render(<SampleTicketDemo />);
    const rust = screen.getByRole('button', { name: /RUST/ });
    rust.focus();
    await user.keyboard('{Enter}');
    expect(rust.closest('td')).toHaveAttribute('data-marked', 'true');
    await user.keyboard(' ');
    expect(rust.closest('td')).toHaveAttribute('data-marked', 'false');
    const patterns = screen.getByLabelText('Winning pattern achievement status');
    expect(within(patterns).getByText('Early 5')).toBeInTheDocument();
    expect(within(patterns).getByText('Any 5 marked cells')).toBeInTheDocument();
    expect(patterns).toHaveTextContent('Early 5 Any 5 marked cells');
  });
});
