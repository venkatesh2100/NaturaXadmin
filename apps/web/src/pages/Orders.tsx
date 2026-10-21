import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { api } from "../api";
import { useAuth } from "../store";
import { Banner, Empty, PageTitle, buttonClass } from "../components/Shell";
import { Loading } from "../components/Spinner";
import { formatMoney, formatStatus, formatWhen, toDateTimeLocal } from "../format";
import { CATEGORY_LABELS, ORDER_STATUS_OPTIONS, STATUS_LABELS, type Category, type Order, type OrderProgress, type Page, type TaskStatus } from "../types";

type OpenTask = { id: string; category: string; priority: string; status: string; assignedEmployeeId: string | null };
type OrderRow = Order & { editable: boolean; openTasks: OpenTask[] };
type OrderDetail = Order & {
  editable: boolean;
  tasks: { id: string; category: string; priority: string; status: string; reason: string; deadline: string; assignedEmployeeId: string | null; assignedEmployee: string }[];
  dataQuality: { code: string; message: string }[];
};

const fieldClass = "w-full max-w-[9.5rem] rounded-md border border-line";

export function OrdersPage() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page<OrderRow> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  function load(nextPage = page, nextQuery = query) {
    const params = new URLSearchParams({ page: String(nextPage), pageSize: "20" });
    if (nextQuery) params.set("search", nextQuery);
    api<Page<OrderRow>>(`/orders?${params.toString()}`)
      .then(setResult)
      .catch((err: Error) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, [query, page]);

  function updateStatus(orderId: string, status: OrderProgress) {
    const previous = result;
    setError("");
    setResult((current) => (current ? { ...current, data: current.data.map((order) => (order.id === orderId ? { ...order, fulfillmentStatus: status } : order)) } : current));
    void api(`/orders/${orderId}/status`, { method: "PATCH", body: JSON.stringify({ status }) }).catch((err: unknown) => {
      setResult(previous);
      setError(err instanceof Error ? err.message : "Could not update order status.");
    });
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.meta.total / result.meta.pageSize)) : 1;

  return (
    <div>
      <PageTitle title="Orders" detail="Every imported order. The status dropdown is the live status employees update. The file status is what the spreadsheet said at import. Admins and the assigned employee can change the live status." />
      {error && <Banner>{error}</Banner>}
      <label className="mb-4 block max-w-md text-xs text-black/55">
        Search
        <input className="mt-1 w-full max-w-xs rounded-md border border-line" placeholder="Order, name, or phone" value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} />
      </label>
      {!result && !error && <Loading />}
      {result && result.data.length === 0 && <Empty>No orders match.</Empty>}
      {result && result.data.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-line bg-white">
            <table className="min-w-[1400px] w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-3 py-2">Order</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Phone</th>
                  <th className="px-3 py-2">Value</th>
                  <th className="px-3 py-2">Payment</th>
                  <th className="px-3 py-2">Status in file</th>
                  <th className="px-3 py-2">Live status</th>
                  <th className="px-3 py-2">Ordered</th>
                  <th className="px-3 py-2">Dispatch</th>
                  <th className="px-3 py-2">Expected</th>
                  <th className="px-3 py-2">Delivered</th>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Open follow-ups</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((order) => (
                  <tr key={order.id} className="border-b border-line align-top last:border-0">
                    <td className="px-3 py-2"><Link className="font-medium text-brand" to={`/orders/${order.id}`}>{order.orderId}</Link></td>
                    <td className="px-3 py-2">{order.customerName}</td>
                    <td className="px-3 py-2 tabular">{order.phone}</td>
                    <td className="px-3 py-2">{formatMoney(order.orderValue)}</td>
                    <td className="px-3 py-2">{order.paymentType}</td>
                    <td className="px-3 py-2">{formatStatus(order.orderStatus)}</td>
                    <td className="px-3 py-2">
                      {order.editable ? (
                        <select className={fieldClass} value={order.fulfillmentStatus} onChange={(event) => void updateStatus(order.id, event.target.value as OrderProgress)}>
                          {ORDER_STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>{formatStatus(status)}</option>
                          ))}
                        </select>
                      ) : formatStatus(order.fulfillmentStatus)}
                    </td>
                    <td className="px-3 py-2">{formatWhen(order.orderDate)}</td>
                    <td className="px-3 py-2">{formatWhen(order.dispatchDate)}</td>
                    <td className="px-3 py-2">{formatWhen(order.expectedDeliveryDate)}</td>
                    <td className="px-3 py-2">{formatWhen(order.deliveredDate)}</td>
                    <td className="px-3 py-2">{order.assignedEmployee?.name ?? "Unassigned"}</td>
                    <td className="px-3 py-2">{order.openTasks.length === 0 ? "None" : order.openTasks.map((task) => CATEGORY_LABELS[task.category as Category] ?? task.category).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm">
            <p className="text-stone-500">{result.meta.total} orders</p>
            <div className="flex gap-2">
              <button className={buttonClass()} disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous page</button>
              <span className="tabular py-1">Page {page} of {totalPages}</span>
              <button className={buttonClass()} disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>Next page</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function OrderDetailPage() {
  const { id } = useParams();
  const user = useAuth((state) => state.user);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState("");

  function load() {
    api<OrderDetail>(`/orders/${id}`).then(setOrder).catch((err: Error) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, [id]);

  function updateOrderStatus(status: OrderProgress) {
    if (!order) return;
    const previous = order;
    setError("");
    setOrder({ ...order, fulfillmentStatus: status });
    void api(`/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }).catch((err: unknown) => {
      setOrder(previous);
      setError(err instanceof Error ? err.message : "Could not update order status.");
    });
  }

  function updateTask(taskId: string, change: (task: OrderDetail["tasks"][number]) => OrderDetail["tasks"][number], path: string, body: unknown, fallback: string) {
    if (!order) return;
    const previous = order;
    setError("");
    setOrder({ ...order, tasks: order.tasks.map((task) => (task.id === taskId ? change(task) : task)) });
    void api(path, { method: "PATCH", body: JSON.stringify(body) }).catch((err: unknown) => {
      setOrder(previous);
      setError(err instanceof Error ? err.message : fallback);
    });
  }

  if (error && !order) return <Banner>{error}</Banner>;
  if (!order) return <Loading />;

  return (
    <div>
      <PageTitle title={order.orderId} detail={`${order.customerName} · ${order.phone}`} />
      {error && <Banner>{error}</Banner>}
      <dl className="grid gap-3 rounded-xl border border-line bg-white p-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Fact label="Customer" value={order.customerName} />
        <Fact label="Phone" value={order.phone} />
        <Fact label="Order value" value={formatMoney(order.orderValue)} />
        <Fact label="Payment" value={order.paymentType} />
        <Fact label="Status in the file" value={formatStatus(order.orderStatus)} />
        <div>
          <dt className="text-xs uppercase tracking-wide text-stone-500">Live status</dt>
          <dd className="mt-1 text-xs text-black/45">What the team sets after they talk to the customer or courier.</dd>
          <dd className="mt-1">
            {order.editable ? (
              <select className="w-full max-w-[11rem] rounded-md border border-line" value={order.fulfillmentStatus} onChange={(event) => void updateOrderStatus(event.target.value as OrderProgress)}>
                {ORDER_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{formatStatus(status)}</option>
                ))}
              </select>
            ) : formatStatus(order.fulfillmentStatus)}
          </dd>
        </div>
        <Fact label="Ordered" value={formatWhen(order.orderDate)} />
        <Fact label="Dispatch" value={formatWhen(order.dispatchDate)} />
        <Fact label="Expected delivery" value={formatWhen(order.expectedDeliveryDate)} />
        <Fact label="Delivered" value={formatWhen(order.deliveredDate)} />
        <Fact label="Assigned employee" value={order.assignedEmployee?.name ?? "Unassigned"} />
      </dl>
      <h2 className="mt-8 text-lg font-semibold">Follow-up tasks</h2>
      <p className="mt-1 text-sm text-black/55">Each row is a reason this order needs a person. Open the task to see the full activity log.</p>
      <ul className="mt-4 space-y-2">
        {order.tasks.length === 0 && <li className="text-sm text-black/50">No follow-up tasks. This order is not waiting on anyone.</li>}
        {order.tasks.map((task) => {
          const canUpdate = user?.role === "ADMIN" || user?.id === task.assignedEmployeeId;
          return (
            <li key={task.id} className="rounded-xl border border-line bg-white px-4 py-3 text-sm">
              <Link className="font-medium text-brand" to={`/tasks/${task.id}`}>{CATEGORY_LABELS[task.category as Category] ?? task.category}</Link>
              <p className="truncate text-xs text-secondary" title={task.reason}>{task.reason}</p>
              <p className="text-stone-500">{task.priority} · {task.assignedEmployee}</p>
              <p className="mt-2 text-stone-500">{task.assignedEmployeeId ? STATUS_LABELS[task.status as TaskStatus] ?? task.status : "Open"} · {formatWhen(task.deadline)}</p>
              {user?.role === "ADMIN" && task.assignedEmployeeId && (
                <label className="mt-3 block">
                  Task status
                  <span className="mt-0.5 block text-xs text-black/45">Only an admin can mark this open, in progress, or resolved.</span>
                  <select className="mt-1 w-full max-w-[11rem] rounded-md border border-line" value={task.status} onChange={(event) => updateTask(task.id, (current) => ({ ...current, status: event.target.value }), `/tasks/${task.id}/status`, { status: event.target.value }, "Could not update task status.")}>
                    {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((status) => (
                      <option key={status} value={status}>{STATUS_LABELS[status]}</option>
                    ))}
                  </select>
                </label>
              )}
              {canUpdate && (
                <label className="mt-3 block">
                  Response deadline
                  <span className="mt-0.5 block text-xs text-black/45">India time. Moving this does not change the order’s expected delivery date.</span>
                  <input className="mt-1 rounded-md border border-line" type="datetime-local" value={toDateTimeLocal(task.deadline)} onChange={(event) => updateTask(task.id, (current) => ({ ...current, deadline: new Date(event.target.value).toISOString() }), `/tasks/${task.id}/deadline`, { deadline: new Date(event.target.value).toISOString() }, "Could not update the deadline.")} />
                </label>
              )}
            </li>
          );
        })}
      </ul>
      {order.dataQuality.length > 0 && (
        <section className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <h2 className="font-medium">Data to correct</h2>
          <p className="mt-1 text-amber-900">These dates were missing, so the matching rule did not create a task.</p>
          {order.dataQuality.map((issue) => <p key={issue.code} className="mt-2">{issue.message}</p>)}
        </section>
      )}
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
