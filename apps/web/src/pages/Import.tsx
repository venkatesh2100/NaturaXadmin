import { useEffect, useState, type FormEvent } from "react";
import { api, apiUrl } from "../api";
import { Banner, PageTitle } from "../components/Shell";

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

  function loadBatches() {
    api<{ batches: Batch[] }>("/imports").then((result) => setBatches(result.batches)).catch(() => undefined);
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
      <PageTitle title="Import orders" detail="CSV or Excel. Invalid rows stay in the summary and can be downloaded. They do not create follow-up tasks." />
      {error && <Banner>{error}</Banner>}
      <form onSubmit={onSubmit} className="rounded-xl border border-line bg-white p-5">
        <input
          className="block w-full text-sm"
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <button className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!file || busy}>
          {busy ? "Importing…" : "Upload and evaluate"}
        </button>
        <p className="mt-3 text-xs text-stone-500">Maximum 5 MB and 5,000 rows. Sample files live in apps/api/fixtures.</p>
      </form>
      {summary && (
        <section className="mt-6">
          <div className="grid gap-3 sm:grid-cols-4">
            <Mini label="Rows" value={summary.totalRows} />
            <Mini label="Imported" value={summary.successfulRows} />
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
        <h2 className="text-sm font-semibold">Recent imports</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {batches.map((batch) => (
            <li key={batch.id} className="rounded-lg border border-line bg-white px-3 py-2">
              {batch.filename} · {batch.successfulRows} imported · {batch.rejectedRows} rejected · {batch.createdBy}
            </li>
          ))}
        </ul>
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
