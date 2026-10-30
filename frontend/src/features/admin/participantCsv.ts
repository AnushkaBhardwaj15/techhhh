export const PARTICIPANT_CSV_MAX_BYTES = 10 * 1024 * 1024;
export const PARTICIPANT_CSV_MAX_ROWS = 1000;
export const PARTICIPANT_CSV_MAX_COLUMNS = 100;
export const PARTICIPANT_CSV_PREVIEW_ROWS = 20;

export type ParticipantCsvPreview = {
  headers: string[];
  rows: string[][];
  totalRows: number;
  issues: string[];
};

export async function readParticipantCsvFile(file: File) {
  if (file.size > PARTICIPANT_CSV_MAX_BYTES) throw new Error('CSV files must be 10 MiB or smaller.');
  try {
    const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(new Error('Could not read the selected file.'));
      reader.readAsArrayBuffer(file);
    });
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('This file is not valid UTF-8 CSV. Save it as UTF-8 and try again.');
  }
}

export function parseParticipantCsv(content: string): ParticipantCsvPreview {
  const issues = new Set<string>();
  const clean = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  if (!clean.trim()) return { headers: [], rows: [], totalRows: 0, issues: ['The selected CSV file is empty.'] };

  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;
  let afterQuote = false;
  const finishRecord = () => {
    record.push(field);
    if (record.some((value) => value.trim())) records.push(record);
    record = [];
    field = '';
    afterQuote = false;
  };
  const tooManyRows = () => records.length > PARTICIPANT_CSV_MAX_ROWS + 1;
  const rowLimitPreview = (): ParticipantCsvPreview => ({
    headers: (records[0] ?? []).map((value) => value.trim()),
    rows: records.slice(1, PARTICIPANT_CSV_PREVIEW_ROWS + 1),
    totalRows: records.length - 1,
    issues: [...issues, `This file has more than ${PARTICIPANT_CSV_MAX_ROWS} data rows; the server accepts up to ${PARTICIPANT_CSV_MAX_ROWS}.`],
  });

  for (let index = 0; index < clean.length; index++) {
    const character = clean[index];
    const next = clean[index + 1];
    if (inQuotes) {
      if (character === '"' && next === '"') { field += '"'; index++; }
      else if (character === '"') { inQuotes = false; afterQuote = true; }
      else field += character;
      continue;
    }
    if (afterQuote && character !== ',' && character !== '\n' && character !== '\r' && !/\s/.test(character)) {
      issues.add(`Unexpected character after a quoted value in record ${records.length + 1}.`);
      afterQuote = false;
    }
    if (character === '"') {
      if (field.trim()) issues.add(`Unexpected quote in record ${records.length + 1}.`);
      else inQuotes = true;
    } else if (character === ',') {
      if (record.length >= PARTICIPANT_CSV_MAX_COLUMNS - 1) {
        issues.add(`CSV rows may not contain more than ${PARTICIPANT_CSV_MAX_COLUMNS} columns.`);
        return { headers: [], rows: [], totalRows: 0, issues: [...issues] };
      }
      record.push(field); field = ''; afterQuote = false;
    } else if (character === '\r' || character === '\n') {
      if (character === '\r' && next === '\n') index++;
      finishRecord();
      if (tooManyRows()) return rowLimitPreview();
    } else if (!afterQuote) field += character;
  }
  if (inQuotes) issues.add('A quoted value is not closed.');
  if (field || record.length) finishRecord();
  if (tooManyRows()) return rowLimitPreview();

  const headers = (records[0] ?? []).map((value) => value.trim());
  if (headers.length === 0) issues.add('Add a header row with name and email columns.');
  const normalizedHeaders = headers.map((header) => header.toLowerCase());
  const duplicateHeaders = normalizedHeaders.filter((header, index) => header && normalizedHeaders.indexOf(header) !== index);
  if (duplicateHeaders.length) issues.add(`Duplicate header: ${[...new Set(duplicateHeaders)].join(', ')}.`);
  for (const required of ['email', 'password']) if (!normalizedHeaders.includes(required)) issues.add(`The header row must include a ${required} column.`);

  const data = records.slice(1);
  if (data.length > PARTICIPANT_CSV_MAX_ROWS) issues.add(`This file has ${data.length} data rows; the server accepts up to ${PARTICIPANT_CSV_MAX_ROWS}.`);
  data.forEach((row, index) => {
    if (row.length !== headers.length) issues.add(`Record ${index + 2} has ${row.length} columns; the header has ${headers.length}.`);
  });

  return { headers, rows: data.slice(0, PARTICIPANT_CSV_PREVIEW_ROWS), totalRows: data.length, issues: [...issues] };
}
