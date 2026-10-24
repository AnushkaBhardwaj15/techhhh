import { describe, expect, it } from "bun:test";
import * as XLSX from "xlsx";
import { parseAndValidateBankSpreadsheet } from "./excel-import.ts";

function createMockWorkbook(data: Record<string, unknown>[]): Buffer {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("parseAndValidateBankSpreadsheet", () => {
  it("parses valid questions and answers from xlsx with standard headers", () => {
    const rows = Array.from({ length: 90 }, (_, i) => ({
      Number: i + 1,
      Question: `What is technology #${i + 1}?`,
      Answer: `TECH_${i + 1}`,
      Category: "DevOps",
      "Code Snippet": i % 5 === 0 ? "docker run hello-world" : "",
    }));

    const buffer = createMockWorkbook(rows);
    const result = parseAndValidateBankSpreadsheet(buffer);

    expect(result.valid).toBe(true);
    expect(result.totalRows).toBe(90);
    expect(result.errors).toHaveLength(0);
    expect(result.questions).toHaveLength(90);
    expect(result.questions[0]).toEqual({
      number: 1,
      term: "TECH_1",
      clue: "What is technology #1?",
      category: "DevOps",
      codeSnippet: "docker run hello-world",
    });
  });

  it("handles alternative header names case-insensitively", () => {
    const rows = Array.from({ length: 90 }, (_, i) => ({
      q: `Clue for term ${i + 1}`,
      term: `TERM_${i + 1}`,
      domain: "Cloud",
      snippet: "",
    }));

    const buffer = createMockWorkbook(rows);
    const result = parseAndValidateBankSpreadsheet(buffer);

    expect(result.valid).toBe(true);
    expect(result.questions).toHaveLength(90);
    expect(result.questions[0]!.clue).toBe("Clue for term 1");
    expect(result.questions[0]!.term).toBe("TERM_1");
  });

  it("reports error when bank does not have exactly 90 questions", () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({
      Question: `Clue ${i + 1}`,
      Answer: `TERM_${i + 1}`,
    }));
    const buffer = createMockWorkbook(rows);
    const result = parseAndValidateBankSpreadsheet(buffer);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("requires exactly 90 unique questions"))).toBe(true);
  });

  it("detects and reports duplicate answer terms with exact row numbers", () => {
    const rows = [
      { Question: "Clue 1", Answer: "DOCKER" },
      { Question: "Clue 2", Answer: "KUBERNETES" },
      { Question: "Clue 3", Answer: "docker" }, // Duplicate in row 4 (1-based index)
    ];

    const buffer = createMockWorkbook(rows);
    const result = parseAndValidateBankSpreadsheet(buffer);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Duplicate answer term") && e.includes("DOCKER"))).toBe(
      true,
    );
  });

  it("detects missing question or answer fields", () => {
    const rows = [
      { Question: "Clue 1", Answer: "" },
      { Question: "", Answer: "POSTGRES" },
    ];

    const buffer = createMockWorkbook(rows);
    const result = parseAndValidateBankSpreadsheet(buffer);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Answer term is empty"))).toBe(true);
    expect(result.errors.some((e) => e.includes("Question clue is empty"))).toBe(true);
  });

  it("rejects spreadsheet when required columns are completely missing", () => {
    const rows = [{ Foo: "Bar", Baz: 123 }];
    const buffer = createMockWorkbook(rows);
    const result = parseAndValidateBankSpreadsheet(buffer);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Missing question column"))).toBe(true);
    expect(result.errors.some((e) => e.includes("Missing answer column"))).toBe(true);
  });
});
