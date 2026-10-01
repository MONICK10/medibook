// adapters/db.js
// -----------------------------------------------------------------
// ADAPTER SWITCH: where data is stored.
//
//   DB_MODE=local    (default) -> JSON file in backend/data/
//   DB_MODE=postgres           -> PostgreSQL via the `pg` package (RDS)
//
// WHY this is the most important adapter: it is the one routes touch on
// almost every request. If routes wrote SQL directly, moving to RDS
// would mean rewriting every route. Instead routes only ever call named
// functions like `db.appointments.listForPatient(id)`, and swapping the
// implementation is a one-line env change.
//
// -----------------------------------------------------------------
// THE INTERFACE (db.local.js and db.postgres.js both implement this)
// -----------------------------------------------------------------
//
//   init()    -> Promise<void>    connect / load the file
//   close()   -> Promise<void>    for a clean shutdown
//   health()  -> Promise<{ ok, mode, detail }>   used by GET /health
//   reset()   -> Promise<void>    wipe everything (seed script only)
//
//   users:        create, findById, findByEmail, findByCognitoSub,
//                 update, list, count, setResetToken, findByResetToken,
//                 clearResetToken
//   specialties:  create, findById, findByName, list, update, remove
//   doctors:      create, findById, findByUserId, list, update,
//                 countActive
//   availability: listByDoctor, replaceForDoctor
//   appointments: createIfSlotFree, findById, list, update,
//                 listTakenSlots, countByStatus, existsBetween
//   reports:      create, findById, listByPatient, remove
//   prescriptions:create, findById, findByAppointmentId, listByPatient,
//                 update
//   auditLogs:    create, list
//
// RULES for both implementations:
//  * Every function is async. Real databases are async, so writing the
//    local one async too means routes never change.
//  * They return plain objects, never store internals. db.local.js
//    deep-copies on the way out so a caller cannot mutate the in-memory
//    store by accident; db.postgres.js gets fresh row objects anyway.
//  * Dates and times are strings ('YYYY-MM-DD', 'HH:MM'). See lib/time.js.
//  * Money is an integer number of paise/cents (feeCents), never a float.
//  * A function that cannot find something returns null, it does not throw.
//    Turning null into a 404 is the route's job.
// -----------------------------------------------------------------

const config = require('../config');

const implementation =
  config.modes.db === 'postgres' ? require('./db.postgres') : require('./db.local');

module.exports = implementation;
