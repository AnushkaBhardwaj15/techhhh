import { describe, expect, it } from 'bun:test';
import { parseParticipantCsv } from '../../src/modules/participants/import/csv-parser.ts';
import { ValidationError } from '../../src/shared/errors/app-error.ts';

describe('Participant CSV Parser', () => {
  it('parses valid CSV with name, email, and external_id', () => {
    const csv = `name,email,external_id
Alice Smith,alice@example.com,EXT-1
Bob Jones,bob@example.com,EXT-2`;

    const rows = parseParticipantCsv(csv);
    expect(rows.length).toBe(2);
    expect(rows[0]).toEqual({
      rowIndex: 2,
      name: 'Alice Smith',
      email: 'alice@example.com',
      externalId: 'EXT-1',
    });
    expect(rows[1]).toEqual({
      rowIndex: 3,
      name: 'Bob Jones',
      email: 'bob@example.com',
      externalId: 'EXT-2',
    });
  });

  it('strips UTF-8 BOM if present at the beginning of the file', () => {
    const csvWithBom = `\uFEFFname,email\nCharlie Brown,charlie@example.com`;
    const rows = parseParticipantCsv(csvWithBom);
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('Charlie Brown');
    expect(rows[0].email).toBe('charlie@example.com');
  });

  it('correctly handles quoted fields containing commas', () => {
    const csv = `name,email,external_id\n"Smith, Alice",alice@example.com,"EMP,001"`;
    const rows = parseParticipantCsv(csv);
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('Smith, Alice');
    expect(rows[0].externalId).toBe('EMP,001');
  });

  it('ignores blank lines and whitespace-only lines', () => {
    const csv = `name,email\n\nAlice,alice@example.com\n   \nBob,bob@example.com\n\n`;
    const rows = parseParticipantCsv(csv);
    expect(rows.length).toBe(2);
  });

  it('returns empty array when given only header or empty content', () => {
    expect(parseParticipantCsv('')).toEqual([]);
    expect(parseParticipantCsv('   ')).toEqual([]);
    expect(parseParticipantCsv('name,email,external_id')).toEqual([]);
  });

  it('throws ValidationError when required columns are missing in header', () => {
    expect(() => parseParticipantCsv('username,mail\nAlice,alice@example.com')).toThrow(
      ValidationError
    );
  });

  it('rejects CSV files exceeding the 500 data row limit', () => {
    const header = 'name,email\n';
    const rows = Array.from({ length: 501 }, (_, i) => `User ${i},user${i}@example.com`).join('\n');
    const overLimitCsv = header + rows;

    expect(() => parseParticipantCsv(overLimitCsv)).toThrow(ValidationError);
  });
});
