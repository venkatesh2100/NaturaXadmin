import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "../api";
import { Banner, Empty, PageTitle, PriorityMark, Stat, buttonClass } from "../components/Shell";
import { Loading } from "../components/Spinner";
import { formatWhen } from "../format";
import { useAuth } from "../store";
import { CATEGORY_HELP, CATEGORY_LABELS, PRIORITY_HELP, type Category, type Metrics, type Page, type Task } from "../types";

export function DashboardPage() {
  const user = useAuth((state) => state.user);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [urgent, setUrgent] = useState<Task[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api<Metrics>("/dashboard"),
      api<Page<Task>>("/tasks?priority=HIGH&status=OPEN&sort=deadline&order=asc&pageSize=6&page=1"),
    ])
      .then(([nextMetrics, nextTasks]) => {
        setMetrics(nextMetrics);
        setUrgent(nextTasks.data);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const greeting = user?.role === "ADMIN"
    ? "You assign work and close tasks. Start with anything marked high."
    : "Pick an open task, then update the order after you call the customer.";
  const employeeRows = metrics
    ? user?.role === "ADMIN"
      ? metrics.pendingByEmployee
      : metrics.pendingByEmployee.filter((row) => row.employeeId === user?.id)
    : [];

  return (
    <div>
      <PageTitle
        title="Today"
        detail={`${user ? `${user.name}. ` : ""}${greeting} Delivered, cancelled, and paid orders stay off this desk.`}
      />
      {error && <Banner>{error}</Banner>}
      {!metrics && !error && <Loading />}
      {metrics && (
        <>
          <section className="grid grid-cols-2 gap-x-8 gap-y-6 border-y border-line py-6 md:grid-cols-3">
            <Stat label="Open tasks" value={metrics.openTasks} hint="Open or in progress. Not finished yet." />
            <Stat label="Due now" value={metrics.overdueTasks} hint="The response deadline has already passed." />
            <Stat label="High priority" value={metrics.highPriority} hint="Same-shift follow-up. Act within 2 hours." />
            <Stat label="Orders" value={metrics.totalOrders} hint="Every order stored from imports." />
            <Stat label="Need attention" value={metrics.ordersRequiringAttention} hint="Orders that still have an unfinished task." />
            <Stat label="Data issues" value={metrics.dataQuality} hint="Missing dates, so a rule could not run." />
          </section>

          <section className="mt-8 grid gap-3 md:grid-cols-3">
            <Guide title="High" body={PRIORITY_HELP.HIGH} />
            <Guide title="Medium" body={PRIORITY_HELP.MEDIUM} />
            <Guide title="Low" body={PRIORITY_HELP.LOW} />
          </section>

          <section className="mt-10 grid gap-10 lg:grid-cols-[1.25fr_0.75fr]">
            <div>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Needs attention</h2>
                  <p className="mt-1 text-sm text-black/55">High-priority tasks that are still open. These should be touched in this shift.</p>
                </div>
                <Link to="/tasks?priority=HIGH&status=OPEN" className={buttonClass()}>All high-priority tasks</Link>
              </div>
              {urgent.length === 0 ? <Empty>No high-priority tasks are waiting. Check the full task queue for medium items.</Empty> : (
                <ul className="space-y-3">
                  {urgent.map((task) => (
                    <li key={task.id} className="rounded-2xl border border-line bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <Link to={`/tasks/${task.id}`} className="text-sm font-semibold hover:underline">{task.order.orderId}</Link>
                          <p className="text-sm text-black/60">{task.order.customerName} · {CATEGORY_LABELS[task.category]}</p>
                        </div>
                        <PriorityMark priority={task.priority} />
                      </div>
                      <p className="mt-3 text-sm">{task.reason}</p>
                      <p className="mt-1 text-sm text-black/60">Next step: {task.actionRequired}</p>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs text-black/50">
                          Deadline {formatWhen(task.deadline)}
                          {task.overdue ? " · overdue" : ""}
                          {task.assignedEmployee ? ` · ${task.assignedEmployee.name}` : " · unassigned"}
                        </p>
                        <Link to={`/tasks/${task.id}`} className={buttonClass("primary")}>Open task</Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold">Recent activity</h2>
              <p className="mt-1 text-sm text-black/55">Who changed an order, picked a task, or moved a deadline.</p>
              {metrics.recentActivity.length === 0 ? <Empty>No updates yet. Activity appears after an import or a task change.</Empty> : (
                <ul className="mt-3 divide-y divide-line">
                  {metrics.recentActivity.slice(0, 8).map((entry) => (
                    <li key={entry.id} className="py-3">
                      <p className="text-sm"><span className="font-medium">{entry.performedBy}</span> {entry.summary}</p>
                      <p className="mt-1 text-xs text-black/45">{formatWhen(entry.createdAt)} · India time</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="mt-10 grid gap-10 lg:grid-cols-2">
            <div>
              <h2 className="text-lg font-semibold">Why a task exists</h2>
              <p className="mt-1 text-sm text-black/55">Each category is a rule. Priority is fixed by the rule, not by how many days late the shipment is.</p>
              <ul className="mt-3 divide-y divide-line">
                {(Object.keys(CATEGORY_LABELS) as Category[]).map((category) => {
                  const count = metrics.byCategory?.find((row) => row.category === category)?.count ?? 0;
                  return (
                    <li key={category} className="flex items-start justify-between gap-4 py-3 text-sm">
                      <span>
                        <span className="font-medium">{CATEGORY_LABELS[category]}</span>
                        <span className="mt-0.5 block text-black/55">{CATEGORY_HELP[category]}</span>
                      </span>
                      <span className="tabular text-black/55">{count}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <h2 className="text-lg font-semibold">Open by employee</h2>
              <p className="mt-1 text-sm text-black/55">
                {user?.role === "ADMIN"
                  ? "Select a person to open their unfinished tasks. Unassigned means nobody has picked them yet."
                  : "Your unfinished tasks. Other people’s queues stay with an admin."}
              </p>
              {employeeRows.length === 0 ? <Empty>{user?.role === "ADMIN" ? "No open tasks are assigned." : "No open tasks are assigned to you."}</Empty> : (
                <ul className="mt-3 divide-y divide-line">
                  {employeeRows.map((row) => (
                    <li key={row.employeeId ?? "none"}>
                      <Link to={employeeTasksHref(row.employeeId, user?.role === "ADMIN")} className="-mx-1 flex items-center justify-between rounded-[9px] px-1 py-3 text-sm hover:bg-paper">
                        <span>{row.employeeId ? row.employee : "Unassigned"}</span>
                        <span className="tabular text-black/55">{row.count} open</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function employeeTasksHref(employeeId: string | null, admin: boolean): string {
  if (!admin) return "/my-tasks";
  return `/tasks?employeeId=${encodeURIComponent(employeeId ?? "unassigned")}`;
}

function Guide({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[14px] border border-line bg-paper px-4 py-3">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm text-black/60">{body}</p>
    </div>
  );
}
