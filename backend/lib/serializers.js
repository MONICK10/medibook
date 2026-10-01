// lib/serializers.js
// -----------------------------------------------------------------
// Turns database rows into the exact shape the API sends out.
//
// WHY every response goes through here:
// a route that does `res.json(user)` works perfectly today and leaks
// `passwordHash` the moment someone adds that column. Allow-listing
// the fields means a new sensitive column is invisible by default, and
// there is one file to audit when asking "what can the browser see?".
//
// These also decide what each ROLE may see of the same row. A doctor
// gets a patient's phone number because they may need to call them; a
// patient does not get another patient's anything.
// -----------------------------------------------------------------

const { permissionsFor } = require('../auth/roles');

// The logged-in user, as sent to themselves.
function publicUser(user) {
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    phone: user.phone,
    isActive: user.isActive,
    createdAt: user.createdAt,
    // So the frontend can hide menu items. Convenience only: every
    // route still checks permissions for itself.
    permissions: permissionsFor(user.role),
  };
}

// A user as an admin sees them in the Manage Users table.
function userForAdmin(user) {
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    phone: user.phone,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    // Deliberately absent: passwordHash, resetTokenHash. An admin has
    // no reason to see either, and showing whether a reset is pending
    // would help an attacker who has taken over an admin account.
  };
}

// A doctor as shown on the public site: bio, fee, specialty. This is
// marketing copy, so it is safe without logging in.
// NOTE: no email or phone. Those belong to the clinic's staff records,
// not a public directory page.
function publicDoctor(doctor) {
  return {
    id: doctor.id,
    name: doctor.name,
    specialtyId: doctor.specialtyId,
    specialtyName: doctor.specialtyName,
    qualification: doctor.qualification,
    experienceYears: doctor.experienceYears,
    bio: doctor.bio,
    feeCents: doctor.feeCents,
    isActive: doctor.isActive,
  };
}

// The same doctor as an admin sees them, with contact details and the
// linked user account.
function doctorForAdmin(doctor) {
  return {
    ...publicDoctor(doctor),
    userId: doctor.userId,
    email: doctor.email,
    phone: doctor.phone,
    createdAt: doctor.createdAt,
  };
}

// An appointment. The `viewer` decides which names come back.
//
// WHY the role matters here: the row joined from the database carries
// both the patient's and the doctor's name. A patient must not learn
// anything extra about the clinic's internals, and a doctor looking at
// their day does not need the patient's full record - just enough to
// know who is coming and why.
function appointmentFor(viewer, appointment) {
  const base = {
    id: appointment.id,
    date: appointment.date,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    slotMinutes: appointment.slotMinutes,
    status: appointment.status,
    reason: appointment.reason,
    doctorId: appointment.doctorId,
    doctorName: appointment.doctorName,
    specialtyName: appointment.specialtyName,
    feeCentsAtBooking: appointment.feeCentsAtBooking,
    createdAt: appointment.createdAt,
    cancelledAt: appointment.cancelledAt,
    cancelReason: appointment.cancelReason,
    completedAt: appointment.completedAt,
    rescheduledFrom: appointment.rescheduledFrom,
  };

  if (viewer.role === 'patient') return base;

  // Doctors and admins also see who the patient is.
  return {
    ...base,
    patientUserId: appointment.patientUserId,
    patientName: appointment.patientName,
    patientPhone: appointment.patientPhone,
  };
}

// A report. The file KEY is never sent out.
//
// WHY: the key is the path inside the bucket or the uploads folder. It
// is not a secret that grants access on its own (nothing serves those
// paths), but publishing internal storage layout helps nobody outside
// the server. The browser gets an id and asks for a download URL.
function publicReport(report) {
  return {
    id: report.id,
    title: report.title,
    originalName: report.originalName,
    mimeType: report.mimeType,
    sizeBytes: report.sizeBytes,
    appointmentId: report.appointmentId,
    patientUserId: report.patientUserId,
    uploadedByUserId: report.uploadedByUserId,
    createdAt: report.createdAt,
  };
}

function publicPrescription(prescription) {
  return {
    id: prescription.id,
    appointmentId: prescription.appointmentId,
    patientUserId: prescription.patientUserId,
    doctorId: prescription.doctorId,
    doctorName: prescription.doctorName,
    appointmentDate: prescription.appointmentDate,
    appointmentTime: prescription.appointmentTime,
    medicines: prescription.medicines,
    notes: prescription.notes,
    createdAt: prescription.createdAt,
    updatedAt: prescription.updatedAt,
  };
}

function publicSpecialty(specialty) {
  return {
    id: specialty.id,
    name: specialty.name,
    description: specialty.description,
  };
}

// A patient, as the treating doctor sees them in their patient list.
function patientForDoctor(patient) {
  return {
    id: patient.id,
    name: patient.name,
    email: patient.email,
    phone: patient.phone,
    lastVisitDate: patient.lastVisitDate,
    visitCount: patient.visitCount,
  };
}

module.exports = {
  publicUser,
  userForAdmin,
  publicDoctor,
  doctorForAdmin,
  appointmentFor,
  publicReport,
  publicPrescription,
  publicSpecialty,
  patientForDoctor,
};
