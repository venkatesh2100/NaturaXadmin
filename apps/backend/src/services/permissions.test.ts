import { describe, expect, it } from "vitest";
import { AppError } from "../lib/errors.js";
import { assertCanChangeStatus, assertCanClaim, assertCanReassign } from "./permissions.js";

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

  it("allows staff to update only their own tasks", () => {
    expect(() => assertCanChangeStatus(staff, { assignedEmployeeId: "staff-1" })).not.toThrow();
    expect(() => assertCanChangeStatus(staff, { assignedEmployeeId: "staff-2" })).toThrow(AppError);
    expect(() => assertCanChangeStatus(staff, { assignedEmployeeId: null })).toThrow(AppError);
    expect(() => assertCanChangeStatus(admin, { assignedEmployeeId: "staff-2" })).not.toThrow();
  });
});
