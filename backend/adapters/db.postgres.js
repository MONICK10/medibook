// adapters/db.postgres.js
// -----------------------------------------------------------------
// AWS VERSION OF THE DATABASE ADAPTER - NOT IMPLEMENTED.
//
//   AWS service: Amazon RDS for PostgreSQL
//   npm package: pg          ->  npm install pg
//   Turn on with: DB_MODE=postgres
//
// Every function below is a stub that throws. Fill them in one at a
// time; the local adapter in db.local.js keeps working while you do,
// so you can always switch back with DB_MODE=local.
//
// HOW TO WORK THROUGH THIS FILE
// 1. Write backend/schema.sql (the CREATE TABLE statements). The field
//    names to use are the object keys in db.local.js - keep them
//    identical and the rest of the app will not notice the change.
// 2. Fill in init() and health() first, then run the server: GET
//    /health will tell you whether you can connect.
// 3. Then the users functions (enough to log in), then the rest.
// 4. Run "npm run seed" against it to check writes work.
//
// TWO THINGS THAT MATTER MORE HERE THAN ANYWHERE ELSE
//
// * Always use parameterised queries: client.query(sql, [values]).
//   Never build SQL by joining strings with user input - that is SQL
//   injection, and this file is the only place in the app where it is
//   even possible.
//
// * The password comes from the SECRETS adapter, not from config
//   directly, so SECRETS_MODE=aws can fetch it from Secrets Manager.
//   See init() below.
//
// NAMING: PostgreSQL columns are conventionally snake_case
// (patient_user_id) while this app uses camelCase (patientUserId).
// Either rename in your SELECTs (SELECT patient_user_id AS "patientUserId")
// or map the rows after fetching. Pick one and be consistent, because
// a half-mapped row is a very confusing bug.
// -----------------------------------------------------------------

const config = require('../config');
const secrets = require('./secrets');

// TODO (RDS): const { Pool } = require('pg');
// let pool = null;

function notImplemented(name) {
  return new Error(
    `db.postgres.${name}() is not implemented yet. ` +
      'Fill it in, or run with DB_MODE=local.'
  );
}

// -----------------------------------------------------------------
// Lifecycle
// -----------------------------------------------------------------

// TODO (RDS): create the connection pool.
//
// A POOL, not a single connection: each app instance keeps a few
// connections open and reuses them, because opening one per request is
// slow and RDS limits how many you may have at once. Keep
// config.postgres.maxPoolSize well under the instance's limit,
// remembering every running copy of the app has its own pool.
//
// Sketch:
//   const password = await secrets.get(config.postgres.passwordSecretKey);
//   pool = new Pool({
//     connectionString: config.postgres.url || undefined,
//     host: config.postgres.host,
//     port: config.postgres.port,
//     database: config.postgres.database,
//     user: config.postgres.user,
//     password,
//     max: config.postgres.maxPoolSize,
//     ssl: config.postgres.ssl ? { rejectUnauthorized: true } : false,
//   });
//   await pool.query('SELECT 1');
//
// Note on ssl: RDS requires TLS. rejectUnauthorized: true means you
// must give Node the RDS CA certificate, otherwise the connection is
// encrypted but not verified - which leaves it open to an attacker in
// the middle. Do not "fix" a certificate error by turning the check off.
async function init() {
  throw notImplemented('init');
}

// TODO (RDS): await pool.end();
async function close() {
  throw notImplemented('close');
}

// TODO (RDS): run a trivial query and report the result.
//
// This is what GET /health reports, and what the load balancer uses to
// decide whether this instance should receive traffic. Keep it cheap -
// 'SELECT 1' - because it runs every few seconds forever.
//
// Return { ok, mode: 'postgres', detail } and never throw: a thrown
// error here turns a useful "degraded" answer into a 500.
async function health() {
  return {
    ok: false,
    mode: 'postgres',
    detail: 'db.postgres.js is not implemented yet.',
  };
}

// TODO (RDS): delete every row, for the seed script.
//
// TRUNCATE ... RESTART IDENTITY CASCADE on all tables is the usual way.
// Guard it: this must never be reachable in production.
async function reset() {
  throw notImplemented('reset');
}

// -----------------------------------------------------------------
// users
// -----------------------------------------------------------------
// Needed before anyone can log in, so start here after init/health.
const users = {
  // TODO (RDS): INSERT INTO users ... RETURNING *
  async create() {
    throw notImplemented('users.create');
  },

  // TODO (RDS): SELECT * FROM users WHERE id = $1
  async findById() {
    throw notImplemented('users.findById');
  },

  // TODO (RDS): SELECT * FROM users WHERE email = $1
  // Store and compare emails lowercase, as db.local.js does, or add a
  // unique index on lower(email) - otherwise two accounts can differ
  // only by capitals.
  async findByEmail() {
    throw notImplemented('users.findByEmail');
  },

  // TODO (RDS): SELECT * FROM users WHERE cognito_sub = $1
  // Only used when AUTH_MODE=cognito.
  async findByCognitoSub() {
    throw notImplemented('users.findByCognitoSub');
  },

  // TODO (RDS): UPDATE users SET ... WHERE id = $1 RETURNING *
  // Keep db.local.js's allow-list of updatable fields. Building the SET
  // clause from whatever keys arrive is how `role` ends up updatable by
  // accident.
  async update() {
    throw notImplemented('users.update');
  },

  // TODO (RDS): SELECT with optional WHERE parts, ORDER BY, LIMIT/OFFSET
  // Return { rows, total }. `total` is the count BEFORE paging, so the
  // UI can show "1-25 of 312" - usually a second COUNT(*) query with
  // the same WHERE clause.
  async list() {
    throw notImplemented('users.list');
  },

  // TODO (RDS): SELECT count(*) FROM users WHERE ...
  // Remember count() returns a string in node-postgres; wrap it in
  // Number() or your dashboard will concatenate instead of adding.
  async count() {
    throw notImplemented('users.count');
  },

  // TODO (RDS): UPDATE users SET reset_token_hash, reset_token_expires_at
  async setResetToken() {
    throw notImplemented('users.setResetToken');
  },

  // TODO (RDS): SELECT * FROM users WHERE reset_token_hash = $1
  async findByResetToken() {
    throw notImplemented('users.findByResetToken');
  },

  // TODO (RDS): UPDATE users SET reset_token_hash = NULL, ...
  async clearResetToken() {
    throw notImplemented('users.clearResetToken');
  },
};

// -----------------------------------------------------------------
// specialties
// -----------------------------------------------------------------
const specialties = {
  // TODO (RDS): INSERT INTO specialties ... RETURNING *
  async create() {
    throw notImplemented('specialties.create');
  },
  // TODO (RDS): SELECT * FROM specialties WHERE id = $1
  async findById() {
    throw notImplemented('specialties.findById');
  },
  // TODO (RDS): SELECT * FROM specialties WHERE lower(name) = lower($1)
  async findByName() {
    throw notImplemented('specialties.findByName');
  },
  // TODO (RDS): SELECT * FROM specialties ORDER BY name
  async list() {
    throw notImplemented('specialties.list');
  },
  // TODO (RDS): UPDATE specialties SET ... RETURNING *
  async update() {
    throw notImplemented('specialties.update');
  },
  // TODO (RDS): DELETE FROM specialties WHERE id = $1
  // A foreign key from doctors.specialty_id will refuse while doctors
  // still reference it. The route checks first so it can explain why,
  // but keep the constraint as the real guarantee.
  async remove() {
    throw notImplemented('specialties.remove');
  },
  // TODO (RDS): SELECT count(*) FROM doctors WHERE specialty_id = $1
  async countDoctors() {
    throw notImplemented('specialties.countDoctors');
  },
};

// -----------------------------------------------------------------
// doctors
// -----------------------------------------------------------------
const doctors = {
  // TODO (RDS): INSERT INTO doctors ... RETURNING *
  async create() {
    throw notImplemented('doctors.create');
  },
  // TODO (RDS): SELECT * FROM doctors WHERE id = $1
  async findById() {
    throw notImplemented('doctors.findById');
  },
  // TODO (RDS): SELECT * FROM doctors WHERE user_id = $1
  async findByUserId() {
    throw notImplemented('doctors.findByUserId');
  },
  // TODO (RDS): UPDATE doctors SET ... RETURNING *
  async update() {
    throw notImplemented('doctors.update');
  },

  // TODO (RDS): the one real JOIN in the app.
  //
  //   SELECT d.*, u.name, u.email, u.phone, u.is_active, s.name AS specialty_name
  //   FROM doctors d
  //   JOIN users u ON u.id = d.user_id
  //   LEFT JOIN specialties s ON s.id = d.specialty_id
  //   WHERE ...
  //
  // db.local.js does this join by hand in JavaScript. Compare the two
  // when you write it - it is the clearest illustration of what a
  // database gives you.
  //
  // JOIN users (not LEFT JOIN): a doctor profile with no user row is
  // broken data and should not appear. LEFT JOIN specialties, because a
  // specialty is optional and a doctor should not vanish if it is null.
  async list() {
    throw notImplemented('doctors.list');
  },

  // TODO (RDS): the same query as list(), with WHERE d.id = $1
  async findDetailById() {
    throw notImplemented('doctors.findDetailById');
  },

  // TODO (RDS): count doctors whose USER row is active
  //   SELECT count(*) FROM doctors d JOIN users u ON u.id = d.user_id
  //   WHERE u.is_active = true
  async countActive() {
    throw notImplemented('doctors.countActive');
  },
};

// -----------------------------------------------------------------
// availability
// -----------------------------------------------------------------
const availability = {
  // TODO (RDS): SELECT * FROM availability WHERE doctor_id = $1
  //             ORDER BY weekday, start_time
  async listByDoctor() {
    throw notImplemented('availability.listByDoctor');
  },

  // TODO (RDS): DELETE the doctor's rows, then INSERT the new ones -
  // INSIDE A TRANSACTION.
  //
  // This is the first place you genuinely need one. Delete-then-insert
  // as two separate statements means a failure in between leaves the
  // doctor with NO schedule at all, so they vanish from every booking
  // calendar. In a transaction, either the whole new week is saved or
  // the old one stays.
  //
  //   const client = await pool.connect();
  //   try {
  //     await client.query('BEGIN');
  //     await client.query('DELETE FROM availability WHERE doctor_id = $1', [id]);
  //     ... INSERTs ...
  //     await client.query('COMMIT');
  //   } catch (e) {
  //     await client.query('ROLLBACK');
  //     throw e;
  //   } finally {
  //     client.release();   // always, or the pool leaks connections
  //   }
  async replaceForDoctor() {
    throw notImplemented('availability.replaceForDoctor');
  },
};

// -----------------------------------------------------------------
// appointments
// -----------------------------------------------------------------
const APPOINTMENT_STATUSES = ['booked', 'completed', 'cancelled', 'no_show'];

const appointments = {
  // TODO (RDS): THE IMPORTANT ONE. Book a slot only if it is free.
  //
  // Do NOT do "SELECT to check, then INSERT". Two patients clicking at
  // the same moment can both pass the SELECT and both INSERT. The
  // database has to enforce it, with a partial unique index:
  //
  //   CREATE UNIQUE INDEX appointments_slot_unique
  //     ON appointments (doctor_id, date, start_time)
  //     WHERE status <> 'cancelled';
  //
  // ("partial" = the WHERE clause, so a cancelled appointment stops
  // holding its slot and someone else can book it.)
  //
  // Then let the INSERT fail and catch it:
  //
  //   try {
  //     const { rows } = await pool.query('INSERT ... RETURNING *', [...]);
  //     return rows[0];
  //   } catch (error) {
  //     if (error.code === '23505') return null;  // unique violation
  //     throw error;
  //   }
  //
  // Returning null (not throwing) is what the booking route expects: it
  // turns null into "that slot was just taken" with a 409.
  async createIfSlotFree() {
    throw notImplemented('appointments.createIfSlotFree');
  },

  // TODO (RDS): SELECT * FROM appointments WHERE id = $1
  async findById() {
    throw notImplemented('appointments.findById');
  },

  // TODO (RDS): UPDATE appointments SET ... WHERE id = $1 RETURNING *
  async update() {
    throw notImplemented('appointments.update');
  },

  // TODO (RDS): the busiest query in the app. Joins patient and doctor
  // names, and takes many optional filters (patient, doctor, status,
  // date, date range, search). Return { rows, total }.
  //
  // Build the WHERE clause by pushing conditions and values into
  // parallel arrays, so every value stays a parameter:
  //   const where = []; const values = [];
  //   if (patientUserId) { values.push(patientUserId);
  //                        where.push(`a.patient_user_id = $${values.length}`); }
  //
  // Then add indexes for the common filters, or this gets slow fast:
  //   (patient_user_id, date), (doctor_id, date), (date)
  async list() {
    throw notImplemented('appointments.list');
  },

  // TODO (RDS): SELECT date, start_time FROM appointments
  //             WHERE doctor_id = $1 AND date BETWEEN $2 AND $3
  //               AND status <> 'cancelled'
  async listTakenSlots() {
    throw notImplemented('appointments.listTakenSlots');
  },

  // TODO (RDS): SELECT status, count(*) FROM appointments ... GROUP BY status
  //
  // GROUP BY only returns statuses that actually occur, so start from an
  // object with all four set to 0 and fill it in - otherwise the
  // dashboard shows "undefined" for a status nobody has used yet.
  async countByStatus() {
    throw notImplemented('appointments.countByStatus');
  },

  // TODO (RDS): the total from list(), without fetching the rows.
  async count() {
    throw notImplemented('appointments.count');
  },

  // TODO (RDS): SELECT EXISTS(SELECT 1 FROM appointments
  //             WHERE doctor_id = $1 AND patient_user_id = $2)
  //
  // This one line is the rule behind "a doctor may only open the
  // records of patients they actually treat" (services/access.js). It
  // runs on every report access, so index (doctor_id, patient_user_id).
  async existsForDoctorAndPatient() {
    throw notImplemented('appointments.existsForDoctorAndPatient');
  },

  // TODO (RDS): distinct patients for one doctor, with their last visit
  // date and visit count.
  //
  //   SELECT u.id, u.name, u.email, u.phone,
  //          max(a.date) AS "lastVisitDate",
  //          count(*)    AS "visitCount"
  //   FROM appointments a JOIN users u ON u.id = a.patient_user_id
  //   WHERE a.doctor_id = $1
  //   GROUP BY u.id, u.name, u.email, u.phone
  //   ORDER BY max(a.date) DESC
  async listPatientsForDoctor() {
    throw notImplemented('appointments.listPatientsForDoctor');
  },
};

// -----------------------------------------------------------------
// reports
// -----------------------------------------------------------------
// Only the file KEY is stored here. The bytes live in S3 (see
// storage.s3.js). Never store a public URL in this table: it would
// outlive the permission check that should guard it.
const reports = {
  // TODO (RDS): INSERT INTO reports ... RETURNING *
  async create() {
    throw notImplemented('reports.create');
  },
  // TODO (RDS): SELECT * FROM reports WHERE id = $1
  async findById() {
    throw notImplemented('reports.findById');
  },
  // TODO (RDS): SELECT * FROM reports WHERE patient_user_id = $1
  //             ORDER BY created_at DESC
  async listByPatient() {
    throw notImplemented('reports.listByPatient');
  },
  // TODO (RDS): DELETE FROM reports WHERE id = $1
  // Deleting the row does not delete the file. Call storage.remove(key)
  // too, or you will pay S3 for orphaned objects forever.
  async remove() {
    throw notImplemented('reports.remove');
  },
  // TODO (RDS): SELECT count(*) FROM reports WHERE patient_user_id = $1
  async countByPatient() {
    throw notImplemented('reports.countByPatient');
  },
};

// -----------------------------------------------------------------
// prescriptions
// -----------------------------------------------------------------
const prescriptions = {
  // TODO (RDS): INSERT INTO prescriptions ... RETURNING *
  //
  // `medicines` is an array of objects. Two reasonable designs:
  //   a) a jsonb column - simplest, matches this code exactly
  //   b) a separate prescription_medicines table - the "proper"
  //      relational answer, and what you want if you ever need to ask
  //      "how many patients are on this drug?"
  // Use jsonb first; the route code does not change either way.
  //
  // Add a UNIQUE constraint on appointment_id: one prescription per
  // visit, which the route already assumes.
  async create() {
    throw notImplemented('prescriptions.create');
  },
  // TODO (RDS): SELECT * FROM prescriptions WHERE id = $1
  async findById() {
    throw notImplemented('prescriptions.findById');
  },
  // TODO (RDS): SELECT * FROM prescriptions WHERE appointment_id = $1
  async findByAppointmentId() {
    throw notImplemented('prescriptions.findByAppointmentId');
  },
  // TODO (RDS): UPDATE prescriptions SET medicines, notes ... RETURNING *
  async update() {
    throw notImplemented('prescriptions.update');
  },
  // TODO (RDS): joined with doctor name and appointment date
  async listByPatient() {
    throw notImplemented('prescriptions.listByPatient');
  },
  // TODO (RDS): SELECT * FROM prescriptions WHERE doctor_id = $1
  async listByDoctor() {
    throw notImplemented('prescriptions.listByDoctor');
  },
};

// -----------------------------------------------------------------
// auditLogs
// -----------------------------------------------------------------
// Append-only by design: there is no update or remove, because an audit
// trail you can edit is not an audit trail. Consider enforcing that at
// the database level too, by granting the app's database user only
// INSERT and SELECT on this table.
const auditLogs = {
  // TODO (RDS): INSERT INTO audit_logs ... RETURNING *
  // `metadata` is a jsonb column.
  async create() {
    throw notImplemented('auditLogs.create');
  },
  // TODO (RDS): SELECT ... ORDER BY created_at DESC LIMIT/OFFSET
  // Index created_at DESC: this table grows forever and is always read
  // newest-first.
  async list() {
    throw notImplemented('auditLogs.list');
  },
  // TODO (RDS): SELECT DISTINCT action FROM audit_logs ORDER BY action
  async distinctActions() {
    throw notImplemented('auditLogs.distinctActions');
  },
};

module.exports = {
  init,
  close,
  health,
  reset,
  APPOINTMENT_STATUSES,
  users,
  specialties,
  doctors,
  availability,
  appointments,
  reports,
  prescriptions,
  auditLogs,
};
