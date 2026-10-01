// scripts/migrate.js
// -----------------------------------------------------------------
// NOT IMPLEMENTED - this is for you to fill in when you reach RDS.
//
//   AWS service: Amazon RDS for PostgreSQL
//   npm package: pg
//   Run with:    npm run migrate
//
// WHAT IT SHOULD DO
// Read backend/schema.sql and run it against the database named by the
// DB_MODE=postgres settings, so a fresh database gets its tables.
//
// Sketch:
//   const fs = require('fs');
//   const path = require('path');
//   const { Pool } = require('pg');
//   const config = require('../config');
//   const secrets = require('../adapters/secrets');
//
//   await secrets.init();
//   const password = await secrets.get(config.postgres.passwordSecretKey);
//   const pool = new Pool({ ...config.postgres, password });
//   const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
//   await pool.query(sql);
//   await pool.end();
//
// YOU ALSO NEED TO WRITE backend/schema.sql.
// The table and column names to use are the object keys in
// adapters/db.local.js - keep them the same and nothing else in the app
// has to change. The constraints that matter most:
//
//   * users.email            UNIQUE (on lower(email), so capitals
//                            cannot create a second account)
//   * doctors.user_id        UNIQUE, REFERENCES users(id)
//   * doctors.specialty_id   REFERENCES specialties(id)
//                            -> this is what refuses to delete a
//                               specialty still in use
//   * prescriptions.appointment_id  UNIQUE
//                            -> one prescription per visit
//   * appointments           the partial unique index that stops double
//                            booking:
//
//       CREATE UNIQUE INDEX appointments_slot_unique
//         ON appointments (doctor_id, date, start_time)
//         WHERE status <> 'cancelled';
//
//     Do not skip this one. It is the thing that makes
//     appointments.createIfSlotFree safe under real traffic, and it is
//     the single most important line in the schema.
//
// A NOTE ON "MIGRATE"
// This script is really "create the schema once". A real project needs
// ordered, repeatable migrations so that change number 7 can be applied
// to a database already at change 6, on every environment, exactly
// once. Tools that do this: node-pg-migrate, Knex migrations, Flyway.
// Running one big schema.sql works to get started and stops working the
// first time you need to add a column to a database with data in it.
// -----------------------------------------------------------------

const config = require('../config');

console.log('');
console.log('npm run migrate is not implemented yet.');
console.log('');
console.log(`  Current DB_MODE is "${config.modes.db}".`);
console.log('  In local mode there is nothing to migrate: the JSON data file');
console.log('  is created automatically by "npm run seed".');
console.log('');
console.log('  To use PostgreSQL you need to:');
console.log('    1. write backend/schema.sql');
console.log('    2. fill in this script (see the comments in the file)');
console.log('    3. fill in backend/adapters/db.postgres.js');
console.log('    4. npm install pg');
console.log('    5. set DB_MODE=postgres in backend/.env');
console.log('');

process.exit(1);
