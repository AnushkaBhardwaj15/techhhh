import * as XLSX from "xlsx";
import { ValidationError } from "../../shared/errors/index.ts";

export interface ImportedQuestionRow {
  number: number;
  term: string;
  clue: string;
  category: string;
  codeSnippet: string | null;
}

export interface BankImportValidationResult {
  valid: boolean;
  totalRows: number;
  validRows: number;
  errors: string[];
  warnings: string[];
  questions: ImportedQuestionRow[];
}

/**
 * Normalizes header string to find matching fields regardless of casing, punctuation or spacing.
 */
function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Finds the column key in a row object that matches any of the given aliases.
 */
function findColumn(row: Record<string, unknown>, aliases: string[]): string | undefined {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const normalizedAlias = normalizeHeader(alias);
    const found = keys.find((k) => normalizeHeader(k) === normalizedAlias);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * Parses and validates an Excel or CSV file buffer containing questions and answers.
 * Dynamically detects columns for questions, answers, categories, code snippets, and numbers.
 */
export function parseAndValidateBankSpreadsheet(
  buffer: Buffer | Uint8Array,
  sheetName?: string,
): BankImportValidationResult {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch (err) {
    throw new ValidationError(
      `Unable to parse spreadsheet file: ${err instanceof Error ? err.message : "Invalid format"}`,
    );
  }

  const targetSheetName = sheetName ?? workbook.SheetNames[0];
  if (!targetSheetName || !workbook.Sheets[targetSheetName]) {
    return {
      valid: false,
      totalRows: 0,
      validRows: 0,
      errors: ["The uploaded spreadsheet contains no readable sheets."],
      warnings: [],
      questions: [],
    };
  }

  const sheet = workbook.Sheets[targetSheetName]!;
  const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
    raw: false,
  });

  if (!rawRows.length) {
    return {
      valid: false,
      totalRows: 0,
      validRows: 0,
      errors: ["The spreadsheet contains no data rows."],
      warnings: [],
      questions: [],
    };
  }

  // Detect column mappings from the first non-empty row
  const sample = rawRows[0]!;
  const clueCol = findColumn(sample, [
    "question",
    "prompt",
    "clue",
    "question_text",
    "q",
    "description",
    "query",
  ]);
  const termCol = findColumn(sample, [
    "answer",
    "term",
    "key",
    "value",
    "a",
    "ans",
    "keyword",
    "technology",
  ]);
  const categoryCol = findColumn(sample, [
    "category",
    "domain",
    "topic",
    "tag",
    "type",
  ]);
  const codeCol = findColumn(sample, [
    "code",
    "snippet",
    "codesnippet",
    "code_snippet",
    "example",
  ]);
  const numberCol = findColumn(sample, [
    "number",
    "no",
    "id",
    "item",
    "sno",
    "sequence",
    "#",
  ]);

  const errors: string[] = [];
  const warnings: string[] = [];

  if (!clueCol) {
    errors.push(
      "Missing question column. The spreadsheet must contain a column for the question/clue (e.g. 'Question', 'Clue', 'Prompt').",
    );
  }
  if (!termCol) {
    errors.push(
      "Missing answer column. The spreadsheet must contain a column for the answer key (e.g. 'Answer', 'Term', 'Key').",
    );
  }

  if (errors.length) {
    return {
      valid: false,
      totalRows: rawRows.length,
      validRows: 0,
      errors,
      warnings,
      questions: [],
    };
  }

  const questions: ImportedQuestionRow[] = [];
  const seenTerms = new Map<string, number>(); // normalized term -> row number

  rawRows.forEach((row, index) => {
    const rowNum = index + 2; // 1-indexed including header row
    const rawClue = String(row[clueCol!] ?? "").trim();
    const rawTerm = String(row[termCol!] ?? "").trim();
    const rawCategory = categoryCol ? String(row[categoryCol] ?? "").trim() : "";
    const rawCode = codeCol ? String(row[codeCol] ?? "").trim() : "";
    const rawNumber = numberCol ? String(row[numberCol] ?? "").trim() : "";

    // Ignore completely blank rows
    if (!rawClue && !rawTerm && !rawCategory && !rawCode) {
      return;
    }

    if (!rawClue) {
      errors.push(`Row ${rowNum}: Question clue is empty.`);
    }
    if (!rawTerm) {
      errors.push(`Row ${rowNum}: Answer term is empty.`);
    }

    if (rawTerm) {
      const normalizedTerm = rawTerm.trim().replace(/\s+/g, " ").toUpperCase();
      if (seenTerms.has(normalizedTerm)) {
        const firstRow = seenTerms.get(normalizedTerm)!;
        errors.push(
          `Row ${rowNum}: Duplicate answer term "${rawTerm}" (matches "${normalizedTerm}" defined on Row ${firstRow}). All answers must be unique for Tombola ticket generation.`,
        );
      } else {
        seenTerms.set(normalizedTerm, rowNum);
      }
    }

    let itemNumber = index + 1;
    if (rawNumber) {
      const parsed = parseInt(rawNumber, 10);
      if (!isNaN(parsed) && parsed > 0) {
        itemNumber = parsed;
      }
    }

    questions.push({
      number: itemNumber,
      term: rawTerm,
      clue: rawClue,
      category: rawCategory || "General",
      codeSnippet: rawCode || null,
    });
  });

  if (questions.length !== 90) {
    errors.push(
      `The imported bank has ${questions.length} questions. Tech Tambola requires exactly 90 unique questions and answers for full 3×9 reference ticket generation.`,
    );
  }

  return {
    valid: errors.length === 0,
    totalRows: rawRows.length,
    validRows: questions.length,
    errors,
    warnings,
    questions: errors.length === 0 ? questions : [],
  };
}
