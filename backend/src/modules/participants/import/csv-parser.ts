import { ValidationError } from '../../../shared/errors/app-error.ts';

export interface ParsedCsvRow {
  rowIndex: number;
  name: string;
  email: string;
  externalId: string | null;
  password?: string;
}

export function parseParticipantCsv(rawContent: string): ParsedCsvRow[] {
  if (!rawContent || !rawContent.trim()) {
    return [];
  }

  // 1. Strip UTF-8 BOM if present
  let cleanContent = rawContent;
  if (cleanContent.charCodeAt(0) === 0xfeff) {
    cleanContent = cleanContent.slice(1);
  }

  // 2. Tokenize CSV lines while respecting quoted fields containing newlines or commas
  const records = parseCsvRecords(cleanContent);
  if (records.length === 0) {
    return [];
  }

  // 3. Header inspection
  const header = records[0].map((col) => col.trim().toLowerCase());
  if (header.length > 100 || new Set(header).size !== header.length) throw new ValidationError('CSV contains too many or duplicate columns');
  const nameIdx = header.indexOf('name');
  const passwordIdx = header.indexOf('password');
  const emailIdx = header.indexOf('email');
  const externalIdIdx = header.indexOf('external_id');

  if (emailIdx === -1 || (nameIdx === -1 && passwordIdx === -1)) {
    throw new ValidationError(
      "CSV header must contain 'email' and either 'password' or 'name' columns"
    );
  }

  const dataRecords = records.slice(1);

  // 4. Maximum 500 data rows enforcement
  if (dataRecords.length > 500) {
    throw new ValidationError(
      `CSV file exceeds maximum limit of 500 data rows (found ${dataRecords.length})`
    );
  }

  const result: ParsedCsvRow[] = [];

  for (let i = 0; i < dataRecords.length; i++) {
    const row = dataRecords[i];
    const rowIndex = i + 2; // 1-based index including header row

    // Skip empty row
    if (row.length === 0 || (row.length === 1 && !row[0].trim())) {
      continue;
    }

    const name = nameIdx === -1 ? (row[emailIdx]?.trim() ?? '') : (row[nameIdx]?.trim() ?? '');
    const email = row[emailIdx] !== undefined ? row[emailIdx].trim().toLowerCase() : '';
    const rawExternalId = externalIdIdx !== -1 && row[externalIdIdx] !== undefined ? row[externalIdIdx].trim() : '';
    const externalId = rawExternalId ? rawExternalId : null;

    result.push({
      rowIndex,
      name,
      email,
      externalId,
      ...(passwordIdx === -1 ? {} : { password: row[passwordIdx] ?? '' }),
    });
  }

  return result;
}

function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;
  let afterQuote = false;
  const finishField = () => {
    if (record.length >= 100) throw new ValidationError('CSV rows may contain at most 100 columns');
    record.push(field);
    field = '';
    afterQuote = false;
  };
  const finishRecord = () => {
    finishField();
    if (record.some((value) => value.trim())) records.push(record);
    record = [];
    if (records.length > 501) throw new ValidationError('CSV file exceeds maximum limit of 500 data rows');
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { inQuotes = false; afterQuote = true; }
      else field += char;
      continue;
    }
    if (char === ',') finishField();
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      finishRecord();
    } else if (afterQuote) {
      if (!/^[ \t]$/.test(char)) throw new ValidationError('Unexpected character after a quoted CSV field');
    } else if (char === '"') {
      if (field.length) throw new ValidationError('Unexpected quote inside an unquoted CSV field');
      inQuotes = true;
    } else field += char;
  }
  if (inQuotes) throw new ValidationError('CSV contains an unclosed quoted field');
  if (field.length || record.length || afterQuote) finishRecord();
  return records;
}
