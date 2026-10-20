import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { api } from "../api";
import type { Category, Priority, TaskStatus, User } from "../types";
import { CATEGORY_LABELS } from "../types";

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
  sort: "deadline",
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
  showStatus = true,
  showSearch = true,
}: {
  filters: FilterState;
  setFilter: (key: keyof FilterState, value: string) => void;
  showStatus?: boolean;
  showSearch?: boolean;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState(filters.search);

  useEffect(() => {
    api<{ users: User[] }>("/users")
      .then((result) => setUsers(result.users))
      .catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== filters.search) setFilter("search", search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, filters.search, setFilter]);

  return (
    <div className="mb-5 grid gap-3 rounded-xl border border-line bg-white p-3 md:grid-cols-3 xl:grid-cols-6">
      <label className="text-xs text-stone-500">
        From
        <input className="mt-1 w-full rounded-md border border-line px-2 py-1.5 text-sm" type="date" value={filters.from} onChange={(event) => setFilter("from", event.target.value)} />
      </label>
      <label className="text-xs text-stone-500">
        To
        <input className="mt-1 w-full rounded-md border border-line px-2 py-1.5 text-sm" type="date" value={filters.to} onChange={(event) => setFilter("to", event.target.value)} />
      </label>
      <label className="text-xs text-stone-500">
        Exception
        <select className="mt-1 w-full rounded-md border border-line px-2 py-1.5 text-sm" value={filters.category} onChange={(event) => setFilter("category", event.target.value)}>
          <option value="">All</option>
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value as Category}>{label}</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-stone-500">
        Employee
        <select className="mt-1 w-full rounded-md border border-line px-2 py-1.5 text-sm" value={filters.employeeId} onChange={(event) => setFilter("employeeId", event.target.value)}>
          <option value="">Everyone</option>
          <option value="unassigned">Unassigned</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>{user.name}</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-stone-500">
        Priority
        <select className="mt-1 w-full rounded-md border border-line px-2 py-1.5 text-sm" value={filters.priority} onChange={(event) => setFilter("priority", event.target.value)}>
          <option value="">All</option>
          {(["HIGH", "MEDIUM", "LOW"] as Priority[]).map((priority) => (
            <option key={priority} value={priority}>{priority}</option>
          ))}
        </select>
      </label>
      {showStatus && (
        <label className="text-xs text-stone-500">
          Status
          <select className="mt-1 w-full rounded-md border border-line px-2 py-1.5 text-sm" value={filters.status} onChange={(event) => setFilter("status", event.target.value)}>
            <option value="">All</option>
            {(["OPEN", "IN_PROGRESS", "RESOLVED"] as TaskStatus[]).map((status) => (
              <option key={status} value={status}>{status === "IN_PROGRESS" ? "In progress" : status[0] + status.slice(1).toLowerCase()}</option>
            ))}
          </select>
        </label>
      )}
      {showSearch && (
        <label className="text-xs text-stone-500 md:col-span-2">
          Search order, customer, or phone
          <input className="mt-1 w-full rounded-md border border-line px-2 py-1.5 text-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="VN-1001" />
        </label>
      )}
    </div>
  );
}
