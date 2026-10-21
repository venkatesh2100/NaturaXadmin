import { useEffect, useState, type FormEvent } from "react";
import { api, apiUrl } from "../api";
import { Banner, PageTitle, buttonClass } from "../components/Shell";
import Spinner, { Loading } from "../components/Spinner";
import { formatWhen } from "../format";

type Summary = {
  batchId: string;
  filename: string;
  totalRows: number;
  successfulRows: number;
  rejectedRows: number;
  warningCount: number;
  tasksCreated: number;
  issues: { rowNumber: number; orderId: string | null; field: string | null; message: string; severity: string }[];
};

type Batch = { id: string; filename: string; totalRows: number; successfulRows: number; rejectedRows: number; createdAt: string; createdBy: string };

export function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [batchesReady, setBatchesReady] = useState(false);

  function loadBatches() {
    api<{ batches: Batch[] }>("/imports")
      .then((result) => setBatches(result.batches))
      .catch(() => undefined)
      .finally(() => setBatchesReady(true));
  }

  useEffect(() => {
    loadBatches();
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    const body = new FormData();
    body.set("file", file);
    try {
      const result = await api<Summary>("/imports", { method: "POST", body });
      setSummary(result);
      loadBatches();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageTitle title="Import orders" detail="Upload a CSV or Excel file. Valid rows become orders and, when a rule matches, follow-up tasks. Rejected rows stay in the summary and can be downloaded. They do not create tasks." />
      {error && <Banner>{error}</Banner>}
      <ol className="mb-4 grid gap-3 text-sm md:grid-cols-3">
        <li className="rounded-2xl bg-paper px-4 py-3"><span className="font-medium">1. Choose the file.</span> Use the order export with dates, status, and customer phone.</li>
        <li className="rounded-2xl bg-paper px-4 py-3"><span className="font-medium">2. Import.</span> The desk checks each row and opens tasks for orders that need a person.</li>
        <li className="rounded-2xl bg-paper px-4 py-3"><span className="font-medium">3. Review.</span> Fix rejected rows, then look at Today for the new high-priority work.</li>
      </ol>
      <form onSubmit={onSubmit} className="rounded-xl border border-line bg-white p-5">
        <label className="block text-sm">
          Order file
          <input
            className="mt-2 block w-full text-sm"
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <button className={`mt-4 ${buttonClass("primary")} disabled:opacity-50`} disabled={!file || busy}>
          {busy ? <Spinner /> : "Import orders"}
        </button>
        <p className="mt-3 text-xs text-stone-500">Maximum 5 MB and 5,000 rows. A second import updates the same order and does not open a duplicate task.</p>
      </form>
      {summary && (
        <section className="mt-6">
          <div className="grid gap-3 sm:grid-cols-4">
            <Mini label="Rows in file" value={summary.totalRows} />
            <Mini label="Saved" value={summary.successfulRows} />
            <Mini label="Rejected" value={summary.rejectedRows} />
            <Mini label="New tasks" value={summary.tasksCreated} />
          </div>
          {summary.rejectedRows > 0 && (
            <a className="mt-3 inline-block text-sm text-brand" href={apiUrl(`/imports/${summary.batchId}/rejected.csv`)}>
              Download rejected rows
            </a>
          )}
          {summary.issues.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">Order</th>
                    <th className="px-3 py-2">Field</th>
                    <th className="px-3 py-2">Issue</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.issues.map((issue, index) => (
                    <tr key={`${issue.rowNumber}-${index}`} className="border-b border-line last:border-0">
                      <td className="px-3 py-2">{issue.rowNumber}</td>
                      <td className="px-3 py-2">{issue.orderId ?? "—"}</td>
                      <td className="px-3 py-2">{issue.field ?? "—"}</td>
                      <td className="px-3 py-2">{issue.severity === "WARNING" ? "Warning: " : ""}{issue.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Recent imports</h2>
        <p className="mt-1 text-sm text-black/55">Who uploaded a file, and how many rows were saved or rejected.</p>
        {!batchesReady && <Loading />}
        {batchesReady && batches.length === 0 ? <p className="mt-3 text-sm text-black/50">No imports yet.</p> : null}
        {batchesReady && batches.length > 0 && (
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-white">
            {batches.map((batch) => (
              <li key={batch.id} className="px-4 py-3 text-sm">
                <p className="font-medium">{batch.filename}</p>
                <p className="text-black/60">{batch.successfulRows} saved · {batch.rejectedRows} rejected · {batch.createdBy}</p>
                <p className="text-xs text-black/45">{formatWhen(batch.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-stone-500">{label}</p>
      <p className="tabular text-xl font-semibold">{value}</p>
    </div>
  );
}
