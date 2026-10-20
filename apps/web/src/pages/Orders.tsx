import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { api } from "../api";
import { Banner, Empty, PageTitle } from "../components/Shell";
import { formatMoney, formatStatus, formatWhen } from "../format";
import type { Order, Page } from "../types";

type OrderRow = Order & { openTasks: { id: string; category: string; priority: string; status: string }[] };

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

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (query) params.set("search", query);
    api<Page<OrderRow>>(`/orders?${params.toString()}`)
      .then(setResult)
      .catch((err: Error) => setError(err.message));
  }, [query, page]);

  return (
    <div>
      <PageTitle title="Orders" detail="Imported orders, including ones that do not currently need follow-up." />
      {error && <Banner>{error}</Banner>}
      <input className="mb-4 w-full max-w-md rounded-md border border-line bg-white px-3 py-2 text-sm" placeholder="Search order, customer, or phone" value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} />
      {!result && <p className="text-sm text-stone-500">Loading orders…</p>}
      {result && result.data.length === 0 && <Empty>No orders match.</Empty>}
      {result && result.data.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Value</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Progress</th>
                <th className="px-3 py-2">Ordered</th>
                <th className="px-3 py-2">Open tasks</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((order) => (
                <tr key={order.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2"><Link className="font-medium text-brand" to={`/orders/${order.id}`}>{order.orderId}</Link></td>
                  <td className="px-3 py-2">{order.customerName}<span className="block text-xs text-stone-500">{order.phone}</span></td>
                  <td className="px-3 py-2">{formatMoney(order.orderValue)}</td>
                  <td className="px-3 py-2">{formatStatus(order.orderStatus)}</td>
                  <td className="px-3 py-2">{formatStatus(order.fulfillmentStatus)}</td>
                  <td className="px-3 py-2">{formatWhen(order.orderDate)}</td>
                  <td className="px-3 py-2">{order.openTasks.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function OrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState<(Order & { tasks: { id: string; category: string; priority: string; status: string; reason: string; deadline: string; assignedEmployee: string }[]; dataQuality: { code: string; message: string }[] }) | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<NonNullable<typeof order>>(`/orders/${id}`).then(setOrder).catch((err: Error) => setError(err.message));
  }, [id]);

  if (error) return <Banner>{error}</Banner>;
  if (!order) return <p className="text-sm text-stone-500">Loading order…</p>;
  return (
    <div>
      <PageTitle title={order.orderId} detail={`${order.customerName} · ${order.phone}`} />
      <div className="rounded-xl border border-line bg-white p-5 text-sm">
        <p>{formatMoney(order.orderValue)} · {order.paymentType} · imported {formatStatus(order.orderStatus)} · progress {formatStatus(order.fulfillmentStatus)}</p>
        <p className="mt-2 text-stone-600">Ordered {formatWhen(order.orderDate)} · Dispatch {formatWhen(order.dispatchDate)} · Expected {formatWhen(order.expectedDeliveryDate)} · Delivered {formatWhen(order.deliveredDate)}</p>
        <p className="mt-2">Assigned on the order: {order.assignedEmployee?.name ?? "Unassigned"}</p>
      </div>
      <ul className="mt-4 space-y-2">
        {order.tasks.map((task) => (
          <li key={task.id} className="rounded-xl border border-line bg-white px-4 py-3 text-sm">
            <Link className="font-medium text-brand" to={`/tasks/${task.id}`}>{task.category}</Link>
            <p>{task.reason}</p>
            <p className="text-stone-500">{task.priority} · {task.status} · {task.assignedEmployee} · {formatWhen(task.deadline)}</p>
          </li>
        ))}
      </ul>
      {order.dataQuality.map((issue) => <p key={issue.code} className="mt-3 text-sm text-amber-900">{issue.message}</p>)}
    </div>
  );
}
