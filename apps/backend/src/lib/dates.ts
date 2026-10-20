const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export function istDate(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  const utc = Date.UTC(year, month - 1, day, hour, minute, second) - IST_OFFSET_MS;
  const date = new Date(utc);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  if (get("year") !== year || get("month") !== month || get("day") !== day) return null;
  if (get("hour") !== hour || get("minute") !== minute || get("second") !== second) return null;
  return date;
}

export type ParsedDate = Date | null;

export function parseFlexibleDate(value: unknown, options: { required: boolean }): ParsedDate | "invalid" {
  if (value == null || value === "") {
    return options.required ? "invalid" : null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "invalid" : value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = excelSerialToDate(value);
    return parsed ?? "invalid";
  }
  const text = String(value).trim();
  if (!text) return options.required ? "invalid" : null;

  if (/^\d{4}-\d{2}-\d{2}T/.test(text) || /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(text)) {
    const iso = new Date(text.includes(" ") && !text.includes("T") ? text.replace(" ", "T") : text);
    return Number.isNaN(iso.getTime()) ? "invalid" : iso;
  }

  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (ymd) {
    const date = istDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
    return date ?? "invalid";
  }

  const dmy = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (dmy) {
    const date = istDate(
      Number(dmy[3]),
      Number(dmy[2]),
      Number(dmy[1]),
      dmy[4] ? Number(dmy[4]) : 0,
      dmy[5] ? Number(dmy[5]) : 0,
      dmy[6] ? Number(dmy[6]) : 0,
    );
    return date ?? "invalid";
  }

  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? "invalid" : fallback;
}

function excelSerialToDate(serial: number): Date | null {
  if (serial <= 0 || serial > 100000) return null;
  const whole = Math.floor(serial);
  const fraction = serial - whole;
  const utcDays = Date.UTC(1899, 11, 30) + whole * 86_400_000;
  const ms = Math.round(fraction * 86_400_000);
  const date = new Date(utcDays + ms);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isAfter(left: Date, right: Date): boolean {
  return left.getTime() > right.getTime();
}

export function startOfTodayIst(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return istDate(get("year"), get("month"), get("day")) ?? now;
}
