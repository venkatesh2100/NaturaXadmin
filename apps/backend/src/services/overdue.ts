import { getPrisma } from "../lib/prisma.js";
import { notifyTaskEvents } from "./notifications.js";

export async function runOverdueCheck(): Promise<{ checked: number; notified: number }> {
  const prisma = getPrisma();
  const now = new Date();
  const overdue = await prisma.task.findMany({
    where: {
      status: { not: "RESOLVED" },
      deadline: { lt: now },
      notifications: { none: { event: "overdue", status: "SENT" } },
    },
    select: { id: true },
    take: 100,
    orderBy: { deadline: "asc" },
  });
  const failed = await prisma.notification.findMany({
    where: { status: "FAILED", attempts: { lt: 5 }, event: "created" },
    select: { taskId: true },
    take: 50,
  });
  const overdueIds = overdue.map((task) => task.id);
  await notifyTaskEvents(overdueIds, "overdue");
  await notifyTaskEvents(
    failed.flatMap((item) => (item.taskId ? [item.taskId] : [])),
    "created",
  );
  return { checked: overdue.length, notified: overdue.length };
}
