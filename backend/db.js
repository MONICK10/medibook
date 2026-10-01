// db.js
// -----------------------------------------------------------------
// This file is the ONLY place that knows how data is stored.
//
// Right now we keep everything in plain JavaScript arrays in memory.
// That means all bookings are LOST when the server restarts.
//
// Later we will replace this file with a PostgreSQL version.
// As long as the new file exports the same functions with the same
// names, server.js will not need to change at all.
//
// Every function is "async" (returns a Promise) on purpose.
// Real databases are async, so writing it this way now makes the
// switch to PostgreSQL easier later.
// -----------------------------------------------------------------

// 3 FAKE doctors. These are not real people.
const doctors = [
  { id: 1, name: 'Dr. Asha Rao', speciality: 'General Physician' },
  { id: 2, name: 'Dr. Vikram Menon', speciality: 'Cardiologist' },
  { id: 3, name: 'Dr. Priya Nair', speciality: 'Dermatologist' },
];

// All bookings are stored in this array.
const appointments = [];

// Used to give each new booking a unique id: 1, 2, 3, ...
let nextAppointmentId = 1;

// Return the list of doctors.
async function getDoctors() {
  return doctors;
}

// Find one doctor by id. Returns undefined if not found.
async function getDoctorById(id) {
  return doctors.find((doctor) => doctor.id === id);
}

// Save a new booking and return it (with its new id).
async function addAppointment({ patientName, phone, doctorId, date, time }) {
  const appointment = {
    id: nextAppointmentId,
    patientName,
    phone,
    doctorId,
    date,
    time,
    reportFile: null, // filled in later when a report is uploaded
    createdAt: new Date().toISOString(),
  };
  nextAppointmentId = nextAppointmentId + 1;

  appointments.push(appointment);
  return appointment;
}

// Return all bookings.
async function getAppointments() {
  return appointments;
}

// Find one booking by id. Returns undefined if not found.
async function getAppointmentById(id) {
  return appointments.find((appointment) => appointment.id === id);
}

// Remember which report file belongs to a booking.
async function setAppointmentReport(id, reportFile) {
  const appointment = await getAppointmentById(id);
  if (appointment) {
    appointment.reportFile = reportFile;
  }
  return appointment;
}

// Make these functions available to other files.
module.exports = {
  getDoctors,
  getDoctorById,
  addAppointment,
  getAppointments,
  getAppointmentById,
  setAppointmentReport,
};
