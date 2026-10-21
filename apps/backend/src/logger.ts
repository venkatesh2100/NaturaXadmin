type Level = "info" | "warn" | "error";

export function log(level: Level, message: string, extra?: Record<string, unknown>): void {
  const time = new Date().toISOString().replace("T", " ").slice(0, 19);
  const fields = extra
    ? Object.entries(extra)
        .filter(([, value]) => value !== undefined && value !== "")
        .map(([key, value]) => `${key}=${formatValue(value)}`)
        .join(" ")
    : "";
  const line = `${time} ${level.toUpperCase().padEnd(5)} ${message}${fields ? `  ${fields}` : ""}`;
  if (level === "error") console.error(line);
  else console.log(line);
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return /\s/.test(value) ? JSON.stringify(value) : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}
