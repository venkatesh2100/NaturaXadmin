import type { RuleHit } from "./rules.js";

export type ExistingTaskSnapshot = {
  category: RuleHit["category"];
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED";
  reason: string;
  priority: RuleHit["priority"];
  actionRequired: string;
};

export type SyncAction =
  | { type: "create"; hit: RuleHit }
  | { type: "update"; hit: RuleHit }
  | { type: "skip_resolved"; hit: RuleHit }
  | { type: "auto_resolve"; category: RuleHit["category"] };

export function planTaskSync(existing: ExistingTaskSnapshot[], hits: RuleHit[]): SyncAction[] {
  const actions: SyncAction[] = [];
  const byCategory = new Map(existing.map((task) => [task.category, task]));

  for (const hit of hits) {
    const current = byCategory.get(hit.category);
    if (!current) {
      actions.push({ type: "create", hit });
      continue;
    }
    if (current.status === "RESOLVED") {
      actions.push({ type: "skip_resolved", hit });
      continue;
    }
    if (
      current.reason !== hit.reason ||
      current.priority !== hit.priority ||
      current.actionRequired !== hit.actionRequired
    ) {
      actions.push({ type: "update", hit });
    }
  }

  for (const task of existing) {
    if (task.status === "RESOLVED") continue;
    if (!hits.some((hit) => hit.category === task.category)) {
      actions.push({ type: "auto_resolve", category: task.category });
    }
  }

  return actions;
}
