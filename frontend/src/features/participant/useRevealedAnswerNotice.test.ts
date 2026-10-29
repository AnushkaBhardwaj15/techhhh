import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { playFixture } from './playFixture';
import { useRevealedAnswerNotice } from './useRevealedAnswerNotice';

afterEach(cleanup);
it('announces one batch with its question numbers and does not repeat on refresh', () => {
  const notify = vi.fn();
  const draws = Array.from({ length: 5 }, (_, i) => ({ ...playFixture().draws[0]!, id: String(i), sequence: i + 1, revealed: false, answer: 'Hidden' }));
  const view = renderHook(({ items }) => useRevealedAnswerNotice('game', items, notify), { initialProps: { items: draws } });
  expect(notify).not.toHaveBeenCalled();
  const revealed = draws.map(draw => ({ ...draw, revealed: true }));
  view.rerender({ items: revealed });
  expect(notify).toHaveBeenCalledWith(expect.objectContaining({ message: 'Answers for questions 1–5 are revealed. Scroll down to Previous questions & answers to view them.' }));
  view.rerender({ items: [...revealed] });
  expect(notify).toHaveBeenCalledTimes(1);
});
it('lists separated reveals accurately instead of implying a continuous range', () => {
  const notify = vi.fn();
  const draws = [1, 3].map(sequence => ({ ...playFixture().draws[0]!, id: String(sequence), sequence, revealed: false, answer: 'Hidden' }));
  const view = renderHook(({ items }) => useRevealedAnswerNotice('game', items, notify), { initialProps: { items: draws } });
  view.rerender({ items: draws.map(draw => ({ ...draw, revealed: true })) });
  expect(notify).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('questions 1, 3 are revealed') }));
});
