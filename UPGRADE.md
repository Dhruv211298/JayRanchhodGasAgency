# Upgrade & Deployment Guide

Two releases are documented here, newest first. If you are upgrading from the
original system, apply **both** in order (the 2026-08-06 release has a
mandatory password reset and a one-time data repair).

---

# Release 2026-09-05 — Connection Events: New Connection, Additional-Bottle Payment & Surrender Refund

This release records the three connection events that move stock and money
at the dealer's counter, and closes the two cash loopholes: money collected
for an additional bottle never reached the day's cash total, and refunds paid
at surrender never reduced it. It also hardens a number of pre-existing
weaknesses found while integrating the module (listed under *What changed*).

**Scope, deliberately narrow:** there is **no customer / consumer-wise
connection master and no deposit ledger** in this system. BPCL's own system
holds consumer names, numbers, addresses and the security-deposit record.
This system records only stock movement and money, per cylinder category,
and reports on them.

**No data repair and no password reset are needed for this release.** The
three new tables are created automatically on first start; nothing existing
is altered.

## Before you start

1. **Take a full database backup.** Standard practice; the migration only
   creates tables, but it is the only rollback for the *data* you record
   afterwards.
2. `backend/package-lock.json` was out of sync with `package.json`
   (`bcryptjs` was missing from the lock, so `npm ci` failed). It has been
   regenerated — run `npm install` in `backend/` once after pulling.

## Step 1 — Deploy

No new environment variables. No new dependencies.

```bash
cd backend && npm install     # picks up the corrected lock file
cd ../app   && npm install && npm run build
```

On first start the server prints:

```
Migration: ensured connection-module tables exist (connection_events, connection_event_penalties, audit_log)
```

Tables are created with `CREATE TABLE IF NOT EXISTS` on **every** boot, so a
missing table is always created automatically. The same DDL is in
`backend/migrations/2026-09-05_connections_module.sql` for applying by hand
(idempotent — safe to re-run).

> If you ran an earlier build of this module that created a customer master
> (`customers`, `connections`, `connection_payments`, `connection_refunds`,
> `connection_refund_penalties`, `connection_cylinder_movements`), the server
> drops those tables automatically **only if every one of them is empty**. If
> any holds rows it prints a NOTICE and leaves them; the SQL file shows how to
> remove them by hand.

## Step 2 — Verify

Automated:

```bash
cd app     && npm test     # 32 stock / cash-formula tests (16 new)
cd backend && npm test     # 10 repair-algorithm tests + 29 connection-event tests
cd app     && npm run lint # must be clean
```

The backend connection tests boot the real `server.js` against an in-memory
database (`backend/test/helpers/fake-mysql.js`) — no MySQL needed.

By hand — **stock (per cylinder category)**:
- [ ] Connections → Record → New Connection: 14 KG, single, qty 1. Open Daily Entry: the 14 KG closing stock shows "−1 (connection)" under it and the In-Out Stock Master is one lower; 19 KG and 5 KG are untouched. **No cash line changes.**
- [ ] New Connection: 19 KG, **double**, qty 2 → 19 KG closing stock drops by 4.
- [ ] Surrender: 14 KG, 1 connection, **1 returned, 0 missing** → 14 KG Empty Cylinder Stock rises by 1. Surrender with **0 returned, 1 missing** + a "missing cylinder" penalty → stock is **unchanged**.
- [ ] Re-save that day's Day Entry form. Reload: the connection stock changes are still there (they are derived on every load, never stored in `daily_product_stock`).
- [ ] `node scripts/repair-stock.js` (dry run) reports **no corrections** after the above — the repair script now includes connection cylinders in its formula.

By hand — **cash**:
- [ ] Additional Bottle, mode **Cash**, ₹1,500: the Daily Entry cash-on-hand bar rises by exactly ₹1,500; green "Connection Payments (Cash) (+)" tile shows it.
- [ ] Additional Bottle, mode **Online**, ₹3,000: cash-on-hand **does not move**; blue "Connection Payments (Online)" tile shows ₹3,000.
- [ ] Surrender with refund ₹2,000 and penalties regulator ₹200 + pipe ₹150: the form shows the full breakdown and **Net ₹1,650** *before* you confirm; after confirming, cash-on-hand drops by ₹1,650 and the red "Connection Refunds (−)" tile shows it.
- [ ] Double-click Confirm: you get "Already Recorded"; the Refunds Paid report lists it once.
- [ ] History shows the "Connections → Pay (Cash) / Refunds" columns; Summary has the two connection stat cards; Admin → Day Reports → Financials lists all three lines and a Connections card; Dashboard shows the two connection KPIs.

By hand — **rules**:
- [ ] Amount blank or 0, or payment mode not chosen → refused. Penalties larger than the refund → refused. Returned + missing outside 1–2 cylinders per connection → refused.
- [ ] As an **office user**: the date field is locked to today; the API refuses yesterday's date with 403; the Connections tab shows only *Record* and *Today's Register*; `/api/connections/reports/summary` returns 403; there is no void button.
- [ ] As **admin**: a back-dated entry works; voiding an entry asks for a reason and appears in the Audit Trail; the day's cash and stock update immediately.
- [ ] Admin → Connections → Summary: "Cylinders with Customers" equals the SQL in the migration file's VERIFY section.

## The reports (all admin unless noted)

| Report | Where | What it answers |
|---|---|---|
| Today's Register (office too) | Connections → Register | every event today, stock and cash effect per row, CSV |
| Daily Register | Connections → Register (any range, filter by type) | the same for any period, admin can void |
| Summary & Cylinders in Market | Connections → Summary | per product for a period: new (single/double), cylinders issued, additional bottles, cash/online collected, surrenders, returned/missing, gross refund, penalties, net paid, net cash effect, net connection change; plus all-time issued − returned − missing = **cylinders with customers**, cross-checked with latest closing and godown stock |
| Monthly Trend | Connections → Monthly Trend | month × product trend of every figure above, CSV |
| Payments Collected | Connections → Payments Collected | additional-bottle register, cash/online/product filter, CSV |
| Refunds Paid | Connections → Refunds Paid | surrender register with expandable penalty items, penalty breakdown by item, CSV |
| Audit Trail | Connections → Audit Trail | who recorded / voided what, when |
| Day Reports, Dashboard, History, Summary | existing tabs | connection cash lines alongside expenses / other credits / cheque-online |

## What changed

### The module
- **Tables:** `connection_events` (one row per event: `new` / `additional` / `surrender`, product, qty, cylinders out / in / missing, amount, payment mode, penalty total, net paid, remarks, who, idempotency key), `connection_event_penalties` (itemised deductions), `audit_log`. **No customer table, no deposit ledger, no deposit rates.**
- **Stock:** each day's events are aggregated per product into `entry.connectionMovements` (`filledOut`, `emptyIn`) and fed into the existing `computeClosingStock()` / `emptyInFor()` in `app/src/constants.js` as one more term each (`connectionFilledOutFor`, `connectionEmptyInFor`). Nothing is ever written to `daily_product_stock`, so a re-save of the day cannot wipe a movement. Missing cylinders are penalty-only and never enter stock. `scripts/repair-stock.js` uses the same formula.
- **Cash:** `calcEntry()` (aliased `computeDayCalcs`) gains `totalConnectionPaymentsCash` (added, like Other Cash Credits), `totalConnectionPaymentsOnline` (reported only, like Cheque/Online) and `totalConnectionRefunds` (net paid, subtracted, like Expenses). `/api/load` attaches `connectionNew`, `connectionPayments`, `connectionRefunds`, `connectionMovements` to every entry and also returns `connectionsByDate` for days that have events but no saved entry.
- **Unsaved days:** if an event is recorded on a day whose daily entry is never saved, the next blank entry's opening stock is reduced by those cylinders and a warning banner names the day.
- **Endpoints:** `POST /api/connection-events/new|additional|surrender`, `GET /api/connection-events` (register), `DELETE /api/connection-events/:id` (admin void, audited), `GET /api/connections/reports/summary`, `/reports/monthly`, `/payments`, `/refunds`, `GET /api/audit` (admin). All mutating routes are transactional, idempotent (client key on the audit row's UNIQUE index; a repeat returns `{ duplicate: true }`; no payload-digest fallback, so two identical genuine events on one day are never collapsed), and enforce the office = today-only rule **server-side** with the same check as `POST /api/entries`. Net paid and penalty totals are always recomputed server-side.
- **UI:** "Connections" tab for both roles (`app/src/components/ConnectionsTab.jsx`): three entry forms with the stock/cash effect shown before saving, the register, and the admin reports. Daily Entry shows a read-only "Connections · This Day's Events" card and a "−N (connection) / +N empty (surrender)" note under each affected product's closing stock.

### Audit trail (new)
The previous release listed "no append-only audit log" as an open item. `audit_log` now records every connection event and void, every **admin save of a back-dated day**, and every day deletion — who, role, when, business date, details.

### Data-correctness fixes (pre-existing)
- **Empty-cylinder balance ignored recovery returns in the UI.** `App.jsx` rebuilt `creditRecoveries` from the pending list *without* `productId` / `emptyReturned`, so `recoveryEmptyFor()` always saw zero on screen. Both fields are now carried through.
- **Blank entry seeded from the wrong day.** A blank entry always copied the *latest* entry's closing stock and cash, even when an admin was back-dating into a gap. It now seeds from the last saved entry strictly *before* the chosen date; changing the date on the Daily Entry screen loads that date's saved entry or a correctly seeded blank (with a confirmation if there are unsaved edits).
- **Salary month tagged in UTC.** `getSalaryMonth()`, the blank salary row and the "For Month" dropdown used `toISOString()`, which between 00:00 and 05:30 IST on the 1st yields the previous month. Replaced with a local `monthStr()`.
- **Price / commission screens updated local state even when the server rejected the sync.** They now show the server's error and keep the previous list.
- **A failed `/api/load` was silently turned into an empty dataset**, which looked like a fresh database and let a blank "first day" be saved over real data. It now blocks the screen with the error and a Retry button.

### Security / reliability hardening (pre-existing endpoints)
- `POST /api/entries` validates the payload shape and ranges before opening a transaction.
- `POST /api/godown-stock` enforces the same date rules as the daily entry (office = today only) and validates items.
- Vehicle / employee create & update validate required fields and ids; deleting one that has records returns a clear 409.
- Raw database error messages are no longer sent to the client from any route.
- Unknown routes and malformed JSON bodies answer in JSON; a final error handler covers anything unexpected.
- Login rejects non-string credentials and over-long inputs.
- Baseline security headers; `X-Powered-By` disabled.

### Performance
- `/api/load` indexes every per-day collection by date once instead of filtering each of 14 collections per day.

### Tooling
- `npm test` in both packages; `npm run lint` is clean.
- Corrected `backend/package-lock.json`.

## Rolling back

`git revert` the deploy. The new tables can stay (nothing reads them in the old code) or be dropped from the backup. Events recorded through the module while it was live exist **only** in these tables, so drop them only if you have exported what you need.

## Still worth doing

- The server trusts the client-computed `closing_stock` in `POST /api/entries`. Recomputing it server-side without duplicating the formula needs the stock engine extracted into a package both sides import.
- JWTs are not revoked on password change (a stolen token stays valid until it expires — default 1 h).
- There is no general request rate limit beyond login.
- `/api/load` still returns the entire history; a date window will be needed eventually.
- Cylinders-in-market counts start from the first event recorded here; an opening balance of connections issued before go-live could be entered as a back-dated "new" event by an admin if the agency wants an absolute figure.

---

# Release 2026-08-06 — Security & data integrity

This release fixes a data-corruption defect and replaces the authentication
system. **Read this before deploying — there is a mandatory password reset and
a one-time data repair.**

---

## Before you start

1. **Take a full database backup.** Everything below is reversible from a
   backup and from nothing else.
2. Set aside about 20 minutes. Do it outside trading hours if you can — nobody
   will be able to log in between the deploy and step 3.

---

## Step 1 — Set the required environment variables

On Render (or wherever the backend runs), add these before deploying:

| Variable | Value | Why |
|---|---|---|
| `JWT_SECRET` | a long random string, 32+ characters | **Mandatory.** The server now refuses to start in production without it. |
| `NODE_ENV` | `production` | Enables the strict checks. |
| `ALLOWED_ORIGINS` | your frontend URL, e.g. `https://your-app.onrender.com` | Locks the API to your own site. Multiple origins are comma-separated. |
| `APP_TIMEZONE` | `Asia/Kolkata` | Optional; this is already the default. |

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

> If `ALLOWED_ORIGINS` is left unset the server still runs and accepts every
> origin, but prints a warning on every start. Set it.

---

## Step 2 — Install the new dependency and deploy

The backend now needs `bcryptjs`:

```bash
cd backend
npm install
```

Then deploy as usual. On first start the server will apply its migrations and
print:

```
────────────────────────────────────────────────────────────────────────
SECURITY MIGRATION APPLIED — plaintext passwords have been cleared.
N account(s) now require a new password.
────────────────────────────────────────────────────────────────────────
```

**This is expected.** Nobody can log in until step 3.

---

## Step 3 — Set the first administrator password (required)

Passwords were stored in plaintext. They have been cleared, not converted, so
they must be set fresh. Bootstrap the first one from a shell with the same
`DB_*` environment variables (the Render shell works):

```bash
cd backend
node scripts/set-password.js --list                    # see the accounts
node scripts/set-password.js <username> <newPassword>  # set one
```

Passwords must be at least 8 characters and contain a letter and a number.

Once you can sign in as an administrator, set the remaining passwords from
**Admin → Users → Set password**. Accounts without a password are flagged there
with a `NOT SET` badge.

---

## Step 4 — Repair the historical stock data

The daily entry screen deducted credit-sale cylinders from closing stock, but
the value written to the database did not. Because each day's closing stock
becomes the next day's opening stock, every cylinder ever sold on credit was
added back to inventory the following day, and the error accumulated.

Run the dry run first. It writes nothing:

```bash
cd backend
node scripts/repair-stock.js
```

You will get a per-date table of what would change and a summary like:

```
PRODUCT     DAYS   CHANGED   MAX DRIFT   CURRENT DRIFT   FIRST WRONG DAY
p14          214       181          47             -47   2026-01-14
```

`CURRENT DRIFT` is how many cylinders your recorded stock is out by today. A
negative number means the system has been **over-stating** stock on hand.

Check the figures against a physical godown count. When you are satisfied:

```bash
node scripts/repair-stock.js --apply
```

It asks for confirmation, then writes every correction inside a single
transaction — it either all succeeds or nothing changes. Running it twice is
safe; the second run will report no changes.

Useful flags:

```bash
node scripts/repair-stock.js --product p14       # one product only
node scripts/repair-stock.js --from 2026-04-01   # seed the chain from a date
node scripts/repair-stock.js --apply --yes       # skip the confirmation prompt
```

---

## Step 5 — Verify

Run the automated tests:

```bash
cd app     && node test/stock.test.mjs        # 16 calculation tests
cd backend && node test/repair-stock.test.js  # 10 repair-algorithm tests
```

Then check by hand:

**Stock**
- [ ] Record a day with a credit sale. The closing stock on screen deducts the credit cylinders.
- [ ] Save, reload, open the next day. Its opening stock equals yesterday's closing stock exactly.
- [ ] Record a vehicle arrival. Closing stock increases by the filled quantity received.
- [ ] The In-Out Stock Master figure matches the product table's closing stock.
- [ ] The History tab's In-Out column agrees with the Daily Entry screen for the same date.

**Login & roles**
- [ ] An account with no password set shows a clear message rather than "invalid password".
- [ ] Ten wrong passwords in a row produces a "too many attempts" message.
- [ ] Signing in as an **office user**: only 5 tabs, and past dates are read-only.
- [ ] As an office user, saving a back-dated entry is refused by the server, not just hidden.
- [ ] Signing in as **admin**: 11 tabs, back-dated editing works, and after saving a past date the screen stays on that date.

**Payments**
- [ ] Record a recovery. Double-click the confirm button — it is recorded once, and you get an "Already Recorded" notice if it was resubmitted.
- [ ] A recovery equal to the outstanding balance clears the credit and removes it from Pending Credits.
- [ ] A credit sale that already has a payment cannot be deleted from the entry form.

**Rates**
- [ ] Adding a new price does not change the revenue shown for any earlier day.
- [ ] Attempting to save an empty price list is refused rather than wiping history.

---

## What changed

### Data correctness
- **Closing stock** is now computed by one shared function (`computeClosingStock`
  in `app/src/constants.js`). It was previously duplicated in four places with
  three different formulas, and the version that reached the database was the
  wrong one. Displayed, stored and persisted values are now identical by
  construction.
- **Empty-cylinder balance** in the History tab now includes empties returned
  with credit recoveries, which it previously ignored, and shows the running
  balance rather than a single day's movement.
- **Date handling** uses the local calendar date instead of the UTC date.
  Entries made between midnight and 05:30 IST were previously dated to the
  previous day.
- **Deleting a day** now also removes that day's salary payments. Previously
  they were left behind as orphans: still in the database, still counted in raw
  SQL, but invisible to every report.

### Security
- Passwords are hashed with **bcrypt** (cost 12). Plaintext storage is gone.
- **`JWT_SECRET` has no hardcoded fallback.** The old default was committed to
  the repository, so anyone with the code could have forged an admin token.
  Production now refuses to start without a real secret.
- **Server-side role checks** on all 15 administrative endpoints. Previously a
  valid token from *any* account could call them — admin-only was enforced
  purely by hiding tabs in the browser, which the API never saw.
- **Back-dated entries are refused server-side** for non-admin accounts.
- **CORS** is restricted to `ALLOWED_ORIGINS`.
- **Login rate limiting**: 10 failed attempts per IP + username per 15 minutes.
- Login responses take the same time whether or not the username exists.
- The last remaining admin account cannot be deleted, and you cannot delete the
  account you are signed in with.
- `ADMIN_PW = "admin123"` removed from the client bundle.

### Reliability
- **Payment recording** is transactional and idempotent. It locks the ledger
  row, so two concurrent recoveries cannot both read a stale balance, and a
  double-submit carrying the same key is recorded once.
- **Price and commission sync** validate every row before deleting anything,
  and refuse a payload that would empty a table that currently has rows. One
  malformed request previously wiped all rate history.
- Entry dates are validated; future dates are rejected.

### Performance
- The empty-cylinder running total is memoised instead of replaying the entire
  history on every keystroke, and the History tab computes the whole series once
  rather than per row.
- Removed the full-object deep clone (`JSON.parse(JSON.stringify(...))`) that
  ran on every keystroke.

### Cleanup
- Deleted `gas-agency-app.jsx` — a dead 1,506-line copy of the app from the
  first commit that nothing imported.
- Deleted 16 one-off dev scripts, including `truncate.js` and `try_delete.js`,
  which were destructive and carried hardcoded credentials.
- Moved the 7 historical migration scripts to
  `backend/scripts/legacy-migrations/` and switched them to environment
  variables so they can no longer connect to the wrong database.

---

## Rolling back

`git revert` the deploy and restore the database backup. Note that the password
migration is **not** reversible from code alone — the plaintext passwords were
cleared, so a restore from backup is the only way to recover them. There is no
reason to want them back.

---

## Still worth doing

Not addressed in this release:

- `/api/load` returns the entire database on every login and after every save.
  Fine at current volume (a few thousand rows per year), but it will need a
  date window eventually.
- The schema itself is not in version control (`*.sql` is gitignored). A fresh
  database has to be built from the legacy migration scripts. Consider
  committing a `schema.sql`.
- No append-only audit log of who edited which back-dated entry.
