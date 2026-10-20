import { describe, expect, it } from "vitest";
import { parseFlexibleDate } from "./dates.js";

describe("date parsing", () => {
  it("interprets date-only values as the start of that day in IST", () => {
    const parsed = parseFlexibleDate("2026-10-20", { required: true });
    expect(parsed).toBeInstanceOf(Date);
    if (parsed instanceof Date) expect(parsed.toISOString()).toBe("2026-10-19T18:30:00.000Z");
  });

  it("rejects impossible calendar dates", () => {
    expect(parseFlexibleDate("31/02/2026", { required: true })).toBe("invalid");
    expect(parseFlexibleDate("", { required: false })).toBeNull();
  });

  it("keeps ISO timestamps as absolute instants", () => {
    const parsed = parseFlexibleDate("2026-10-20T12:00:00.000Z", { required: true });
    expect(parsed).toBeInstanceOf(Date);
    if (parsed instanceof Date) expect(parsed.toISOString()).toBe("2026-10-20T12:00:00.000Z");
  });
});
