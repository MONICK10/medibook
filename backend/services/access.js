// services/access.js
// -----------------------------------------------------------------
// LAYER 3 of the security chain: may you touch THIS ROW?
//
//   requireAuth        -> are you logged in?             401
//   requirePermission  -> may your role do this at all?  403
//   THIS FILE          -> may you do it to this record?  403
//
// WHY layer 2 is not enough: "a patient may read appointments" is a
// true statement about the role, and it is also how you accidentally
// let patient A read patient B's appointment. The permission gets you
// to the route; these functions decide which rows you may see.
//
// WHY these are functions and not middleware: the check needs the ROW,
// so it has to run after the database lookup. Middleware runs before.
// Each loader below therefore fetches and checks in one step, and the
// route cannot get a row without having been checked - the only way to
// get one is to call a function that checks.
//
// On 403 vs 404: asking for a record that belongs to someone else
// returns 403, not 404. That does confirm the id exists, which a
// strict reading of "do not leak information" would avoid. It is the
// deliberate choice here because the ids are unguessable UUIDs (so the
// leak is worth little) and because a clear "you are not allowed"
// teaches the boundary better than a vague "not found".
// -----------------------------------------------------------------

const db = require('../adapters/db');
const { forbidden, notFound } = require('../lib/httpError');
const { ROLES, PERMISSIONS, can } = require('../auth/roles');

// The doctor PROFILE row for a logged-in doctor user.
//
// Needed constantly, because appointments point at a doctor profile id
// while req.user carries a user id. A doctor account with no profile
// row is broken data, not a permission problem, so it is a 500-worthy
// situation - but we return 403 rather than leak that detail.
async function requireDoctorProfile(user) {
  if (user.role !== ROLES.DOCTOR) {
    throw forbidden('Only a doctor can do this.');
  }

  const doctor = await db.doctors.findByUserId(user.id);
  if (!doctor) {
    throw forbidden('Your doctor profile is incomplete. Please contact the clinic.');
  }

  return doctor;
}

// Has this doctor ever had an appointment with this patient?
//
// THE rule behind "a doctor may only open the records of patients they
// actually treat". Any appointment counts, including cancelled ones:
// the patient did choose to book with this doctor, and a doctor
// preparing for a visit that was later moved still has a reason to
// look. Change this to a status filter if you want it stricter.
async function doctorTreatsPatient(doctorId, patientUserId) {
  return db.appointments.existsForDoctorAndPatient(doctorId, patientUserId);
}

// May this user see this patient's clinical records (reports, history)?
// True for the patient themselves, and for a doctor who treats them.
//
// Note an admin fails this check. That is the rule you confirmed:
// running the clinic is not a clinical reason to read someone's test
// results. See the note in auth/roles.js.
async function assertCanViewPatientRecords(user, patientUserId) {
  if (user.role === ROLES.PATIENT) {
    if (user.id !== patientUserId) {
      throw forbidden('You can only view your own records.');
    }
    return { via: 'self' };
  }

  if (user.role === ROLES.DOCTOR) {
    const doctor = await requireDoctorProfile(user);
    const treats = await doctorTreatsPatient(doctor.id, patientUserId);
    if (!treats) {
      throw forbidden('You can only view patients who have an appointment with you.');
    }
    return { via: 'doctor', doctor };
  }

  throw forbidden('You do not have permission to view patient records.');
}

// Load one appointment, or refuse.
//
// Returns { appointment, doctor } - doctor is the caller's own profile
// when a doctor is asking, since the route usually needs it next.
async function loadAppointment(user, appointmentId) {
  const appointment = await db.appointments.findById(appointmentId);
  if (!appointment) throw notFound('That appointment');

  if (user.role === ROLES.PATIENT) {
    if (appointment.patientUserId !== user.id) {
      throw forbidden('That appointment belongs to someone else.');
    }
    return { appointment, doctor: null };
  }

  if (user.role === ROLES.DOCTOR) {
    const doctor = await requireDoctorProfile(user);
    if (appointment.doctorId !== doctor.id) {
      throw forbidden('That appointment is with a different doctor.');
    }
    return { appointment, doctor };
  }

  // Anyone else needs the clinic-wide read permission (admins).
  if (can(user.role, PERMISSIONS.APPOINTMENT_READ_ALL)) {
    return { appointment, doctor: null };
  }

  throw forbidden('You do not have permission to view that appointment.');
}

// Load one report, or refuse. Used by both the list detail and the
// download-link endpoint, so the file rule lives in exactly one place.
async function loadReport(user, reportId) {
  const report = await db.reports.findById(reportId);
  if (!report) throw notFound('That report');

  // Reuses the patient-records rule, so reports and visit history can
  // never drift apart on who may see what.
  await assertCanViewPatientRecords(user, report.patientUserId);

  return report;
}

// Load one prescription, or refuse.
async function loadPrescription(user, prescriptionId) {
  const prescription = await db.prescriptions.findById(prescriptionId);
  if (!prescription) throw notFound('That prescription');

  if (user.role === ROLES.PATIENT) {
    if (prescription.patientUserId !== user.id) {
      throw forbidden('That prescription belongs to someone else.');
    }
    return { prescription, doctor: null };
  }

  if (user.role === ROLES.DOCTOR) {
    const doctor = await requireDoctorProfile(user);
    // Stricter than reports on purpose: a doctor may read the
    // prescriptions THEY wrote, not everything another doctor has
    // prescribed for a shared patient. Treatment by someone else is
    // their clinical record to explain, not ours to hand over.
    if (prescription.doctorId !== doctor.id) {
      throw forbidden('You can only view prescriptions you wrote.');
    }
    return { prescription, doctor };
  }

  throw forbidden('You do not have permission to view that prescription.');
}

module.exports = {
  requireDoctorProfile,
  doctorTreatsPatient,
  assertCanViewPatientRecords,
  loadAppointment,
  loadReport,
  loadPrescription,
};
