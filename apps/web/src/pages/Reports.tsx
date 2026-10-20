import { useEffect, useState } from "react";
import { api, apiUrl } from "../api";
import { Filters, toApiQuery, useFilters } from "../components/Filters";
import { Banner, PageTitle } from "../components/Shell";
import { formatWhen } from "../format";
import { CATEGORY_LABELS, type Category } from "../types";

type ReportTask = {
  orderId: string;
  customerName: string;
  category: Category;
  priority: string;
  employee: string;
  deadline: string;
  status: string;
  reason: string;
};

type Report = {
  newExceptions: ReportTask[];
  unresolved: ReportTask[];
  overdue: ReportTask[];
  highPriority: ReportTask[];
  pendingByEmployee: { employee: string; count: number }[];
};

export function ReportsPage() {
  const { filters, setFilter } = useFilters();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const query = toApiQuery(filters);

  useEffect(() => {
    api<Report>(`/reports/daily?${query}`)
      .then(setReport)
      .catch((err: Error) => setError(err.message));
  }, [query]);

  return (
    <div>
      <PageTitle title="Daily exception report" detail="New exceptions use the date range. The other lists are the current queue." />
      <div className="mb-4">
        <a className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white" href={apiUrl(`/reports/daily.csv?${query}`)}>
          Download CSV
        </a>
      </div>
      <Filters filters={filters} setFilter={setFilter} showSearch={false} />
      {error && <Banner>{error}</Banner>}
      {!report && !error && <p className="text-sm text-stone-500">Loading report…</p>}
      {report && (
        <div className="space-y-6">
          <Section title="New exceptions" tasks={report.newExceptions} />
          <Section title="Unresolved" tasks={report.unresolved} />
          <Section title="Overdue" tasks={report.overdue} />
          <Section title="High priority" tasks={report.highPriority} />
          <section className="rounded-xl border border-line bg-white p-4">
            <h2 className="text-sm font-semibold">Employee pending actions</h2>
            <ul className="mt-2 text-sm">
              {report.pendingByEmployee.map((item) => (
                <li key={item.employee} className="flex justify-between border-b border-line py-2 last:border-0">
                  <span>{item.employee}</span>
                  <span className="tabular">{item.count}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

function Section({ title, tasks }: { title: string; tasks: ReportTask[] }) {
  return (
    <section>
      <h2 className="text-sm font-semibold">{title} <span className="text-stone-500">({tasks.length})</span></h2>
      {tasks.length === 0 ? <p className="mt-2 text-sm text-stone-500">None.</p> : (
        <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-white">
          {tasks.slice(0, 12).map((task) => (
            <li key={`${title}-${task.orderId}-${task.category}`} className="px-3 py-2 text-sm">
              <span className="font-medium">{task.orderId}</span> · {task.customerName} · {CATEGORY_LABELS[task.category]} · {task.employee} · {formatWhen(task.deadline)}
              <span className="block text-stone-600">{task.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
