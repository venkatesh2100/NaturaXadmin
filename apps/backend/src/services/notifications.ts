import { getEnv } from "../env.js";
import { log } from "../logger.js";
import { getPrisma } from "../lib/prisma.js";
import { buildDiscordPayload, sendDiscordNotification, shouldNotifyOnCreate } from "./discord.js";

const CATEGORY_LABELS: Record<string, string> = {
  UNCONFIRMED: "Unconfirmed order",
  DISPATCH_DELAY: "Dispatch delay",
  SHIPMENT_DELAY: "Shipment delay",
  FAILED_DELIVERY: "Failed delivery",
  HIGH_VALUE_OVERDUE: "High-value overdue",
};

export async function notifyTaskEvent(taskId: string, event: "created" | "overdue"): Promise<void> {
  const env = getEnv();
  const prisma = getPrisma();
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { order: true, assignedEmployee: true },
  });
  if (!task) return;
  if (event === "created" && !shouldNotifyOnCreate(task)) return;
  if (event === "overdue" && (task.status === "RESOLVED" || task.deadline.getTime() >= Date.now())) return;

  const dedupeKey = `${taskId}:${event}`;
  const existing = await prisma.notification.findUnique({ where: { dedupeKey } });
  if (existing && (existing.status === "SENT" || existing.attempts >= 5)) return;

  if (!env.DISCORD_NOTIFICATIONS_ENABLED || !env.DISCORD_WEBHOOK_URL) return;

  let notificationId = existing?.id;
  if (!notificationId) {
    try {
      const created = await prisma.notification.create({
        data: { dedupeKey, taskId, event, status: "PENDING" },
      });
      notificationId = created.id;
    } catch (error) {
      if (isUniqueViolation(error)) return;
      throw error;
    }
  }

  const result = await sendDiscordNotification({
    webhookUrl: env.DISCORD_WEBHOOK_URL,
    enabled: true,
    payload: buildDiscordPayload({
      title: event === "overdue" ? "Task is overdue" : "New high-priority exception",
      orderRef: task.order.orderId,
      category: CATEGORY_LABELS[task.category] ?? task.category,
      priority: task.priority,
      employee: task.assignedEmployee?.name ?? "Unassigned",
      deadline: task.deadline.toISOString(),
      action: task.actionRequired,
      url: `${env.WEB_ORIGIN}/tasks/${task.id}`,
    }),
  });

  if (result.ok && !("skipped" in result && result.skipped)) {
    await prisma.notification.update({
      where: { id: notificationId },
      data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, lastError: null },
    });
    return;
  }

  const error = result.ok ? "skipped" : result.error;
  await prisma.notification.update({
    where: { id: notificationId },
    data: { status: "FAILED", attempts: { increment: 1 }, lastError: error },
  });
  log("warn", "discord notification failed", { taskId, event, error });
}

export async function notifyTaskEvents(taskIds: string[], event: "created" | "overdue"): Promise<void> {
  for (const taskId of taskIds) {
    try {
      await notifyTaskEvent(taskId, event);
    } catch (error) {
      log("warn", "discord notification crashed", {
        taskId,
        event,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
}
