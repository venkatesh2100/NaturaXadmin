import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { api } from "../api";
import { useAuth } from "../store";
import { Banner, PageTitle, PriorityMark, StatusText, buttonClass } from "../components/Shell";
import { Loading } from "../components/Spinner";
import { formatAction, formatMoney, formatStatus, formatWhen, toDateTimeLocal } from "../format";
import { CATEGORY_LABELS, ORDER_STATUS_OPTIONS, STATUS_LABELS, type OrderProgress, type Task, type TaskStatus, type User } from "../types";

type Detail = Task & {
  dataQuality: { code: string; message: string }[];
  audit: { id: string; action: string; oldValue: string | null; newValue: string | null; performedBy: string; createdAt: string }[];
};

export function TaskDetailPage() {
  const { id } = useParams();
  const user = useAuth((state) => state.user);
  const [task, setTask] = useState<Detail | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");

  function load() {
    if (!id) return;
    api<Detail>(`/tasks/${id}`).then(setTask).catch((err: Error) => setError(err.message));
  }

  useEffect(() => {
    load();
    if (user?.role === "ADMIN") {
      api<{ users: User[] }>("/users")
        .then((result) => setUsers(result.users.filter((person) => person.role === "STAFF")))
        .catch(() => undefined);
    }
  }, [id, user?.role]);

  function apply(change: (current: Detail) => Detail, request: () => Promise<unknown>, fallback: string) {
    if (!task) return;
    const previous = task;
    setError("");
    setTask(change(task));
    void request().catch((err: unknown) => {
      setTask(previous);
      setError(err instanceof Error ? err.message : fallback);
    });
  }

  function updateStatus(status: TaskStatus) {
    apply((current) => ({ ...current, status }), () => api(`/tasks/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }), "Could not update status.");
  }

  function updateOrderStatus(status: OrderProgress) {
    apply((current) => ({ ...current, order: { ...current.order, fulfillmentStatus: status } }), () => api(`/tasks/${id}/order-status`, { method: "PATCH", body: JSON.stringify({ status }) }), "Could not update order status.");
  }

  function claim() {
    if (!user) return;
    apply((current) => ({ ...current, assignedEmployee: { id: user.id, name: user.name, email: user.email } }), () => api(`/tasks/${id}/claim`, { method: "POST" }), "Could not pick this task.");
  }

  function updateDeadline(value: string) {
    if (!value) return;
    const deadline = new Date(value).toISOString();
    apply((current) => ({ ...current, deadline, overdue: new Date(deadline).getTime() < Date.now() }), () => api(`/tasks/${id}/deadline`, { method: "PATCH", body: JSON.stringify({ deadline }) }), "Could not update the deadline.");
  }

  function reassign(employeeId: string) {
    const person = users.find((employee) => employee.id === employeeId);
    const overdueHandoff = Boolean(person && task?.overdue && task.assignedEmployee && task.assignedEmployee.id !== person.id);
    apply((current) => ({
      ...current,
      assignedEmployee: person ? { id: person.id, name: person.name, email: person.email } : null,
      status: person ? current.status : "OPEN",
      priority: overdueHandoff ? "HIGH" : current.priority,
    }), () => api(`/tasks/${id}/assignment`, { method: "PATCH", body: JSON.stringify({ employeeId: employeeId || null }) }), "Could not reassign.");
  }

  if (error && !task) return <Banner>{error}</Banner>;
  if (!task) return <Loading />;

  const canUpdate = user?.role === "ADMIN" || user?.id === task.assignedEmployee?.id;

  return (
    <div>
      <PageTitle title={task.order.orderId} detail={`${CATEGORY_LABELS[task.category]}. ${task.reason}`} />
      {error && <Banner>{error}</Banner>}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <section className="rounded-xl border border-line bg-white p-5">
          <div className="flex flex-wrap items-center gap-4">
            <PriorityMark priority={task.priority} />
            <StatusText status={task.status} />
            {task.overdue && <span className="text-sm text-red-700">Overdue</span>}
          </div>
          <p className="mt-4 text-base">{task.reason}</p>
          <p className="mt-2 text-sm text-stone-700"><span className="font-medium">Next action. </span>{task.actionRequired}</p>
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <Fact label="Customer" value={task.order.customerName} />
            <Fact label="Phone" value={task.order.phone} />
            <Fact label="Order value" value={formatMoney(task.order.orderValue)} />
            <Fact label="Payment" value={task.order.paymentType} />
            <Fact label="Assigned to" value={task.assignedEmployee?.name ?? "Unassigned"} />
            <Fact label="Status in the file" value={formatStatus(task.order.orderStatus)} />
            <Fact label="Live order status" value={formatStatus(task.order.fulfillmentStatus)} />
            <Fact label="Deadline" value={formatWhen(task.deadline)} />
            <Fact label="Ordered" value={formatWhen(task.order.orderDate)} />
            <Fact label="Dispatched" value={formatWhen(task.order.dispatchDate)} />
            <Fact label="Expected delivery" value={formatWhen(task.order.expectedDeliveryDate)} />
            <Fact label="Delivered" value={formatWhen(task.order.deliveredDate)} />
          </dl>
          <p className="mt-4 text-sm"><Link className="text-brand" to={`/orders/${task.order.id}`}>View order</Link></p>
          {user?.role !== "ADMIN" && !task.assignedEmployee && (
            <button className={`mt-5 ${buttonClass("primary")}`} onClick={() => void claim()}>
              Pick this task
            </button>
          )}
          {canUpdate && (
            <label className="mt-5 block text-sm">
              Live order status
              <span className="mt-0.5 block text-xs text-black/45">Set this after you confirm, ship, or learn the delivery failed.</span>
              <select
                className="mt-1 w-full max-w-[11rem] rounded-md border border-line"
                value={task.order.fulfillmentStatus}
                onChange={(event) => void updateOrderStatus(event.target.value as OrderProgress)}
              >
                {ORDER_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{formatStatus(status)}</option>
                ))}
              </select>
            </label>
          )}
          {user?.role === "ADMIN" && task.assignedEmployee && (
            <label className="mt-4 block text-sm">
              Task status
              <span className="mt-0.5 block text-xs text-black/45">Open means not started. In progress means someone is on it. Resolved removes it from today’s queue.</span>
              <select className="mt-1 w-full max-w-[11rem] rounded-md border border-line" value={task.status} onChange={(event) => updateStatus(event.target.value as TaskStatus)}>
                {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((status) => (
                  <option key={status} value={status}>{STATUS_LABELS[status]}</option>
                ))}
              </select>
            </label>
          )}
          {canUpdate && (
            <label className="mt-4 block text-sm">
              Response deadline
              <span className="mt-0.5 block text-xs text-black/45">When this follow-up should be done. It is separate from the customer’s expected delivery date.</span>
              <input className="mt-1 rounded-md border border-line" type="datetime-local" value={toDateTimeLocal(task.deadline)} onChange={(event) => updateDeadline(event.target.value)} />
            </label>
          )}
          {user?.role === "ADMIN" && (
            <label className="mt-4 block text-sm">
              Assign to employee
              <span className="mt-0.5 block text-xs text-black/45">Choose Unassigned to put it back on the open queue. Handing an overdue task to someone else raises it to high.</span>
              <select className="mt-1 w-full max-w-[11rem] rounded-md border border-line" value={task.assignedEmployee?.id ?? ""} onChange={(event) => void reassign(event.target.value)}>
                <option value="">Unassigned</option>
                {users.map((person) => (
                  <option key={person.id} value={person.id}>{person.name}</option>
                ))}
              </select>
            </label>
          )}
          {task.dataQuality.length > 0 && (
            <div className="mt-5 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
              {task.dataQuality.map((issue) => <p key={issue.code}>{issue.message}</p>)}
            </div>
          )}
        </section>
        <section className="rounded-xl border border-line bg-white p-5">
          <h2 className="text-sm font-semibold">Activity</h2>
          <p className="mt-1 text-xs text-black/50">Newest change first.</p>
          {task.audit.length === 0 ? <p className="mt-3 text-sm text-black/50">No activity yet.</p> : (
            <ol className="mt-3 space-y-3">
              {task.audit.map((entry) => (
                <li key={entry.id} className="border-b border-line pb-3 text-sm last:border-0">
                  <p className="font-medium">{formatAction(entry.action)}</p>
                  <p className="text-stone-600">{entry.performedBy} · {formatWhen(entry.createdAt)}</p>
                  {(entry.oldValue || entry.newValue) && <p className="mt-1 break-words text-xs text-stone-500">{readableChange(entry.oldValue)} → {readableChange(entry.newValue)}</p>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function readableChange(value: string | null): string {
  if (!value) return "—";
  try {
    const parsed = JSON.parse(value) as { name?: string | null; category?: string; priority?: string };
    if (parsed && typeof parsed === "object") {
      if ("name" in parsed) return parsed.name ?? "Unassigned";
      if (parsed.category || parsed.priority) return [parsed.category, parsed.priority].filter(Boolean).join(" · ").replaceAll("_", " ").toLowerCase();
    }
  } catch {
    return value.replaceAll("_", " ");
  }
  return value.replaceAll("_", " ");
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-stone-500">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}
