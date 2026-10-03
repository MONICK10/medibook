# AWS TODO list

Everything you need to fill in to move MediBook onto AWS, in a sensible
order. The local app keeps working the whole time: each adapter is
chosen by one environment variable, so you can switch a piece on, try
it, and switch it back.

Every function listed below already exists as a stub that throws a
clear error, with a TODO comment in the file explaining what to write.

**Install nothing up front.** Each section lists the one package it
needs, so you only install a dependency when you reach it.

---

## Order to work in

The order is chosen so each step is testable on its own and nothing
depends on something you have not built yet.

1. **SES** (mailer) - smallest, one function, instant feedback.
2. **Secrets Manager** (secrets) - two functions, and RDS needs it.
3. **S3** (storage) - five functions, and the signed-URL idea is
   already in the local version.
4. **RDS / PostgreSQL** (db) - the biggest by far. Do it last of the
   data pieces.
5. **Cognito** (auth) - changes how login works, so leave it until the
   rest is stable.

---

## 1. Mailer -> Amazon SES

**File:** `backend/adapters/mailer.ses.js`
**Package:** `npm install @aws-sdk/client-sesv2`
**Switch on with:** `MAIL_MODE=ses`

| Function | What to write |
| --- | --- |
| `init()` | Create `SESv2Client({ region: config.mail.sesRegion })`. Fail fast if `MAIL_FROM` is empty. |
| `send({ to, subject, text })` | `SendEmailCommand`, return `{ messageId, delivered }`. |

**Before any code:**

- Verify the sender - either the single address in `MAIL_FROM`, or
  (better) the whole domain with DKIM. SES will not send from an
  identity you have not proved you own.
- A new SES account is in the **sandbox**: it can only send *to*
  verified addresses. Verify your own address and send to yourself. To
  send to anyone, request production access.

**IAM:** `ses:SendEmail` on your identity.

**Two things to keep from the console version:** log that mail was
sent with the recipient and subject but **never the body** (reset links
and temporary passwords travel in it), and decide deliberately what a
send failure should do to the request.

**Env:** `SES_REGION`, `MAIL_FROM`

---

## 2. Secrets -> AWS Secrets Manager

**File:** `backend/adapters/secrets.aws.js`
**Package:** `npm install @aws-sdk/client-secrets-manager`
**Switch on with:** `SECRETS_MODE=aws`

| Function | What to write |
| --- | --- |
| `init()` | `GetSecretValueCommand`, `JSON.parse` the result, cache it in memory. |
| `get(key)` | Return one value from the cache, or `null`. |

**How to store it:** one secret holding a JSON object, with its name or
ARN in `AWS_SECRET_ID`:

```json
{ "PGPASSWORD": "...", "JWT_SECRET": "...", "FILE_SIGNING_SECRET": "..." }
```

One secret rather than one per value, because Secrets Manager charges
per secret and per API call.

**Never log the parsed object or any value in it.** Log the keys if you
want to confirm what loaded.

**IAM:** `secretsmanager:GetSecretValue` on that one secret's ARN, not
on `*`.

**Cheaper alternative:** SSM Parameter Store `SecureString` parameters
do much the same job and the standard tier is free
(`@aws-sdk/client-ssm`, `GetParameter` with `WithDecryption: true`).

**Env:** `AWS_SECRET_ID`, `AWS_SECRET_REGION`

---

## 3. Storage -> Amazon S3

**File:** `backend/adapters/storage.s3.js`
**Packages:** `npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`
**Switch on with:** `STORAGE_MODE=s3`

| Function | What to write |
| --- | --- |
| `init()` | `S3Client({ region })`. Fail fast if `S3_BUCKET` is empty. |
| `save({ buffer, originalName, mimeType, ownerId })` | `PutObjectCommand`. `buildKey()` is already written for you. Return `{ key, sizeBytes }`. |
| `createDownloadUrl(key, { filename, mimeType })` | `getSignedUrl` with a `GetObjectCommand`, 5 minute expiry. |
| `exists(key)` | `HeadObjectCommand` - a 404 means `false`, anything else should throw. |
| `stat(key)` | `HeadObjectCommand` -> `{ sizeBytes: ContentLength }`. |
| `remove(key)` | `DeleteObjectCommand`. |

**Bucket setup, before any code:**

- Block **all** public access, at the account and bucket level.
  Downloads work through pre-signed URLs; the bucket never needs
  anonymous reads.
- Turn on default encryption (SSE-S3 is one click).
- Consider versioning, to survive an accidental overwrite or delete.

**IAM:** `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on
`arn:aws:s3:::YOUR_BUCKET/reports/*` and nothing more.

**Do not pass `ACL: 'public-read'`.** Modern buckets reject it anyway,
and it is the single mistake that turns this into a data breach.

**Note:** the local adapter also exports `verifyDownloadToken` and
`createReadStream`, which serve files through our own API. S3 mode does
not need them - the browser fetches from S3 directly, and
`routes/files.routes.js` already checks whether that function exists
before offering the route.

**Env:** `S3_BUCKET`, `S3_REGION`, `S3_KEY_PREFIX`,
`S3_SIGNED_URL_TTL_SECONDS`

---

## 4. Database -> Amazon RDS for PostgreSQL

**Files:** `backend/adapters/db.postgres.js`, `backend/scripts/migrate.js`,
and a new `backend/schema.sql` you write
**Package:** `npm install pg`
**Switch on with:** `DB_MODE=postgres`

This is the big one. Work in this order so you can test as you go:

**Step 1 - write `backend/schema.sql`.** The tables and columns are the
object shapes in `adapters/db.local.js`. Keep the names identical and
nothing else in the app has to change. The constraints that matter:

| Constraint | Why |
| --- | --- |
| `users.email` unique on `lower(email)` | otherwise capitals create a second account |
| `doctors.user_id` unique, references `users(id)` | one profile per account |
| `doctors.specialty_id` references `specialties(id)` | this is what refuses to delete a specialty in use |
| `prescriptions.appointment_id` unique | one prescription per visit |
| the partial unique index below | **this is what stops double booking** |

```sql
CREATE UNIQUE INDEX appointments_slot_unique
  ON appointments (doctor_id, date, start_time)
  WHERE status <> 'cancelled';
```

Do not skip that index. It is the thing that makes
`appointments.createIfSlotFree` safe under real traffic, and the
`WHERE` clause is what lets a cancelled appointment free its slot.

**Step 2 - `init()` and `health()`.** Then start the server: `GET
/health` tells you whether you can connect.

**Step 3 - the `users` functions.** Enough to log in.

**Step 4 - everything else**, then `npm run seed` to check writes.

**Step 5 - `scripts/migrate.js`**, which reads `schema.sql` and runs it.

### Functions to fill in

| Group | Functions |
| --- | --- |
| lifecycle | `init`, `close`, `health`, `reset` |
| `users` | `create`, `findById`, `findByEmail`, `findByCognitoSub`, `update`, `list`, `count`, `setResetToken`, `findByResetToken`, `clearResetToken` |
| `specialties` | `create`, `findById`, `findByName`, `list`, `update`, `remove`, `countDoctors` |
| `doctors` | `create`, `findById`, `findByUserId`, `update`, `list`, `findDetailById`, `countActive` |
| `availability` | `listByDoctor`, `replaceForDoctor` |
| `appointments` | `createIfSlotFree`, `findById`, `update`, `list`, `listTakenSlots`, `countByStatus`, `count`, `existsForDoctorAndPatient`, `listPatientsForDoctor` |
| `reports` | `create`, `findById`, `listByPatient`, `remove`, `countByPatient` |
| `prescriptions` | `create`, `findById`, `findByAppointmentId`, `update`, `listByPatient`, `listByDoctor` |
| `auditLogs` | `create`, `list`, `distinctActions` |

### Three things that matter more here than anywhere else

- **Always use parameterised queries:** `client.query(sql, [values])`.
  Never build SQL by joining strings with user input. This file is the
  only place in the app where SQL injection is even possible.
- **`createIfSlotFree` must not be "SELECT then INSERT".** Let the
  unique index reject it and catch error code `23505`, returning `null`
  so the route turns it into a 409.
- **`availability.replaceForDoctor` needs a transaction.** It deletes
  then inserts; a failure in between would leave a doctor with no
  schedule at all, so they vanish from every booking calendar.

Other notes: `pg` returns `count(*)` as a string, so wrap it in
`Number()`. PostgreSQL columns are conventionally `snake_case` while
this app uses `camelCase` - either alias in your SELECTs
(`SELECT patient_user_id AS "patientUserId"`) or map the rows, but pick
one and be consistent. Index `(patient_user_id, date)`,
`(doctor_id, date)` and `(doctor_id, patient_user_id)` or the common
queries get slow.

**RDS setup:** require TLS (`PGSSL=true`) and give Node the RDS CA
certificate so `rejectUnauthorized: true` works. Do not "fix" a
certificate error by turning the check off - that leaves the
connection encrypted but unverified. Keep `PGPOOL_MAX` well under the
instance's connection limit, remembering every running copy of the app
has its own pool.

**Env:** `DATABASE_URL` or `PGHOST`/`PGPORT`/`PGDATABASE`/`PGUSER`,
plus `PGPASSWORD_SECRET_KEY`, `PGSSL`, `PGPOOL_MAX`

---

## 5. Auth -> Amazon Cognito

**File:** `backend/adapters/auth.cognito.js`
**Packages:** `npm install aws-jwt-verify` (and
`@aws-sdk/client-cognito-identity-provider` if you want admins to be
able to create doctor accounts)
**Switch on with:** `AUTH_MODE=cognito`

**This one changes how login works, so leave it until last.** In local
mode the app owns identity: it stores password hashes and signs its own
tokens. In Cognito mode AWS owns identity and this app only *verifies*
tokens. That means:

- The browser logs in against Cognito (Hosted UI or Amplify), gets a
  token, and sends it to us as a Bearer token exactly as before.
- `/api/auth/login`, `register`, `forgot-password`, `reset-password`
  and `change-password` all return **501**. That is already handled -
  `capabilities.passwords` is `false` and
  `routes/auth.routes.js` checks it.
- A user's **role comes from their Cognito groups**, mapped through
  `config.cognito.groupRoleMap` (`admins` -> `admin`, and so on).
- We still keep a row in our own `users` table for everyone, because
  appointments and reports have to point at something. It is created on
  first sign-in.

| Function | What to write |
| --- | --- |
| `init()` | `CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: 'id' })`. Build it **once** here, not per request, or it fetches the signing keys every time. |
| `verifyToken(token)` | `await verifier.verify(token)`, and turn any failure into our own flat 401. |
| `resolveUser(claims)` | The one that matters. See below. |

`resolveUser` must:

1. Map `claims['cognito:groups']` to one of our roles. **If no group
   maps, refuse** - do not fall back to `patient`, or a misconfigured
   group silently grants access.
2. Find our user row by `claims.sub`, never by email. An email can be
   changed and reassigned; `sub` is permanent.
3. Create the row on first sign-in. If a row already exists with that
   email but no `cognitoSub` (for example from the local seed), decide
   deliberately whether to link it - and only if
   `claims.email_verified` is true, or you have built an
   account-takeover bug.
4. Enforce the same two rules the local adapter does on **every**
   request: refuse a deactivated account, and update our copy of the
   role when Cognito's differs (Cognito is the source of truth here,
   which is the opposite of local mode).

**Optional:** to let an admin create doctor accounts in this mode, add
`AdminCreateUserCommand` plus `AdminAddUserToGroupCommand`.
`routes/admin.routes.js` currently refuses, because it would otherwise
write a password hash.

**Env:** `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`,
`COGNITO_GROUP_ROLE_MAP`

---

## Deployment, when you get there

Not stubbed in code, but these are the pieces the app is already shaped
for:

- **Frontend on S3 + CloudFront.** `npm run build` makes a static
  `dist/`. Build it with the right `VITE_API_URL` - Vite bakes that in
  at build time, so a site built for localhost will still call
  localhost. Add the CloudFront domain to `FRONTEND_URL` on the backend
  or CORS will block it.
- **Backend on EC2 (or ECS/Fargate).** Attach an IAM role; the AWS SDK
  picks credentials up from it automatically. **No access keys in any
  file** - that is the habit this whole structure exists to teach.
- **Health check:** point the load balancer at `GET /health`. It
  returns 503 when the database is unreachable, so a broken instance
  is taken out of rotation instead of serving errors.
- **Set `TRUST_PROXY=true`** once there really is an ALB or CloudFront
  in front, so `req.ip` is the client and not the load balancer. Do
  **not** set it before that, or a client can spoof `X-Forwarded-For`
  and dodge the rate limiter.
- **Set `TZ`** to the clinic's timezone. Appointment times are stored
  as wall-clock strings and compared against the server's local time.
- **Rate limits are per-process.** Two instances behind a load
  balancer means the real limit is doubled. Production needs a shared
  store (ElastiCache/Redis) via `express-rate-limit`.
- **Logs** are JSON on stdout, ready for CloudWatch to collect.
- **`JWT_SECRET` and `FILE_SIGNING_SECRET` must be set** in
  production - the app refuses to start without them, and every
  instance needs the *same* values or tokens issued by one are rejected
  by another.

---

## Quick reference: the five switches

```bash
# backend/.env - all local by default
DB_MODE=local         # local | postgres
STORAGE_MODE=local    # local | s3
AUTH_MODE=local       # local | cognito
MAIL_MODE=console     # console | ses
SECRETS_MODE=env      # env | aws
```

Change one at a time. If something breaks, set it back to the local
value and the app works again - that is the whole point of the
arrangement.
