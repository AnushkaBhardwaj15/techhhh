import { ValidationError } from '../../../shared/errors/app-error.ts';

export interface ParsedCsvRow {
  rowIndex: number;
  name: string;
  email: string;
  externalId: string | null;
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
  const nameIdx = header.indexOf('name');
  const emailIdx = header.indexOf('email');
  const externalIdIdx = header.indexOf('external_id');

  if (nameIdx === -1 || emailIdx === -1) {
    throw new ValidationError(
      "CSV header must contain at least 'name' and 'email' columns"
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

    const name = row[nameIdx] !== undefined ? row[nameIdx].trim() : '';
    const email = row[emailIdx] !== undefined ? row[emailIdx].trim().toLowerCase() : '';
    const rawExternalId = externalIdIdx !== -1 && row[externalIdIdx] !== undefined ? row[externalIdIdx].trim() : '';
    const externalId = rawExternalId ? rawExternalId : null;

    result.push({
      rowIndex,
      name,
      email,
      externalId,
    });
  }

  return result;
}

function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let currentRecord: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRecord.push(currentField);
        currentField = '';
      } else if (char === '\r') {
        if (nextChar === '\n') {
          i++; // skip LF
        }
        currentRecord.push(currentField);
        currentField = '';
        if (currentRecord.some((f) => f.trim().length > 0)) {
          records.push(currentRecord);
        }
        currentRecord = [];
      } else if (char === '\n') {
        currentRecord.push(currentField);
        currentField = '';
        if (currentRecord.some((f) => f.trim().length > 0)) {
          records.push(currentRecord);
        }
        currentRecord = [];
      } else {
        currentField += char;
      }
    }
  }

  if (currentField || currentRecord.length > 0) {
    currentRecord.push(currentField);
    if (currentRecord.some((f) => f.trim().length > 0)) {
      records.push(currentRecord);
    }
  }

  return records;
}
