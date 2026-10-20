import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { generateSampleOrders, INVALID_SAMPLE_CSV, SAMPLE_HEADERS, sampleOrdersToCsv } from "../services/sample-data.js";

const dir = new URL("../../fixtures/", import.meta.url);
await mkdir(dir, { recursive: true });
const orders = generateSampleOrders(new Date());
await writeFile(new URL("sample-orders.csv", dir), sampleOrdersToCsv(orders));
await writeFile(new URL("sample-invalid.csv", dir), INVALID_SAMPLE_CSV);

const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet("Orders");
sheet.addRow(SAMPLE_HEADERS);
for (const line of sampleOrdersToCsv(orders).trim().split("\n").slice(1, 16)) {
  sheet.addRow(parseCsvLine(line));
}
await workbook.xlsx.writeFile(fileURLToPath(new URL("sample-orders.xlsx", dir)));

const invalidBook = new ExcelJS.Workbook();
const invalidSheet = invalidBook.addWorksheet("Invalid");
for (const line of INVALID_SAMPLE_CSV.trim().split("\n")) invalidSheet.addRow(parseCsvLine(line));
await invalidBook.xlsx.writeFile(fileURLToPath(new URL("sample-invalid.xlsx", dir)));

console.log(`Wrote ${orders.length} sample orders and invalid fixtures.`);

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else current += char;
  }
  cells.push(current);
  return cells;
}
