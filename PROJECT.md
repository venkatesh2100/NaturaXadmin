# What this project is

VitaNatura Elements sells orders that move through confirm, dispatch, ship, and deliver. The follow-up tool is the internal queue for the orders that stall. It does not take payments and it does not talk to a courier. Status arrives in a CSV or Excel file, or from a person updating an order in the app. The rules then decide which orders need a person, and by when.

## Who uses it

There are two roles.

An **admin** sees every order and task, assigns work, changes task status, manages the team, and can run the overdue check. Admins assign tasks. They do not claim unassigned ones.

A **staff** member works the tasks assigned to them, and can claim a task that has no owner. They can update an order only when that order, or one of its tasks, is assigned to them. They cannot reassign work and they cannot change Open, In progress, or Resolved. That status change is an admin action. They can still update the fulfillment status of an order they own, which re-runs the rules.

Sign-in is email and password. Google sign-in is available when the API has Google credentials. Sessions are random tokens stored as a SHA-256 hash and sent as an HTTP-only cookie.

## A day in the app

1. Someone uploads the latest order file on Import, or the seed script loads a demo file.
2. Each valid row becomes an order. Invalid rows are rejected and listed with the batch. They are not inserted.
3. The rules run against the current time. Each hit becomes one task: a category, a reason, a recommended action, a priority, and a deadline.
4. Today shows how many orders need attention, how many tasks are open, how many are overdue, and how many are high priority.
5. An employee opens a task, does the action (confirm the customer, dispatch, check the courier, arrange a reattempt), and an admin marks it in progress or resolved. Every change is written to the audit log with who did it. System-created rows say System.
6. Report lists new exceptions, unresolved work, overdue work, high-priority work, and a count per employee. That report downloads as CSV.

Uploading the same file again updates the order. It does not create a second task for the same order and category. One order can still have several tasks when several rules match, for example a failed delivery that is also past its expected date.

## How a task is born

`evaluateOrder` in `apps/backend/src/services/rules.ts` is a pure function. It receives the order and a clock. Closed orders (`delivered`, `cancelled`, `paid`) produce no tasks and no data-quality findings.

A file status is mapped onto a live fulfillment status before the checks. A real fulfillment status on the order wins over the older order-status names.

| File status | Live status |
|---|---|
| `UNCONFIRMED`, `PENDING` | `pending` |
| `CONFIRMED` | `confirmed` |
| `DISPATCHED`, `SHIPPED` | `shipped` |
| `OUT_FOR_DELIVERY` | `out_for_delivery` |
| `DELIVERED` | `delivered` |
| `FAILED_DELIVERY`, `FAILED` | `failed` |
| `CANCELLED`, `CANCELED` | `cancelled` |
| `PAID` | `paid` |

### Rules

The comparison is strict. An order that is exactly 2 hours old, or exactly 24 hours old, is not flagged. It has to be older than the threshold. If the date a rule needs is missing, the rule does not fire. The order is stored with a data-quality finding so someone can fix the file and import again.

| Live status | Condition | Task | Priority | What the person should do |
|---|---|---|---|---|
| `pending` | Order date is more than 2 hours ago | Unconfirmed | High | Contact the customer and confirm the order. |
| `confirmed`, no dispatch date | Order date is more than 24 hours ago | Dispatch delay | High | Check inventory and dispatch the order. |
| `shipped`, `out_for_delivery`, or `failed` | Expected delivery is in the past, and it is not delivered | Shipment delay | Medium | Check courier tracking and contact the customer. |
| `failed` | As soon as the status is failed | Failed delivery | High | Contact the customer and arrange a reattempt. |
| Any open order worth more than ₹5,000 | Expected delivery is in the past | High-value overdue | High | Escalate with the courier and contact the customer. |

Value of exactly ₹5,000 does not count. A failed shipment can get both Failed delivery and Shipment delay. A high-value order can get High-value overdue on top of the status rule.

An order counts as delivered for the high-value check when its status is `delivered`, `cancelled`, or `paid`, or when a delivered date is present.

### Two different clocks

The 2-hour and 24-hour numbers above decide **whether a task is created**. They are measured from the order date.

The deadline on the task is a second clock, measured from the moment the task is created:

| Priority | Due |
|---|---|
| High | 2 hours |
| Medium | 8 hours |
| Low | 24 hours |

No current rule assigns Low. Unconfirmed, dispatch delay, failed delivery, and high-value overdue are High, so the employee has 2 hours after the task appears. Shipment delay is Medium, so the due time is 8 hours after the task appears. The 24-hour dispatch wait is not the task's due date. A confirmed order sits quietly for 24 hours, then a High task appears, and that task is due 2 hours later.

Deadlines count nights and weekends. There is no business-hours calendar.

Date-only cells in a file are read as midnight in Asia/Kolkata. A full ISO timestamp is kept as that instant. A file uploaded late in the day can make a same-day date-only order look older than 2 hours.

## What happens on the next import

Task sync plans four outcomes:

- No task for that category yet: create one. The assignee is the employee named on the row when the name or email matches a user. An unknown name imports the order unassigned and records a warning.
- An open task is still justified, and the reason, priority, or action changed: update the text. The existing assignee and the existing deadline stay.
- The condition has cleared: an open task is marked resolved by the system.
- The task was already resolved: leave it resolved. A later import does not reopen it. A person has to do that.

Changing an order's fulfillment status in the app runs the same evaluation.

## Overdue and Discord

Every 15 minutes, unless the interval is turned off, the API looks for unresolved tasks whose deadline has passed. It also retries Discord messages that failed earlier.

Discord is notified when a high-priority task is created, including every failed delivery, and when a task first becomes overdue. Each event is sent at most once. The webhook URL never leaves the server. If Discord is down, the order and the task are already saved.

## What is stored

- **User** — name, email, role, optional password hash, Google subject id.
- **Order** — business order id, customer, phone, value, payment type (prepaid or cash on delivery), legacy order status, live fulfillment status, dispatch, expected delivery, delivered date, assigned employee.
- **Task** — one per order and category. Reason, priority, action, deadline, status (`OPEN`, `IN_PROGRESS`, `RESOLVED`).
- **Audit log** — who changed a task or an order, the old value, and the new value.
- **Import batch and issues** — file name, row counts, and the rejected or warned rows.
- **Data-quality issue** — a rule that could not run because a date was missing.
- **Notification** — whether a Discord event was sent, skipped, or failed, and how many attempts it used.

## What this project does not do

- It does not call a courier API, send WhatsApp, or receive live shipment events. Status is whatever the file or a person last set.
- Rules run on import, on an order status change, and on the overdue job. They do not run from a stream of order events.
- Re-importing does not reopen a resolved task and does not move an existing task to a different employee.
- Employee names that do not match a user leave the order unassigned.
- Google sign-in and Discord need credentials that are not in this repository.
