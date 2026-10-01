// scripts/seed.js
// -----------------------------------------------------------------
// Fills an empty database with fake demo data.  Run: npm run seed
//
// Everything in here is invented. No real people, no real patient
// data. The accounts are demo accounts with a published password, which
// is exactly why this script refuses to run with NODE_ENV=production.
// -----------------------------------------------------------------

const fs = require('fs');
const path = require('path');

const config = require('../config');
const logger = require('../lib/logger');
const time = require('../lib/time');

const secrets = require('../adapters/secrets');
const db = require('../adapters/db');
const storage = require('../adapters/storage');
const auth = require('../adapters/auth');
const { checkPasswordStrength } = require('../lib/password');
const { ROLES } = require('../auth/roles');
const slots = require('../services/slots');
const { makePdf, makePng } = require('./sampleFiles');

// One password for every demo account, so the list is easy to teach
// from. Override it with SEED_PASSWORD if you like.
//
// It has to satisfy the real rules in lib/password.js - checked below,
// not assumed. WHY that check matters: the seed writes a bcrypt hash
// directly and never goes through the register form, so without it the
// seed could happily create accounts whose password the app would
// refuse to accept. (The first draft of this file used "MediBook#2026",
// which the rules reject for containing the app's own name.)
const DEMO_PASSWORD = process.env.SEED_PASSWORD || 'ClinicDemo#2026';

// Weekday numbers, to keep the schedules below readable.
const MON = 1;
const TUE = 2;
const WED = 3;
const THU = 4;
const FRI = 5;
const SAT = 6;

const SPECIALTIES = [
  {
    name: 'General Medicine',
    description: 'Everyday illnesses, check-ups and referrals.',
  },
  {
    name: 'Cardiology',
    description: 'Heart and blood vessel conditions.',
  },
  {
    name: 'Dermatology',
    description: 'Skin, hair and nail conditions.',
  },
  {
    name: 'Paediatrics',
    description: 'Healthcare for babies, children and teenagers.',
  },
  {
    name: 'Orthopaedics',
    description: 'Bones, joints, muscles and sports injuries.',
  },
];

const DOCTORS = [
  {
    name: 'Dr. Asha Rao',
    email: 'asha.rao@medibook.local',
    phone: '9000000101',
    specialty: 'General Medicine',
    qualification: 'MBBS, MD (General Medicine)',
    experienceYears: 12,
    // Fees are stored as integer paise, never a floating point rupee
    // value. 60000 paise = Rs 600.00
    feeCents: 60000,
    bio:
      'Dr. Asha Rao has 12 years of experience in general medicine. She treats ' +
      'everyday illnesses, manages long-term conditions such as diabetes and ' +
      'blood pressure, and refers patients to specialists when needed.',
    availability: [
      { weekday: MON, startTime: '09:00', endTime: '13:00', slotMinutes: 20 },
      { weekday: WED, startTime: '09:00', endTime: '13:00', slotMinutes: 20 },
      { weekday: FRI, startTime: '14:00', endTime: '18:00', slotMinutes: 20 },
    ],
  },
  {
    name: 'Dr. Vikram Menon',
    email: 'vikram.menon@medibook.local',
    phone: '9000000102',
    specialty: 'Cardiology',
    qualification: 'MBBS, MD, DM (Cardiology)',
    experienceYears: 18,
    feeCents: 120000, // Rs 1200.00
    bio:
      'Dr. Vikram Menon is a cardiologist with 18 years of experience. He sees ' +
      'patients for chest pain, high blood pressure, heart rhythm problems and ' +
      'follow-up after heart procedures.',
    availability: [
      { weekday: TUE, startTime: '10:00', endTime: '13:00', slotMinutes: 30 },
      { weekday: THU, startTime: '10:00', endTime: '13:00', slotMinutes: 30 },
    ],
  },
  {
    name: 'Dr. Priya Nair',
    email: 'priya.nair@medibook.local',
    phone: '9000000103',
    specialty: 'Dermatology',
    qualification: 'MBBS, MD (Dermatology)',
    experienceYears: 8,
    feeCents: 80000,
    bio:
      'Dr. Priya Nair treats skin conditions including acne, eczema and ' +
      'psoriasis, along with hair loss and nail problems. She also offers ' +
      'routine skin checks.',
    availability: [
      { weekday: MON, startTime: '15:00', endTime: '19:00', slotMinutes: 15 },
      { weekday: THU, startTime: '15:00', endTime: '19:00', slotMinutes: 15 },
      { weekday: SAT, startTime: '10:00', endTime: '13:00', slotMinutes: 15 },
    ],
  },
  {
    name: 'Dr. Imran Qureshi',
    email: 'imran.qureshi@medibook.local',
    phone: '9000000104',
    specialty: 'Paediatrics',
    qualification: 'MBBS, MD (Paediatrics)',
    experienceYears: 15,
    feeCents: 70000,
    bio:
      'Dr. Imran Qureshi is a paediatrician caring for newborns through to ' +
      'teenagers. He handles routine vaccinations, growth and development ' +
      'checks, and childhood illnesses.',
    availability: [
      { weekday: MON, startTime: '09:30', endTime: '12:30', slotMinutes: 20 },
      { weekday: TUE, startTime: '09:30', endTime: '12:30', slotMinutes: 20 },
      { weekday: WED, startTime: '16:00', endTime: '19:00', slotMinutes: 20 },
      { weekday: FRI, startTime: '09:30', endTime: '12:30', slotMinutes: 20 },
    ],
  },
  {
    name: 'Dr. Meera Krishnan',
    email: 'meera.krishnan@medibook.local',
    phone: '9000000105',
    specialty: 'Orthopaedics',
    qualification: 'MBBS, MS (Orthopaedics)',
    experienceYears: 20,
    feeCents: 95000,
    bio:
      'Dr. Meera Krishnan treats bone and joint problems, sports injuries, ' +
      'back pain and arthritis, and provides care before and after joint ' +
      'replacement surgery.',
    availability: [
      { weekday: TUE, startTime: '14:00', endTime: '18:00', slotMinutes: 30 },
      { weekday: THU, startTime: '14:00', endTime: '18:00', slotMinutes: 30 },
    ],
  },
  {
    name: 'Dr. Sanjay Pillai',
    email: 'sanjay.pillai@medibook.local',
    phone: '9000000106',
    specialty: 'General Medicine',
    qualification: 'MBBS, DNB (Family Medicine)',
    experienceYears: 6,
    feeCents: 50000,
    bio:
      'Dr. Sanjay Pillai is a family physician who sees patients of all ages ' +
      'for common infections, minor injuries, health screening and advice on ' +
      'diet and exercise.',
    availability: [
      { weekday: WED, startTime: '09:00', endTime: '12:00', slotMinutes: 15 },
      { weekday: FRI, startTime: '09:00', endTime: '12:00', slotMinutes: 15 },
      { weekday: SAT, startTime: '09:00', endTime: '12:00', slotMinutes: 15 },
    ],
  },
];

const PATIENTS = [
  { name: 'Ravi Shankar', email: 'ravi@example.com', phone: '9000000201' },
  { name: 'Divya Iyer', email: 'divya@example.com', phone: '9000000202' },
  { name: 'Arjun Das', email: 'arjun@example.com', phone: '9000000203' },
  { name: 'Fatima Sheikh', email: 'fatima@example.com', phone: '9000000204' },
  { name: 'Joseph Mathew', email: 'joseph@example.com', phone: '9000000205' },
];

const ADMIN = {
  name: 'Clinic Administrator',
  email: 'admin@medibook.local',
  phone: '9000000001',
};

const VISIT_REASONS = [
  'Fever and body ache for three days',
  'Follow-up for blood pressure medication',
  'Persistent dry cough',
  'Itchy rash on both arms',
  'Routine annual health check',
  'Knee pain after playing football',
  'Child due for vaccination',
  'Chest discomfort while climbing stairs',
  'Review of recent blood test results',
  'Headaches in the afternoon',
  'Shoulder stiffness for two weeks',
  'Acne not improving with cream',
];

// -----------------------------------------------------------------

async function main() {
  // Refuse to run against anything that calls itself production. These
  // accounts have a password printed in a README.
  if (config.isProduction && !process.argv.includes('--force')) {
    console.error('Refusing to seed with NODE_ENV=production.');
    console.error('These are demo accounts with a published password.');
    console.error('Use --force only if you are certain.');
    process.exit(1);
  }

  // The demo password must pass the same rules a real user faces.
  const strength = checkPasswordStrength(DEMO_PASSWORD);
  if (!strength.ok) {
    console.error(`SEED_PASSWORD is not acceptable: it ${strength.message}.`);
    console.error('Pick one that satisfies the rules in lib/password.js.');
    process.exit(1);
  }

  // Make sure there is a .env, so the JWT secret is stable between the
  // seed and the server. Without it, config.js invents a new secret each
  // process and the demo logins would stop working at every restart.
  ensureEnvFile();

  await secrets.init();
  await db.init();
  await storage.init();
  await auth.init();

  console.log('');
  console.log('Clearing existing data...');
  await db.reset();
  await clearUploads();

  // One password hash, reused. bcrypt is deliberately slow, so hashing
  // it 12 times would add real seconds to the seed for no benefit.
  console.log('Hashing the demo password...');
  const passwordHash = await auth.hashPassword(DEMO_PASSWORD);

  // --- admin -----------------------------------------------------
  console.log('Creating the admin...');
  const admin = await db.users.create({
    role: ROLES.ADMIN,
    name: ADMIN.name,
    email: ADMIN.email,
    phone: ADMIN.phone,
    passwordHash,
    isActive: true,
  });

  // --- specialties -----------------------------------------------
  console.log('Creating specialties...');
  const specialtyByName = new Map();
  for (const item of SPECIALTIES) {
    const specialty = await db.specialties.create(item);
    specialtyByName.set(specialty.name, specialty);
  }

  // --- doctors ---------------------------------------------------
  console.log('Creating doctors and their weekly schedules...');
  const doctorRecords = [];
  for (const item of DOCTORS) {
    const user = await db.users.create({
      role: ROLES.DOCTOR,
      name: item.name,
      email: item.email,
      phone: item.phone,
      passwordHash,
      isActive: true,
    });

    const specialty = specialtyByName.get(item.specialty);
    const doctor = await db.doctors.create({
      userId: user.id,
      specialtyId: specialty.id,
      bio: item.bio,
      feeCents: item.feeCents,
      experienceYears: item.experienceYears,
      qualification: item.qualification,
    });

    await db.availability.replaceForDoctor(doctor.id, item.availability);

    doctorRecords.push({ user, doctor, availability: item.availability, config: item });
  }

  // --- patients --------------------------------------------------
  console.log('Creating patients...');
  const patients = [];
  for (const item of PATIENTS) {
    patients.push(
      await db.users.create({
        role: ROLES.PATIENT,
        name: item.name,
        email: item.email,
        phone: item.phone,
        passwordHash,
        isActive: true,
      })
    );
  }

  // --- appointments ----------------------------------------------
  console.log('Creating appointments...');
  const appointments = await createAppointments(doctorRecords, patients);

  // --- prescriptions ---------------------------------------------
  console.log('Writing prescriptions for some completed visits...');
  const prescriptions = await createPrescriptions(appointments, doctorRecords);

  // --- reports ---------------------------------------------------
  console.log('Uploading sample report files...');
  const reports = await createReports(patients, appointments);

  await db.close();

  printSummary({
    admin,
    doctorRecords,
    patients,
    appointments,
    prescriptions,
    reports,
  });
}

// -----------------------------------------------------------------

function ensureEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) return;

  console.log('No backend/.env found. Creating one with fresh secrets...');
  // Reuse the same script the student would run by hand, so there is
  // only one piece of code that knows how to build a .env.
  require('child_process').execFileSync(
    process.execPath,
    [path.join(__dirname, 'init-env.js')],
    { stdio: 'inherit' }
  );

  // config.js already ran and captured the generated-on-the-fly secrets,
  // so this process is still using those. That is fine: the seed only
  // hashes passwords (bcrypt, not secret-dependent) and never issues a
  // token. The SERVER will read the new .env when it starts.
}

async function clearUploads() {
  const uploadDir = config.paths.uploadDir;
  if (!fs.existsSync(uploadDir)) return;

  // Remove the seeded report folder only. Anything else a student
  // uploaded while experimenting is left alone.
  const reportsDir = path.join(uploadDir, 'reports');
  await fs.promises.rm(reportsDir, { recursive: true, force: true });
}

// Pick an item from a list, deterministically, so repeated seeds look
// the same and screenshots in teaching notes stay accurate.
function pick(list, index) {
  return list[index % list.length];
}

async function createAppointments(doctorRecords, patients) {
  const today = time.todayString();
  const created = [];

  // Remembers which (doctor, date, time) we have already used, so we
  // never ask the adapter to double-book. createIfSlotFree would refuse
  // anyway - this just avoids wasted attempts.
  const used = new Set();

  // Walk backwards for past visits and forwards for upcoming ones,
  // finding real slots in each doctor's weekly schedule.
  async function book({ doctorIndex, patientIndex, dayOffset, status, reasonIndex }) {
    const record = doctorRecords[doctorIndex % doctorRecords.length];
    const patient = patients[patientIndex % patients.length];
    const date = time.addDays(today, dayOffset);

    // Only the doctor's real slots for that weekday are candidates.
    const daySlots = slots.slotsForDate(record.availability, date);
    if (daySlots.length === 0) return null; // doctor does not work that day

    const slot = daySlots.find(
      (candidate) => !used.has(`${record.doctor.id}|${date}|${candidate.startTime}`)
    );
    if (!slot) return null;

    used.add(`${record.doctor.id}|${date}|${slot.startTime}`);

    const appointment = await db.appointments.createIfSlotFree({
      patientUserId: patient.id,
      doctorId: record.doctor.id,
      date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      slotMinutes: slot.slotMinutes,
      reason: pick(VISIT_REASONS, reasonIndex),
      status: 'booked',
      feeCentsAtBooking: record.doctor.feeCents,
    });
    if (!appointment) return null;

    // Move it to its final status, through update(), so the stored shape
    // is the same as it would be if a doctor had clicked the button.
    if (status !== 'booked') {
      const patch = { status };
      if (status === 'completed') {
        patch.completedAt = time.toLocalDate(date, slot.endTime).toISOString();
      }
      if (status === 'cancelled') {
        patch.cancelledAt = time.toLocalDate(date, '08:00').toISOString();
        patch.cancelledByUserId = patient.id;
        patch.cancelReason = 'Could not attend';
      }
      await db.appointments.update(appointment.id, patch);
      appointment.status = status;
    }

    created.push({ appointment, record, patient });
    return appointment;
  }

  // --- past appointments: completed, no-show, cancelled -----------
  // Several statuses so the admin dashboard and the patient's history
  // both have something real to show.
  const pastPlan = [
    { doctorIndex: 0, patientIndex: 0, dayOffset: -21, status: 'completed' },
    { doctorIndex: 0, patientIndex: 1, dayOffset: -19, status: 'completed' },
    { doctorIndex: 1, patientIndex: 0, dayOffset: -17, status: 'completed' },
    { doctorIndex: 2, patientIndex: 2, dayOffset: -16, status: 'completed' },
    { doctorIndex: 3, patientIndex: 3, dayOffset: -15, status: 'completed' },
    { doctorIndex: 4, patientIndex: 4, dayOffset: -14, status: 'completed' },
    { doctorIndex: 5, patientIndex: 1, dayOffset: -12, status: 'completed' },
    { doctorIndex: 1, patientIndex: 2, dayOffset: -10, status: 'no_show' },
    { doctorIndex: 2, patientIndex: 0, dayOffset: -9, status: 'cancelled' },
    { doctorIndex: 0, patientIndex: 3, dayOffset: -8, status: 'completed' },
    { doctorIndex: 3, patientIndex: 4, dayOffset: -7, status: 'no_show' },
    { doctorIndex: 4, patientIndex: 1, dayOffset: -6, status: 'cancelled' },
    { doctorIndex: 5, patientIndex: 2, dayOffset: -5, status: 'completed' },
    { doctorIndex: 2, patientIndex: 3, dayOffset: -3, status: 'completed' },
  ];

  // --- upcoming appointments: booked -----------------------------
  const futurePlan = [
    { doctorIndex: 0, patientIndex: 0, dayOffset: 1, status: 'booked' },
    { doctorIndex: 1, patientIndex: 1, dayOffset: 1, status: 'booked' },
    { doctorIndex: 2, patientIndex: 2, dayOffset: 2, status: 'booked' },
    { doctorIndex: 3, patientIndex: 0, dayOffset: 2, status: 'booked' },
    { doctorIndex: 4, patientIndex: 3, dayOffset: 3, status: 'booked' },
    { doctorIndex: 5, patientIndex: 4, dayOffset: 3, status: 'booked' },
    { doctorIndex: 0, patientIndex: 1, dayOffset: 4, status: 'booked' },
    { doctorIndex: 2, patientIndex: 0, dayOffset: 5, status: 'booked' },
    { doctorIndex: 3, patientIndex: 2, dayOffset: 6, status: 'booked' },
  ];

  let reasonIndex = 0;
  for (const plan of [...pastPlan, ...futurePlan]) {
    // Try the planned day first; if that doctor does not work then, slide
    // forward or back a few days until a real working day is found.
    for (let nudge = 0; nudge <= 6; nudge += 1) {
      const direction = plan.dayOffset < 0 ? -1 : 1;
      const booked = await book({
        ...plan,
        dayOffset: plan.dayOffset + nudge * direction,
        reasonIndex,
      });
      if (booked) {
        reasonIndex += 1;
        break;
      }
    }
  }

  return created;
}

async function createPrescriptions(appointments, doctorRecords) {
  // Only a completed visit gets a prescription - an appointment that has
  // not happened yet cannot have one, and the API will enforce that.
  const completed = appointments.filter(
    (item) => item.appointment.status === 'completed'
  );

  const templates = [
    {
      medicines: [
        { name: 'Paracetamol 500mg', dose: '1 tablet', frequency: 'Three times a day', days: 3 },
        { name: 'Cetirizine 10mg', dose: '1 tablet', frequency: 'At night', days: 5 },
      ],
      notes: 'Rest and drink plenty of fluids. Come back if the fever lasts beyond three days.',
    },
    {
      medicines: [
        { name: 'Amlodipine 5mg', dose: '1 tablet', frequency: 'Once in the morning', days: 30 },
      ],
      notes: 'Check blood pressure weekly and write the readings down. Review in one month.',
    },
    {
      medicines: [
        { name: 'Clobetasol cream 0.05%', dose: 'Thin layer', frequency: 'Twice a day', days: 14 },
        { name: 'Levocetirizine 5mg', dose: '1 tablet', frequency: 'At night', days: 10 },
      ],
      notes: 'Avoid hot water on the affected skin. Do not use the cream on the face.',
    },
    {
      medicines: [
        { name: 'Ibuprofen 400mg', dose: '1 tablet', frequency: 'Twice a day after food', days: 5 },
        { name: 'Calcium + Vitamin D3', dose: '1 tablet', frequency: 'Once a day', days: 30 },
      ],
      notes: 'Apply ice for 15 minutes twice a day. Begin the exercises from the handout after a week.',
    },
    {
      medicines: [
        { name: 'Ondansetron 4mg', dose: '1 tablet', frequency: 'When needed', days: 3 },
        { name: 'ORS sachets', dose: '1 sachet in 1 litre of water', frequency: 'Through the day', days: 3 },
      ],
      notes: 'Small sips often. Return at once if the child cannot keep fluids down.',
    },
  ];

  const created = [];
  for (let index = 0; index < Math.min(5, completed.length); index += 1) {
    const { appointment, record, patient } = completed[index];
    const template = templates[index % templates.length];

    created.push(
      await db.prescriptions.create({
        appointmentId: appointment.id,
        patientUserId: patient.id,
        doctorId: record.doctor.id,
        medicines: template.medicines,
        notes: template.notes,
      })
    );
  }

  return created;
}

async function createReports(patients, appointments) {
  const plan = [
    {
      patientIndex: 0,
      title: 'Blood test results',
      kind: 'pdf',
      fileName: 'blood-test-results.pdf',
      lines: [
        'SAMPLE DOCUMENT - FAKE DATA ONLY',
        '',
        'Patient: Ravi Shankar (demo)',
        'Test: Complete blood count',
        '',
        'Haemoglobin      13.8 g/dL     (normal 13.0 - 17.0)',
        'White cells       7.2 x10^9/L  (normal 4.0 - 11.0)',
        'Platelets         245 x10^9/L  (normal 150 - 450)',
        '',
        'All values within the normal range.',
      ],
    },
    {
      patientIndex: 0,
      title: 'Chest X-ray image',
      kind: 'png',
      fileName: 'chest-xray.png',
    },
    {
      patientIndex: 1,
      title: 'ECG report',
      kind: 'pdf',
      fileName: 'ecg-report.pdf',
      lines: [
        'SAMPLE DOCUMENT - FAKE DATA ONLY',
        '',
        'Patient: Divya Iyer (demo)',
        'Test: Resting 12-lead ECG',
        '',
        'Rate          72 beats per minute',
        'Rhythm        Regular sinus rhythm',
        'Intervals     Within normal limits',
        '',
        'Impression: Normal ECG.',
      ],
    },
    {
      patientIndex: 2,
      title: 'Skin patch test',
      kind: 'pdf',
      fileName: 'patch-test.pdf',
      lines: [
        'SAMPLE DOCUMENT - FAKE DATA ONLY',
        '',
        'Patient: Arjun Das (demo)',
        'Test: Allergy patch test, 20 common allergens',
        '',
        'Positive reaction: Nickel sulphate (mild)',
        'All other allergens: no reaction',
        '',
        'Advice: avoid nickel-plated jewellery and watch straps.',
      ],
    },
    {
      patientIndex: 3,
      title: 'Knee MRI summary',
      kind: 'pdf',
      fileName: 'knee-mri-summary.pdf',
      lines: [
        'SAMPLE DOCUMENT - FAKE DATA ONLY',
        '',
        'Patient: Fatima Sheikh (demo)',
        'Study: MRI, right knee',
        '',
        'Findings: small amount of fluid in the joint.',
        'Ligaments and cartilage appear intact.',
        '',
        'Impression: mild effusion, no tear seen.',
      ],
    },
  ];

  const created = [];

  for (const item of plan) {
    const patient = patients[item.patientIndex];

    const buffer =
      item.kind === 'png'
        ? makePng()
        : makePdf({ title: item.title + ' (sample)', lines: item.lines });

    const mimeType = item.kind === 'png' ? 'image/png' : 'application/pdf';

    // Goes through the storage adapter, exactly as an upload from the
    // browser would. So with STORAGE_MODE=s3 the seed populates S3
    // instead, with no change to this script.
    const { key, sizeBytes } = await storage.save({
      buffer,
      originalName: item.fileName,
      mimeType,
      ownerId: patient.id,
    });

    // Link it to one of that patient's completed visits, if they have one.
    const visit = appointments.find(
      (row) =>
        row.patient.id === patient.id && row.appointment.status === 'completed'
    );

    created.push(
      await db.reports.create({
        patientUserId: patient.id,
        appointmentId: visit ? visit.appointment.id : null,
        uploadedByUserId: patient.id,
        fileKey: key,
        originalName: item.fileName,
        mimeType,
        sizeBytes,
        title: item.title,
      })
    );
  }

  return created;
}

// -----------------------------------------------------------------

function printSummary({ admin, doctorRecords, patients, appointments, prescriptions, reports }) {
  const line = '='.repeat(72);
  const statuses = appointments.reduce((counts, item) => {
    counts[item.appointment.status] = (counts[item.appointment.status] || 0) + 1;
    return counts;
  }, {});

  console.log('');
  console.log(line);
  console.log('SEED COMPLETE');
  console.log(line);
  console.log(`Specialties:    ${SPECIALTIES.length}`);
  console.log(`Doctors:        ${doctorRecords.length}`);
  console.log(`Patients:       ${patients.length}`);
  console.log(
    `Appointments:   ${appointments.length}  ` +
      `(${Object.entries(statuses).map(([key, value]) => `${key}: ${value}`).join(', ')})`
  );
  console.log(`Prescriptions:  ${prescriptions.length}`);
  console.log(`Reports:        ${reports.length}`);
  console.log('');
  console.log(line);
  console.log('DEMO LOGINS');
  console.log(line);
  console.log(`Every account below uses the same password: ${DEMO_PASSWORD}`);
  console.log('');
  console.log('ADMIN');
  console.log(`  ${admin.email}`);
  console.log('');
  console.log('DOCTORS');
  for (const record of doctorRecords) {
    console.log(`  ${record.user.email.padEnd(34)} ${record.config.specialty}`);
  }
  console.log('');
  console.log('PATIENTS');
  for (const patient of patients) {
    console.log(`  ${patient.email.padEnd(34)} ${patient.name}`);
  }
  console.log('');
  console.log(line);
  console.log('These are fake demo accounts holding invented data.');
  console.log('Next: npm run dev   (then start the frontend)');
  console.log(line);
  console.log('');
}

main().catch((error) => {
  logger.error('Seed failed', { message: error.message, stack: error.stack });
  process.exit(1);
});
