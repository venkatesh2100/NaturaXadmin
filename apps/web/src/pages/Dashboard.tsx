import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "../api";
import { Filters, toApiQuery, useFilters } from "../components/Filters";
import { Banner, Empty, PageTitle, PriorityMark, Stat } from "../components/Shell";
import { formatWhen } from "../format";
import { CATEGORY_LABELS, type Category, type Task, type Page } from "../types";

type Metrics = {
  totalOrders: number;
  ordersRequiringAttention: number;
  openTasks: number;
  overdueTasks: number;
  highPriority: number;
  dataQuality: number;
  byCategory: { category: Category; count: number }[];
  pendingByEmployee: { employeeId: string | null; employee: string; count: number }[];
  recentActivity: { id: string; action: string; orderId: string; performedBy: string; summary: string; createdAt: string }[];
};

export function DashboardPage() {
  const { filters, setFilter } = useFilters();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [urgent, setUrgent] = useState<Task[]>([]);
  const [error, setError] = useState("");
  const query = toApiQuery({ ...filters, page: "" });
  const urgentQuery = toApiQuery({ ...filters, priority: filters.priority || "HIGH", status: filters.status || "OPEN", pageSize: "5", page: "1" });

  useEffect(() => {
    setError("");
    Promise.all([
      api<Metrics>(`/dashboard?${query}`),
      api<Page<Task>>(`/tasks?${urgentQuery}`),
    ])
      .then(([nextMetrics, tasks]) => {
        setMetrics(nextMetrics);
        setUrgent(tasks.data);
      })
      .catch((err: Error) => setError(err.message));
  }, [query, urgentQuery]);

  return (
    <div>
      <PageTitle title="What needs a person today" detail="Exceptions are created from order timestamps. Delivered orders stay off this queue." />
      <Filters filters={filters} setFilter={setFilter} showSearch={false} />
      {error && <Banner>{error}</Banner>}
      {!metrics && !error && <p className="text-sm text-stone-500">Loading the queue…</p>}
      {metrics && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Stat label="Orders uploaded" value={metrics.totalOrders} />
            <Stat label="Orders needing attention" value={metrics.ordersRequiringAttention} />
            <Stat label="Open tasks" value={metrics.openTasks} />
            <Stat label="Overdue tasks" value={metrics.overdueTasks} hint="Deadline has passed" />
            <Stat label="High priority" value={metrics.highPriority} />
            <Stat label="Data to correct" value={metrics.dataQuality} hint="Rules skipped for missing dates" />
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-line bg-white p-4">
              <h2 className="text-sm font-semibold">Exceptions by category</h2>
              <ul className="mt-3 space-y-2">
                {metrics.byCategory.length === 0 && <li className="text-sm text-stone-500">No exceptions in this view.</li>}
                {metrics.byCategory.map((item) => (
                  <li key={item.category} className="flex items-center justify-between text-sm">
                    <span>{CATEGORY_LABELS[item.category]}</span>
                    <span className="tabular font-medium">{item.count}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="rounded-xl border border-line bg-white p-4">
              <h2 className="text-sm font-semibold">Pending by employee</h2>
              <ul className="mt-3 space-y-2">
                {metrics.pendingByEmployee.length === 0 && <li className="text-sm text-stone-500">No pending tasks.</li>}
                {metrics.pendingByEmployee.map((item) => (
                  <li key={item.employee} className="flex items-center justify-between text-sm">
                    <span>{item.employee}</span>
                    <span className="tabular font-medium">{item.count}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
          <section className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">High-priority cases</h2>
              <Link className="text-sm text-brand" to="/tasks?priority=HIGH&status=OPEN">Open the queue</Link>
            </div>
            {urgent.length === 0 ? <Empty>No high-priority tasks match these filters.</Empty> : (
              <div className="overflow-x-auto rounded-xl border border-line bg-white">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-line text-xs uppercase tracking-wide text-stone-500">
                    <tr>
                      <th className="px-3 py-2">Order</th>
                      <th className="px-3 py-2">Customer</th>
                      <th className="px-3 py-2">Reason</th>
                      <th className="px-3 py-2">Deadline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {urgent.map((task) => (
                      <tr key={task.id} className="border-b border-line last:border-0">
                        <td className="px-3 py-2"><Link className="font-medium text-brand" to={`/tasks/${task.id}`}>{task.order.orderId}</Link></td>
                        <td className="px-3 py-2">{task.order.customerName}</td>
                        <td className="px-3 py-2"><PriorityMark priority={task.priority} /> <span className="mt-1 block text-stone-600">{task.reason}</span></td>
                        <td className="px-3 py-2">{formatWhen(task.deadline)}{task.overdue ? " · overdue" : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="mt-6 rounded-xl border border-line bg-white p-4">
            <h2 className="text-sm font-semibold">Recent activity</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {metrics.recentActivity.length === 0 && <li className="text-stone-500">No updates yet.</li>}
              {metrics.recentActivity.map((entry) => (
                <li key={entry.id} className="flex flex-wrap justify-between gap-2">
                  <span><span className="font-medium">{entry.performedBy}</span> {entry.summary}</span>
                  <span className="text-stone-500">{formatWhen(entry.createdAt)}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
