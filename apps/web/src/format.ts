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

export function toDateTimeLocal(value: string): string {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatStatus(value: string): string {
  return value.replaceAll("_", " ").toLowerCase().replace(/^\w/, (char) => char.toUpperCase());
}

export function kolkataDate(offsetDays = 0): string {
  const shifted = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(shifted);
}

const ACTION_LABELS: Record<string, string> = {
  TASK_CREATED: "Task created",
  TASK_UPDATED: "Task updated",
  AUTO_RESOLVED: "Closed automatically",
  REASSIGNED: "Assignment changed",
  CLAIMED: "Picked up",
  ORDER_STATUS_UPDATED: "Order status changed",
  DEADLINE_CHANGED: "Deadline changed",
  STATUS_CHANGED: "Task status changed",
};

export function formatAction(action: string): string {
  return ACTION_LABELS[action] ?? action.replaceAll("_", " ").toLowerCase().replace(/^\w/, (char) => char.toUpperCase());
}
