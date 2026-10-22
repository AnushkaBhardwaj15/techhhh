import { NotFoundError, UnprocessableEntityError } from '../../shared/errors/index.ts';

/**
 * Validates that round is ACTIVE. Throws UnprocessableEntityError (422) if not.
 */
export function validateRoundActiveForMark(status: string): void {
  if (status !== 'ACTIVE') {
    throw new UnprocessableEntityError(
      `Round must be ACTIVE to mark or unmark cells. Current status is ${status}.`
    );
  }
}

/**
 * Validates that the cell is eligible to be marked:
 * 1. Cell must be populated with a key (not empty).
 * Participants can mark any cell based on their knowledge without leaking answer correctness.
 */
export function validateCellEligibleForMark(
  cell: { id: string; keyId: string | null },
  _drawnKeyIds?: Set<string>
): void {
  if (!cell.keyId) {
    throw new UnprocessableEntityError('Cannot mark an empty cell');
  }
}

/**
 * Asserts that the authenticated participant owns the ticket.
 * Throws non-enumerating NotFoundError (404) if ownership check fails.
 */
export function assertTicketOwnership(
  ticket: { participantId: string },
  participantProfileId: string
): void {
  if (ticket.participantId !== participantProfileId) {
    throw new NotFoundError('Ticket not found');
  }
}

/**
 * Asserts that the cell belongs to the specified ticket.
 * Throws non-enumerating NotFoundError (404) if mismatch.
 */
export function assertCellBelongsToTicket(
  cell: { ticketId: string },
  ticketId: string
): void {
  if (cell.ticketId !== ticketId) {
    throw new NotFoundError('Cell not found');
  }
}
