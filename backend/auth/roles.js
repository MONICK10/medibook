// auth/roles.js
// -----------------------------------------------------------------
// Roles and what each one is allowed to do.
//
// WHY permissions instead of checking the role name in every route:
// if routes say `if (user.role === 'admin')`, then adding a
// receptionist role means hunting through every file and editing those
// checks - and the one you miss is a security hole. Here, routes ask
// for a PERMISSION ("can you manage doctors?") and this table decides
// which roles have it. Adding a receptionist is then one new entry
// below, with no route changes.
//
// Note the ":own" / ":assigned" / ":all" suffixes. They are the SCOPE of
// a permission. The permission gets you to the route; the ownership
// check in services/access.js decides which rows you may touch. Both
// are needed: "a doctor may read appointments" must not mean "a doctor
// may read ALL appointments".
// -----------------------------------------------------------------

const ROLES = {
  PATIENT: 'patient',
  DOCTOR: 'doctor',
  ADMIN: 'admin',
};

const ALL_ROLES = Object.values(ROLES);

// Every permission string the app uses. Listed so a typo in a route
// (requirePermission('appointment:boook')) fails loudly at startup
// instead of quietly allowing or denying the wrong thing.
const PERMISSIONS = {
  // Appointments
  APPOINTMENT_BOOK: 'appointment:book',
  APPOINTMENT_READ_OWN: 'appointment:read:own',
  APPOINTMENT_READ_ASSIGNED: 'appointment:read:assigned',
  APPOINTMENT_READ_ALL: 'appointment:read:all',
  APPOINTMENT_CANCEL_OWN: 'appointment:cancel:own',
  APPOINTMENT_RESCHEDULE_OWN: 'appointment:reschedule:own',
  APPOINTMENT_SET_OUTCOME: 'appointment:setOutcome', // completed / no-show

  // Doctors and specialties
  DOCTOR_READ: 'doctor:read',
  DOCTOR_MANAGE: 'doctor:manage',
  DOCTOR_EDIT_OWN_PROFILE: 'doctor:editOwnProfile',
  AVAILABILITY_MANAGE_OWN: 'availability:manageOwn',
  SPECIALTY_MANAGE: 'specialty:manage',

  // Reports
  REPORT_UPLOAD_OWN: 'report:uploadOwn',
  REPORT_READ_OWN: 'report:readOwn',
  REPORT_READ_ASSIGNED: 'report:readAssigned', // only patients this doctor sees

  // Prescriptions
  PRESCRIPTION_READ_OWN: 'prescription:readOwn',
  PRESCRIPTION_READ_ASSIGNED: 'prescription:readAssigned',
  PRESCRIPTION_WRITE: 'prescription:write',

  // Admin
  USER_MANAGE: 'user:manage',
  AUDIT_READ: 'audit:read',

  // Dashboards
  STATS_PATIENT: 'stats:patient',
  STATS_DOCTOR: 'stats:doctor',
  STATS_ADMIN: 'stats:admin',
};

const P = PERMISSIONS;

// The table. To add a role, add one key here and nothing else changes.
const ROLE_PERMISSIONS = {
  [ROLES.PATIENT]: [
    P.APPOINTMENT_BOOK,
    P.APPOINTMENT_READ_OWN,
    P.APPOINTMENT_CANCEL_OWN,
    P.APPOINTMENT_RESCHEDULE_OWN,
    P.DOCTOR_READ,
    P.REPORT_UPLOAD_OWN,
    P.REPORT_READ_OWN,
    P.PRESCRIPTION_READ_OWN,
    P.STATS_PATIENT,
  ],

  [ROLES.DOCTOR]: [
    P.APPOINTMENT_READ_ASSIGNED,
    P.APPOINTMENT_SET_OUTCOME,
    P.DOCTOR_READ,
    P.DOCTOR_EDIT_OWN_PROFILE,
    P.AVAILABILITY_MANAGE_OWN,
    P.REPORT_READ_ASSIGNED,
    P.PRESCRIPTION_WRITE,
    P.PRESCRIPTION_READ_ASSIGNED,
    P.STATS_DOCTOR,
  ],

  [ROLES.ADMIN]: [
    P.APPOINTMENT_READ_ALL,
    P.DOCTOR_READ,
    P.DOCTOR_MANAGE,
    P.SPECIALTY_MANAGE,
    P.USER_MANAGE,
    P.AUDIT_READ,
    P.STATS_ADMIN,
  ],

  // --- Example of adding a role later -----------------------------
  // Uncomment, add 'receptionist' to ROLES, and the whole app works:
  //
  // [ROLES.RECEPTIONIST]: [
  //   P.APPOINTMENT_READ_ALL,
  //   P.APPOINTMENT_BOOK,
  //   P.DOCTOR_READ,
  // ],
  //
  // Note what an admin deliberately does NOT get: REPORT_READ_OWN or
  // PRESCRIPTION_READ_OWN. An admin runs the clinic; they have no
  // clinical reason to read a patient's medical reports. Keeping that
  // out of the table is the whole point of least privilege.
};

// Fail fast if the table ever references a permission that is not
// declared above - almost always a typo.
const KNOWN_PERMISSIONS = new Set(Object.values(PERMISSIONS));
for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
  for (const permission of permissions) {
    if (!KNOWN_PERMISSIONS.has(permission)) {
      throw new Error(`Role "${role}" references unknown permission "${permission}".`);
    }
  }
}

// Pre-built Sets, because `has` is faster than `includes` and this runs
// on every single request.
const permissionSets = Object.fromEntries(
  Object.entries(ROLE_PERMISSIONS).map(([role, list]) => [role, new Set(list)])
);

// Does this role have this permission?
function can(role, permission) {
  if (!KNOWN_PERMISSIONS.has(permission)) {
    // A route asking for a permission that does not exist is a bug, and
    // the safe answer to "may I?" when the question is broken is no.
    throw new Error(`Unknown permission "${permission}". Add it to PERMISSIONS in auth/roles.js.`);
  }
  const set = permissionSets[role];
  return set ? set.has(permission) : false;
}

function isValidRole(role) {
  return ALL_ROLES.includes(role);
}

// The permission list for a role, so the frontend can show or hide menu
// items. Convenience only - the backend still enforces every rule.
function permissionsFor(role) {
  return [...(permissionSets[role] || [])];
}

module.exports = {
  ROLES,
  ALL_ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  can,
  isValidRole,
  permissionsFor,
};
