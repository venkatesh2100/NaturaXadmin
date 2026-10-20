import { PageTitle } from "../components/Shell";

export function ImpactPage() {
  return (
    <div>
      <PageTitle title="What this changes for the team" detail="The numbers below are a planning model. Replace the assumptions with a week of your own counts." />
      <div className="space-y-4">
        <Card title="1. Less manual searching">
          Uploading the order sheet creates the follow-up list. People stop scanning Excel for unconfirmed orders, late dispatches, and failed deliveries, and they stop asking in WhatsApp which orders are still open.
        </Card>
        <Card title="2. Orders are not left to memory">
          Every exception has an owner, a deadline, and a status. A resolved task is not reopened by the next import. If the condition clears, the open task is closed and the audit log says why. Overdue work stays visible on the dashboard.
        </Card>
        <Card title="3. Metrics that show it is working">
          Track median time from task creation to In progress, the share of tasks resolved before the deadline, the count of overdue tasks, and how often the same order produces another exception after it was marked resolved. Unconfirmed orders older than two hours should trend toward zero.
        </Card>
        <Card title="4. Time saved per day">
          Example: 150 orders a day, 25 percent needing follow-up, is about 38 exceptions. Finding each one in a sheet and a chat takes about 4 minutes, or roughly 150 minutes. Reviewing a prepared task takes about 45 seconds, or about 30 minutes. That is about 2 hours a day. Use your own volume: exceptions × (minutes to find manually − minutes to act here).
        </Card>
        <Card title="5. Limits of this version">
          There is no live courier feed and no WhatsApp sending. Rules run when a file is imported and when the overdue check runs, not on a continuous order stream. Date-only cells are treated as the start of that day in IST. Weekends count toward deadlines. A resolved task stays resolved until someone reopens it. Employee names in the sheet must match a user already in the system.
        </Card>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: string }) {
  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-stone-700">{children}</p>
    </section>
  );
}
