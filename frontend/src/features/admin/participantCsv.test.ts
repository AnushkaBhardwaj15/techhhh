import { describe, expect, it } from 'vitest';
import { parseParticipantCsv, PARTICIPANT_CSV_MAX_BYTES, PARTICIPANT_CSV_MAX_COLUMNS, PARTICIPANT_CSV_MAX_ROWS, readParticipantCsvFile } from './participantCsv';

describe('Participant CSV preview', () => {
  it('parses a UTF-8 BOM and quoted commas, newlines, and escaped quotes', () => {
    const preview = parseParticipantCsv('\uFEFFname,email,external_id\r\n"Sam, Rivera",sam@example.test,"E-""42"""\r\n"Two\nLines",two@example.test,');
    expect(preview).toEqual({
      headers: ['name', 'email', 'external_id'],
      rows: [['Sam, Rivera', 'sam@example.test', 'E-"42"'], ['Two\nLines', 'two@example.test', '']],
      totalRows: 2,
      issues: [],
    });
  });

  it('reports empty files and required or duplicate headers', () => {
    expect(parseParticipantCsv('').issues).toContain('The selected CSV file is empty.');
    expect(parseParticipantCsv('Name,Email,email\nSam,sam@example.test,').issues).toEqual(expect.arrayContaining([
      'Duplicate header: email.',
    ]));
    expect(parseParticipantCsv('full_name,contact\nSam,sam@example.test').issues).toEqual(expect.arrayContaining([
      'The header row must include a name column.', 'The header row must include a email column.',
    ]));
  });

  it('flags an unclosed quote and inconsistent column counts as malformed structure', () => {
    expect(parseParticipantCsv('name,email\n"Sam,sam@example.test').issues).toContain('A quoted value is not closed.');
    expect(parseParticipantCsv('name,email\nSam,sam@example.test,extra').issues).toContain('Record 2 has 3 columns; the header has 2.');
  });

  it('enforces the server row limit and bounds the displayed preview', () => {
    const rows = Array.from({ length: PARTICIPANT_CSV_MAX_ROWS + 1 }, (_, index) => `Person ${index},p${index}@example.test`).join('\n');
    const preview = parseParticipantCsv(`name,email\n${rows}`);
    expect(preview.issues).toContain('This file has more than 500 data rows; the server accepts up to 500.');
    const small = parseParticipantCsv(`name,email\n${Array.from({ length: 25 }, (_, index) => `Person ${index},p${index}@example.test`).join('\n')}`);
    expect(small.rows).toHaveLength(20);
    expect(small.totalRows).toBe(25);
  });

  it('stops parsing comma-heavy rows before they can create unbounded columns', () => {
    const preview = parseParticipantCsv(`name,email\n${','.repeat(1_000_000)}`);
    expect(preview.issues).toContain(`CSV rows may not contain more than ${PARTICIPANT_CSV_MAX_COLUMNS} columns.`);
    expect(preview.rows).toHaveLength(0);
  });

  it('stops retaining data rows as soon as the server row limit is exceeded', () => {
    const rows = Array.from({ length: 100_000 }, (_, index) => `Person ${index},p${index}@example.test`).join('\n');
    const preview = parseParticipantCsv(`name,email\n${rows}`);
    expect(preview.totalRows).toBe(PARTICIPANT_CSV_MAX_ROWS + 1);
    expect(preview.rows).toHaveLength(20);
    expect(preview.issues).toContain('This file has more than 500 data rows; the server accepts up to 500.');
  });

  it('deduplicates repeated malformed-quote diagnostics within a row', () => {
    const preview = parseParticipantCsv(`name,email\n${'x"'.repeat(100_000)},sam@example.test`);
    expect(preview.issues).toEqual(['Unexpected quote in record 2.']);
  });

  it('rejects files over the server upload limit and non-UTF-8 content', async () => {
    const oversized = { size: PARTICIPANT_CSV_MAX_BYTES + 1 } as File;
    await expect(readParticipantCsvFile(oversized)).rejects.toThrow('10 MiB or smaller');
    const invalidUtf8 = new File([new Uint8Array([0xff])], 'invalid.csv');
    await expect(readParticipantCsvFile(invalidUtf8)).rejects.toThrow('valid UTF-8 CSV');
  });
});
