const time = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  return time.format(new Date(value));
}

export function formatMoney(value: number): string {
  return money.format(value);
}

export function formatStatus(value: string): string {
  return value.replaceAll("_", " ").toLowerCase().replace(/^\w/, (char) => char.toUpperCase());
}
