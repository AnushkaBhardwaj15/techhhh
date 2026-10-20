import type { TicketCellRecord, TicketRecord } from '../../db/schema/tickets.ts';
import type { GeneratedCell, TicketKey } from './ticket.domain.ts';

export interface TicketCellDto {
  id: string;
  rowIndex: number;
  colIndex: number;
  row: number;
  column: number;
  keyId: string;
  keyValue: string;
  marked: boolean;
}

export interface TicketDto {
  id: string;
  roundId: string;
  participantId: string;
  eventId: string;
  cells: TicketCellDto[];
  createdAt: string;
}

export interface GenerateTicketsResult {
  roundId: string;
  totalParticipants: number;
  created: number;
  existing: number;
  skipped: number;
}

export interface ParticipantTicketRead {
  userStatus: string;
  adminRole: string | null;
  profile: { id: string; eventId: string; status: string } | null;
  roundFound: boolean;
  ticket: (TicketRecord & { cells: Array<TicketCellRecord & { keyValue: string; marked: boolean }> }) | null;
}

export interface ITicketRepository {
  findBySessionAndRound(sessionId: string, userId: string, roundId: string, eventId: string): Promise<ParticipantTicketRead | null>;
  findByUserAndRound(
    userId: string,
    roundId: string
  ): Promise<(TicketRecord & { cells: Array<TicketCellRecord & { keyValue: string; marked: boolean }> }) | null>;

  findByParticipantAndRound(
    participantId: string,
    roundId: string,
    tx?: any
  ): Promise<(TicketRecord & { cells: Array<TicketCellRecord & { keyValue: string; marked: boolean }> }) | null>;

  findTicketById(
    ticketId: string,
    tx?: any
  ): Promise<(TicketRecord & { cells: Array<TicketCellRecord & { keyValue: string }> }) | null>;

  findExistingTicketParticipantIds(
    roundId: string,
    tx?: any
  ): Promise<Set<string>>;

  createTicketWithCells(
    data: {
      roundId: string;
      participantId: string;
      eventId: string;
      cells: GeneratedCell[];
    },
    tx?: any
  ): Promise<TicketRecord>;

  listTicketsForRound(
    roundId: string,
    options: { page: number; limit: number },
    tx?: any
  ): Promise<{ data: TicketRecord[]; total: number }>;

  getRoundKeys(roundId: string, tx?: any): Promise<TicketKey[]>;
}
