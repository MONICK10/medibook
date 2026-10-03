# MediBook

A healthcare appointment web app, built to run entirely on your laptop
and then be moved onto AWS one service at a time.

Three roles: **patient**, **doctor**, **admin**. Patients book
appointments and upload medical reports, doctors manage their schedule
and write prescriptions, admins run the clinic and read the audit log.

All data is invented. There is no real patient information anywhere in
this repository.

---

## Run it

You need **Node.js 20.9 or newer** (`node --version`). Nothing else: no
database to install, no Docker, no AWS account.

Two terminals.

**Terminal 1 - the API:**

```bash
cd medibook/backend
npm install
npm run seed
npm run dev
```

**Terminal 2 - the website:**

```bash
cd medibook/frontend
npm install
npm run dev
```

Then open <http://localhost:5173>.

`npm run seed` creates `backend/.env` with fresh random secrets, fills
the local database with demo data, and prints the logins. Run it again
at any time to wipe and start over.

Stop either server with **Ctrl + C**.

---

## Demo logins

Every account uses the same password:

```
ClinicDemo#2026
```

| Role    | Email                           |
| ------- | ------------------------------- |
| Admin   | `admin@medibook.local`          |
| Doctor  | `asha.rao@medibook.local`       |
| Doctor  | `vikram.menon@medibook.local`   |
| Doctor  | `priya.nair@medibook.local`     |
| Doctor  | `imran.qureshi@medibook.local`  |
| Doctor  | `meera.krishnan@medibook.local` |
| Doctor  | `sanjay.pillai@medibook.local`  |
| Patient | `ravi@example.com`              |
| Patient | `divya@example.com`             |
| Patient | `arjun@example.com`             |
| Patient | `fatima@example.com`            |
| Patient | `joseph@example.com`            |

The login page has a **Demo accounts** panel that fills these in for
you. The seed also creates 5 specialties, 6 doctors with weekly
schedules, 23 appointments across all four statuses, 5 prescriptions
and 5 sample report files.

These are demo accounts with a published password, which is why
`npm run seed` refuses to run when `NODE_ENV=production`.

---

## Commands

**backend/**

| Command            | What it does                                      |
| ------------------ | ------------------------------------------------- |
| `npm run dev`      | Start the API, restarting on file changes         |
| `npm start`        | Start the API once                                |
| `npm run seed`     | Wipe and refill the database with demo data       |
| `npm run check`    | 47 unit checks (rules, slots, passwords, paths)   |
| `npm run check:api`| 68 end-to-end checks against the real HTTP API    |
| `npm test`         | Both of the above                                 |
| `npm run init-env` | Create `backend/.env` with new random secrets     |
| `npm run migrate`  | Not implemented - for you to write (see TODOs)    |

**frontend/**

| Command         | What it does                                         |
| --------------- | ---------------------------------------------------- |
| `npm run dev`   | Start the website on port 5173                       |
| `npm run build` | Build the static site into `dist/`                   |
| `npm run smoke` | Render all 39 routes in Node and check they work     |

---

## What is where

```
medibook/
  backend/
    server.js, app.js, config.js    startup, middleware order, all env vars
    adapters/     THE SWAPPABLE PARTS - see the next section
    auth/roles.js roles and the permission table
    middleware/   requireAuth (401), requireRole (403), rate limits, errors
    services/     access.js (row-level permission), slots.js, audit.js
    lib/          validation, password rules, time, logging, JSON store
    routes/       one file per area of the API
    scripts/      seed, checks, init-env
    data/         the local database (git-ignored)
    uploads/      uploaded files (git-ignored)
  frontend/
    src/config.js           the API address, read from VITE_API_URL
    src/api/client.js       one fetch wrapper for the whole app
    src/auth/AuthContext.jsx who is logged in
    src/components/         layout, route guards, shared UI, slot picker
    src/pages/              landing, auth, patient/, doctor/, admin/
    src/styles/global.css   design tokens and shared styles
  AWS-TODO.md    every stub you need to fill in for AWS
```

---

## The adapters

Everything that would become an AWS service is isolated in one file,
chosen by one environment variable. The rest of the app never knows
which is active.

| Adapter                  | Local (default)         | AWS (stubbed for you) | Switch         |
| ------------------------ | ----------------------- | --------------------- | -------------- |
| `adapters/db.js`         | JSON file in `data/`    | PostgreSQL on RDS     | `DB_MODE`      |
| `adapters/storage.js`    | files in `uploads/`     | private S3 bucket     | `STORAGE_MODE` |
| `adapters/auth.js`       | bcryptjs + our own JWT  | Amazon Cognito        | `AUTH_MODE`    |
| `adapters/mailer.js`     | prints to the terminal  | Amazon SES            | `MAIL_MODE`    |
| `adapters/secrets.js`    | `.env` file             | Secrets Manager       | `SECRETS_MODE` |

**The AWS side is deliberately not written.** Each `*.postgres.js`,
`*.s3.js`, `*.cognito.js`, `*.ses.js` and `*.aws.js` file exists with
every function stubbed, a TODO saying what to write, which AWS service
it is, and which npm package you will need.

See **[AWS-TODO.md](AWS-TODO.md)** for the full checklist.

Switching back is always one line: set the mode to its local value in
`backend/.env`.

---

## How security works

Every rule is enforced in the **backend**. Hiding a button in React
stops nobody who can use `curl`.

**Three layers, in order:**

1. `requireAuth` - is there a valid token for an active account?
   Failing gives **401**, and the frontend sends you to log in.
2. `requirePermission` - does your role hold this permission? Failing
   gives **403**, and the frontend shows Access Denied. Permissions
   live in one table in `auth/roles.js`, so adding a receptionist role
   later is one entry and no route changes.
3. `services/access.js` - may you touch *this row*? A patient sees only
   their own records; a doctor only patients they have appointments
   with; an admin cannot read medical records at all.

**Also in place:** every input validated on the backend with unknown
fields stripped (so nobody registers themselves as an admin); login and
password-reset rate limits keyed by IP *and* email; `helmet` headers;
CORS locked to `FRONTEND_URL`; no stack traces in responses; uploaded
files never in a public folder, reachable only through signed links
that expire in 5 minutes; bcryptjs password hashing where a login
attempt for an unknown email takes the same time as a real one; and an
append-only audit log of logins, failed logins, role changes,
deletions and every report download.

Run `npm test` in `backend/` to see these checked, including: patient A
reading patient B's appointment gets 403, a doctor who has never seen a
patient gets 403 on their reports, a patient calling any `/admin` route
gets 403, two patients cannot book the same slot, and a report cannot
be fetched without a valid signed link.

---

## Things worth knowing

- **Bookings are kept in a JSON file** at `backend/data/db.json`. It is
  not a real database - it rewrites the whole file on every change.
  That is the point of `DB_MODE=postgres`.
- **Dates and times are plain strings** (`2026-10-05`, `14:30`), not
  `Date` objects, so a server in another timezone cannot shift every
  appointment by hours. Set `TZ` to the clinic's timezone in
  production.
- **Money is a whole number of paise** (`feeCents`), never a float.
- **Passwords are never chosen by an admin.** Creating a doctor
  generates one and emails it; with `MAIL_MODE=console` it prints in
  the backend terminal. Password reset links print there too.
- **The login page's demo panel** would be deleted before any real
  deployment.
