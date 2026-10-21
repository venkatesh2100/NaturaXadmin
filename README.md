# VitaNatura order follow-up

Internal tool for VitaNatura Elements. It imports orders from CSV or Excel, flags the ones that need a person, and keeps a task queue with owners, deadlines, and an audit log.

The web app is a static React site for Cloudflare Pages. The API is a separate Node.js service. It is not deployed as a Cloudflare Worker: Prisma talks to PostgreSQL through the `pg` driver, which needs a Node.js runtime.

## Architecture

- `apps/web` — React, Vite, Tailwind CSS
- `apps/api` — Express, Prisma 7, PostgreSQL, Zod
- Rules live in `apps/api/src/services/rules.ts` and take the current time as an argument
- Tasks and audit rows are written in one database transaction
- Discord alerts run after the import commits. A failed webhook does not roll back the import

Deadline policy, measured from the moment a task is created:

- High: 2 hours
- Medium: 8 hours
- Low: 24 hours

Date-only values in a file are read as the start of that calendar day in Asia/Kolkata. ISO timestamps are kept as absolute instants. A rule that is missing a timestamp it needs does not fire. The order is stored as a data-quality issue instead.

A repeated import updates the order and does not create a second task for the same order and category. A resolved task is not reopened. If the underlying condition has cleared, an open task is marked resolved by the system.

## 1. Prerequisites

- Node.js 22.12 or newer
- npm 10
- Docker, if you want local PostgreSQL

## 2. Local setup

```bash
npm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Edit `apps/api/.env` and set `SESSION_SECRET` and `CRON_SECRET` to long random strings. Leave the Google and Discord values empty until you have them.

`DEV_LOGIN_ENABLED=true` turns on the seeded demo accounts. The API refuses to boot if that flag is true while `NODE_ENV=production`.

## 3. Database setup and migrations

```bash
docker compose up -d
cd apps/api
npx prisma migrate deploy
npm run db:seed
```

`DATABASE_URL` in the example points at `postgresql://naturax:naturax@localhost:5432/naturax`.

Create a second database before the integration test:

```bash
docker compose exec postgres createdb -U naturax naturax_test
DATABASE_URL=postgresql://naturax:naturax@localhost:5432/naturax_test npx prisma migrate deploy
```

Run that from `apps/api`. The integration test refuses to touch a database whose name does not contain `test`.

## 4. Google OAuth

1. In Google Cloud, create an OAuth client of type Web application.
2. Add the API callback as an authorized redirect URI, for example `http://localhost:4000/auth/google/callback`.
3. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL` to that same callback URL.
4. Optional: `ALLOWED_EMAIL_DOMAINS=yourcompany.com` limits sign-in. Leave it empty to allow any verified Google email.
5. Optional: `BOOTSTRAP_ADMIN_EMAILS=person@yourcompany.com` promotes that email to admin on sign-in.

Sign-in is email and password. Passwords are stored as scrypt hashes in PostgreSQL, never as plaintext. `POST /auth/register` creates a staff account, or an admin when the email is listed in `BOOTSTRAP_ADMIN_EMAILS`. Sessions are random tokens stored as a SHA-256 hash and sent as an HTTP-only cookie. In production the session cookie is `Secure` and `SameSite=None` so the Pages site on another host can call the API. Mutating requests must come from `WEB_ORIGIN`.

Google sign-in is still available when `GOOGLE_CLIENT_ID` is set. The API stores the Google subject id, name, and email. It never stores a Google password. The callback checks the OAuth `state` against an HTTP-only cookie and a short-lived database row. This repository does not include Google credentials, so OAuth has not been exercised against Google.

## 5. Discord webhook

Set `DISCORD_WEBHOOK_URL` and `DISCORD_NOTIFICATIONS_ENABLED=true`. The URL stays on the server. It is not in the frontend bundle and must not be committed.

A message is sent when a high-priority task is created, which includes every failed delivery, and when the overdue job finds a task past its deadline. Each event has a unique key of `taskId:created` or `taskId:overdue`, so a repeat does not send a second message. Requests time out after 5 seconds and retry once on HTTP 429. Failures are stored on the `Notification` row and retried by the overdue job, up to 5 attempts.

## 6. Seed and sample files

`npm run db:seed` creates five demo users and about 130 synthetic orders, then runs the same importer the upload page uses. Dates are calculated from the moment you seed, so the two-hour and 24-hour rules match the current time.

Demo sign-in. Every seeded account uses the password `naturax123`:

- `admin@vitanatura.example`
- `ananya.iyer@vitanatura.example`
- `rohan.mehta@vitanatura.example`
- `kavya.nair@vitanatura.example`
- `dev.patel@vitanatura.example`

Refresh the upload files after seeding so their timestamps stay current:

```bash
npm run fixtures
```

That writes:

- `apps/api/fixtures/sample-orders.csv`
- `apps/api/fixtures/sample-orders.xlsx`
- `apps/api/fixtures/sample-invalid.csv`
- `apps/api/fixtures/sample-invalid.xlsx`

Upload `sample-invalid.csv` to see rejected rows. Those rows are not inserted.

Start the apps from the repository root:

```bash
npm run dev
```

The API listens on port 4000 and the site on port 3000.

## 7. Tests

```bash
npm test
```

Rule tests use a fixed timestamp of `2026-10-20T12:00:00.000Z`. They cover each rule, the exact two-hour and 24-hour boundaries, missing timestamps, delivered orders, duplicate task planning, invalid CSV, an xlsx workbook, and Discord failures.

The import API test runs only when `DATABASE_URL` points at a migrated database whose name contains `test`. From `apps/api`:

```bash
DATABASE_URL=postgresql://naturax:naturax@localhost:5432/naturax_test npm test
```

`npm run typecheck` checks both packages.

## 8. Frontend on Cloudflare Pages

The site is a static build. Pages serves it. The API stays on a Node host.

- Root directory: repository root
- Build command: `npm ci && npm run build --workspace apps/web`
- Build output: `apps/web/dist`
- Environment variable: `VITE_API_BASE_URL=https://your-api-host` (required at build time)
- SPA fallback: `apps/web/public/_redirects` contains `/* /index.html 200`

Set the API `WEB_ORIGIN` to the Pages URL, including `https`, with no trailing path.

## 9. Backend hosting

Use any Node.js host that can run a long-lived process and reach PostgreSQL. Render, Railway, and Fly.io are all suitable. Do not put this API on Cloudflare Workers.

Build: `npm ci && npm run build --workspace apps/api`

Start: `node apps/api/dist/index.js` with the working directory at the repository root, or `npm start --workspace apps/api` after `prisma generate`.

Release command: `npm run db:migrate --workspace apps/api`

Set every variable from `apps/api/.env.example`. `WEB_ORIGIN` must be the Pages origin. Use HTTPS in production.

The process checks overdue tasks on `OVERDUE_CHECK_INTERVAL_MS` (default 15 minutes). On a host with more than one instance, prefer a single scheduler and turn the interval off with `OVERDUE_CHECK_INTERVAL_MS=0`. Call the cron endpoint from the host's scheduler:

```bash
curl -X POST -H "x-cron-secret: $CRON_SECRET" https://your-api-host/internal/jobs/overdue
```

Admins can also run the same check from `POST /jobs/overdue`.

Health check: `GET /health`.

## 10. Known limitations

- No courier API and no WhatsApp messages. Status comes from the imported file.
- Rules run on import and on the overdue check, not from a live order stream.
- Google sign-in and Discord delivery need your own credentials. They are implemented and covered with failure tests, and they have not been called against the live services from this workspace.
- Date-only cells are midnight IST. A file uploaded late in the day can make a same-day order look older than two hours.
- Deadlines count nights and weekends.
- Re-importing a file does not reopen a resolved task and does not change an existing task's assignee. New tasks take the employee named on the row when that name or email matches a user.
- Employee names that do not match a user import the order as unassigned and record a warning.
- The in-process scheduler is per instance. Use the cron endpoint when you run more than one.

## Business impact

The Impact page in the app walks through the manual work this removes, how a task stops an order being forgotten, which metrics to watch, a worked example of about two hours saved a day, and the limits above. `DEMO.md` is a five-minute walkthrough.
