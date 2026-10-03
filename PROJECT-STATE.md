# MediBook — Complete Project Reference

**Snapshot date:** 3 October 2026
**Location:** `E:\bnc\hc\medibook`
**Verified by:** running all three test suites and inspecting the working tree on the snapshot date. Test numbers in this document are measured, not quoted from the README.

---

## Table of contents

1. [What MediBook is](#1-what-medibook-is)
2. [Current stage](#2-current-stage)
3. [Verified status](#3-verified-status)
4. [Running it](#4-running-it)
5. [The adapter architecture](#5-the-adapter-architecture)
6. [Repository layout](#6-repository-layout)
7. [Data model](#7-data-model)
8. [Complete API reference](#8-complete-api-reference)
9. [The security model](#9-the-security-model)
10. [Security controls inventory](#10-security-controls-inventory)
11. [Frontend](#11-frontend)
12. [Configuration reference](#12-configuration-reference)
13. [Design decisions worth knowing](#13-design-decisions-worth-knowing)
14. [What is deliberately not built](#14-what-is-deliberately-not-built)
15. [Known issues and risks](#15-known-issues-and-risks)
16. [Suggested next steps](#16-suggested-next-steps)

---

## 1. What MediBook is

A healthcare appointment booking web application. Patients book appointments with doctors and upload medical reports; doctors manage their schedules and write prescriptions; admins run the clinic and read an audit log.

It has two purposes, and the second one shapes almost every design decision in the codebase:

1. **A working app** that runs entirely on a laptop with no database, no Docker and no AWS account.
2. **A teaching scaffold for an AWS migration.** Every piece that would become a managed AWS service is isolated behind an adapter chosen by one environment variable. The AWS implementations exist as fully stubbed files with TODO comments, so the migration can be done one service at a time without the local app ever breaking.

The code is unusually heavily commented, and the comments explain *why* rather than *what* — including the security trade-offs that were deliberately accepted. That commentary is part of the deliverable, not incidental.

**All data is invented.** There is no real patient information anywhere in the repository.

### Technology

| Layer | Choice |
| --- | --- |
| Runtime | Node.js ≥ 20.9.0 (running 20.15.0) |
| Backend | Express 4.21, CommonJS |
| Frontend | React 18.3 + Vite 5.4 + react-router-dom 6.28, ES modules |
| Auth | `bcryptjs` + `jsonwebtoken` (own JWTs) |
| Security | `helmet`, `cors`, `express-rate-limit` |
| Uploads | `multer` 2.0 (memory storage) |
| Database | A JSON file. No ORM, no SQL, no migrations yet. |
| Tests | Hand-rolled harnesses on `node:assert`. No Jest/Vitest/Playwright. |

Dependency count is deliberately small: 8 backend production dependencies, 3 frontend. There is no linter, formatter, TypeScript, or CI configuration.

### Scale

| Extension | Files | Lines |
| --- | --- | --- |
| `.js` | 58 | 10,505 |
| `.jsx` | 35 | 6,951 |
| `.css` | 11 | 2,084 |
| `.md` | 2 | 416 |
| `.html` | 2 | 41 |
| **Total** | **108** | **~20,000** |

(Excludes `node_modules`. The `.md` count is before this file was added.)

---

## 2. Current stage

### Git history

The repository is at `medibook/.git` — note that the parent folder `E:\bnc\hc` is **not** a repository, only `medibook/` is.

```
e1b6071  Phase 5: doctor pages
67b212a  Phase 4: patient pages
a8cf2bd  Phase 3: frontend foundation, landing page and auth screens
89c1cae  Phase 2: full backend API with three-layer authorization
f4b379b  Phase 1: backend foundation with swappable local/AWS adapters
a4b1240  MediBook starter app
```

Six commits. Current branch: **`phase-1-backend-foundation`** — a stale name; the branch is five phases past what it is called.

### Phase 6 is complete but uncommitted

The working tree holds finished, passing work that has never been committed:

**Untracked (new):**
- `AWS-TODO.md` — the full AWS migration checklist
- `frontend/src/pages/admin/ManageDoctorsPage.jsx`
- `frontend/src/pages/admin/ManageSpecialtiesPage.jsx`
- `frontend/src/pages/admin/ManageUsersPage.jsx`
- `frontend/src/pages/admin/AllAppointmentsPage.jsx`
- `frontend/src/pages/admin/AuditLogPage.jsx`

**Modified:**
- `README.md`
- `frontend/src/App.jsx` — wires up the five admin routes
- `frontend/src/pages/admin/AdminPages.css`
- `frontend/scripts/smoke-render.js` — extended to cover the new routes

This is the single most important fact about the current stage: **roughly a phase of work, including all five admin screens and the entire AWS migration guide, exists only in the working tree.** It is not backed up by a commit.

### Completeness by area

| Area | State |
| --- | --- |
| Backend API | **Complete.** All 12 routers, all three roles, all endpoints implemented. |
| Backend security | **Complete.** Three-layer authorization, audit log, rate limits, signed file links. |
| Local adapters | **Complete.** db, storage, auth, mailer, secrets all working. |
| Patient frontend | **Complete.** 8 pages. |
| Doctor frontend | **Complete.** 7 pages. |
| Admin frontend | **Complete, uncommitted.** 7 pages. |
| Tests | **Complete** for what exists: 47 unit + 68 API + 39 route-render checks. |
| AWS adapters | **Not started by design.** 66 stub functions across 5 files. |
| `scripts/migrate.js` | **Not implemented** — intentionally left as an exercise. |
| `backend/schema.sql` | **Does not exist** — to be written during the RDS phase. |
| Deployment | **Not started.** No IaC, no Dockerfile, no CI. |

In short: **the local application is feature-complete and tested. The AWS migration has not begun.**

---

## 3. Verified status

All three suites were run on the snapshot date. These are the actual results.

### `backend/npm run check` — 47 unit checks

**46 passed, 1 failed** on the first run; **47/47 on four consecutive re-runs.**

The single failure is flaky, not a defect. The test `checking a non-existent account costs the same as a real one` measures bcrypt timing:

```
missing-account check took 135.3ms vs 280.2ms for a real one
```

It asserts `missingMs > realMs * 0.5`. The real hash is measured *first*, so on a cold V8 it absorbs JIT warm-up and reads abnormally slow (280ms against a typical ~140ms), which drags the threshold above the genuine second measurement. The mechanism being tested is correct — `verifyPassword` compares against a real pre-built bcrypt hash at the same cost factor when no account exists ([auth.local.js:57-78](backend/adapters/auth.local.js#L57-L78)). See [§15](#15-known-issues-and-risks) for the fix.

Coverage: the permission table, password rules, slot generation, date/time handling, the validator, path-traversal refusal, download-link signing and expiry, and the generated sample PDF/PNG fixtures.

### `backend/npm run check:api` — 68 end-to-end checks

**68 passed, 0 failed.**

This suite boots the real Express app against a temporary sandbox data directory and makes real HTTP requests with real logins, so it never touches development data. It is the suite that proves the authorization story. Groups:

- ACCEPTANCE: patient cannot reach another patient or admin (7)
- ACCEPTANCE: doctor boundaries (8)
- ACCEPTANCE: admin cannot read clinical records (2)
- ACCEPTANCE: files are not reachable without permission (3)
- ACCEPTANCE: two patients cannot book the same slot (2)
- Booking rules enforced server-side (6)
- Cancel, reschedule and outcome (4)
- Prescriptions (5)
- Uploads (6)
- Admin management (9)
- Doctor workspace (9)
- Patient dashboard and profile (4)
- Response hygiene (3)

Notable passing assertions: `no response anywhere contains a password hash or reset token`, `the audit log never contains a password or token`, `an error response never contains a stack trace`, `deactivating a patient stops their existing token working`.

### `frontend/npm run smoke` — 39 route checks

**39 passed, 0 failed.**

Renders every route in Node (no browser) under three simulated roles plus logged-out, and asserts the route guards redirect correctly. This includes the five new admin routes, which is how we know the uncommitted Phase 6 work is sound.

### State on disk

`backend/.env` **exists**, so secrets are persistent — no ephemeral-secret warning appeared at startup, meaning logins survive restarts.

`backend/data/db.json` — 38,601 bytes, seeded 1 October 2026:

| Collection | Rows |
| --- | --- |
| `users` | 12 (1 admin, 6 doctors, 5 patients) |
| `specialties` | 5 |
| `doctors` | 6 |
| `availability` | 17 |
| `appointments` | 23 |
| `reports` | 5 |
| `prescriptions` | 5 |
| `auditLogs` | 3 |

`backend/uploads/` — 5 report files (4 PDF, 1 PNG) plus `.gitkeep`, stored under the `reports/<ownerId>/<date>/<random>.<ext>` key scheme. Both `data/` and `uploads/` are git-ignored.

Both `backend/node_modules` and `frontend/node_modules` are installed.

---

## 4. Running it

Needs Node.js ≥ 20.9. Nothing else.

**Terminal 1 — the API:**
```bash
cd medibook/backend
npm install
npm run seed      # only needed once, or to wipe and start over
npm run dev       # or: npm start
```

**Terminal 2 — the website:**
```bash
cd medibook/frontend
npm install
npm run dev
```

Then open <http://localhost:5173>. The API alone serves no user interface — the `allowedOrigins: ["http://localhost:5173"]` line in the startup log is the backend saying where it expects the frontend to be.

`npm run dev` restarts on file changes (`node --watch`); `npm start` runs once.

### Reading the startup log

A healthy boot prints six JSON lines: `Starting MediBook backend` (with the five adapter modes), `Secrets adapter ready`, `Database ready` (with row counts), `Storage ready`, `Auth ready`, `Backend listening`. Adapters are initialised **before** the port opens, so the server never accepts a request while the database is still loading.

A seventh line, `Using generated development secrets`, appears only when `backend/.env` is missing. It means logins and download links will break on restart. Fix with `npm run init-env`.

### Watch this terminal

With `MAIL_MODE=console`, nothing is actually emailed. Password reset links and generated doctor passwords **print in the backend terminal** inside a boxed `EMAIL (not really sent)` block.

### Demo logins

Every account uses `ClinicDemo#2026`.

| Role | Email |
| --- | --- |
| Admin | `admin@medibook.local` |
| Doctor | `asha.rao@medibook.local` |
| Doctor | `vikram.menon@medibook.local` |
| Doctor | `priya.nair@medibook.local` |
| Doctor | `imran.qureshi@medibook.local` |
| Doctor | `meera.krishnan@medibook.local` |
| Doctor | `sanjay.pillai@medibook.local` |
| Patient | `ravi@example.com` |
| Patient | `divya@example.com` |
| Patient | `arjun@example.com` |
| Patient | `fatima@example.com` |
| Patient | `joseph@example.com` |

The login page has a **Demo accounts** panel that fills these in. `npm run seed` refuses to run when `NODE_ENV=production`, because this password is published.

### All commands

**backend/**

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the API, restarting on file changes |
| `npm start` | Start the API once |
| `npm run seed` | Wipe and refill the database with demo data |
| `npm run check` | 47 unit checks |
| `npm run check:api` | 68 end-to-end checks against the real HTTP API |
| `npm test` | Both of the above |
| `npm run init-env` | Create `backend/.env` with new random secrets |
| `npm run migrate` | **Not implemented** — a stub for the RDS phase |

**frontend/**

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the website on port 5173 |
| `npm run build` | Build the static site into `dist/` |
| `npm run preview` | Serve the built `dist/` |
| `npm run smoke` | Render all 39 routes in Node and check they work |

---

## 5. The adapter architecture

This is the central idea of the codebase. Everything that would become an AWS managed service is isolated in one file, selected by one environment variable. The rest of the app never knows which implementation is active.

| Adapter | Local (default) | AWS (stubbed) | Switch |
| --- | --- | --- | --- |
| `adapters/db.js` | JSON file in `data/` | PostgreSQL on RDS | `DB_MODE` |
| `adapters/storage.js` | files in `uploads/` | private S3 bucket | `STORAGE_MODE` |
| `adapters/auth.js` | bcryptjs + own JWT | Amazon Cognito | `AUTH_MODE` |
| `adapters/mailer.js` | prints to terminal | Amazon SES | `MAIL_MODE` |
| `adapters/secrets.js` | `.env` file | Secrets Manager | `SECRETS_MODE` |

Each switch file is a three-line dispatcher:

```js
const implementation =
  config.modes.db === 'postgres' ? require('./db.postgres') : require('./db.local');
module.exports = implementation;
```

The *interface contract* lives in a long comment block at the top of each switch file, which is the authoritative specification both implementations must satisfy. For `db.js` the rules are:

- Every function is `async`, even in the local version, so routes never change.
- Both return plain objects, never store internals. `db.local.js` deep-copies on the way out (via `structuredClone`) so a caller cannot mutate the in-memory store by accident.
- Dates and times are strings (`'YYYY-MM-DD'`, `'HH:MM'`).
- Money is an integer number of paise/cents (`feeCents`), never a float.
- A function that cannot find something returns `null`; it does not throw. Turning `null` into a 404 is the route's job.

### The five switches

```bash
# backend/.env — all local by default
DB_MODE=local         # local | postgres
STORAGE_MODE=local    # local | s3
AUTH_MODE=local       # local | cognito
MAIL_MODE=console     # console | ses
SECRETS_MODE=env      # env | aws
```

Invalid values are rejected at startup by `readMode()` in `config.js` with a clear message, rather than silently falling back — a typo like `STORAGE_MODE=S3x` must not quietly write patient files to the wrong place.

### Capability flags

Adapters advertise what they support rather than being probed by mode name. `auth.capabilities.passwords` is `true` locally and `false` under Cognito, and `routes/auth.routes.js` has a `requirePasswordSupport` guard that returns **501 Not Implemented** for register/login/reset/change-password in Cognito mode. Likewise `routes/files.routes.js` checks `typeof storage.verifyDownloadToken === 'function'` before offering the local file-streaming route, because S3 mode does not need it.

---

## 6. Repository layout

```
medibook/
├── README.md                 How to run it, demo logins, commands
├── AWS-TODO.md               The migration checklist (untracked)
├── PROJECT-STATE.md          This file
├── .gitignore
├── backend/
│   ├── server.js             Startup: init adapters, then listen, then graceful shutdown
│   ├── app.js                Express assembly — middleware order matters here
│   ├── config.js             Every env var, read once, validated
│   ├── .env                  Real secrets (git-ignored, present)
│   ├── .env.example          Documented template
│   ├── adapters/
│   │   ├── db.js             switch + interface contract
│   │   ├── db.local.js       JSON store implementation (860 lines)
│   │   ├── db.postgres.js    STUB — 53 functions
│   │   ├── storage.js        switch + contract
│   │   ├── storage.local.js  filesystem + HMAC-signed links
│   │   ├── storage.s3.js     STUB — 6 functions
│   │   ├── auth.js           switch + contract
│   │   ├── auth.local.js     bcryptjs + jsonwebtoken
│   │   ├── auth.cognito.js   STUB — 3 functions
│   │   ├── mailer.js         switch
│   │   ├── mailer.console.js prints a boxed email to stdout
│   │   ├── mailer.ses.js     STUB — 2 functions
│   │   ├── secrets.js        switch
│   │   ├── secrets.env.js    reads process.env
│   │   └── secrets.aws.js    STUB — 2 functions
│   ├── auth/
│   │   └── roles.js          Roles, permissions, and the permission table
│   ├── middleware/
│   │   ├── requestContext.js Request id + per-request child logger
│   │   ├── requireAuth.js    Layer 1 — 401
│   │   ├── requireRole.js    Layer 2 — 403
│   │   ├── rateLimit.js      Four limiters
│   │   ├── upload.js         multer config
│   │   └── errors.js         404 + the single error handler
│   ├── services/
│   │   ├── access.js         Layer 3 — row-level permission
│   │   ├── slots.js          Weekly schedule → bookable slots
│   │   └── audit.js          The audit trail writer
│   ├── lib/
│   │   ├── validate.js       Schema validator; strips unknown fields
│   │   ├── password.js       Strength rules + temp password generator
│   │   ├── time.js           Date/time strings, no Date objects
│   │   ├── jsonStore.js      Atomic-ish JSON file persistence
│   │   ├── logger.js         Structured JSON logging
│   │   ├── httpError.js      Typed HTTP errors
│   │   └── serializers.js    Row → safe JSON shapes
│   ├── routes/               12 routers (see §8)
│   ├── scripts/
│   │   ├── seed.js           Wipe + demo data
│   │   ├── check.js          47 unit checks
│   │   ├── check-api.js      68 end-to-end checks
│   │   ├── init-env.js       Generate .env with random secrets
│   │   ├── sampleFiles.js    Builds valid PDF/PNG bytes for the seed
│   │   └── migrate.js        STUB
│   ├── data/                 db.json (git-ignored)
│   └── uploads/              report files (git-ignored)
└── frontend/
    ├── index.html
    ├── vite.config.js
    ├── .env.example
    ├── scripts/smoke-render.js   39 route checks
    └── src/
        ├── main.jsx
        ├── App.jsx               Every route in one place
        ├── config.js             API_URL, token key, currency
        ├── api/client.js         The single fetch wrapper
        ├── auth/AuthContext.jsx  Who is logged in
        ├── components/           Layout, RouteGuards, ui, SlotPicker, ErrorBoundary
        ├── pages/                landing, auth/, patient/, doctor/, admin/, shared/
        └── styles/global.css     Design tokens
```

### Middleware order in `app.js`

Order is load-bearing and the file says so. Top to bottom:

1. **`trust proxy`** (if `TRUST_PROXY=true`) — first, because `req.ip` feeds the rate limiter and the audit log.
2. **`x-powered-by` disabled.**
3. **`helmet`** — with `contentSecurityPolicy: false` (this is a JSON API serving no HTML; the CSP that matters belongs on whatever serves the frontend) and `crossOriginResourcePolicy: 'cross-origin'` (so the frontend on :5173 can read a file response from the API on :3000).
4. **CORS** — an explicit allow-list from `FRONTEND_URL`, never `*`. A request with no `Origin` header (curl, a health check) is allowed, because CORS has nothing to protect there and blocking it would break the load balancer probe. `credentials: false`, since the app uses `Authorization` headers rather than cookies.
5. **Request context** — assigns `req.id` and a child logger.
6. **Body parsing** — `express.json({ limit: '64kb' })`. Deliberately small; file uploads do not come through here.
7. **Global rate limit.**
8. **Routes** — health first (also mounted outside `/api` for load balancers).
9. **`notFoundHandler`**, then **`errorHandler`** — which must be registered last or it never sees anything.

Each router calls `requireAuth` itself rather than relying on its mount point, so moving a mount can never silently expose one.

### Graceful shutdown

`server.js` handles `SIGTERM` and `SIGINT`: stop accepting connections, let open requests finish, flush the JSON store, exit — with a 10-second hard deadline in case a connection never closes. `unhandledRejection` and `uncaughtException` are logged in the same structured format and then exit, rather than carrying on in an unknown state.

---

## 7. Data model

Nine collections in `backend/data/db.json`. The object shapes here are intended to be the SQL table shapes later, so names should stay identical.

### `users`
One row per person, whatever their role.

| Field | Notes |
| --- | --- |
| `id` | UUID |
| `role` | `patient` \| `doctor` \| `admin` |
| `name`, `phone` | |
| `email` | **always lowercased** on write, so logins are case-insensitive |
| `passwordHash` | bcrypt. `null` in Cognito mode |
| `cognitoSub` | set only in Cognito mode |
| `isActive` | `false` blocks login immediately, on every request |
| `lastLoginAt` | |
| `resetTokenHash` | a **hash** of the reset token, never the token |
| `resetTokenExpiresAt` | |
| `createdAt`, `updatedAt` | ISO strings |

`users.update()` uses an **allow-list** of changeable fields, so a bug elsewhere that passes a whole request body cannot alter `role` or `passwordHash`.

### `specialties`
`id`, `name`, `description`, `createdAt`, `updatedAt`. Name uniqueness is checked case-insensitively, so "Cardiology" and "cardiology" cannot both exist and split the doctors between two identical filters.

### `doctors`
A doctor is a `users` row with role `doctor` **plus** a profile row here. Split deliberately: login details belong to every user, but a bio and a fee only make sense for a doctor.

`id`, `userId`, `specialtyId`, `bio`, `feeCents` (integer), `experienceYears`, `qualification`, timestamps.

Active/inactive is read from the **user** row, never duplicated here — one source of truth, so a deactivated login can never still appear as a bookable doctor.

### `availability`
A doctor's weekly recurring schedule. `id`, `doctorId`, `weekday` (0–6), `startTime`, `endTime`, `slotMinutes`, `createdAt`.

Replaced wholesale per doctor, never edited row by row.

### `appointments`
| Field | Notes |
| --- | --- |
| `id` | |
| `patientUserId` | → `users.id` |
| `doctorId` | → `doctors.id` (not the user id) |
| `date`, `startTime`, `endTime`, `slotMinutes` | strings |
| `reason` | |
| `status` | `booked` \| `completed` \| `cancelled` \| `no_show` |
| `feeCentsAtBooking` | copied in at booking so a later fee change does not rewrite the quote |
| `cancelledAt`, `cancelledByUserId`, `cancelReason` | |
| `completedAt` | |
| `rescheduledFrom` | points at the appointment this one replaced |
| `createdAt`, `updatedAt` | |

**A cancelled appointment frees its slot; every other status holds it** (`HOLDS_SLOT = status !== 'cancelled'`). This single rule means cancelling needs no extra bookkeeping.

### `reports`
Uploaded medical files. Only the **key** is stored — never the bytes, never a public URL.

`id`, `patientUserId`, `appointmentId` (nullable), `uploadedByUserId`, `fileKey`, `originalName`, `mimeType`, `sizeBytes`, `title`, `createdAt`.

The original filename is kept for display only and never decides where bytes land.

### `prescriptions`
`id`, `appointmentId` (**unique** — one per visit), `patientUserId`, `doctorId`, `medicines` (`[{ name, dose, frequency, days }]`), `notes`, timestamps.

### `auditLogs`
`id`, `action`, `actorUserId`, `actorRole`, `actorEmail`, `entityType`, `entityId`, `ip`, `userAgent` (truncated to 300 chars), `metadata`, `createdAt`.

**Append-only by construction:** the adapter exposes `create`, `list` and `distinctActions` — there is no `update` or `remove`. An audit trail you can edit is not an audit trail.

### Concurrency

`appointments.createIfSlotFree()` is one function, not "check then create". Node runs JavaScript on a single thread, so a block containing **no `await`** runs to completion before another request is handled — which makes the check-and-insert atomic. The critical section is explicitly marked in the source:

```js
// --- start of the critical section: no awaits in here ---
const taken = state.appointments.some(...);
if (taken) return null;
state.appointments.push(appointment);
// --- end of the critical section ---
await store.save();
```

PostgreSQL will get the same guarantee from a partial unique index instead (see [§14](#14-what-is-deliberately-not-built)).

### Persistence

`lib/jsonStore.js` holds the whole database in memory and rewrites the entire file on every change. Writes are chained so two saves cannot interleave, and consecutive changes collapse into one write. It writes to a temp file then renames over the real one, so a crash mid-write leaves the previous good file intact — with a direct-write fallback because on Windows a rename can fail if antivirus has the target open.

A corrupt data file makes the server **refuse to start** rather than silently discard the data. A file from an older version missing a newly added collection still loads, because the parsed object is merged onto the empty shape.

---

## 8. Complete API reference

Base URL `http://localhost:3000`. All request and response bodies are JSON unless noted.

**Error shape** — identical for every failure, from any layer:

```json
{
  "error": { "code": "forbidden", "message": "...", "details": { "email": "is required" } },
  "requestId": "..."
}
```

`details` appears only on validation failures (422). No stack trace, file path, SQL fragment or library message ever reaches the client — those go to the logs.

### Health

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/health` | — | For the load balancer. Returns **503** when the database is unreachable |
| GET | `/api/health` | — | Identical, for the frontend |

### Auth — `/api/auth`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/register` | — | **Patients only.** Role is hardcoded server-side. Rate limited: 10/hour. Returns a token (logs them straight in) |
| POST | `/login` | — | Rate limited 10 per 15 min, keyed by **IP + email**. Successful logins don't count against it |
| POST | `/logout` | token | Writes the audit entry. The token stays valid — the frontend discards it |
| GET | `/me` | token | Used on page load to check whether a stored token is still good |
| GET | `/password-rules` | — | So forms show the rules the backend actually enforces |
| POST | `/forgot-password` | — | Rate limited 5/hour. **Always the same reply**, whether or not the account exists |
| POST | `/reset-password` | — | Single-use token. Does **not** auto-login |
| POST | `/change-password` | token | Requires the current password, so a stolen token alone cannot lock the owner out |

In `AUTH_MODE=cognito` every password endpoint returns **501**.

### Public reads

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/specialties` | — | For the landing page and the filter dropdown |
| GET | `/api/doctors` | — | Filter by `specialtyId`, `search`; paginated. **Active doctors only** (hardcoded) |
| GET | `/api/doctors/:id` | — | One profile |
| GET | `/api/doctors/:id/slots` | — | The next few days of availability, each slot marked free / `booked` / `past` |

### Profile — `/api/profile`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/` | token | My details, plus my doctor profile if I have one |
| PATCH | `/` | token | **Name and phone only.** Role and email cannot be changed here |

### Appointments — `/api/appointments`

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| POST | `/` | `appointment:book` | Books a slot. Accepts only `doctorId`, `date`, `startTime`, `reason` |
| GET | `/` | any of read:own / read:assigned / read:all | **One endpoint, three roles.** Scope comes from the token, never a query param. Filters: `status`, `when=upcoming\|past`, `date`, `limit`, `offset` |
| GET | `/:id` | as above | Also returns `hasPrescription` / `prescriptionId` |
| POST | `/:id/cancel` | `appointment:cancel:own` | Blocked within 120 min of the slot |
| POST | `/:id/reschedule` | `appointment:reschedule:own` | Creates a **new** row and cancels the old one |
| POST | `/:id/outcome` | `appointment:setOutcome` | Doctor sets `completed` or `no_show`, only once the slot has started |

Booking validation, all server-side:

- `patientUserId` comes from the token; `feeCents`, `endTime`, `slotMinutes` and `status` are computed. None can be set from the body.
- The date must be today or later, and within `BOOKING_DAYS_AHEAD` (7).
- The slot must be a **real slot in the doctor's schedule** — the server rebuilds the doctor's slots and looks for an exact match, so `03:00` or `09:07` are both refused. Without this, `09:07` would sit between slots and quietly block the 09:00 one.
- The slot must not have already started.
- The patient must not already have a non-cancelled appointment at that time with anyone.
- Taking the slot is atomic; losing the race returns **409**, so the frontend knows to refresh rather than retry.

Reschedule claims the new slot **first** with the same atomic call, and only cancels the old one once the new one is safely held. If the claim fails, the patient keeps their original appointment. The old row remains as `cancelled` with a reason, and the new row points back via `rescheduledFrom` — an honest history.

### Reports — `/api/reports`

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/` | `report:readOwn` or `report:readAssigned` | A patient always gets their own — a `patientUserId` for someone else is silently ignored, not an error, so there is no way to probe for other patients' ids. A doctor **must** name a patient and only gets them if they treat them |
| POST | `/` | `report:uploadOwn` | `multipart/form-data`, field name **`report`**. Owner is always the uploader |
| GET | `/:id` | read own/assigned | Metadata |
| GET | `/:id/download-url` | read own/assigned | **The permission gate for all file access.** Returns a link valid for 5 minutes |

Upload limits: **5 MB**, exactly one file, max 10 form fields. Allowed types `application/pdf`, `image/png`, `image/jpeg` — checked by **both** MIME type and extension.

### Prescriptions — `/api/prescriptions`

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/` | readOwn / readAssigned | Patient: mine. Doctor: ones I wrote |
| GET | `/:id` | readOwn / readAssigned | |
| POST | `/` | `prescription:write` | Appointment must be **`completed`**; one prescription per appointment |
| PATCH | `/:id` | `prescription:write` | Corrections only, by the doctor who wrote it |

`patientUserId` and `doctorId` are taken from the **appointment**, never the body.

### Patient workspace — `/api/patient`

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/dashboard` | `stats:patient` |

### Doctor workspace — `/api/doctor`

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/dashboard` | `stats:doctor` | Counts only their own work |
| GET | `/patients` | `report:readAssigned` | Distinct patients they have seen |
| GET | `/patients/:patientUserId` | `report:readAssigned` | 403 unless they treat that patient |
| GET | `/availability` | `availability:manageOwn` | |
| PUT | `/availability` | `availability:manageOwn` | **Replaces the whole week.** Max 21 blocks |
| PATCH | `/profile` | `doctor:editOwnProfile` | Bio, fee, qualification, experience — **not** specialty |

Availability validation beyond the schema: end must be after start; the block must fit at least one slot; `slotMinutes` is clamped to 5–240 (which also prevents `0`, an infinite loop when generating slots); overlapping blocks on one day are refused.

Saving a schedule **does not** cancel appointments that fall outside the new hours. Instead the response returns `warnings` and an `orphanedAppointments` list for the doctor to handle. Silently cancelling patients' appointments because a form was saved would be far worse.

### Admin — `/api/admin`

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/stats` | `stats:admin` | Counts run in parallel via `Promise.all` |
| GET | `/doctors` | `doctor:manage` | **Includes deactivated**, unlike the public list |
| POST | `/doctors` | `doctor:manage` | Generates the password and **emails** it; never returns it |
| PATCH | `/doctors/:id` | `doctor:manage` | Splits the patch across the user and doctor rows |
| GET | `/specialties` | `specialty:manage` | With `doctorCount`, so the UI can show which cannot be deleted |
| POST | `/specialties` | `specialty:manage` | |
| PATCH | `/specialties/:id` | `specialty:manage` | |
| DELETE | `/specialties/:id` | `specialty:manage` | **409** while any doctor still uses it |
| GET | `/users` | `user:manage` | Filter by role, active, search |
| PATCH | `/users/:id/status` | `user:manage` | Deactivate / reactivate |
| GET | `/appointments` | `appointment:read:all` | Clinic-wide, newest first, with `hasMore` |
| GET | `/audit-logs` | `audit:read` | Max `limit` 200. Also returns `availableActions` for the filter dropdown |

Two guards prevent an admin lockout: an admin **cannot change their own status**, and **the last active admin cannot be deactivated**.

Deactivation rather than deletion is deliberate: appointments, reports and prescriptions must stay, and deleting the user row would leave all of them pointing at nothing. Deactivating stops the login immediately — `auth.local.js` checks `isActive` on **every request**, which is why the test `deactivating a patient stops their existing token working` passes.

There is **no admin route for reading reports or prescriptions**, and the permission table does not grant one.

### Files — `/api/files`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/:token` | **none, by design** | The signed token *is* the authorisation |

Local storage mode only. The token was issued by `/api/reports/:id/download-url` after a full permission check, and carries an HMAC-SHA256 signature plus an expiry. This is how an S3 pre-signed URL works, which is why a browser can simply follow the link with no header attached.

The trade-off is stated openly in the source: for the few minutes it is alive, anyone holding that link can fetch that one file. Hence the short expiry, the per-file (not per-folder) scope, and the permission check and audit entry at issue time.

Responses set `Content-Type` to the **type recorded at upload** (never sniffed from content), `Content-Disposition: attachment` with a sanitised filename, and `Cache-Control: private, no-store, max-age=0` so no shared cache keeps a medical file.

---

## 9. The security model

Three layers, each answering a different question. The file comments are explicit that collapsing them produces copy-pasted checks, and the one that gets missed is the hole.

| Layer | Where | Question | Failure |
| --- | --- | --- | --- |
| 1 | `middleware/requireAuth.js` | Is there a valid token for an **active** account? | **401** → frontend redirects to login |
| 2 | `middleware/requireRole.js` | May your **role** do this at all? | **403** → frontend shows Access Denied |
| 3 | `services/access.js` | May you touch **this row**? | **403** |

401 vs 403 is not cosmetic: 401 means "log in and try again", 403 means "logging in again will not help". Returning the wrong one sends users round a redirect loop.

### Layer 1

Reads `Authorization: Bearer <token>`, verifies it, resolves the user, and **rejects deactivated accounts on every request**. It attaches a deliberately narrow `req.user` — `passwordHash` and `resetTokenHash` are stripped here, so they cannot leak through a route that returns `req.user` by mistake. It also adds the user id and role to the request's logger, so logs show who did what without each route remembering.

`optionalAuth` exists for routes that behave differently when logged in but do not require it; a bad token there is treated the same as no token.

### Layer 2 — the permission table

Routes ask for a **permission**, not a role name. `auth/roles.js` decides which roles hold it. The rationale is stated in the file: if routes said `if (user.role === 'admin')`, adding a receptionist role would mean hunting through every file, and the one you miss is a security hole. Here it is one new entry.

The `:own` / `:assigned` / `:all` suffixes encode **scope**. The permission gets you to the route; layer 3 decides which rows.

| Permission | patient | doctor | admin |
| --- | :-: | :-: | :-: |
| `appointment:book` | ● | | |
| `appointment:read:own` | ● | | |
| `appointment:read:assigned` | | ● | |
| `appointment:read:all` | | | ● |
| `appointment:cancel:own` | ● | | |
| `appointment:reschedule:own` | ● | | |
| `appointment:setOutcome` | | ● | |
| `doctor:read` | ● | ● | ● |
| `doctor:manage` | | | ● |
| `doctor:editOwnProfile` | | ● | |
| `availability:manageOwn` | | ● | |
| `specialty:manage` | | | ● |
| `report:uploadOwn` | ● | | |
| `report:readOwn` | ● | | |
| `report:readAssigned` | | ● | |
| `prescription:readOwn` | ● | | |
| `prescription:readAssigned` | | ● | |
| `prescription:write` | | ● | |
| `user:manage` | | | ● |
| `audit:read` | | | ● |
| `stats:patient` | ● | | |
| `stats:doctor` | | ● | |
| `stats:admin` | | | ● |

**The admin column is the interesting one.** An admin has no `report:readOwn` and no `prescription:readOwn`. Running the clinic is not a clinical reason to read someone's test results. Keeping that out of the table is the point of least privilege, and two end-to-end tests enforce it.

Two fail-fast guards: the table is checked at startup against the declared permission list, so a typo throws on boot; and `can()` **throws** on an unknown permission rather than returning `false`, because a route asking for a permission that does not exist is a bug, and the safe answer to a broken question is not a silent allow.

`permissionsFor(role)` is sent to the frontend so it can hide menu items — convenience only, never enforcement.

### Layer 3 — row-level access

These are functions, not middleware, because the check needs the **row**, so it must run after the database lookup. Each loader fetches and checks in one step, so **a route cannot obtain a row without having been checked** — the only way to get one is to call a function that checks.

| Function | Rule |
| --- | --- |
| `requireDoctorProfile(user)` | Resolve a doctor user → their doctor profile row |
| `doctorTreatsPatient(doctorId, patientUserId)` | Any appointment counts, **including cancelled** ones |
| `assertCanViewPatientRecords(user, patientUserId)` | The patient themselves, or a doctor who treats them. **An admin fails this** |
| `loadAppointment(user, id)` | Patient: own only. Doctor: own only. Admin: via `read:all` |
| `loadReport(user, id)` | Reuses the patient-records rule, so reports and visit history can never drift apart |
| `loadPrescription(user, id)` | **Stricter than reports**: a doctor may read only prescriptions **they wrote** |

Two documented judgement calls:

- **403, not 404, for someone else's record.** This confirms the id exists, which a strict reading of information-hiding would avoid. Accepted because ids are unguessable UUIDs (so the leak is worth little) and a clear "you are not allowed" teaches the boundary better than a vague "not found".
- **Prescriptions are stricter than reports.** A doctor sharing a patient does not get to read what a colleague prescribed — that is the other doctor's clinical record to explain.

---

## 10. Security controls inventory

### Input handling

- **Every input is validated on the backend**, in `lib/validate.js`. The form is a convenience for honest users; anyone can use curl.
- **Unknown fields are stripped.** A body of `{ name: "A", role: "admin" }` against a schema allowing only `name` silently drops `role`. This blocks mass assignment — a patient promoting themselves by adding a field the frontend never sends.
- Routes read **`req.valid`, never `req.body`**, so an unvalidated field cannot reach the database by accident.
- Role is **hardcoded** at both registration (`patient`) and admin doctor-creation (`doctor`), as a second layer behind the stripping.
- Types available: `string`, `email`, `phone`, `password`, `enum`, `date`, `time`, `int`, `boolean`, `id` (UUID shape), `array` (with per-item field schemas and indexed error paths like `medicines[2].dose`).
- Emails are lowercased; phone numbers are stripped of spaces, dashes and brackets.
- UUID-shape checking on ids means SQL injection attempts in an id fail at the validator.
- Every paginated endpoint has a **hard `max` on `limit`** (100, or 200 for audit logs). Without one, `?limit=999999999` is a cheap way to exhaust server memory.

### Passwords

- Minimum **10 characters**, with lowercase, uppercase and a digit. The reasoning is in the file: length does more for safety than a zoo of required symbols, which mostly pushes people to `Password1!`.
- A blocklist of ~18 common passwords, **including the app's own name**.
- Rejects passwords containing the user's **own name or email local-part** (≥ 4 chars) — the first thing an attacker who knows them will try.
- bcrypt with 10 rounds. Passwords are SHA-256 pre-hashed before bcrypt, so the 72-byte bcrypt limit does not truncate long passwords.
- **Login does not apply strength rules** — only `string`. Checking them at login would reject an old password predating the rules, and would quietly tell an attacker which guesses are not worth making.
- Admins never choose a doctor's password. `generateTemporaryPassword()` builds a 14-character password with a cryptographic RNG, excluding look-alike characters (`0/O`, `1/l/I`), guarantees one of each required class, then Fisher–Yates shuffles so the guaranteed characters are not always in positions 1–3. It is **emailed, not returned in the response**, so the admin creating the account never learns it.
- `GET /api/auth/password-rules` serves the rules from the same constant the validator uses, so the forms cannot drift out of date.

### Account enumeration

The codebase treats this as a genuine privacy issue, because *which email addresses have accounts at a clinic* is itself private information about a person.

- **Login** returns one identical message for wrong email, wrong password and deactivated account.
- **Timing is equalised.** When no account exists there is no stored hash, so `verifyPassword` compares against a **real pre-built bcrypt hash** at the same cost factor. The dummy hash is built during startup so the first failed login is not slower than the rest. A comment records that a malformed string like `'$2a$10$invalid'` does *not* work, because bcryptjs rejects it immediately without doing the work — that was the bug this replaced.
- **Forgot-password** gives the same reply either way.
- **Register deliberately does leak** that an email is taken. The trade-off is reasoned out in the source: the alternative confuses honest users badly, and the login page leaks the same fact anyway, so the effort goes into rate limiting instead.

### Rate limiting

| Limiter | Window | Max | Key |
| --- | --- | --- | --- |
| Login | 15 min | 10 | **IP + email** |
| Forgot password | 60 min | 5 | **IP + email** |
| Register | 60 min | 10 | IP |
| Global | 15 min | 1000 | IP |

Keying login on **both** IP and email is explained: IP alone lets an attacker on a rotating proxy pool hammer one account while punishing a whole office behind one public IP; email alone lets an attacker lock a victim out on purpose. Successful logins are not counted. Health checks are exempt from the global limiter, or a load balancer would conclude a healthy instance is dead.

**These counters live in one process's memory** — two instances behind a load balancer means the real limit doubles.

### File handling

- Files are **never in a public folder** and **never have a stable URL**.
- Permission is checked **when the link is issued**, while the server still knows who is asking.
- Links expire in **5 minutes**, in both local and S3 mode.
- Stored keys are `reports/<ownerId>/<date>/<random>.<ext>` with a 16-byte random name and an **allow-listed extension** (anything unexpected becomes `.bin`). Two patients uploading `scan.pdf` cannot collide, and the original name — which could be `../../server.js`, 400 characters long, or a Windows reserved name like `CON` — never decides where bytes land.
- `resolveKeyToPath()` rejects `..`, null bytes, absolute paths and drive letters, then **re-checks after resolving** that the result is still under the upload root. Defence at the boundary, because a key also arrives from the database on download.
- Signature comparison uses **`crypto.timingSafeEqual`**, with a length check first. A plain `===` leaks, through timing, how many leading characters of a guessed signature were right — enough to forge one byte at a time.
- A forged signature, a tampered payload and an expired link all produce the **same message**. Telling them apart would help someone work out how the signing works.
- Downloads are served with the recorded `Content-Type` (never sniffed), `Content-Disposition: attachment`, and `no-store`. Combined with helmet's `nosniff`, this stops a file that is secretly HTML from being rendered as a page in the API's origin.
- The MIME/extension check is honestly labelled in the source as checking *what the browser claims* — a renamed executable with a `.pdf` extension passes. Real protection comes from never executing uploads, the fixed `Content-Type`, and the attachment disposition.

### Audit trail

Distinct from application logs, and the file says why: logs are for engineers and get rotated away; an audit trail answers "which staff member opened this patient's report, and when" — a question that can arrive months later, from a regulator or a court.

25 fixed action constants across five groups: authentication, records that must be traceable, clinical activity, and **file access** (`report.uploaded`, `report.downloaded`, `report.access.denied`).

- `report.downloaded` is written **before the link is handed over**, so a download cannot happen without a log entry existing for it. Its metadata records `viewerRole` and `onBehalfOf: 'self' | 'other'`, making it obvious when a doctor opened a patient's file rather than the patient opening their own.
- A **refused** report access (403) is recorded too — that is the signal someone is probing for other people's records.
- Failed logins record the attempted address and the **real** reason (`no_such_user` / `wrong_password` / `account_inactive`). The detail is kept where only an admin can read it, not handed to whoever is trying.
- Prescription events log a `medicineCount` but **not the medicines**, because the audit log is read by admins, who have no clinical role.
- An audit-write failure is **deliberately swallowed** and logged at error level. Failing to write an audit row must not turn a successful booking into an error for the patient. The source notes a strict compliance regime would make the opposite choice.
- Unknown action names **throw**, so a typo cannot create a near-duplicate that hides events from a search.

### Error handling

One handler, so exactly one piece of code decides what the outside world learns. Library errors (multer limits, malformed JSON, oversized bodies) are normalised into typed `HttpError`s first, so the handler has one kind of error to think about. Known errors return their user-facing message; anything unexpected returns a flat 500 with `requestId` and nothing else. 4xx is logged at `warn` so patterns — many 403s from one IP — stay visible.

The 404 handler is deliberately vague: it does not reveal that a path exists but the method was wrong, which would help someone map the API.

### Secrets

- In **production**, missing `JWT_SECRET` or `FILE_SIGNING_SECRET` is a **hard startup failure**, and a secret under 32 characters is rejected.
- In **development** a throwaway secret is generated so the app runs with no setup — and the cost is announced loudly at `warn` level, naming the consequence (restarting logs everyone out).
- `JWT_SECRET` and `FILE_SIGNING_SECRET` are **separate**, with the reasoning given: different lifetime and blast radius. Rotating file links should not log every user out, and in Cognito mode there is no `JWT_SECRET` to borrow.
- The Postgres password is fetched through the **secrets adapter**, not read from `config`, so AWS mode can pull it from Secrets Manager.

### Other

- `TRUST_PROXY` defaults to **off**, and the comment explains this is a security hole rather than a nuisance: trusting a proxy that is not there lets a client spoof `X-Forwarded-For` and dodge the rate limiter.
- CORS is an explicit allow-list, never `*`, with `credentials: false`.
- JSON bodies are capped at **64 KB**.
- `x-powered-by` is disabled.
- A `publicUser()` / serializer helper is used everywhere rather than returning rows directly, so a newly added sensitive column cannot leak because one route forgot to strip it.
- Token lifetime is **2 hours**. The logout endpoint cannot truly revoke a stateless JWT, and the source says so plainly, naming the real fix (a denylist in a shared store) and the trade-off it costs.

---

## 11. Frontend

### Structure

- **`App.jsx`** — every route in one file. Each role area is a single `<Route>` wrapped in `<RequireRole>` with a nested `<Outlet />`, so a new page added inside an area is protected automatically; there is no per-page guard to forget.
- **`api/client.js`** — the one fetch wrapper. The token is attached in one place so no page can forget it; errors arrive as one `ApiError` with `status`, `code`, `message`, `details` and `requestId`; and a 401 anywhere clears the token and dispatches a `medibook:session-expired` browser event. A plain event is used rather than importing the auth context, which would be a circular import.
- **`auth/AuthContext.jsx`** — who is logged in; listens for the expiry event.
- **`config.js`** — `API_URL`, `CLINIC_NAME`, `TOKEN_STORAGE_KEY`, `CURRENCY_SYMBOL` (₹), `CENTS_PER_UNIT`.
- **`components/`** — `Layout`, `RouteGuards`, `ui`, `SlotPicker`, `ErrorBoundary`.
- **`styles/global.css`** — design tokens.

Three error paths are handled distinctly: a network failure reports "Could not reach the server. Check that the backend is running" (the most likely cause while developing, since fetch cannot distinguish server-down from CORS); a non-JSON response reports a proxy got in the way; and `AbortError` is re-thrown untouched, because an aborted request means the component unmounted, not a failure.

`FormData` bodies deliberately get **no** `Content-Type` header — the browser must add it itself, because it includes the multipart boundary.

### The 39 routes

**Public (7):** `/`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/access-denied`, `*` (404)

`/login`, `/register` and `/forgot-password` are wrapped in `<RequireAnonymous>`, so a signed-in user is sent to their dashboard instead of a form they do not need. **`/reset-password` deliberately is not** — someone may follow the emailed link while still logged in on another tab, and that should work.

**Patient (8):** `/patient`, `/patient/doctors`, `/patient/doctors/:doctorId`, `/patient/doctors/:doctorId/book`, `/patient/appointments`, `/patient/reports`, `/patient/prescriptions`, `/patient/profile`

**Doctor (7):** `/doctor`, `/doctor/appointments`, `/doctor/appointments/:appointmentId/prescription`, `/doctor/patients`, `/doctor/patients/:patientUserId`, `/doctor/availability`, `/doctor/profile`

**Admin (7):** `/admin`, `/admin/doctors`, `/admin/specialties`, `/admin/appointments`, `/admin/users`, `/admin/audit-log`, `/admin/profile`

Plus `/dashboard` → redirect to `/` (a legacy link), and the 10 negative guard assertions the smoke test adds.

**The route guards are for navigation only.** The API checks every request for itself.

### Token storage

`localStorage`, not a cookie, with the trade-off written down in `config.js`: localStorage cannot be sent automatically by the browser, so there is no CSRF risk, but JavaScript can read it, so an XSS bug could steal it. An httpOnly cookie flips those two around. localStorage was chosen because it keeps working when the site is a static build on CloudFront calling an API on a different domain. Every access is wrapped in try/catch, because localStorage throws in a private window with site data blocked — such a visitor should see "please log in", not a crashed page.

### Build-time configuration

Vite replaces `import.meta.env.VITE_*` at **build** time, not run time. A site built for localhost will still call localhost after being uploaded to S3. It must be rebuilt per environment with the right `VITE_API_URL`.

Only `VITE_`-prefixed variables are exposed, and `.env.example` warns that anything in that file ends up in the bundle every visitor downloads — so never a secret.

---

## 12. Configuration reference

Every switch the app has, all read once in `config.js`. The rest of the code never touches `process.env`, so this one file is the complete list, and a typo in an env name fails at startup rather than deep inside a route.

### Core

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` makes missing secrets fatal |
| `PORT` | `3000` | |
| `LOG_LEVEL` | `debug` dev / `info` prod | |
| `TRUST_PROXY` | `false` | Only enable behind a real ALB/CloudFront |
| `FRONTEND_URL` | `http://localhost:5173` | Comma-separated CORS allow-list |
| `API_PUBLIC_URL` | `http://localhost:3000` | Used to build absolute download links |
| `TZ` | system | Set to the clinic's timezone in production |

### Adapter modes

| Variable | Allowed | Default |
| --- | --- | --- |
| `DB_MODE` | `local` \| `postgres` | `local` |
| `STORAGE_MODE` | `local` \| `s3` | `local` |
| `AUTH_MODE` | `local` \| `cognito` | `local` |
| `MAIL_MODE` | `console` \| `ses` | `console` |
| `SECRETS_MODE` | `env` \| `aws` | `env` |

### Paths, auth, uploads, booking

| Variable | Default |
| --- | --- |
| `DATA_DIR` | `backend/data` |
| `UPLOAD_DIR` | `backend/uploads` |
| `JWT_SECRET` | generated in dev, **required in prod** |
| `JWT_EXPIRES_IN` | `2h` |
| `JWT_ISSUER` | `medibook` |
| `BCRYPT_ROUNDS` | `10` |
| `PASSWORD_RESET_TTL_MINUTES` | `30` |
| `UPLOAD_MAX_BYTES` | `5242880` (5 MB) |
| `FILE_SIGNING_SECRET` | generated in dev, **required in prod** |
| `FILE_URL_TTL_SECONDS` | `300` |
| `BOOKING_DAYS_AHEAD` | `7` |
| `BOOKING_CANCEL_CUTOFF_MINUTES` | `120` |

Allowed upload MIME types are hardcoded, not configurable: `application/pdf`, `image/png`, `image/jpeg`.

### Rate limits

`RATE_LIMIT_LOGIN_WINDOW_MINUTES` (15), `RATE_LIMIT_LOGIN_MAX` (10), `RATE_LIMIT_FORGOT_WINDOW_MINUTES` (60), `RATE_LIMIT_FORGOT_MAX` (5), `RATE_LIMIT_GLOBAL_WINDOW_MINUTES` (15), `RATE_LIMIT_GLOBAL_MAX` (1000).

### Mail

`MAIL_FROM` (`MediBook <no-reply@medibook.local>`), `SES_REGION`.

### AWS — unused while the modes above are local

**Postgres:** `DATABASE_URL`, `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD_SECRET_KEY`, `PGSSL`, `PGPOOL_MAX`
**S3:** `S3_BUCKET`, `S3_REGION`, `S3_KEY_PREFIX`, `S3_SIGNED_URL_TTL_SECONDS`
**Cognito:** `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_GROUP_ROLE_MAP` (JSON; invalid JSON throws at startup)
**Secrets Manager:** `AWS_SECRET_ID`, `AWS_SECRET_REGION`, `AWS_REGION`

### Frontend

| Variable | Default |
| --- | --- |
| `VITE_API_URL` | `http://localhost:3000` |
| `VITE_CLINIC_NAME` | `MediBook` |

---

## 13. Design decisions worth knowing

**Slots are calculated, never stored.** A doctor says "Mondays, 9am–1pm, 30-minute slots" — that is a few availability rows. Storing every slot would mean generating thousands in advance, deciding how far ahead to go, and regenerating the lot whenever hours change. Calculating on demand keeps one source of truth. What *is* stored is the booked appointment, which is the only thing that must be remembered.

**Dates and times are plain strings** (`2026-10-05`, `14:30`), not `Date` objects, so a server in another timezone cannot shift every appointment by hours. `lib/time.js` owns all the arithmetic.

**Money is an integer number of paise** (`feeCents`). `0.1 + 0.2 !== 0.3`, and money a fraction of a rupee out is a bug nobody wants. The frontend multiplies the rupee value by 100.

**The fee is copied into the appointment at booking** (`feeCentsAtBooking`). If a doctor later raises their fee, an old appointment must still show what the patient was actually quoted. Rescheduling carries the original quote over.

**One list endpoint, three roles, scope from the token.** The tempting design is `GET /api/appointments?patientUserId=X`, which forces an ownership comparison everywhere — and the day someone forgets it, patient A reads patient B's diary by editing a URL. Deriving the filter from `req.user` makes that impossible: there is no parameter to tamper with.

**Reschedule creates a new row.** Editing in place would mean freeing the old slot and claiming the new one as two steps, and a failure between them either loses the booking or double-books. Claiming first means a failure leaves the patient's original appointment untouched.

**Availability is replaced wholesale with `PUT`.** The screen edits the week as one form, so sending the whole week means what is saved is exactly what the doctor sees. Per-row calls would allow a half-saved week — a doctor who believes they have blocked Friday off but has not.

**A doctor cannot change their own specialty.** Which department a doctor belongs to is a clinic decision, and reassigning themselves would change which booking filters show them.

**Doctors cannot self-register.** A doctor account can read patient records, so letting anyone sign up as one would let anyone read medical files. Registration is patients-only with the role hardcoded, and doctors are created by an admin.

**Reset tokens are stored hashed.** If someone reads the database they still cannot use the tokens, exactly like passwords. The plain token exists only in the email. It is cleared on use, so a link in someone's email history cannot be replayed.

**Password reset does not auto-login.** Whoever holds the link has not typed the new password into a login form yet; making them do so proves they know it.

**Changing a password requires the current one**, even while logged in, so a stolen token alone cannot lock the real owner out.

**`doctorTreatsPatient` counts cancelled appointments.** The patient did choose to book with this doctor, and a doctor preparing for a visit that was later moved still has a reason to look. The source notes where to make it stricter.

**Prescriptions require a `completed` appointment.** A prescription records what happened at a visit, so the visit has to have happened — which also means a no-show or cancelled appointment can never carry one. One per appointment: a correction is an edit, so the patient never sees two conflicting lists for the same visit.

**Deactivate, never delete.** Records must survive, and deleting a user row would orphan every appointment, report and prescription pointing at it.

**The login page's demo panel would be deleted before any real deployment.**

---

## 14. What is deliberately not built

The AWS side is intentionally unwritten. Every function exists as a stub that throws a clear error, with a TODO comment naming what to write, which AWS service it is, and which npm package is needed. **No AWS SDK packages are installed** — each is installed only when its section is reached.

**66 stub functions across 5 files.**

### The recommended order (from `AWS-TODO.md`)

Chosen so each step is testable alone and nothing depends on something unbuilt.

| # | Service | File | Functions | Package |
| --- | --- | --- | --- | --- |
| 1 | **SES** (mail) | `mailer.ses.js` | 2 | `@aws-sdk/client-sesv2` |
| 2 | **Secrets Manager** | `secrets.aws.js` | 2 | `@aws-sdk/client-secrets-manager` |
| 3 | **S3** (storage) | `storage.s3.js` | 6 | `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` |
| 4 | **RDS / PostgreSQL** | `db.postgres.js` | 53 | `pg` |
| 5 | **Cognito** (auth) | `auth.cognito.js` | 3 | `aws-jwt-verify` |

SES first because it is one function with instant feedback. Secrets second because RDS needs it. Cognito last because it changes how login works.

### Also not built

- **`backend/schema.sql`** does not exist. It is to be written from the object shapes in `db.local.js`, keeping names identical so nothing else changes.
- **`backend/scripts/migrate.js`** is a stub. It should read `schema.sql` and run it.
- **No deployment artifacts:** no Dockerfile, no CloudFormation/CDK/Terraform, no CI pipeline.

### The three constraints that matter most in the Postgres phase

1. **Always use parameterised queries** — `client.query(sql, [values])`. `db.postgres.js` is the only file in the app where SQL injection is even possible.
2. **`createIfSlotFree` must not be "SELECT then INSERT".** Let a partial unique index reject it and catch error code `23505`, returning `null` so the route turns it into a 409:
   ```sql
   CREATE UNIQUE INDEX appointments_slot_unique
     ON appointments (doctor_id, date, start_time)
     WHERE status <> 'cancelled';
   ```
   This index is what makes booking safe under real traffic, and the `WHERE` clause is what lets a cancelled appointment free its slot.
3. **`availability.replaceForDoctor` needs a transaction.** It deletes then inserts; a failure in between leaves a doctor with no schedule at all, so they vanish from every booking calendar.

### Deployment notes the app is already shaped for

- **Frontend on S3 + CloudFront.** Build with the right `VITE_API_URL`, and add the CloudFront domain to `FRONTEND_URL` on the backend or CORS will block it.
- **Backend on EC2/ECS.** Attach an IAM role; the SDK picks credentials up automatically. **No access keys in any file** — the habit the whole structure exists to teach.
- **Health check** at `GET /health`, which returns 503 when the database is unreachable, so a broken instance is removed from rotation.
- **Set `TRUST_PROXY=true`** only once there really is a proxy in front.
- **Rate limits need a shared store** (ElastiCache/Redis) once there is more than one instance.
- **Logs are JSON on stdout**, ready for CloudWatch.
- **`JWT_SECRET` and `FILE_SIGNING_SECRET` must be identical across instances**, or tokens issued by one are rejected by another.
- **Block all public access on the S3 bucket**, enable default encryption, and never pass `ACL: 'public-read'` — the one mistake that turns this into a data breach.

---

## 15. Known issues and risks

### 1. Phase 6 is uncommitted — the main risk right now

Five admin pages, `AWS-TODO.md`, and four modified files exist only in the working tree. All of it passes its tests. A stray `git checkout` or a disk problem loses it. **Commit it.**

### 2. The branch name is five phases stale

`phase-1-backend-foundation` while the work is at phase 6. Worth renaming or merging.

### 3. One flaky unit test

`checking a non-existent account costs the same as a real one` fails intermittently (observed once in five runs). It is a wall-clock bcrypt measurement whose *first* sample absorbs V8 warm-up, making the real-account baseline read ~2× slow and pushing the `0.5 ×` threshold above the genuine second sample.

The security property itself is sound. Possible fixes, in order of preference: take a warm-up measurement of each case and discard it; measure both several times and compare medians; or loosen the ratio to ~0.3. The last is the least informative.

### 4. Genuine scale limits, by design

- **The JSON store rewrites the entire file on every change** and holds everything in RAM. Fine for a demo; it would fall over with real traffic. This is the point of `DB_MODE=postgres`.
- **Uploads are buffered in memory** (5 MB cap). For larger files the browser should PUT straight to S3 with a pre-signed URL and the API never see the bytes.
- **Rate limit counters are per-process.**
- **`doctors.findDetailById` loads and joins the whole doctor list** to find one row. Harmless at 6 doctors; the Postgres version should be a single indexed query.
- **`appointments.list` builds its joins in JavaScript** on every call, and several routes call it twice (once for the row, once for the joined names).

### 5. Accepted trade-offs, not bugs

Each of these is a deliberate, documented decision. Listed so nobody "fixes" one without reading the reasoning.

- **Registration leaks that an email is taken** (§10).
- **403, not 404, for another user's record** (§9).
- **A signed download link works for anyone holding it** for up to 5 minutes (§8).
- **Logout cannot revoke a stateless JWT**; the token lives up to 2 hours.
- **The upload MIME/extension check only validates what the browser claims.**
- **An audit-write failure is swallowed** rather than failing the user's action.
- **Saving availability does not cancel now-orphaned appointments** — it warns instead.
- **Token in `localStorage`**: no CSRF exposure, but XSS could steal it.

### 6. Operational notes

- Restarting the server **without** `backend/.env` invalidates all sessions and download links. The file is currently present, so this is not an active problem.
- `npm run seed` **wipes everything**. It refuses to run when `NODE_ENV=production`.
- `npm run check:api` is safe to run anytime — it uses its own temp sandbox and never touches development data.
- Appointment times are compared against the **server's local time**, so `TZ` matters in production.
- Demo data was seeded 1 October 2026 with appointments spread around that date. As real time moves on, more of it falls into the past; re-seed to refresh the upcoming/past balance.

---

## 16. Suggested next steps

**Immediately:**

1. **Commit Phase 6.** Five admin pages, `AWS-TODO.md` and the smoke-test extension are passing but unprotected.
2. **Rename the branch** to match reality, or merge it.

**Small, high-value cleanups:**

3. Stabilise the flaky timing test (§15.3).
4. Re-seed if you want demo data centred on the current date.

**Then the migration, in the documented order:**

5. **SES** — 2 functions. Verify a sender identity first; a new SES account is sandboxed and can only send to verified addresses.
6. **Secrets Manager** — 2 functions. One secret holding a JSON object. Never log the parsed object or any value in it. (SSM Parameter Store `SecureString` is a cheaper alternative with a free standard tier.)
7. **S3** — 6 functions. Set up the bucket with all public access blocked and default encryption *before* writing code.
8. **RDS/PostgreSQL** — the big one, 53 functions. Write `schema.sql` first, then `init`/`health` (so `GET /health` tells you whether you can connect), then `users` (enough to log in), then everything else, then `migrate.js`. Do not skip the partial unique index.
9. **Cognito** — 3 functions, last. `resolveUser` is the one that matters: map groups to roles and **refuse if no group maps** rather than falling back to `patient`; find users by `sub`, never email; and only link an existing row if `email_verified` is true, or you have built an account-takeover bug.

Each switch is one line in `backend/.env`. Change one at a time — if something breaks, set it back to the local value and the app works again. That is the whole point of the arrangement.
