import * as XLSX from 'xlsx';
import { ValidationError } from '../../../shared/errors/app-error.ts';

export function participantFileToCsv(filename: string, buffer: Buffer): string {
  if (buffer.length > 10 * 1024 * 1024) throw new ValidationError('File must be 10 MiB or smaller');
  if (filename.toLowerCase().endsWith('.csv')) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch { throw new ValidationError('CSV must use UTF-8 encoding'); }
  }
  if (!/\.xlsx?$/i.test(filename)) throw new ValidationError('Choose a CSV, XLSX or XLS file');
  const zip = buffer[0] === 0x50 && buffer[1] === 0x4b;
  const ole = buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (!zip && !ole) throw new ValidationError('Invalid Excel workbook');
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer', sheetRows: 502, cellFormula: true });
    if (workbook.SheetNames.length !== 1) throw new Error('Use a workbook with exactly one sheet');
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (Object.values(sheet).some((cell) => cell && typeof cell === 'object' && 'f' in cell)) {
      throw new Error('Use plain values instead of formulas');
    }
    return XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
  } catch {
    throw new ValidationError('Cannot read workbook. Use one sheet with plain email and password values');
  }
}
