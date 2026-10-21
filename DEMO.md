# Five-minute demo

Use the seeded database and local demo login. Google and Discord are optional for this walkthrough.

1. Start the API and web app with `npm run dev`. Open http://localhost:3000 and sign in as `admin@vitanatura.example` with password `naturax123`.
2. On Overview, point at orders needing attention, overdue tasks, and the category counts. Filter to Failed delivery and High priority. Open one high-priority case and read the recommended action, deadline, and audit line that says the system created it.
3. Change the status to In progress. Sign out and sign in as the assigned employee, for example Ananya Iyer, and show that she can update her own task. Sign back in as admin and reassign it. The audit history shows who changed the status and the assignment.
4. Open Import and upload `apps/api/fixtures/sample-invalid.csv`. Show the row errors for the missing id, bad date, unknown status, and the duplicated order id. Download the rejected CSV. Upload `sample-orders.csv` a second time and show that it does not create a second copy of each task.
5. Open Daily report, download the CSV, and open Impact. Walk through the four outcomes: less searching, a deadline on every exception, the metrics to watch, and the estimate of about two hours a day if 38 exceptions no longer take four minutes each to find. Close on the limits: no live courier feed, rules run when data is imported, and resolved tasks stay resolved until a person reopens them.
