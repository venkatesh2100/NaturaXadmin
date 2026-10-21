# VitaNatura order follow-up

Internal tool for VitaNatura Elements. Staff import orders from CSV or Excel. The API flags the ones that need a person and keeps a task queue with owners, deadlines, and an audit log.

What the product does, who uses it, and how the rules behave is in [PROJECT.md](PROJECT.md). This file is how to run it and how the pieces fit together.

## Architecture

The site and the API are separate processes. The browser never talks to PostgreSQL.

```text
Browser (React, port 3000)
        |
        |  cookie session, JSON
        v
API (Express, port 4000 locally, 8080 in Docker)
        |
        |  Prisma + pg
        v
PostgreSQL 16
```

| Piece | Where | What it does |
|---|---|---|
| Web app | `apps/web` | React 19, Vite, Tailwind CSS, React Router, Zustand. Static build. |
| API | `apps/backend` | Express 5, Prisma 7, Zod, PostgreSQL through the `pg` driver. Package name `@naturax/api`. |
| Rules | `apps/backend/src/services/rules.ts` | Pure function. Takes an order and the current time. Returns tasks and data-quality findings. |
| Import | `apps/backend/src/services/import.ts` | Parses the file, writes orders, tasks, and audit rows in one transaction. Discord runs after commit. |
| Database | `apps/backend/prisma/schema.prisma` | Users, sessions, orders, tasks, audit log, import batches, data-quality issues, notifications. |

The API is a long-lived Node process. It is not a Cloudflare Worker. Prisma needs the `pg` driver and a Node runtime. The web app can be deployed as static assets on Cloudflare; the API stays on a Node host that can reach PostgreSQL.

### Request path

1. The browser calls the API with `credentials: "include"`. The session is an HTTP-only cookie. The token in the database is a SHA-256 hash.
2. Mutating requests must come from `WEB_ORIGIN`.
3. Import and status changes call `evaluateOrder`. Matching tasks are created, updated, or auto-resolved inside the same database transaction as the order write.
4. After the transaction commits, high-priority task creation and overdue tasks can post to Discord. A failed webhook does not roll back the import. Each event is stored once, keyed by `taskId:created` or `taskId:overdue`.

### Screens

| Route | Who | Purpose |
|---|---|---|
| `/login` | everyone | Email and password. Google when it is configured. |
| `/` | signed in | Today: orders needing attention, open tasks, overdue, high priority. |
| `/tasks` | signed in | Full task queue. |
| `/my-tasks` | staff | Tasks assigned to the signed-in employee. |
| `/tasks/:id` | signed in | Reason, action, deadline, audit history. |
| `/orders`, `/orders/:id` | signed in | Order list and detail. Status updates re-run the rules. |
| `/import` | signed in | Upload CSV or Excel. |
| `/reports` | signed in | Daily report and CSV download. |
| `/team` | admin | Users. |

## Prerequisites

- Node.js 22.12 or newer
- npm 10
- Docker, for local PostgreSQL

## Run locally

From the repository root:

```bash
npm install
cp apps/backend/.env.example apps/backend/.env
cp apps/web/.env.example apps/web/.env
```

Edit `apps/backend/.env`. Replace `SESSION_SECRET` and `CRON_SECRET` with long random strings. Leave Google and Discord empty until you have them.

`DEV_LOGIN_ENABLED=true` allows the seeded demo accounts. The API refuses to start if that flag is true and `NODE_ENV=production`.

Start PostgreSQL, apply migrations, and load demo data:

```bash
docker compose up -d postgres
npm run db:migrate
npm run db:seed
```

`DATABASE_URL` in the example is `postgresql://naturax:naturax@localhost:5432/naturax`.

Start both apps:

```bash
npm run dev
```

- Site: http://localhost:3000
- API: http://localhost:4000
- Health: http://localhost:4000/health

`npm run dev:api` and `npm run dev:web` start one side only.

The web app reads `VITE_API_BASE_URL` at dev-server start. The example points at `http://localhost:4000`. If that file is missing, the client falls back to `http://127.0.0.1:8080`, which is the Docker API port, not the local Node port.

## Demo sign-in and sample files

`npm run db:seed` creates five users and about 130 synthetic orders, then runs the same importer the upload page uses. Dates are calculated from the moment you seed, so the 2-hour and 24-hour rules match the current time.

Every seeded account uses the password `naturax123`:

| Email | Role |
|---|---|
| `admin@vitanatura.example` | Admin |
| `ananya.iyer@vitanatura.example` | Staff |
| `rohan.mehta@vitanatura.example` | Staff |
| `kavya.nair@vitanatura.example` | Staff |
| `dev.patel@vitanatura.example` | Staff |

Refresh the upload files after seeding so their timestamps stay current:

```bash
npm run fixtures
```

That writes:

- `apps/backend/fixtures/sample-orders.csv`
- `apps/backend/fixtures/sample-orders.xlsx`
- `apps/backend/fixtures/sample-invalid.csv`
- `apps/backend/fixtures/sample-invalid.xlsx`

Upload `sample-invalid.csv` to see rejected rows. Those rows are not inserted. Uploading `sample-orders.csv` again updates orders and does not create a second task for the same order and category.

## Run the API with Docker Compose

`docker compose up --build` starts PostgreSQL and the API. The API container listens on port 8080 and runs `prisma migrate deploy` before the process starts. It does not start the web app and it does not seed demo users.

```bash
docker compose up --build
```

Point the site at that API before starting Vite:

```bash
# apps/web/.env
VITE_API_BASE_URL=http://localhost:8080
```

Then, from the repository root, seed and start only the site:

```bash
DATABASE_URL=postgresql://naturax:naturax@localhost:5432/naturax npm run db:seed
npm run dev:web
```

The Compose API uses `WEB_ORIGIN=http://localhost:3000`, so the site on port 3000 is allowed to call it.

## Google sign-in

Email and password is enough for local use. Google is optional.

1. In Google Cloud, create an OAuth client of type Web application.
2. Add the API callback as an authorized redirect URI: `http://localhost:4000/auth/google/callback` for the local Node API, or `http://localhost:8080/auth/google/callback` for Compose.
3. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL` to that same callback.
4. Optional: `ALLOWED_EMAIL_DOMAINS=yourcompany.com` limits sign-in. Leave it empty to allow any verified Google email.
5. Optional: `BOOTSTRAP_ADMIN_EMAILS=person@yourcompany.com` promotes that email to admin on sign-in.

`POST /auth/register` creates a staff account, or an admin when the email is listed in `BOOTSTRAP_ADMIN_EMAILS`. Passwords are stored as scrypt hashes. The Google callback checks the OAuth `state` against an HTTP-only cookie and a short-lived database row. This repository does not include Google credentials.

## Discord

Set `DISCORD_WEBHOOK_URL` and `DISCORD_NOTIFICATIONS_ENABLED=true`. The URL stays on the server. It is not in the frontend bundle.

A message is sent when a high-priority task is created (that includes every failed delivery) and when the overdue job finds a task past its deadline. Requests time out after 5 seconds and retry once on HTTP 429. Failures are stored on the notification row and retried by the overdue job, up to 5 attempts.

## Tests

```bash
npm test
npm run typecheck
```

Rule tests use a fixed timestamp of `2026-10-20T12:00:00.000Z`. They cover each rule, the exact 2-hour and 24-hour boundaries, missing timestamps, delivered orders, duplicate task planning, invalid CSV, an xlsx workbook, and Discord failures.

The import API test runs only when `DATABASE_URL` points at a migrated database whose name contains `test`. Create that database once:

```bash
docker compose exec postgres createdb -U naturax naturax_test
cd apps/backend
DATABASE_URL=postgresql://naturax:naturax@localhost:5432/naturax_test npx prisma migrate deploy
DATABASE_URL=postgresql://naturax:naturax@localhost:5432/naturax_test npm test
```

## Production

### Web

The site is a static build. `apps/web/wrangler.jsonc` deploys it as Cloudflare Worker assets and sends unknown paths to `index.html`.

From `apps/web`:

```bash
npm run deploy
```

Set `VITE_API_BASE_URL` to the public API origin before that build. Vite bakes it into the bundle.

### API

Use a Node.js host that can run a long-lived process and reach PostgreSQL. Do not put this API on Cloudflare Workers.

```bash
npm ci
npm run build --workspace apps/backend
npm run db:migrate
npm start --workspace apps/backend
```

`npm start` runs `node dist/index.js` with the working directory at `apps/backend`. Set every variable from `apps/backend/.env.example`. `WEB_ORIGIN` must be the site origin, including `https`, with no trailing path. In production the session cookie is `Secure` and `SameSite=None` so a site on another host can call the API.

The process checks overdue tasks on `OVERDUE_CHECK_INTERVAL_MS` (default 15 minutes). On a host with more than one instance, set `OVERDUE_CHECK_INTERVAL_MS=0` and call the cron endpoint from one scheduler:

```bash
curl -X POST -H "x-cron-secret: $CRON_SECRET" https://your-api-host/internal/jobs/overdue
```

Admins can run the same check with `POST /jobs/overdue`. Health check: `GET /health`.

The Docker image (`apps/backend/Dockerfile`) listens on port 8080 and migrates on startup. That image is what Compose builds.

## Environment

API (`apps/backend/.env`):

| Variable | Purpose |
|---|---|
| `PORT` | API port. `4000` locally. Compose sets `8080`. |
| `DATABASE_URL` | PostgreSQL connection string. |
| `WEB_ORIGIN` | Allowed browser origin. `http://localhost:3000` locally. |
| `SESSION_SECRET` | At least 16 characters. |
| `SESSION_TTL_HOURS` | Session lifetime. Default 168. |
| `DEV_LOGIN_ENABLED` | Demo password login. Must be false in production. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` | All three must be set or Google stays off. |
| `ALLOWED_EMAIL_DOMAINS` | Comma-separated. Empty allows any verified Google email. |
| `BOOTSTRAP_ADMIN_EMAILS` | Comma-separated emails promoted to admin. |
| `DISCORD_WEBHOOK_URL`, `DISCORD_NOTIFICATIONS_ENABLED` | Server-side alerts. |
| `CRON_SECRET` | Header `x-cron-secret` for `POST /internal/jobs/overdue`. |
| `OVERDUE_CHECK_INTERVAL_MS` | In-process scheduler. `0` disables it. Default 900000. |

Web (`apps/web/.env`):

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | API origin the browser calls. Required at build time for production. |
