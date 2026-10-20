import { describe, expect, it } from "vitest";
import { planTaskSync, type ExistingTaskSnapshot } from "./task-sync.js";
import type { RuleHit } from "./rules.js";

const hit: RuleHit = {
  category: "UNCONFIRMED",
  priority: "HIGH",
  reason: "Order has remained unconfirmed for more than 2 hours.",
  actionRequired: "Contact the customer and confirm the order.",
};

function existing(overrides: Partial<ExistingTaskSnapshot> = {}): ExistingTaskSnapshot {
  return { ...hit, status: "OPEN", ...overrides };
}

describe("task sync plan", () => {
  it("creates a task when the category is new", () => {
    expect(planTaskSync([], [hit])).toEqual([{ type: "create", hit }]);
  });

  it("does not create a duplicate when an open task already exists", () => {
    expect(planTaskSync([existing()], [hit])).toEqual([]);
  });

  it("does not reopen a resolved task", () => {
    expect(planTaskSync([existing({ status: "RESOLVED" })], [hit])).toEqual([{ type: "skip_resolved", hit }]);
  });

  it("auto-resolves an open task when the rule no longer applies", () => {
    expect(planTaskSync([existing()], [])).toEqual([{ type: "auto_resolve", category: "UNCONFIRMED" }]);
  });

  it("updates an open task when the reason changes", () => {
    const next = { ...hit, reason: "Updated reason" };
    expect(planTaskSync([existing()], [next])).toEqual([{ type: "update", hit: next }]);
  });
});
