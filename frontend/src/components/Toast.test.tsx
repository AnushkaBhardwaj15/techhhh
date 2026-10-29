import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Toast } from './Toast';

afterEach(() => { cleanup(); vi.useRealTimers(); });

it('announces feedback and supports dismissal', () => {
  const dismiss = vi.fn();
  render(<Toast message="Check your marks and try again." onDismiss={dismiss} />);
  expect(screen.getByRole('status')).toHaveTextContent('Check your marks and try again.');
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
  expect(dismiss).toHaveBeenCalledOnce();
});

it('auto-dismisses after eight seconds and resets the timer for a new message', () => {
  vi.useFakeTimers();
  const dismiss = vi.fn();
  const view = render(<Toast message="First claim" onDismiss={dismiss} />);
  act(() => vi.advanceTimersByTime(5000));
  view.rerender(<Toast message="Second claim" tone="success" onDismiss={dismiss} />);
  expect(screen.getByRole('status')).toHaveTextContent('Claim confirmed');
  act(() => vi.advanceTimersByTime(7999));
  expect(dismiss).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(dismiss).toHaveBeenCalledOnce();
});

it('announces connection errors as alerts', () => {
  render(<Toast message="Check your connection." tone="error" onDismiss={() => {}} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Check your connection.');
});
