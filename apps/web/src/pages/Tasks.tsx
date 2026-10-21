import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "../api";
import { useAuth } from "../store";
import { Filters, toApiQuery, useFilters } from "../components/Filters";
import { Banner, Empty, PageTitle, PriorityMark, buttonClass } from "../components/Shell";
import Spinner, { Loading } from "../components/Spinner";
import { formatStatus, formatWhen, toDateTimeLocal } from "../format";
import { CATEGORY_LABELS, ORDER_STATUS_OPTIONS, STATUS_LABELS, type Page, type Task, type TaskStatus, type User } from "../types";

const fieldClass = "w-full max-w-[9.5rem] rounded-md border border-line";

export function TasksPage({ mine = false }: { mine?: boolean }) {
  const user = useAuth((state) => state.user);
  const { filters, setFilter, setFilters } = useFilters();
  const [page, setPage] = useState<Page<Task> | null>(null);
  const [employees, setEmployees] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState("");
  const scoped = mine && user ? { ...filters, employeeId: user.id } : filters;
  const query = toApiQuery(scoped);

  function patchTask(taskId: string, change: (task: Task) => Task, request: () => Promise<unknown>, fallback: string) {
    const previous = page;
    setError("");
    setPage((current) => (current ? { ...current, data: current.data.map((task) => (task.id === taskId ? change(task) : task)) } : current));
    void request().catch((err: unknown) => {
      setPage(previous);
      setError(err instanceof Error ? err.message : fallback);
    });
  }

  function claim(taskId: string) {
    if (!user) return;
    setClaimingId(taskId);
    patchTask(
      taskId,
      (task) => ({ ...task, assignedEmployee: { id: user.id, name: user.name, email: user.email } }),
      () => api(`/tasks/${taskId}/claim`, { method: "POST" }).finally(() => setClaimingId("")),
      "Could not pick this task.",
    );
  }

  useEffect(() => {
    if (mine && !user) return;
    setLoading(true);
    setError("");
    api<Page<Task>>(`/tasks?${query}`)
      .then(setPage)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [query, mine, user]);

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    api<{ users: User[] }>("/users")
      .then((result) => setEmployees(result.users.filter((person) => person.role === "STAFF")))
      .catch(() => setEmployees([]));
  }, [user?.role]);

  const totalPages = page ? Math.max(1, Math.ceil(page.meta.total / page.meta.pageSize)) : 1;

  return (
    <div>
      <PageTitle
        title={mine ? "My tasks" : "Task queue"}
        detail={mine
          ? "These are assigned to you. Change the order status after you contact the customer, and move the deadline if you need more time. An admin marks the task Open, In progress, or Resolved."
          : user?.role === "ADMIN"
            ? "Assign a person, then set the task to Open, In progress, or Resolved. If you hand an overdue task to someone else, it becomes high priority."
            : "Take an unassigned task with Pick. You can change order status and deadline only on tasks that are yours."}
      />
      <Filters filters={filters} setFilter={setFilter} setFilters={setFilters} showEmployee={!mine} />
      {error && <Banner>{error}</Banner>}
      {loading && <Loading />}
      {!loading && page && page.data.length === 0 && <Empty>{mine ? "No tasks are assigned to you." : "No tasks match these filters."}</Empty>}
      {!loading && page && page.data.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-line bg-white">
            <table className="min-w-[980px] w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-3 py-2"><Sort label="Order" active={filters.sort === "customer"} order={filters.order} onClick={() => toggleSort(filters, setFilters, "customer")} /></th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Phone</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2"><Sort label="Priority" active={filters.sort === "priority"} order={filters.order} onClick={() => toggleSort(filters, setFilters, "priority")} /></th>
                  <th className="px-3 py-2">Assigned to</th>
                  <th className="px-3 py-2">Order status</th>
                  <th className="px-3 py-2"><Sort label="Deadline" active={filters.sort === "deadline"} order={filters.order} onClick={() => toggleSort(filters, setFilters, "deadline")} /></th>
                  <th className="px-3 py-2">Task status</th>
                  {!mine && user?.role !== "ADMIN" && <th className="px-3 py-2">Pick</th>}
                </tr>
              </thead>
              <tbody>
                {page.data.map((task) => {
                  const canUpdate = user?.role === "ADMIN" || user?.id === task.assignedEmployee?.id;
                  return (
                    <tr key={task.id} className="border-b border-line align-middle last:border-0">
                      <td className="px-3 py-2 font-medium"><Link className="text-brand" to={`/tasks/${task.id}`}>{task.order.orderId}</Link><span className="block text-[11px] text-muted">{CATEGORY_LABELS[task.category]}</span></td>
                      <td className="px-3 py-2">{task.order.customerName}</td>
                      <td className="px-3 py-2 tabular text-xs">{task.order.phone}</td>
                      <td className="max-w-[14rem] px-3 py-2"><p className="truncate text-xs text-secondary" title={task.reason}>{task.reason}</p></td>
                      <td className="px-3 py-2"><PriorityMark priority={task.priority} /></td>
                      <td className="px-3 py-2">
                        {user?.role === "ADMIN" ? (
                          <select className={fieldClass} value={task.assignedEmployee?.id ?? ""} onChange={(event) => {
                            const employeeId = event.target.value;
                            const person = employees.find((employee) => employee.id === employeeId);
                            const overdueHandoff = Boolean(person && task.overdue && task.assignedEmployee && task.assignedEmployee.id !== person.id);
                            patchTask(task.id, (current) => ({
                              ...current,
                              assignedEmployee: person ? { id: person.id, name: person.name, email: person.email } : null,
                              status: person ? current.status : "OPEN",
                              priority: overdueHandoff ? "HIGH" : current.priority,
                            }), () => api(`/tasks/${task.id}/assignment`, { method: "PATCH", body: JSON.stringify({ employeeId: employeeId || null }) }), "Could not assign this task.");
                          }}>
                            <option value="">Unassigned</option>
                            {employees.map((person) => (
                              <option key={person.id} value={person.id}>{person.name}</option>
                            ))}
                          </select>
                        ) : (
                          task.assignedEmployee?.name ?? "Unassigned"
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {canUpdate ? (
                          <select className={fieldClass} value={task.order.fulfillmentStatus} onChange={(event) => patchTask(task.id, (current) => ({ ...current, order: { ...current.order, fulfillmentStatus: event.target.value as Task["order"]["fulfillmentStatus"] } }), () => api(`/tasks/${task.id}/order-status`, { method: "PATCH", body: JSON.stringify({ status: event.target.value }) }), "Could not update order status.")}>
                            {ORDER_STATUS_OPTIONS.map((status) => (
                              <option key={status} value={status}>{formatStatus(status)}</option>
                            ))}
                          </select>
                        ) : formatStatus(task.order.fulfillmentStatus)}
                      </td>
                      <td className="px-3 py-2">
                        {canUpdate ? (
                          <input className={`${fieldClass} max-w-[13.25rem]`} type="datetime-local" value={toDateTimeLocal(task.deadline)} onChange={(event) => {
                            const deadline = new Date(event.target.value).toISOString();
                            patchTask(task.id, (current) => ({ ...current, deadline, overdue: new Date(deadline).getTime() < Date.now() }), () => api(`/tasks/${task.id}/deadline`, { method: "PATCH", body: JSON.stringify({ deadline }) }), "Could not update the deadline.");
                          }} />
                        ) : (
                          <span>{formatWhen(task.deadline)}{task.overdue && <span className="mt-1 block text-xs text-red-700">Overdue</span>}</span>
                        )}
                        {canUpdate && task.overdue && <span className="mt-1 block text-xs text-red-700">Overdue</span>}
                      </td>
                      <td className="px-3 py-2">
                        {user?.role === "ADMIN" && task.assignedEmployee ? (
                          <select className={fieldClass} value={task.status} onChange={(event) => {
                            const status = event.target.value as TaskStatus;
                            patchTask(task.id, (current) => ({ ...current, status }), () => api(`/tasks/${task.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }), "Could not update task status.");
                          }}>
                            {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((status) => (
                              <option key={status} value={status}>{STATUS_LABELS[status]}</option>
                            ))}
                          </select>
                        ) : task.assignedEmployee ? STATUS_LABELS[task.status] : "Open"}
                      </td>
                      {!mine && user?.role !== "ADMIN" && (
                        <td className="px-3 py-2">
                          {!task.assignedEmployee && (
                            <button className={`${buttonClass("primary")} px-3 py-1 text-xs`} disabled={claimingId === task.id} onClick={() => void claim(task.id)}>
                              {claimingId === task.id ? <Spinner /> : "Pick this task"}
                            </button>
                          )}
                          {task.assignedEmployee?.id === user?.id && <span className="text-xs text-stone-500">Yours</span>}
                          {task.assignedEmployee && task.assignedEmployee.id !== user?.id && <span className="text-xs text-stone-400">Assigned</span>}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm">
            <p className="text-stone-500">{page.meta.total} tasks</p>
            <div className="flex gap-2">
              <button className={buttonClass()} disabled={Number(filters.page) <= 1} onClick={() => setFilter("page", String(Number(filters.page) - 1))}>Previous page</button>
              <span className="tabular py-1">Page {filters.page} of {totalPages}</span>
              <button className={buttonClass()} disabled={Number(filters.page) >= totalPages} onClick={() => setFilter("page", String(Number(filters.page) + 1))}>Next page</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Sort({ label, active, onClick, order }: { label: string; active: boolean; onClick: () => void; order: string }) {
  return (
    <button className={active ? "text-ink" : ""} onClick={onClick} type="button">
      {label}{active ? (order === "asc" ? " ↑" : " ↓") : ""}
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
