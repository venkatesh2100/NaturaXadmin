import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";
import { AppError } from "../lib/errors.js";
import { mapHeaders, validateMappedRows, type RowIssue, type ValidOrder } from "./validate-row.js";

const MAX_ROWS = 5000;

export type ParsedTable = {
  valid: ValidOrder[];
  issues: RowIssue[];
  totalRows: number;
  missingColumns: string[];
};

export async function parseOrderFile(filename: string, buffer: Buffer): Promise<ParsedTable> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) return parseTable(readCsv(buffer));
  if (lower.endsWith(".xlsx")) return parseTable(await readXlsx(buffer));
  throw new AppError(400, "UNSUPPORTED_FILE", "Upload a .csv or .xlsx file.");
}

function readCsv(buffer: Buffer): Array<{ rowNumber: number; raw: Record<string, string> }> {
  let records: Record<string, unknown>[];
  try {
    records = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      relax_column_count: true,
      trim: true,
    }) as Record<string, unknown>[];
  } catch {
    throw new AppError(400, "UNREADABLE_FILE", "The CSV file could not be parsed.");
  }
  return records.map((record, index) => ({
    rowNumber: index + 2,
    raw: stringifyRecord(record),
  }));
}

async function readXlsx(buffer: Buffer): Promise<Array<{ rowNumber: number; raw: Record<string, string> }>> {
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new AppError(400, "UNREADABLE_FILE", "The Excel file is not a valid .xlsx workbook.");
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw new AppError(400, "UNREADABLE_FILE", "The Excel file could not be parsed.");
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new AppError(400, "UNREADABLE_FILE", "The workbook has no sheets.");
  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
    headers[col - 1] = String(cell.value ?? "").trim();
  });
  const rows: Array<{ rowNumber: number; raw: Record<string, string> }> = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const raw: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((header, index) => {
      if (!header) return;
      const value = cellToString(row.getCell(index + 1).value);
      if (value) hasValue = true;
      raw[header] = value;
    });
    if (hasValue) rows.push({ rowNumber, raw });
  });
  return rows;
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value && value.text) return String(value.text);
    if ("result" in value && value.result != null) return cellToString(value.result as ExcelJS.CellValue);
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
  }
  return String(value).trim();
}

function stringifyRecord(record: Record<string, unknown>): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    raw[key] = value == null ? "" : String(value).trim();
  }
  return raw;
}

function parseTable(rows: Array<{ rowNumber: number; raw: Record<string, string> }>): ParsedTable {
  if (rows.length === 0) throw new AppError(400, "EMPTY_FILE", "The file has no data rows.");
  if (rows.length > MAX_ROWS) {
    throw new AppError(400, "TOO_MANY_ROWS", `Upload at most ${MAX_ROWS} rows at a time.`);
  }
  const headers = Object.keys(rows[0]?.raw ?? {});
  const { canonical, missing } = mapHeaders(headers);
  if (missing.length > 0) {
    return { valid: [], issues: [], totalRows: rows.length, missingColumns: missing };
  }
  const { valid, issues } = validateMappedRows(rows, canonical);
  return { valid, issues, totalRows: rows.length, missingColumns: [] };
}
