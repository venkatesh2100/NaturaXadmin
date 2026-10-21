import { describe, expect, it } from "vitest";
import { AppError } from "../lib/errors.js";
import { assertCanChangeStatus, assertCanClaim, assertCanReassign, assertCanSetTaskStatus, assertCanUpdateOrder } from "./permissions.js";

const staff = { id: "staff-1", role: "STAFF" as const };
const admin = { id: "admin-1", role: "ADMIN" as const };

describe("task permissions", () => {
  it("allows only admins to reassign", () => {
    expect(() => assertCanReassign(staff)).toThrow(AppError);
    expect(() => assertCanReassign(admin)).not.toThrow();
  });

  it("lets employees pick tasks and keeps assignment with admins", () => {
    expect(() => assertCanClaim(staff)).not.toThrow();
    expect(() => assertCanClaim(admin)).toThrow(AppError);
  });

  it("lets an admin or the assigned employee update an order", () => {
    const order = {
      assignedEmployeeId: "staff-2",
      tasks: [{ assignedEmployeeId: "staff-1" }],
    };
    expect(() => assertCanUpdateOrder(admin, order)).not.toThrow();
    expect(() => assertCanUpdateOrder(staff, order)).not.toThrow();
    expect(() => assertCanUpdateOrder(staff, { assignedEmployeeId: null, tasks: [] })).toThrow(AppError);
  });

  it("lets only an admin change Open, In progress, or Resolved", () => {
    expect(() => assertCanSetTaskStatus(admin)).not.toThrow();
    expect(() => assertCanSetTaskStatus(staff)).toThrow(AppError);
  });

  it("allows staff to update only their own tasks", () => {
    expect(() => assertCanChangeStatus(staff, { assignedEmployeeId: "staff-1" })).not.toThrow();
    expect(() => assertCanChangeStatus(staff, { assignedEmployeeId: "staff-2" })).toThrow(AppError);
    expect(() => assertCanChangeStatus(staff, { assignedEmployeeId: null })).toThrow(AppError);
    expect(() => assertCanChangeStatus(admin, { assignedEmployeeId: "staff-2" })).not.toThrow();
  });
});
