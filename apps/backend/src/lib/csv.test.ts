import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv.js";

describe("csv export", () => {
  it("escapes quotes and neutralises spreadsheet formulas", () => {
    expect(csvCell(`=HYPERLINK("http://evil")`)).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell("+cmd")).toBe("'+cmd");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@sum")).toBe("'@sum");
    expect(toCsv(["Order ID", "Note"], [["VN-1", "ok"]])).toBe("Order ID,Note\nVN-1,ok\n");
  });
});
