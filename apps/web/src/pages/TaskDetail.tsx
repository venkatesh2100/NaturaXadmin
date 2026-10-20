import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { api } from "../api";
import { useAuth } from "../auth";
import { Banner, PageTitle, PriorityMark, StatusText } from "../components/Shell";
import { formatMoney, formatStatus, formatWhen } from "../format";
import { CATEGORY_LABELS, ORDER_STATUS_OPTIONS, type OrderProgress, type Task, type TaskStatus, type User } from "../types";

type Detail = Task & {
  dataQuality: { code: string; message: string }[];
  audit: { id: string; action: string; oldValue: string | null; newValue: string | null; performedBy: string; createdAt: string }[];
};

export function TaskDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [task, setTask] = useState<Detail | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

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

  async function updateStatus(status: TaskStatus) {
    setError("");
    setMessage("");
    try {
      await api(`/tasks/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      setMessage("Status saved.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update status.");
    }
  }

  async function updateOrderStatus(status: OrderProgress) {
    setError("");
    setMessage("");
    try {
      await api(`/tasks/${id}/order-status`, { method: "PATCH", body: JSON.stringify({ status }) });
      setMessage("Order status saved.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update order status.");
    }
  }

  async function claim() {
    setError("");
    setMessage("");
    try {
      await api(`/tasks/${id}/claim`, { method: "POST" });
      setMessage("Task picked.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not pick this task.");
    }
  }

  async function reassign(employeeId: string) {
    setError("");
    setMessage("");
    try {
      await api(`/tasks/${id}/assignment`, {
        method: "PATCH",
        body: JSON.stringify({ employeeId: employeeId || null }),
      });
      setMessage("Assignment saved.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reassign.");
    }
  }

  if (error && !task) return <Banner>{error}</Banner>;
  if (!task) return <p className="text-sm text-stone-500">Loading task…</p>;

  const canUpdate = user?.role === "ADMIN" || user?.id === task.assignedEmployee?.id;

  return (
    <div>
      <PageTitle title={task.order.orderId} detail={CATEGORY_LABELS[task.category]} />
      {error && <Banner>{error}</Banner>}
      {message && <p className="mb-4 text-sm text-brand">{message}</p>}
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
            <Fact label="Imported status" value={formatStatus(task.order.orderStatus)} />
            <Fact label="Order status" value={formatStatus(task.order.fulfillmentStatus)} />
            <Fact label="Deadline" value={formatWhen(task.deadline)} />
            <Fact label="Ordered" value={formatWhen(task.order.orderDate)} />
            <Fact label="Dispatched" value={formatWhen(task.order.dispatchDate)} />
            <Fact label="Expected delivery" value={formatWhen(task.order.expectedDeliveryDate)} />
            <Fact label="Delivered" value={formatWhen(task.order.deliveredDate)} />
          </dl>
          <p className="mt-4 text-sm"><Link className="text-brand" to={`/orders/${task.order.id}`}>View order</Link></p>
          {user?.role !== "ADMIN" && !task.assignedEmployee && (
            <button className="mt-5 rounded-md bg-moss px-4 py-2 text-sm font-medium text-white" onClick={() => void claim()}>
              Pick this task
            </button>
          )}
          {canUpdate && (
            <label className="mt-5 block text-sm">
              Update order status
              <select
                className="mt-1 w-full max-w-sm rounded-md border border-line px-2 py-1.5"
                value={task.order.fulfillmentStatus}
                onChange={(event) => void updateOrderStatus(event.target.value as OrderProgress)}
              >
                {ORDER_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{formatStatus(status)}</option>
                ))}
              </select>
            </label>
          )}
          {canUpdate && (
            <div className="mt-5 flex flex-wrap gap-2">
              {(["OPEN", "IN_PROGRESS", "RESOLVED"] as TaskStatus[]).map((status) => (
                <button key={status} className="rounded-md border border-line px-3 py-1.5 text-sm disabled:bg-stone-100" disabled={task.status === status} onClick={() => void updateStatus(status)}>
                  Mark {status === "IN_PROGRESS" ? "in progress" : status.toLowerCase()}
                </button>
              ))}
            </div>
          )}
          {user?.role === "ADMIN" && (
            <label className="mt-4 block text-sm">
              Assign to employee
              <select className="mt-1 w-full max-w-sm rounded-md border border-line px-2 py-1.5" value={task.assignedEmployee?.id ?? ""} onChange={(event) => void reassign(event.target.value)}>
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
          <h2 className="text-sm font-semibold">Audit history</h2>
          <ol className="mt-3 space-y-3">
            {task.audit.map((entry) => (
              <li key={entry.id} className="border-b border-line pb-3 text-sm last:border-0">
                <p className="font-medium">{entry.action.replaceAll("_", " ")}</p>
                <p className="text-stone-600">{entry.performedBy} · {formatWhen(entry.createdAt)}</p>
                {(entry.oldValue || entry.newValue) && <p className="mt-1 break-words text-xs text-stone-500">{entry.oldValue ?? "—"} → {entry.newValue ?? "—"}</p>}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-stone-500">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}
