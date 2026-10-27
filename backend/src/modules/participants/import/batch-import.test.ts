import { describe, expect, it, mock } from 'bun:test';
import * as XLSX from 'xlsx';
import { parseParticipantCsv } from './csv-parser.ts';
import { participantFileToCsv } from './spreadsheet.ts';
import { ImportService } from './import.service.ts';

// Scenarios: CSV/Excel credentials, optional names, exact password whitespace,
// bad headers/quotes/types/encoding, 500-row boundary, invalid rows, duplicates,
// retries scoped by actor/Event/batch/file, errors without credential disclosure.
describe('named credential imports', () => {
  it('accepts personal and college emails and preserves password whitespace', () => {
    const rows = parseParticipantCsv('email,password\nPerson@gmail.com," spaced password "\nstudent@college.edu,StudentPass1');
    expect(rows.map(({ email, password, name }) => ({ email, password, name }))).toEqual([
      { email: 'person@gmail.com', password: ' spaced password ', name: 'Person@gmail.com' },
      { email: 'student@college.edu', password: 'StudentPass1', name: 'student@college.edu' },
    ]);
  });

  it('rejects missing headers and unclosed quotes', () => {
    expect(() => parseParticipantCsv('password\nsecret')).toThrow();
    expect(() => parseParticipantCsv('email,password\na@example.com,"secret')).toThrow();
    expect(() => parseParticipantCsv('email,password\na@example.com,abc"def"ghi')).toThrow();
    expect(() => parseParticipantCsv('email,password\na@example.com,"abc"tail')).toThrow();
  });

  it('accepts 500 rows and rejects 501', () => {
    const csv = 'email,password\n' + Array.from({ length: 500 }, (_, i) => `p${i}@test.com,Pass12345`).join('\n');
    expect(parseParticipantCsv(csv)).toHaveLength(500);
    expect(() => parseParticipantCsv(csv + '\nextra@test.com,Pass12345')).toThrow('500');
  });

  it.each(['xlsx', 'xls'])('reads an Excel %s workbook with plain email/password values', (extension) => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['email', 'password'], ['a@test.com', 'Pass12345']]), 'People');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: extension as 'xlsx' | 'xls' });
    expect(parseParticipantCsv(participantFileToCsv(`test.${extension}`, buffer))[0].password).toBe('Pass12345');
  });

  it('rejects unsupported, oversized, malformed, multi-sheet and formula workbooks', () => {
    expect(() => participantFileToCsv('test.pdf', Buffer.from('bad'))).toThrow();
    expect(() => participantFileToCsv('test.csv', Buffer.alloc(10 * 1024 * 1024 + 1))).toThrow();
    expect(() => participantFileToCsv('test.csv', Buffer.from([0xff]))).toThrow();
    expect(() => participantFileToCsv('test.xlsx', Buffer.from([0, 1, 2]))).toThrow();
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([['email', 'password'], ['a@test.com', 'Pass12345']]);
    sheet.B2 = { t: 's', f: '"Pass12345"', v: 'Pass12345' };
    XLSX.utils.book_append_sheet(workbook, sheet, 'People');
    expect(() => participantFileToCsv('test.xlsx', XLSX.write(workbook, { type: 'buffer' }))).toThrow();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Extra');
    expect(() => participantFileToCsv('test.xlsx', XLSX.write(workbook, { type: 'buffer' }))).toThrow();
  });

  function fixture() {
    const created = mock(async (..._args: unknown[]) => ({}));
    const cache = new Map<string, unknown>();
    const service = new ImportService(
      { findById: async () => ({ id: 'event', status: 'READY' }) } as any,
      { createParticipant: created } as any,
      { find: async (key: string) => cache.get(key), save: async (key: string, _type: string, report: unknown) => { cache.set(key, report); } } as any,
      { record: async () => ({}) } as any,
      { withEventLock: async (_event: string, operation: (tx: any) => Promise<unknown>) => operation(undefined) } as any,
    );
    return { service, created, cache };
  }

  it('creates valid rows, reports invalid rows and skips in-file duplicates without returning passwords', async () => {
    const { service, created } = fixture();
    const result = await service.importParticipantsFromCsv('admin', 'event',
      'email,password\na@test.com,GoodPass123\na@test.com,GoodPass123\nb@test.com,short\nbad,GoodPass123', 'key', undefined, ' testing1 ');
    expect(result).toMatchObject({ createdCount: 1, skippedCount: 1, failedCount: 2 });
    expect(created.mock.calls[0]).toEqual(['admin', expect.objectContaining({ batchName: 'testing1', password: 'GoodPass123' }), undefined, expect.objectContaining({ afterCommit: expect.any(Array) })]);
    expect(JSON.stringify(result)).not.toContain('GoodPass123');
  });

  it('requires passwords in named batches and validates batch names and request keys', async () => {
    const { service } = fixture();
    expect((await service.importParticipantsFromCsv('a', 'e', 'email,name\na@test.com,A', 'k', undefined, 'test')).failedCount).toBe(1);
    await expect(service.importParticipantsFromCsv('a', 'e', '', '', undefined, 'test')).rejects.toThrow();
    await expect(service.importParticipantsFromCsv('a', 'e', '', 'k', undefined, ' '.repeat(3))).rejects.toThrow();
  });

  it('replays identical imports while separating different actors, Events, batches and files', async () => {
    const { service, created, cache } = fixture();
    const csv = 'email,password\na@test.com,GoodPass123';
    await service.importParticipantsFromCsv('a', 'e', csv, 'k', undefined, 'test');
    await service.importParticipantsFromCsv('a', 'e', csv, 'k', undefined, 'test');
    expect(created).toHaveBeenCalledTimes(1);
    for (const [actor, event, batch, content] of [['b', 'e', 'test', csv], ['a', 'f', 'test', csv], ['a', 'e', 'prod', csv], ['a', 'e', 'test', csv + '\n']]) {
      await service.importParticipantsFromCsv(actor, event, content, 'k', undefined, batch);
    }
    expect(created).toHaveBeenCalledTimes(5);
    expect(JSON.stringify([...cache])).not.toContain('GoodPass123');
  });

  it('does not expose IO errors containing credentials', async () => {
    const { service, created } = fixture();
    created.mockRejectedValueOnce(new Error('SQL failed for password GoodPass123'));
    const result = await service.importParticipantsFromCsv('a', 'e', 'email,password\na@test.com,GoodPass123', 'k', undefined, 'test');
    expect(result.errors[0].reason).toBe('Row could not be created');
  });
});
