import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SampleTicketDemo } from './SampleTicketDemo';

describe('SampleTicketDemo', () => {
  afterEach(cleanup);

  it('renders the 3x9 grid and interactive controls', () => {
    render(<SampleTicketDemo />);

    expect(screen.getByText('SAMPLE PARTICIPANT TICKET')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Simulate Next Clue/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reset/i })).toBeInTheDocument();
    expect(screen.getByText('DOCKER')).toBeInTheDocument();
    expect(screen.getByText('RUST')).toBeInTheDocument();
    expect(screen.getByText('BUN')).toBeInTheDocument();
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
    expect(rustCell).toHaveAttribute('aria-pressed', 'true');

    // Click again to unmark
    await user.click(rustCell);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(rustCell).toHaveAttribute('aria-pressed', 'false');
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
});
