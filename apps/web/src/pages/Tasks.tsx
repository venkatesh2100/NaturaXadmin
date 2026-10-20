import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "../api";
import { useAuth } from "../auth";
import { Filters, toApiQuery, useFilters } from "../components/Filters";
import { Banner, Empty, PageTitle, PriorityMark, StatusText } from "../components/Shell";
import { formatWhen } from "../format";
import { CATEGORY_LABELS, type Page, type Task } from "../types";

export function TasksPage() {
  const { user } = useAuth();
  const { filters, setFilter, setFilters } = useFilters();
  const [page, setPage] = useState<Page<Task> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState("");
  const query = toApiQuery(filters);

  async function claim(taskId: string) {
    setError("");
    setClaimingId(taskId);
    try {
      await api(`/tasks/${taskId}/claim`, { method: "POST" });
      const next = await api<Page<Task>>(`/tasks?${query}`);
      setPage(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not pick this task.");
    } finally {
      setClaimingId("");
    }
  }

  useEffect(() => {
    setLoading(true);
    setError("");
    api<Page<Task>>(`/tasks?${query}`)
      .then(setPage)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [query]);

  const totalPages = page ? Math.max(1, Math.ceil(page.meta.total / page.meta.pageSize)) : 1;

  return (
    <div>
      <PageTitle
        title="Task queue"
        detail={user?.role === "ADMIN"
          ? "Assign each task to an employee. Employees cannot assign tasks to anyone else."
          : "Pick an unassigned task, then update its order status. You can update only tasks assigned to you."}
      />
      <Filters filters={filters} setFilter={setFilter} />
      {error && <Banner>{error}</Banner>}
      {loading && <p className="text-sm text-stone-500">Loading tasks…</p>}
      {!loading && page && page.data.length === 0 && <Empty>No tasks match these filters.</Empty>}
      {!loading && page && page.data.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-line bg-white">
            <table className="min-w-[960px] w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-3 py-2"><Sort label="Order" active={filters.sort === "customer"} onClick={() => toggleSort(filters, setFilters, "customer")} /></th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Phone</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2"><Sort label="Priority" active={filters.sort === "priority"} onClick={() => toggleSort(filters, setFilters, "priority")} /></th>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2"><Sort label="Deadline" active={filters.sort === "deadline"} onClick={() => toggleSort(filters, setFilters, "deadline")} /></th>
                  <th className="px-3 py-2">Status</th>
                  {user?.role !== "ADMIN" && <th className="px-3 py-2">Pick</th>}
                </tr>
              </thead>
              <tbody>
                {page.data.map((task) => (
                  <tr key={task.id} className="border-b border-line align-top last:border-0">
                    <td className="px-3 py-3 font-medium"><Link className="text-brand" to={`/tasks/${task.id}`}>{task.order.orderId}</Link><span className="mt-1 block text-xs text-stone-500">{CATEGORY_LABELS[task.category]}</span></td>
                    <td className="px-3 py-3">{task.order.customerName}</td>
                    <td className="px-3 py-3 tabular">{task.order.phone}</td>
                    <td className="px-3 py-3 max-w-xs">{task.reason}</td>
                    <td className="px-3 py-3"><PriorityMark priority={task.priority} /></td>
                    <td className="px-3 py-3">{task.assignedEmployee?.name ?? "Unassigned"}</td>
                    <td className="px-3 py-3 max-w-xs">{task.actionRequired}</td>
                    <td className="px-3 py-3">{formatWhen(task.deadline)}{task.overdue && <span className="mt-1 block text-xs text-red-700">Overdue</span>}</td>
                    <td className="px-3 py-3"><StatusText status={task.status} /></td>
                    {user?.role !== "ADMIN" && (
                      <td className="px-3 py-3">
                        {!task.assignedEmployee && (
                          <button
                            className="rounded-md bg-moss px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                            disabled={claimingId === task.id}
                            onClick={() => void claim(task.id)}
                          >
                            {claimingId === task.id ? "Picking…" : "Pick"}
                          </button>
                        )}
                        {task.assignedEmployee?.id === user?.id && <span className="text-xs text-stone-500">Yours</span>}
                        {task.assignedEmployee && task.assignedEmployee.id !== user?.id && <span className="text-xs text-stone-400">Assigned</span>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm">
            <p className="text-stone-500">{page.meta.total} tasks</p>
            <div className="flex gap-2">
              <button className="rounded-md border border-line bg-white px-3 py-1 disabled:opacity-40" disabled={Number(filters.page) <= 1} onClick={() => setFilter("page", String(Number(filters.page) - 1))}>Previous</button>
              <span className="tabular py-1">{filters.page} / {totalPages}</span>
              <button className="rounded-md border border-line bg-white px-3 py-1 disabled:opacity-40" disabled={Number(filters.page) >= totalPages} onClick={() => setFilter("page", String(Number(filters.page) + 1))}>Next</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Sort({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={active ? "text-ink" : ""} onClick={onClick}>
      {label}
    </button>
  );
}

function toggleSort(
  filters: { sort: string; order: string },
  setFilters: (partial: { sort?: string; order?: string }) => void,
  sort: string,
) {
  if (filters.sort === sort) setFilters({ order: filters.order === "asc" ? "desc" : "asc" });
  else setFilters({ sort, order: "asc" });
}
