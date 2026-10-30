import type { ParticipantTicket } from '../../types/ticket';

export const DEFAULT_TICKET_ID = 'b102a200-8679-4cfc-b2cd-9d23961b5a5f';

/**
 * Standard 9x3 Tambola ticket matching the 90 technology question topics.
 * 15 cells total: 5 in Row 0, 5 in Row 1, 5 in Row 2 across 9 columns (0-8).
 */
export function createDefaultTicket(roundId: string = 'default-round', userId: string = 'player'): ParticipantTicket {
  return {
    id: DEFAULT_TICKET_ID,
    roundId,
    participantId: userId,
    eventId: 'e7bf4217-f212-4970-b3f1-e924e1782f25',
    createdAt: '2026-10-23T10:00:00.000Z',
    cells: [
      // Row 0: 5 items
      { id: 'c_0_0', rowIndex: 0, colIndex: 0, row: 0, column: 0, keyId: 'k_ws', keyValue: 'WEBSOCKET', marked: false },
      { id: 'c_0_1', rowIndex: 0, colIndex: 1, row: 0, column: 1, keyId: 'k_driz', keyValue: 'DRIZZLE', marked: false },
      { id: 'c_0_2', rowIndex: 0, colIndex: 2, row: 0, column: 2, keyId: 'k_git', keyValue: 'GIT', marked: false },
      { id: 'c_0_4', rowIndex: 0, colIndex: 4, row: 0, column: 4, keyId: 'k_goog', keyValue: 'GOOGLE', marked: false },
      { id: 'c_0_8', rowIndex: 0, colIndex: 8, row: 0, column: 8, keyId: 'k_arg', keyValue: 'ARGON2', marked: false },

      // Row 1: 5 items
      { id: 'c_1_2', rowIndex: 1, colIndex: 2, row: 1, column: 2, keyId: 'k_json', keyValue: 'JSON', marked: false },
      { id: 'c_1_3', rowIndex: 1, colIndex: 3, row: 1, column: 3, keyId: 'k_node', keyValue: 'NODEJS', marked: false },
      { id: 'c_1_5', rowIndex: 1, colIndex: 5, row: 1, column: 5, keyId: 'k_fast', keyValue: 'FASTIFY', marked: false },
      { id: 'c_1_6', rowIndex: 1, colIndex: 6, row: 1, column: 6, keyId: 'k_brow', keyValue: 'BROWSER', marked: false },
      { id: 'c_1_7', rowIndex: 1, colIndex: 7, row: 1, column: 7, keyId: 'k_ngx', keyValue: 'NGINX', marked: false },

      // Row 2: 5 items
      { id: 'c_2_0', rowIndex: 2, colIndex: 0, row: 2, column: 0, keyId: 'k_react', keyValue: 'REACT', marked: false },
      { id: 'c_2_1', rowIndex: 2, colIndex: 1, row: 2, column: 1, keyId: 'k_ts', keyValue: 'TYPESCRIPT', marked: false },
      { id: 'c_2_4', rowIndex: 2, colIndex: 4, row: 2, column: 4, keyId: 'k_pg', keyValue: 'POSTGRES', marked: false },
      { id: 'c_2_7', rowIndex: 2, colIndex: 7, row: 2, column: 7, keyId: 'k_doc', keyValue: 'DOCKER', marked: false },
      { id: 'c_2_8', rowIndex: 2, colIndex: 8, row: 2, column: 8, keyId: 'k_k8s', keyValue: 'KUBERNETES', marked: false },
    ],
  };
}
