import type { Role } from "../generated/prisma/client.js";
import { AppError } from "../lib/errors.js";

export type Actor = { id: string; role: Role };

export function assertCanReassign(actor: Actor): void {
  if (actor.role !== "ADMIN") {
    throw new AppError(403, "FORBIDDEN", "Only an admin can assign tasks.");
  }
}

export function assertCanClaim(actor: Actor): void {
  if (actor.role === "ADMIN") {
    throw new AppError(403, "FORBIDDEN", "Admins assign tasks. Employees pick unassigned tasks.");
  }
}

export function assertCanSetTaskStatus(actor: Actor): void {
  if (actor.role !== "ADMIN") {
    throw new AppError(403, "FORBIDDEN", "Only an admin can change Open, In progress, or Resolved.");
  }
}

export function assertCanChangeStatus(actor: Actor, task: { assignedEmployeeId: string | null }): void {
  if (actor.role === "ADMIN") return;
  if (!task.assignedEmployeeId || task.assignedEmployeeId !== actor.id) {
    throw new AppError(403, "FORBIDDEN", "You can update only tasks assigned to you.");
  }
}

export function canUpdateOrder(
  actor: Actor,
  order: { assignedEmployeeId: string | null; tasks: { assignedEmployeeId: string | null }[] },
): boolean {
  if (actor.role === "ADMIN") return true;
  if (order.assignedEmployeeId === actor.id) return true;
  return order.tasks.some((task) => task.assignedEmployeeId === actor.id);
}

export function assertCanUpdateOrder(
  actor: Actor,
  order: { assignedEmployeeId: string | null; tasks: { assignedEmployeeId: string | null }[] },
): void {
  if (!canUpdateOrder(actor, order)) {
    throw new AppError(403, "FORBIDDEN", "You can update only orders assigned to you.");
  }
}
