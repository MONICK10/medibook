// server.js
// -----------------------------------------------------------------
// The main file of the backend. It starts an Express web server
// and defines the API routes (URLs) that the frontend calls.
//
// Notice: this file does NOT know how data or files are stored.
//   - Data   -> handled by db.js
//   - Files  -> handled by storage.js
// -----------------------------------------------------------------

const express = require('express');
const cors = require('cors');
const multer = require('multer');

const db = require('./db');
const storage = require('./storage');

const app = express();

// Read the port from an environment variable. If it is not set, use 3000.
const PORT = process.env.PORT || 3000;

// ---------- Middleware (code that runs before every route) ----------

// Allow the frontend (running on a different port) to call this API.
app.use(cors());

// Let Express read JSON sent in the request body.
app.use(express.json());

// Multer handles file uploads.
// memoryStorage() keeps the file in memory, then storage.js decides
// where to save it. This keeps "where files go" inside storage.js only.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // max 5 MB
  fileFilter: (req, file, callback) => {
    // Only allow PDF and image files.
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg'];
    if (allowedTypes.includes(file.mimetype)) {
      callback(null, true); // accept the file
    } else {
      callback(new Error('Only PDF, PNG or JPG files are allowed'));
    }
  },
});

// ---------- Routes ----------

// Health check: a quick way to see if the server is running.
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Get the list of doctors.
app.get('/api/doctors', async (req, res) => {
  const doctors = await db.getDoctors();
  res.json(doctors);
});

// Save a new booking.
app.post('/api/appointments', async (req, res) => {
  const { patientName, phone, doctorId, date, time } = req.body;

  // 1. Check that all fields were sent.
  if (!patientName || !phone || !doctorId || !date || !time) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // 2. Check the phone number: only digits, 10 of them.
  if (!/^[0-9]{10}$/.test(phone)) {
    return res.status(400).json({ error: 'Phone must be 10 digits' });
  }

  // 3. Check that the doctor exists.
  const doctor = await db.getDoctorById(Number(doctorId));
  if (!doctor) {
    return res.status(400).json({ error: 'Doctor not found' });
  }

  // 4. Everything is fine, so save it.
  const appointment = await db.addAppointment({
    patientName,
    phone,
    doctorId: doctor.id,
    date,
    time,
  });

  // 201 means "Created".
  res.status(201).json(appointment);
});

// Get all bookings.
app.get('/api/appointments', async (req, res) => {
  const appointments = await db.getAppointments();
  res.json(appointments);
});

// Upload a medical report for a booking.
// upload.single('report') means: expect ONE file in a form field named "report".
app.post('/api/reports', upload.single('report'), async (req, res) => {
  const appointmentId = Number(req.body.appointmentId);

  // 1. Check that a file was sent.
  if (!req.file) {
    return res.status(400).json({ error: 'Please choose a file' });
  }

  // 2. Check that the booking exists.
  const appointment = await db.getAppointmentById(appointmentId);
  if (!appointment) {
    return res.status(400).json({ error: 'Booking not found' });
  }

  // 3. Save the file (storage.js decides where) and link it to the booking.
  try {
    const savedName = await storage.saveFile(req.file);
    await db.setAppointmentReport(appointmentId, savedName);
    res.status(201).json({ message: 'Report uploaded', fileName: savedName });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Could not save the file' });
  }
});

// ---------- Error handler ----------
// If anything above throws an error (for example a wrong file type,
// or a file that is too big), Express sends it here.
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(400).json({ error: err.message });
});

// ---------- Start the server ----------
app.listen(PORT, () => {
  console.log('MediBook backend running on http://localhost:' + PORT);
});
