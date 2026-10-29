import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { RecentQuestions } from './RecentQuestions';
import { playFixture } from './playFixture';

afterEach(cleanup);
const draw = playFixture().draws[0]!;

it.each([1, 5, 10, 25, 90])('shows all %i answers in the current reveal batch without a fixed limit', count => {
  const draws = Array.from({ length: count }, (_, i) => ({ ...draw, id: `draw-${i}`, sequence: i + 1, prompt: `Clue ${i + 1}`, answer: `Key ${i + 1}`, revealed: true }));
  render(<RecentQuestions draws={draws} />);
  fireEvent.click(screen.getByText(`Previous questions & answers (${count})`));
  expect(screen.getAllByRole('listitem')).toHaveLength(count);
  expect(screen.getAllByRole('listitem')[0]).toHaveTextContent(`Clue ${count}`);
  expect(screen.getByText('Key 1')).toBeInTheDocument();
  expect(screen.getByText(`Key ${count}`)).toBeInTheDocument();
});

it('keeps unrevealed answers hidden and updates after the host reveals them', () => {
  const earlier = { ...draw, id: 'earlier', sequence: 1, prompt: 'An earlier clue', answer: 'SECRET KEY', revealed: false };
  const current = { ...draw, id: 'current', sequence: 2 };
  const view = render(<RecentQuestions draws={[earlier, current]} />);
  fireEvent.click(screen.getByText('Previous questions & answers (0)'));
  expect(screen.queryByText('SECRET KEY')).not.toBeInTheDocument();
  expect(screen.getByText(/No answers in this batch yet/)).toBeInTheDocument();
  view.rerender(<RecentQuestions draws={[{ ...earlier, revealed: true }, { ...current, revealed: true, answer: 'Current key' }]} />);
  expect(screen.getByText('SECRET KEY')).toBeInTheDocument();
});

it.each([{ draws: [] }, { draws: [draw] }])('explains when no earlier clues exist', ({ draws }) => {
  render(<RecentQuestions draws={draws} />);
  expect(screen.getByText('Previous questions & answers (0)')).toBeInTheDocument();
  expect(screen.getByText(/No answers in this batch yet/)).toBeInTheDocument();
});


it('clears on the next question and shows only the new reveal batch, including after remount', () => {
  const batch1 = '11111111-1111-4111-8111-111111111111';
  const batch2 = '22222222-2222-4222-8222-222222222222';
  const first = Array.from({ length: 5 }, (_, i) => ({ ...draw, id: `first-${i}`, sequence: i + 1, prompt: `Clue ${i + 1}`, revealed: true, answer: `Key ${i + 1}`, revealBatchId: batch1 }));
  const view = render(<RecentQuestions draws={first} />);
  expect(screen.getByText('Previous questions & answers (5)')).toBeInTheDocument();
  const next = Array.from({ length: 10 }, (_, i) => ({ ...draw, id: `next-${i}`, sequence: i + 6, prompt: `Clue ${i + 6}`, revealed: false, answer: null, revealBatchId: null }));
  view.rerender(<RecentQuestions draws={[...first, next[0]!]} />);
  expect(screen.getByText('Previous questions & answers (0)')).toBeInTheDocument();
  view.rerender(<RecentQuestions draws={[...first, ...next]} />);
  expect(screen.getByText('Previous questions & answers (0)')).toBeInTheDocument();
  const revealed = next.map(item => ({ ...item, revealed: true, answer: `Key ${item.sequence}`, revealBatchId: batch2 }));
  view.rerender(<RecentQuestions draws={[...first, ...revealed]} />);
  expect(screen.getByText('Previous questions & answers (10)')).toBeInTheDocument();
  expect(screen.queryByText('Key 1')).not.toBeInTheDocument();
  expect(screen.getByText('Key 6')).toBeInTheDocument();
  expect(screen.getByText('Key 15')).toBeInTheDocument();
  view.unmount();
  render(<RecentQuestions draws={[...first, ...revealed]} />);
  expect(screen.getByText('Previous questions & answers (10)')).toBeInTheDocument();
});
