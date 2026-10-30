import { afterEach, expect, it, vi } from 'vitest';
import { mutationFailed, mutationSucceeded } from './notifications';
afterEach(() => vi.restoreAllMocks());
it('keeps payment declaration feedback local so a toast cannot cover Continue', () => {
  const dispatch = vi.spyOn(window, 'dispatchEvent');
  mutationSucceeded('/participant/play/rounds/round/payment-declaration', 'PUT');
  mutationFailed('/participant/play/rounds/round/payment-declaration', 'PUT', 409, 'Payments closed');
  expect(dispatch).not.toHaveBeenCalled();
});
it('preserves global feedback for unrelated changes', () => {
  const dispatch = vi.spyOn(window, 'dispatchEvent');
  mutationSucceeded('/auth/password', 'POST');
  expect(dispatch).toHaveBeenCalledOnce();
});
