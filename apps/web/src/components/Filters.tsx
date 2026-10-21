import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { api } from "../api";
import { kolkataDate } from "../format";
import type { Category, Priority, TaskStatus, User } from "../types";
import { CATEGORY_HELP, CATEGORY_LABELS, PRIORITY_LABELS, STATUS_LABELS } from "../types";

export type FilterState = {
  from: string;
  to: string;
  category: string;
  employeeId: string;
  priority: string;
  status: string;
  search: string;
  sort: string;
  order: string;
  page: string;
};

const empty: FilterState = {
  from: "",
  to: "",
  category: "",
  employeeId: "",
  priority: "",
  status: "",
  search: "",
  sort: "priority",
  order: "asc",
  page: "1",
};

export function useFilters() {
  const [params, setParams] = useSearchParams();
  const filters: FilterState = { ...empty };
  for (const key of Object.keys(empty) as (keyof FilterState)[]) {
    filters[key] = params.get(key) ?? empty[key];
  }

  const setFilter = useCallback((key: keyof FilterState, value: string) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (!value) next.delete(key);
      else next.set(key, value);
      if (key !== "page") next.delete("page");
      return next;
    }, { replace: true });
  }, [setParams]);

  const setFilters = useCallback((partial: Partial<FilterState>) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(partial)) {
        if (!value) next.delete(key);
        else next.set(key, value);
      }
      if (!("page" in partial)) next.delete("page");
      return next;
    }, { replace: true });
  }, [setParams]);

  return { filters, setFilter, setFilters };
}

export function toApiQuery(filters: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (!value) continue;
    if (key === "from") params.set(key, `${value}T00:00:00+05:30`);
    else if (key === "to") params.set(key, `${value}T23:59:59.999+05:30`);
    else params.set(key, value);
  }
  return params.toString();
}

export function Filters({
  filters,
  setFilter,
  setFilters,
  showStatus = true,
  showSearch = true,
  showEmployee = true,
}: {
  filters: FilterState;
  setFilter: (key: keyof FilterState, value: string) => void;
  setFilters: (partial: Partial<FilterState>) => void;
  showStatus?: boolean;
  showSearch?: boolean;
  showEmployee?: boolean;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState(filters.search);
  const searchFromUrl = useRef(false);

  useEffect(() => {
    api<{ users: User[] }>("/users")
      .then((result) => setUsers(result.users))
      .catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    searchFromUrl.current = true;
    setSearch(filters.search);
  }, [filters.search]);

  useEffect(() => {
    if (searchFromUrl.current) {
      searchFromUrl.current = false;
      return;
    }
    if (search === filters.search) return;
    const timer = setTimeout(() => setFilter("search", search), 300);
    return () => clearTimeout(timer);
  }, [search, filters.search, setFilter]);

  function applyRange(days: number) {
    setFilters({ from: kolkataDate(1 - days), to: kolkataDate(0) });
  }

  const control = "mt-1 h-8 rounded-md border border-line";

  return (
    <div className="mb-4 rounded-[14px] border border-line bg-white px-3 py-2">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="From">
          <input className={control} type="date" aria-label="Order date from" value={filters.from} onChange={(event) => setFilter("from", event.target.value)} />
        </Field>
        <Field label="To">
          <input className={control} type="date" aria-label="Order date to" value={filters.to} onChange={(event) => setFilter("to", event.target.value)} />
        </Field>
        <div className="flex gap-1 pb-px">
          <button type="button" className={chip} onClick={() => applyRange(1)}>Today</button>
          <button type="button" className={chip} onClick={() => applyRange(7)}>7 days</button>
          <button type="button" className={chip} onClick={() => applyRange(30)}>30 days</button>
        </div>
        <Field label="Reason">
          <select className={`${control} w-40`} title={filters.category ? CATEGORY_HELP[filters.category as Category] : "Why the task exists"} value={filters.category} onChange={(event) => setFilter("category", event.target.value)}>
            <option value="">All</option>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value as Category} title={CATEGORY_HELP[value as Category]}>{label}</option>
            ))}
          </select>
        </Field>
        {showEmployee && (
          <Field label="Person">
            <select className={`${control} w-40`} value={filters.employeeId} onChange={(event) => setFilter("employeeId", event.target.value)}>
              <option value="">Everyone</option>
              <option value="unassigned">Unassigned</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Priority">
          <select className={`${control} w-28`} value={filters.priority} onChange={(event) => setFilter("priority", event.target.value)}>
            <option value="">All</option>
            {(["HIGH", "MEDIUM", "LOW"] as Priority[]).map((priority) => (
              <option key={priority} value={priority}>{PRIORITY_LABELS[priority]}</option>
            ))}
          </select>
        </Field>
        {showStatus && (
          <Field label="Status">
            <select className={`${control} w-32`} value={filters.status} onChange={(event) => setFilter("status", event.target.value)}>
              <option value="">All</option>
              {(["OPEN", "IN_PROGRESS", "RESOLVED"] as TaskStatus[]).map((status) => (
                <option key={status} value={status}>{STATUS_LABELS[status]}</option>
              ))}
            </select>
          </Field>
        )}
        {showSearch && (
          <Field label="Search">
            <input className={`${control} w-44`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Order, name, phone" />
          </Field>
        )}
        <button type="button" className={`${chip} mb-px`} onClick={() => setFilters({ from: "", to: "", category: "", employeeId: "", priority: "", status: "", search: "" })}>Clear</button>
      </div>
    </div>
  );
}

const chip = "h-8 rounded-[9px] border border-line bg-white px-2.5 text-xs text-ink hover:bg-paper";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
      {label}
      {children}
    </label>
  );
}
