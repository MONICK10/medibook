# MediBook

A healthcare appointment web app, built to be run locally with no cloud
account, and then moved onto AWS one service at a time.

Three roles: **patient**, **doctor**, **admin**. Patients book
appointments and upload medical reports, doctors manage their schedule
and write prescriptions, admins run the clinic.

All data is invented. There is no real patient information anywhere in
this repository.

> **Build status: phase 1 of 7 complete (backend foundation).**
> The API has health, authentication and the audit log. The rest of the
> API arrives in phase 2 and the React frontend in phases 3 to 6.
> See [Build phases](#build-phases) below, and do not start the
> frontend yet - it is still the old starter version and does not match
> the new API.

---

## What makes this project unusual

Every part of the app that would become an AWS service in production is
isolated in its own **adapter** file, chosen by one environment
variable. The same code runs entirely on your laptop or against AWS,
and nothing outside the adapter knows which.

| Adapter                  | Local (default)         | AWS                        | Switch         |
| ------------------------ | ----------------------- | -------------------------- | -------------- |
| `adapters/db.js`         | JSON file in `data/`    | PostgreSQL on RDS          | `DB_MODE`      |
| `adapters/storage.js`    | files in `uploads/`     | private S3 bucket          | `STORAGE_MODE` |
| `adapters/auth.js`       | bcryptjs + our own JWT  | Amazon Cognito             | `AUTH_MODE`    |
| `adapters/mailer.js`     | prints to the terminal  | Amazon SES                 | `MAIL_MODE`    |
| `adapters/secrets.js`    | `.env` file             | AWS Secrets Manager        | `SECRETS_MODE` |

Each adapter file starts with a comment block explaining the interface
and **why** it is worth splitting out. The AWS implementations are
written in phase 7.

---

## Requirements

- **Node.js 20.9 or newer.** Check with `node --version`.
  Download from <https://nodejs.org> if you need it.
- Nothing else. No database to install, no Docker, no AWS account.

---

## Run it locally

```bash
cd medibook/backend
npm install
npm run seed
npm run dev
```

That is all three steps. `npm run seed` creates `backend/.env` with
freshly generated secrets, fills the local database with demo data, and
prints the demo logins. `npm run dev` starts the API on
<http://localhost:3000> and restarts it when you edit a file.

Check it is alive:

```bash
curl http://localhost:3000/api/health
```

```json
{ "status": "ok", "modes": { "db": "local", "storage": "local", ... } }
```

To stop it, press **Ctrl + C**.

### Frontend

Not yet. The `frontend/` folder still holds the original starter app,
which calls API routes that no longer exist. It is replaced in phase 3.

---

## Demo logins

Created by `npm run seed`. Every account uses the same password:

```
ClinicDemo#2026
```

| Role    | Email                           | Notes             |
| ------- | ------------------------------- | ----------------- |
| Admin   | `admin@medibook.local`          | the only admin    |
| Doctor  | `asha.rao@medibook.local`       | General Medicine  |
| Doctor  | `vikram.menon@medibook.local`   | Cardiology        |
| Doctor  | `priya.nair@medibook.local`     | Dermatology       |
| Doctor  | `imran.qureshi@medibook.local`  | Paediatrics       |
| Doctor  | `meera.krishnan@medibook.local` | Orthopaedics      |
| Doctor  | `sanjay.pillai@medibook.local`  | General Medicine  |
| Patient | `ravi@example.com`              | has reports       |
| Patient | `divya@example.com`             | has a prescription|
| Patient | `arjun@example.com`             |                   |
| Patient | `fatima@example.com`            |                   |
| Patient | `joseph@example.com`            |                   |

The seed also creates 5 specialties, 23 appointments across all four
statuses, 5 prescriptions and 5 sample report files.

These are demo accounts with a published password, which is why
`npm run seed` refuses to run when `NODE_ENV=production`.

Re-running `npm run seed` wipes the database and starts over.

---

## Commands

Run these from `medibook/backend`.

| Command            | What it does                                        |
| ------------------ | --------------------------------------------------- |
| `npm run dev`      | Start the API, restarting on file changes           |
| `npm start`        | Start the API once (what a server would run)        |
| `npm run seed`     | Wipe and refill the database with demo data         |
| `npm run check`    | Run the self-tests (47 checks, no server needed)    |
| `npm run init-env` | Create `backend/.env` with new random secrets       |
| `npm run migrate`  | Create the PostgreSQL schema (phase 7)              |

---

## What works right now

| Method | Route                        | Who         |
| ------ | ---------------------------- | ----------- |
| GET    | `/health`, `/api/health`     | anyone      |
| POST   | `/api/auth/register`         | anyone      |
| POST   | `/api/auth/login`            | anyone      |
| POST   | `/api/auth/logout`           | logged in   |
| GET    | `/api/auth/me`               | logged in   |
| GET    | `/api/auth/password-rules`   | anyone      |
| POST   | `/api/auth/forgot-password`  | anyone      |
| POST   | `/api/auth/reset-password`   | anyone      |
| POST   | `/api/auth/change-password`  | logged in   |
| GET    | `/api/admin/audit-logs`      | admin only  |

### Try the password reset

There is no email server locally. `MAIL_MODE=console` prints the email,
including the reset link, straight into the backend terminal:

```bash
curl -X POST http://localhost:3000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"ravi@example.com"}'
```

Look at the terminal running the backend. Copy the link's `token`, then:

```bash
curl -X POST http://localhost:3000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"PASTE_IT_HERE","password":"MyNewPass#2026"}'
```

---

## Folder structure

```
medibook/
  backend/
    server.js            Starts up: adapters first, then listen
    app.js               Builds the Express app (middleware order matters)
    config.js            Every environment variable, read once

    adapters/            THE SWAPPABLE PARTS
      db.js                switch + the interface contract
      db.local.js          JSON file store
      storage.js / storage.local.js
      auth.js   / auth.local.js
      mailer.js / mailer.console.js
      secrets.js/ secrets.env.js

    auth/
      roles.js           Roles and the permission table

    middleware/
      requireAuth.js     Layer 1: are you logged in?       (401)
      requireRole.js     Layer 2: may your role do this?   (403)
      rateLimit.js       Login and reset throttling
      errors.js          The one place errors become responses
      requestContext.js  Request id and structured logging

    services/
      slots.js           Weekly schedule -> bookable slots
      audit.js           The audit trail

    lib/
      validate.js        Input validation, strips unknown fields
      password.js        Password strength rules
      time.js            Dates and times as plain strings
      logger.js          JSON logs to stdout
      httpError.js       Errors that carry a status code
      jsonStore.js       The JSON file behind db.local.js

    routes/
      health.routes.js
      auth.routes.js
      admin.routes.js

    scripts/
      seed.js            Demo data
      check.js           Self-tests
      init-env.js        Generate .env
      sampleFiles.js     Builds valid PDFs and PNGs for the seed

    data/                The local database (git-ignored)
    uploads/             Uploaded files (git-ignored)
    .env                 Your secrets (git-ignored)
    .env.example         Every variable, explained

  frontend/              React + Vite (rebuilt in phase 3)
  README.md
```

---

## How security is enforced

Every rule is enforced in the **backend**. Hiding a button in React
stops nobody who can use `curl`.

Three layers, in this order:

1. **`requireAuth`** - is there a valid token for an active account?
   No token means **401**, so the frontend sends you to log in.
2. **`requirePermission`** - does your role hold this permission?
   Failing means **403**, so the frontend shows Access Denied.
   Permissions live in one table in `auth/roles.js`, which is why
   adding a receptionist role later is one entry and no route changes.
3. **Ownership checks** - may you touch *this particular row*? A
   patient sees only their own records; a doctor sees only patients
   they have appointments with. (Phase 2, in `services/access.js`.)

Also in place:

- Every input validated on the backend, with unknown fields **stripped**
  so nobody can register themselves as an admin by adding a field.
- Login and forgot-password rate limited, keyed by IP **and** email.
- `helmet` security headers, and CORS locked to `FRONTEND_URL`.
- No stack traces in API responses - errors return a code, a safe
  message and a request id. The detail goes to the logs.
- Uploaded files are never in a public folder. Downloads use
  short-lived signed links (5 minutes), exactly like S3 pre-signed URLs,
  and permission is checked when the link is issued.
- Passwords hashed with bcryptjs. A login attempt for an email that
  does not exist takes the **same** time as a real one, so the login
  form cannot be used to discover who has an account.
- Sensitive actions written to an append-only audit log: logins, failed
  logins, role changes, deletions, report downloads.

Run `npm run check` to see these rules tested.

---

## Build phases

| Phase | Contents                                               | State |
| ----- | ------------------------------------------------------ | ----- |
| 1     | Adapters (local), auth, roles, data model, seed         | done  |
| 2     | Patient, doctor and admin APIs with ownership checks    | next  |
| 3     | Frontend: landing page, auth pages, role-based routing  |       |
| 4     | Frontend: patient pages                                 |       |
| 5     | Frontend: doctor pages                                  |       |
| 6     | Frontend: admin pages                                   |       |
| 7     | AWS adapters (RDS, S3, Cognito, SES, Secrets Manager), docs |   |

Phase 7 also adds `docs/ARCHITECTURE.md` and `docs/ROLES.md`.
