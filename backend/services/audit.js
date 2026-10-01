// services/audit.js
// -----------------------------------------------------------------
// Writes the audit trail: who did what, when, from where.
//
// WHY this is separate from the normal logs: logs are for engineers and
// get rotated away after a couple of weeks. An audit trail answers
// "which staff member opened this patient's report, and when" - a
// question that can arrive months later, from a regulator or a court.
// It lives in the database, is append-only (adapters/db.local.js has no
// update or delete for it), and is readable in the admin UI.
//
// WHY the action list is a fixed set of constants: so the admin screen
// can offer a filter dropdown, and so a typo cannot create a
// near-duplicate action name that hides events from a search.
// -----------------------------------------------------------------

const db = require('../adapters/db');
const logger = require('../lib/logger');

const ACTIONS = {
  // Authentication
  LOGIN_SUCCESS: 'auth.login.success',
  LOGIN_FAILED: 'auth.login.failed',
  LOGOUT: 'auth.logout',
  REGISTER: 'auth.register',
  PASSWORD_RESET_REQUESTED: 'auth.password.reset.requested',
  PASSWORD_RESET_COMPLETED: 'auth.password.reset.completed',
  PASSWORD_CHANGED: 'auth.password.changed',

  // Records that must be traceable
  ROLE_CHANGED: 'user.role.changed',
  USER_DEACTIVATED: 'user.deactivated',
  USER_REACTIVATED: 'user.reactivated',
  DOCTOR_CREATED: 'doctor.created',
  DOCTOR_UPDATED: 'doctor.updated',
  SPECIALTY_CREATED: 'specialty.created',
  SPECIALTY_UPDATED: 'specialty.updated',
  SPECIALTY_DELETED: 'specialty.deleted',

  // Clinical activity
  APPOINTMENT_BOOKED: 'appointment.booked',
  APPOINTMENT_CANCELLED: 'appointment.cancelled',
  APPOINTMENT_RESCHEDULED: 'appointment.rescheduled',
  APPOINTMENT_OUTCOME_SET: 'appointment.outcome.set',
  PRESCRIPTION_CREATED: 'prescription.created',
  PRESCRIPTION_UPDATED: 'prescription.updated',

  // File access - the most sensitive of all
  REPORT_UPLOADED: 'report.uploaded',
  REPORT_DOWNLOADED: 'report.downloaded',
  REPORT_ACCESS_DENIED: 'report.access.denied',
};

const KNOWN_ACTIONS = new Set(Object.values(ACTIONS));

// Record one event.
//
// `req` may be null for things that happen outside a request (the seed
// script). Pass `actor` explicitly for a failed login, where there is
// no req.user because the login did not succeed.
async function record(req, { action, entityType, entityId, metadata, actor } = {}) {
  if (!KNOWN_ACTIONS.has(action)) {
    throw new Error(`Unknown audit action "${action}". Add it to ACTIONS in services/audit.js.`);
  }

  const who = actor || (req && req.user) || {};

  try {
    await db.auditLogs.create({
      action,
      actorUserId: who.id || null,
      actorRole: who.role || null,
      actorEmail: who.email || null,
      entityType: entityType || null,
      entityId: entityId || null,
      ip: req ? req.ip : null,
      // Truncated: a browser can send a very long user-agent, and we are
      // not interested in storing someone's whole plugin list.
      userAgent: req ? String(req.get('user-agent') || '').slice(0, 300) : null,
      // Keep this to facts about the action. Never put a password, a
      // token or a clinical note in here - this table is read by admins.
      metadata: metadata || {},
    });
  } catch (error) {
    // Deliberately swallowed. WHY: failing to write an audit row must not
    // turn a successful booking into an error for the patient. It is
    // logged at error level so the gap is visible to whoever watches the
    // logs. A system under a strict compliance regime would make the
    // opposite choice and refuse the action instead.
    (req && req.log ? req.log : logger).error('Could not write audit log', {
      action,
      error: error.message,
    });
  }
}

module.exports = { record, ACTIONS };
