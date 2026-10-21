import { useEffect, useState } from "react";
import { api, apiUrl } from "../api";
import { Filters, toApiQuery, useFilters } from "../components/Filters";
import { PageTitle, buttonClass } from "../components/Shell";
import { Loading } from "../components/Spinner";
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
  const { filters, setFilter, setFilters } = useFilters();
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
      <PageTitle title="Daily report" detail="Use the calendars to choose which order dates count as new. The other lists are the queue as it stands now, ignoring that date range." />
      <div className="mb-4">
        <a className={buttonClass("primary")} href={apiUrl(`/reports/daily.csv?${query}`)}>
          Download this view as CSV
        </a>
      </div>
      <Filters filters={filters} setFilter={setFilter} setFilters={setFilters} showSearch={false} />
      {/* {error && <Banner>{error}</Banner>} */}
      {!report && !error && <Loading />}
      {report && (
        <div className="space-y-6">
          <Section title="New exceptions" detail="Tasks created for orders in the selected date range." tasks={report.newExceptions} />
          <Section title="Still open" detail="Every unfinished task, including ones outside the date range." tasks={report.unresolved} />
          <Section title="Overdue" detail="Unfinished tasks whose response deadline has passed." tasks={report.overdue} />
          <Section title="High priority" detail="Same-shift follow-ups that are not resolved yet." tasks={report.highPriority} />
          <section className="rounded-xl border border-line bg-white p-4">
            <h2 className="text-sm font-semibold">Waiting on each person</h2>
            <p className="mt-1 text-sm text-black/55">Unfinished tasks currently assigned, plus any that nobody has picked.</p>
            <ul className="mt-2 text-sm">
              {report.pendingByEmployee.map((item) => (
                <li key={item.employee} className="flex justify-between border-b border-line py-2 last:border-0">
                  <span>{personLabel(item.employee)}</span>
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

function personLabel(name: string): string {
  return name === "Open" ? "Unassigned" : name;
}

function Section({ title, detail, tasks }: { title: string; detail: string; tasks: ReportTask[] }) {
  return (
    <section>
      <h2 className="text-sm font-semibold">{title} <span className="text-stone-500">({tasks.length})</span></h2>
      <p className="mt-1 text-sm text-black/55">{detail}</p>
      {tasks.length === 0 ? <p className="mt-2 text-sm text-stone-500">None.</p> : (
        <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-white">
          {tasks.slice(0, 12).map((task) => (
            <li key={`${title}-${task.orderId}-${task.category}`} className="px-3 py-2 text-sm">
              <span className="font-medium">{task.orderId}</span> · {task.customerName} · {CATEGORY_LABELS[task.category]} · {personLabel(task.employee)} · {formatWhen(task.deadline)}
              <span className="block text-stone-600">{task.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
