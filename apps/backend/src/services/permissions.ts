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

export function assertCanChangeStatus(actor: Actor, task: { assignedEmployeeId: string | null }): void {
  if (actor.role === "ADMIN") return;
  if (!task.assignedEmployeeId || task.assignedEmployeeId !== actor.id) {
    throw new AppError(403, "FORBIDDEN", "You can update only tasks assigned to you.");
  }
}
