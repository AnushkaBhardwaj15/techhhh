import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { GamePaymentNotice } from './GamePaymentNotice';
afterEach(cleanup);
it.each([false, true])('explains the fee, unpaid entry and pre-start deadline (projector=%s)', projector => {
  render(<GamePaymentNotice projector={projector} />);
  const notice = screen.getByLabelText('Ticket fee and prize rules');
  expect(notice).toHaveTextContent('₹10 ticket per game');
  expect(notice).toHaveTextContent('You can join without paying');
  expect(notice).toHaveTextContent('unpaid winners cannot collect prizes');
  expect(notice).toHaveTextContent('Payments close when the game starts');
});
