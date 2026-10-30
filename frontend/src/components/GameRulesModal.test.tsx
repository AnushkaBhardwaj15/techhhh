import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GameRulesModal } from './GameRulesModal';

describe('GameRulesModal', () => {
  afterEach(cleanup);

  it('does not render when isOpen is false', () => {
    render(<GameRulesModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders all 7 winning patterns and critical rule when isOpen is true', () => {
    render(<GameRulesModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/How to Play Tech Tambola/i)).toBeInTheDocument();
    expect(screen.getByText(/Not a Quiz!/i)).toBeInTheDocument();
    expect(screen.getByText('Early 5')).toBeInTheDocument();
    expect(screen.getByText('Four Corners')).toBeInTheDocument();
    expect(screen.getByText('Top Line')).toBeInTheDocument();
    expect(screen.getByText('Middle Line')).toBeInTheDocument();
    expect(screen.getByText('Bottom Line')).toBeInTheDocument();
    expect(screen.getByText('Full House (1st)')).toBeInTheDocument();
    expect(screen.getByText('Second House')).toBeInTheDocument();
  });

  it('calls onClose when clicking close button, got it button, or pressing Escape', () => {
    const handleClose = vi.fn();
    const { rerender } = render(<GameRulesModal isOpen={true} onClose={handleClose} />);

    // Click close button (✕)
    fireEvent.click(screen.getByLabelText(/Close rules dialog/i));
    expect(handleClose).toHaveBeenCalledTimes(1);

    // Click Got it button
    fireEvent.click(screen.getByRole('button', { name: /Got it, let's play!/i }));
    expect(handleClose).toHaveBeenCalledTimes(2);

    // Press Escape
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(3);

    // Re-render closed and ensure no events fire
    rerender(<GameRulesModal isOpen={false} onClose={handleClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(3);
  });
});
