// scripts/check-api.js
// -----------------------------------------------------------------
// End-to-end checks against the real HTTP API.  Run: npm run check:api
//
// Where scripts/check.js tests the rules in isolation, this one starts
// the actual Express app and makes real requests with real logins. It
// is the file that proves the authorization story, so most of what it
// checks is "the wrong person is refused".
//
// It runs against its OWN data directory and uploads folder (a temp
// copy seeded from scratch), so running it never touches the data you
// are developing against.
// -----------------------------------------------------------------

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

// --- isolate the test data ----------------------------------------
// This MUST happen before anything requires ../config, because config
// reads process.env once at load time.
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'medibook-apitest-'));
process.env.DATA_DIR = path.join(sandbox, 'data');
process.env.UPLOAD_DIR = path.join(sandbox, 'uploads');
process.env.LOG_LEVEL = 'error'; // keep the output readable
process.env.NODE_ENV = 'development';
// A fixed secret so the seed process and this process agree.
process.env.JWT_SECRET = 'test-only-secret-not-used-anywhere-else-0123456789';
process.env.FILE_SIGNING_SECRET = 'test-only-file-secret-not-used-elsewhere-0123456789';
// Generous limits so the checks themselves are never rate limited.
process.env.RATE_LIMIT_LOGIN_MAX = '500';
process.env.RATE_LIMIT_GLOBAL_MAX = '100000';

const DEMO_PASSWORD = 'ClinicDemo#2026';

// --- tiny test harness --------------------------------------------
const results = [];
let currentGroup = '';

function group(name) {
  currentGroup = name;
}

async function check(name, fn) {
  const record = { group: currentGroup, name, ok: true };
  results.push(record);
  try {
    await fn();
  } catch (error) {
    record.ok = false;
    record.message = error.message;
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function expectStatus(response, wanted, what) {
  if (response.status !== wanted) {
    throw new Error(
      `${what}: expected ${wanted}, got ${response.status} ` +
        `(${JSON.stringify(response.body).slice(0, 160)})`
    );
  }
}

// --- HTTP helper ---------------------------------------------------
let baseUrl = '';

async function api(method, routePath, { token, body, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (body instanceof FormData) {
    payload = body; // fetch sets the multipart boundary itself
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const response = await fetch(baseUrl + routePath, {
    method,
    headers,
    body: payload,
    redirect: 'manual',
  });

  if (raw) return response;

  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { nonJsonBody: text.slice(0, 200) };
  }

  return { status: response.status, body: parsed, headers: response.headers };
}

async function login(email, password = DEMO_PASSWORD) {
  const response = await api('POST', '/api/auth/login', {
    body: { email, password },
  });
  if (response.status !== 200) {
    throw new Error(`Could not log in as ${email}: ${JSON.stringify(response.body)}`);
  }
  return response.body.token;
}

// Ask the OS for a free port, then give it back.
//
// WHY we cannot just listen on port 0: the signed download links the
// API hands out are absolute URLs built from config.apiPublicUrl, and
// config reads that env variable once at load time. So the port has to
// be known BEFORE anything requires ../config. Listening on 0 and
// reading the port afterwards is too late, and the links would point
// at localhost:3000 - quite possibly a different server.
function findFreePort() {
  const net = require('net');
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

// -----------------------------------------------------------------
async function main() {
  const port = await findFreePort();
  process.env.PORT = String(port);
  process.env.API_PUBLIC_URL = `http://127.0.0.1:${port}`;

  // Seed the sandbox in a child process, so it picks up DATA_DIR.
  execFileSync(process.execPath, [path.join(__dirname, 'seed.js')], {
    env: process.env,
    stdio: 'pipe',
  });

  const db = require('../adapters/db');
  const storage = require('../adapters/storage');
  const auth = require('../adapters/auth');
  const secrets = require('../adapters/secrets');
  const { createApp } = require('../app');

  await secrets.init();
  await db.init();
  await storage.init();
  await auth.init();

  // The port found above, which config has already been told about.
  const server = await new Promise((resolve) => {
    const s = createApp().listen(port, '127.0.0.1', () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${port}`;

  try {
    await runChecks(db);
  } finally {
    server.close();
    await db.close();
    fs.rmSync(sandbox, { recursive: true, force: true });
  }

  report();
}

async function runChecks(db) {
  // --- log everyone in ---
  const adminToken = await login('admin@medibook.local');
  const patientA = await login('ravi@example.com');
  const patientB = await login('divya@example.com');

  // Work out the real ids and relationships from the seeded data,
  // rather than hardcoding them - the seed shifts dates to match each
  // doctor's weekday schedule, so ids are not predictable.
  const me = await api('GET', '/api/auth/me', { token: patientA });
  const patientAId = me.body.user.id;
  const meB = await api('GET', '/api/auth/me', { token: patientB });
  const patientBId = meB.body.user.id;

  const allAppointments = await api(
    'GET',
    '/api/admin/appointments?limit=100',
    { token: adminToken }
  );
  const adminDoctors = await api('GET', '/api/admin/doctors?limit=100', {
    token: adminToken,
  });
  const doctorById = new Map(adminDoctors.body.doctors.map((d) => [d.id, d]));

  // An appointment belonging to patient B, for the cross-patient test.
  const patientBAppointment = allAppointments.body.appointments.find(
    (a) => a.patientUserId === patientBId
  );
  // One of patient A's, so A can read their own.
  const patientAAppointment = allAppointments.body.appointments.find(
    (a) => a.patientUserId === patientAId
  );

  // =================================================================
  group('ACCEPTANCE: patient cannot reach another patient or admin');
  // =================================================================

  await check('patient A reading patient B\'s appointment gets 403', async () => {
    expect(Boolean(patientBAppointment), 'no seeded appointment found for patient B');
    const response = await api('GET', `/api/appointments/${patientBAppointment.id}`, {
      token: patientA,
    });
    expectStatus(response, 403, 'cross-patient appointment read');
    expect(response.body.error.code === 'forbidden', 'expected a forbidden error code');
  });

  await check('patient A reading their OWN appointment gets 200', async () => {
    const response = await api('GET', `/api/appointments/${patientAAppointment.id}`, {
      token: patientA,
    });
    expectStatus(response, 200, 'own appointment read');
  });

  await check('patient A cannot cancel patient B\'s appointment', async () => {
    const response = await api(
      'POST',
      `/api/appointments/${patientBAppointment.id}/cancel`,
      { token: patientA, body: {} }
    );
    expectStatus(response, 403, 'cross-patient cancel');
  });

  await check('a patient listing appointments only ever sees their own', async () => {
    const response = await api('GET', '/api/appointments?limit=100', { token: patientA });
    expectStatus(response, 200, 'patient appointment list');
    const foreign = response.body.appointments.filter(
      // A patient's serialized appointment has no patientUserId at all,
      // so this also proves the serializer is hiding it.
      (a) => a.patientUserId !== undefined
    );
    expect(foreign.length === 0, 'a patient list leaked patientUserId');
    expect(response.body.appointments.length > 0, 'patient A should have appointments');
  });

  await check('ACCEPTANCE: a patient calling an /admin route gets 403', async () => {
    for (const route of [
      '/api/admin/stats',
      '/api/admin/users',
      '/api/admin/doctors',
      '/api/admin/appointments',
      '/api/admin/audit-logs',
      '/api/admin/specialties',
    ]) {
      const response = await api('GET', route, { token: patientA });
      expectStatus(response, 403, `patient calling ${route}`);
    }
  });

  await check('a patient cannot create a doctor', async () => {
    const response = await api('POST', '/api/admin/doctors', {
      token: patientA,
      body: {
        name: 'Fake Doctor',
        email: 'fake@example.com',
        phone: '9000000999',
        specialtyId: '00000000-0000-0000-0000-000000000000',
        feeCents: 1,
      },
    });
    expectStatus(response, 403, 'patient creating a doctor');
  });

  await check('no token at all gets 401, not 403', async () => {
    const response = await api('GET', '/api/admin/stats');
    expectStatus(response, 401, 'admin route with no token');
  });

  // =================================================================
  group('ACCEPTANCE: doctor boundaries');
  // =================================================================

  // Find a doctor who HAS seen patient A, and one who has not.
  const patientAVisits = allAppointments.body.appointments.filter(
    (a) => a.patientUserId === patientAId
  );
  const treatingDoctorId = patientAVisits[0].doctorId;
  const treatingDoctor = doctorById.get(treatingDoctorId);

  const strangerDoctor = adminDoctors.body.doctors.find(
    (d) => !patientAVisits.some((a) => a.doctorId === d.id)
  );

  const treatingToken = await login(treatingDoctor.email);
  const strangerToken = strangerDoctor ? await login(strangerDoctor.email) : null;

  await check('a treating doctor CAN list their patient\'s reports', async () => {
    const response = await api(`GET`, `/api/reports?patientUserId=${patientAId}`, {
      token: treatingToken,
    });
    expectStatus(response, 200, 'treating doctor reading reports');
    expect(response.body.reports.length > 0, 'patient A should have seeded reports');
  });

  await check(
    'ACCEPTANCE: a doctor who has never seen the patient gets 403 on their reports',
    async () => {
      expect(Boolean(strangerDoctor), 'could not find a doctor unrelated to patient A');
      const response = await api('GET', `/api/reports?patientUserId=${patientAId}`, {
        token: strangerToken,
      });
      expectStatus(response, 403, 'unrelated doctor reading reports');
    }
  );

  await check(
    'ACCEPTANCE: that doctor also cannot open the report by its id',
    async () => {
      const list = await api('GET', `/api/reports?patientUserId=${patientAId}`, {
        token: treatingToken,
      });
      const reportId = list.body.reports[0].id;

      const detail = await api('GET', `/api/reports/${reportId}`, {
        token: strangerToken,
      });
      expectStatus(detail, 403, 'unrelated doctor reading a report by id');

      const link = await api('GET', `/api/reports/${reportId}/download-url`, {
        token: strangerToken,
      });
      expectStatus(link, 403, 'unrelated doctor requesting a download link');
    }
  );

  await check('a refused report access is written to the audit log', async () => {
    const logs = await api('GET', '/api/admin/audit-logs?action=report.access.denied', {
      token: adminToken,
    });
    expectStatus(logs, 200, 'audit log read');
    expect(logs.body.total > 0, 'expected a report.access.denied entry');
  });

  await check('a doctor cannot open a patient record they do not treat', async () => {
    const response = await api('GET', `/api/doctor/patients/${patientAId}`, {
      token: strangerToken,
    });
    expectStatus(response, 403, 'unrelated doctor opening a patient record');
  });

  await check('a treating doctor CAN open that patient record', async () => {
    const response = await api('GET', `/api/doctor/patients/${patientAId}`, {
      token: treatingToken,
    });
    expectStatus(response, 200, 'treating doctor opening a patient record');
    expect(Array.isArray(response.body.reports), 'expected a reports array');
    // Every visit shown must be with THIS doctor.
    const foreign = response.body.visits.filter((v) => v.doctorId !== treatingDoctorId);
    expect(foreign.length === 0, 'a doctor saw visits belonging to another doctor');
  });

  await check('a doctor cannot read the clinic-wide appointment list', async () => {
    const response = await api('GET', '/api/admin/appointments', { token: treatingToken });
    expectStatus(response, 403, 'doctor calling the admin appointment list');
  });

  await check('a doctor listing appointments sees only their own', async () => {
    const response = await api('GET', '/api/appointments?limit=100', {
      token: treatingToken,
    });
    expectStatus(response, 200, 'doctor appointment list');
    const foreign = response.body.appointments.filter(
      (a) => a.doctorId !== treatingDoctorId
    );
    expect(foreign.length === 0, 'a doctor saw another doctor\'s appointments');
  });

  // =================================================================
  group('ACCEPTANCE: admin cannot read clinical records');
  // =================================================================

  await check('an admin gets 403 on a patient\'s reports', async () => {
    const response = await api('GET', `/api/reports?patientUserId=${patientAId}`, {
      token: adminToken,
    });
    expectStatus(response, 403, 'admin reading reports');
  });

  await check('an admin gets 403 on prescriptions', async () => {
    const response = await api('GET', '/api/prescriptions', { token: adminToken });
    expectStatus(response, 403, 'admin reading prescriptions');
  });

  // =================================================================
  group('ACCEPTANCE: files are not reachable without permission');
  // =================================================================

  let realDownloadUrl = null;

  await check('a patient can get a working download link for their own report', async () => {
    const list = await api('GET', '/api/reports', { token: patientA });
    expectStatus(list, 200, 'own report list');

    const reportId = list.body.reports[0].id;
    const link = await api('GET', `/api/reports/${reportId}/download-url`, {
      token: patientA,
    });
    expectStatus(link, 200, 'download link');
    expect(typeof link.body.url === 'string', 'expected a url');
    realDownloadUrl = link.body.url;

    const file = await fetch(realDownloadUrl);
    expect(file.status === 200, `following the link gave ${file.status}`);
    const bytes = Buffer.from(await file.arrayBuffer());
    // The seeded reports are real PDFs or PNGs.
    const isPdf = bytes.subarray(0, 5).toString('latin1') === '%PDF-';
    const isPng = bytes[0] === 0x89 && bytes.subarray(1, 4).toString('latin1') === 'PNG';
    expect(isPdf || isPng, 'the downloaded bytes were not a PDF or PNG');
    expect(
      String(file.headers.get('content-disposition') || '').includes('attachment'),
      'a downloaded file should be sent as an attachment, not rendered'
    );
  });

  await check(
    'ACCEPTANCE: a report cannot be fetched by guessing a URL, with no login',
    async () => {
      // A forged token.
      const forged = Buffer.from(
        JSON.stringify({ k: 'reports/anything/x.pdf', e: 9999999999 })
      ).toString('base64url');

      for (const attempt of [
        `/api/files/${forged}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`,
        '/api/files/nonsense',
        // The stored path, in case uploads are served as static files.
        '/uploads/reports/x.pdf',
        '/api/uploads/reports/x.pdf',
      ]) {
        const response = await api('GET', attempt);
        expect(
          response.status === 400 || response.status === 404,
          `${attempt} should be refused, got ${response.status}`
        );
      }
    }
  );

  await check('tampering with a valid link breaks it', async () => {
    expect(Boolean(realDownloadUrl), 'no download url captured');
    // Change the last character of the signature.
    const tampered =
      realDownloadUrl.slice(0, -1) + (realDownloadUrl.endsWith('A') ? 'B' : 'A');
    const response = await fetch(tampered);
    expect(response.status === 400, `a tampered link gave ${response.status}`);
  });

  // =================================================================
  group('ACCEPTANCE: two patients cannot book the same slot');
  // =================================================================

  await check('the second booking of one slot gets 409', async () => {
    // Find any doctor with a free slot in the booking window.
    const doctors = await api('GET', '/api/doctors?limit=50');
    let target = null;

    for (const doctor of doctors.body.doctors) {
      const slots = await api('GET', `/api/doctors/${doctor.id}/slots`);
      for (const day of slots.body.calendar) {
        const free = day.slots.find((s) => s.available);
        if (free) {
          target = { doctorId: doctor.id, date: day.date, startTime: free.startTime };
          break;
        }
      }
      if (target) break;
    }

    expect(Boolean(target), 'could not find any free slot to test with');

    const first = await api('POST', '/api/appointments', {
      token: patientA,
      body: { ...target, reason: 'First patient booking this slot' },
    });
    expectStatus(first, 201, 'first booking');

    const second = await api('POST', '/api/appointments', {
      token: patientB,
      body: { ...target, reason: 'Second patient trying the same slot' },
    });
    expectStatus(second, 409, 'second booking of the same slot');
    expect(second.body.error.code === 'conflict', 'expected a conflict error code');

    // And the slot is now reported as taken.
    const slots = await api('GET', `/api/doctors/${target.doctorId}/slots`);
    const day = slots.body.calendar.find((d) => d.date === target.date);
    const slot = day.slots.find((s) => s.startTime === target.startTime);
    expect(slot.available === false, 'the booked slot still shows as available');
    expect(slot.reason === 'booked', `expected reason "booked", got "${slot.reason}"`);

    // Clean up so later checks are not affected.
    await api('POST', `/api/appointments/${first.body.appointment.id}/cancel`, {
      token: patientA,
      body: { reason: 'test cleanup' },
    });
  });

  await check('cancelling frees the slot for someone else', async () => {
    const doctors = await api('GET', '/api/doctors?limit=50');
    let target = null;
    for (const doctor of doctors.body.doctors) {
      const slots = await api('GET', `/api/doctors/${doctor.id}/slots`);
      for (const day of slots.body.calendar) {
        const free = day.slots.find((s) => s.available);
        if (free) {
          target = { doctorId: doctor.id, date: day.date, startTime: free.startTime };
          break;
        }
      }
      if (target) break;
    }

    const first = await api('POST', '/api/appointments', {
      token: patientA,
      body: { ...target, reason: 'Booking then cancelling' },
    });
    expectStatus(first, 201, 'booking');

    await api('POST', `/api/appointments/${first.body.appointment.id}/cancel`, {
      token: patientA,
      body: {},
    });

    const second = await api('POST', '/api/appointments', {
      token: patientB,
      body: { ...target, reason: 'Taking the freed slot' },
    });
    expectStatus(second, 201, 'booking a cancelled slot');

    await api('POST', `/api/appointments/${second.body.appointment.id}/cancel`, {
      token: patientB,
      body: {},
    });
  });

  // =================================================================
  group('Booking rules are enforced on the server');
  // =================================================================

  const anyDoctor = (await api('GET', '/api/doctors?limit=1')).body.doctors[0];

  await check('a time that is not one of the doctor\'s slots is refused', async () => {
    // 03:00 is in nobody's working hours.
    const response = await api('POST', '/api/appointments', {
      token: patientA,
      body: {
        doctorId: anyDoctor.id,
        date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        startTime: '03:00',
        reason: 'Trying to book outside working hours',
      },
    });
    expectStatus(response, 400, 'booking at 03:00');
  });

  await check('a time BETWEEN slots is refused', async () => {
    const slots = await api('GET', `/api/doctors/${anyDoctor.id}/slots`);
    const day = slots.body.calendar.find((d) => d.slots.length > 0);
    expect(Boolean(day), 'no day with slots found');

    // Shift a real slot by 7 minutes: a plausible-looking time that is
    // not on the grid. Without the findSlot check this would book and
    // quietly block the real slot.
    const [h, m] = day.slots[0].startTime.split(':').map(Number);
    const offGrid = `${String(h).padStart(2, '0')}:${String((m + 7) % 60).padStart(2, '0')}`;

    const response = await api('POST', '/api/appointments', {
      token: patientA,
      body: {
        doctorId: anyDoctor.id,
        date: day.date,
        startTime: offGrid,
        reason: 'Trying to book between slots',
      },
    });
    expectStatus(response, 400, `booking at ${offGrid}`);
  });

  await check('a date in the past is refused', async () => {
    const response = await api('POST', '/api/appointments', {
      token: patientA,
      body: {
        doctorId: anyDoctor.id,
        date: '2020-01-06',
        startTime: '09:00',
        reason: 'Booking in the past',
      },
    });
    expectStatus(response, 400, 'booking in the past');
  });

  await check('a date beyond the booking window is refused', async () => {
    const far = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
    const response = await api('POST', '/api/appointments', {
      token: patientA,
      body: {
        doctorId: anyDoctor.id,
        date: far,
        startTime: '09:00',
        reason: 'Booking too far ahead',
      },
    });
    expectStatus(response, 400, 'booking beyond the window');
  });

  await check('the patient id and fee cannot be set from the request body', async () => {
    const slots = await api('GET', `/api/doctors/${anyDoctor.id}/slots`);
    let target = null;
    for (const day of slots.body.calendar) {
      const free = day.slots.find((s) => s.available);
      if (free) {
        target = { date: day.date, startTime: free.startTime };
        break;
      }
    }
    expect(Boolean(target), 'no free slot');

    const response = await api('POST', '/api/appointments', {
      token: patientA,
      body: {
        doctorId: anyDoctor.id,
        ...target,
        reason: 'Trying to inject fields',
        // All of these must be ignored.
        patientUserId: patientBId,
        feeCentsAtBooking: 0,
        status: 'completed',
      },
    });
    expectStatus(response, 201, 'booking with extra fields');

    const created = await db.appointments.findById(response.body.appointment.id);
    expect(
      created.patientUserId === patientAId,
      'patientUserId was taken from the request body'
    );
    expect(created.status === 'booked', 'status was taken from the request body');
    expect(
      created.feeCentsAtBooking === anyDoctor.feeCents,
      'the fee was taken from the request body'
    );

    await api('POST', `/api/appointments/${response.body.appointment.id}/cancel`, {
      token: patientA,
      body: {},
    });
  });

  await check('a patient cannot double-book themselves at one time', async () => {
    // Two different doctors working the same slot time, if the seed has
    // any; skipped quietly if not.
    const doctors = (await api('GET', '/api/doctors?limit=50')).body.doctors;
    let found = null;

    for (let i = 0; i < doctors.length && !found; i += 1) {
      const a = await api('GET', `/api/doctors/${doctors[i].id}/slots`);
      for (let j = i + 1; j < doctors.length && !found; j += 1) {
        const b = await api('GET', `/api/doctors/${doctors[j].id}/slots`);
        for (const dayA of a.body.calendar) {
          const dayB = b.body.calendar.find((d) => d.date === dayA.date);
          if (!dayB) continue;
          const slotA = dayA.slots.find(
            (s) => s.available && dayB.slots.some((t) => t.available && t.startTime === s.startTime)
          );
          if (slotA) {
            found = {
              first: { doctorId: doctors[i].id, date: dayA.date, startTime: slotA.startTime },
              second: { doctorId: doctors[j].id, date: dayA.date, startTime: slotA.startTime },
            };
            break;
          }
        }
      }
    }

    if (!found) return; // nothing to test with in this seed

    const first = await api('POST', '/api/appointments', {
      token: patientA,
      body: { ...found.first, reason: 'First of two at the same time' },
    });
    expectStatus(first, 201, 'first of two');

    const second = await api('POST', '/api/appointments', {
      token: patientA,
      body: { ...found.second, reason: 'Second doctor, same moment' },
    });
    expectStatus(second, 409, 'same patient, same time, different doctor');

    await api('POST', `/api/appointments/${first.body.appointment.id}/cancel`, {
      token: patientA,
      body: {},
    });
  });

  // =================================================================
  group('Cancel, reschedule and outcome');
  // =================================================================

  await check('a past appointment cannot be cancelled', async () => {
    const past = allAppointments.body.appointments.find(
      (a) => a.patientUserId === patientAId && a.status === 'completed'
    );
    expect(Boolean(past), 'no completed appointment for patient A');

    const response = await api('POST', `/api/appointments/${past.id}/cancel`, {
      token: patientA,
      body: {},
    });
    expectStatus(response, 400, 'cancelling a completed appointment');
  });

  await check('reschedule moves the booking and frees the old slot', async () => {
    const doctors = (await api('GET', '/api/doctors?limit=50')).body.doctors;
    let slotsFound = null;

    for (const doctor of doctors) {
      const response = await api('GET', `/api/doctors/${doctor.id}/slots`);
      const free = [];
      for (const day of response.body.calendar) {
        for (const slot of day.slots) {
          if (slot.available) free.push({ date: day.date, startTime: slot.startTime });
        }
      }
      if (free.length >= 2) {
        slotsFound = { doctorId: doctor.id, from: free[0], to: free[1] };
        break;
      }
    }
    expect(Boolean(slotsFound), 'need a doctor with two free slots');

    const booked = await api('POST', '/api/appointments', {
      token: patientA,
      body: {
        doctorId: slotsFound.doctorId,
        ...slotsFound.from,
        reason: 'Will be rescheduled',
      },
    });
    expectStatus(booked, 201, 'booking before reschedule');

    const moved = await api(
      'POST',
      `/api/appointments/${booked.body.appointment.id}/reschedule`,
      { token: patientA, body: slotsFound.to }
    );
    expectStatus(moved, 201, 'reschedule');

    expect(
      moved.body.appointment.date === slotsFound.to.date &&
        moved.body.appointment.startTime === slotsFound.to.startTime,
      'the new appointment is not at the requested time'
    );
    expect(
      moved.body.appointment.rescheduledFrom === booked.body.appointment.id,
      'the new appointment does not point back at the old one'
    );

    // The original is cancelled, not deleted, so the history is intact.
    const original = await db.appointments.findById(booked.body.appointment.id);
    expect(original.status === 'cancelled', 'the original was not cancelled');

    // And its slot is free again.
    const after = await api('GET', `/api/doctors/${slotsFound.doctorId}/slots`);
    const day = after.body.calendar.find((d) => d.date === slotsFound.from.date);
    const slot = day.slots.find((s) => s.startTime === slotsFound.from.startTime);
    expect(slot.available === true, 'the old slot was not released');

    await api('POST', `/api/appointments/${moved.body.appointment.id}/cancel`, {
      token: patientA,
      body: {},
    });
  });

  await check('a doctor cannot set an outcome before the appointment', async () => {
    const doctors = (await api('GET', '/api/doctors?limit=50')).body.doctors;
    let target = null;
    for (const doctor of doctors) {
      const response = await api('GET', `/api/doctors/${doctor.id}/slots`);
      for (const day of response.body.calendar) {
        const free = day.slots.find((s) => s.available);
        if (free) {
          target = { doctorId: doctor.id, date: day.date, startTime: free.startTime };
          break;
        }
      }
      if (target) break;
    }

    const booked = await api('POST', '/api/appointments', {
      token: patientA,
      body: { ...target, reason: 'Future appointment' },
    });
    expectStatus(booked, 201, 'booking a future appointment');

    const doctorEmail = doctorById.get(target.doctorId).email;
    const token = await login(doctorEmail);

    const response = await api(
      'POST',
      `/api/appointments/${booked.body.appointment.id}/outcome`,
      { token, body: { status: 'no_show' } }
    );
    expectStatus(response, 400, 'outcome on a future appointment');

    await api('POST', `/api/appointments/${booked.body.appointment.id}/cancel`, {
      token: patientA,
      body: {},
    });
  });

  await check('a doctor cannot set the outcome of another doctor\'s appointment', async () => {
    const theirs = allAppointments.body.appointments.find(
      (a) => a.doctorId !== treatingDoctorId && a.status === 'booked'
    );
    if (!theirs) return;

    const response = await api('POST', `/api/appointments/${theirs.id}/outcome`, {
      token: treatingToken,
      body: { status: 'completed' },
    });
    expectStatus(response, 403, 'outcome on another doctor\'s appointment');
  });

  // =================================================================
  group('Prescriptions');
  // =================================================================

  await check('a prescription cannot be written for an unfinished appointment', async () => {
    const booked = allAppointments.body.appointments.find(
      (a) => a.doctorId === treatingDoctorId && a.status === 'booked'
    );
    if (!booked) return;

    const response = await api('POST', '/api/prescriptions', {
      token: treatingToken,
      body: {
        appointmentId: booked.id,
        medicines: [
          { name: 'Paracetamol 500mg', dose: '1 tablet', frequency: 'Twice a day', days: 3 },
        ],
      },
    });
    expectStatus(response, 400, 'prescription for a booked appointment');
  });

  await check('an appointment cannot have two prescriptions', async () => {
    // Find a completed visit for this doctor that already has one.
    const prescriptions = await api('GET', '/api/prescriptions', { token: treatingToken });
    expectStatus(prescriptions, 200, 'doctor prescription list');
    if (prescriptions.body.prescriptions.length === 0) return;

    const existing = prescriptions.body.prescriptions[0];
    const response = await api('POST', '/api/prescriptions', {
      token: treatingToken,
      body: {
        appointmentId: existing.appointmentId,
        medicines: [
          { name: 'Ibuprofen 400mg', dose: '1 tablet', frequency: 'Twice a day', days: 5 },
        ],
      },
    });
    expectStatus(response, 409, 'a second prescription for one appointment');
  });

  await check('a patient can read their own prescription but not another\'s', async () => {
    const mine = await api('GET', '/api/prescriptions', { token: patientA });
    expectStatus(mine, 200, 'patient prescription list');

    const theirs = await api('GET', '/api/prescriptions', { token: patientB });
    expectStatus(theirs, 200, 'other patient prescription list');

    if (theirs.body.prescriptions.length > 0) {
      const response = await api(
        'GET',
        `/api/prescriptions/${theirs.body.prescriptions[0].id}`,
        { token: patientA }
      );
      expectStatus(response, 403, 'cross-patient prescription read');
    }
  });

  await check('a doctor cannot read a prescription written by someone else', async () => {
    const theirs = await api('GET', '/api/prescriptions', { token: strangerToken });
    const mine = await api('GET', '/api/prescriptions', { token: treatingToken });

    if (mine.body.prescriptions.length > 0) {
      const response = await api(
        'GET',
        `/api/prescriptions/${mine.body.prescriptions[0].id}`,
        { token: strangerToken }
      );
      expectStatus(response, 403, 'another doctor\'s prescription');
    }
  });

  await check('medicine lines are validated field by field', async () => {
    const completed = allAppointments.body.appointments.find(
      (a) => a.doctorId === treatingDoctorId && a.status === 'completed'
    );
    if (!completed) return;

    const response = await api('POST', '/api/prescriptions', {
      token: treatingToken,
      body: {
        appointmentId: completed.id,
        medicines: [{ name: 'X', dose: '', frequency: 'Daily', days: 0 }],
      },
    });
    expect(
      response.status === 422 || response.status === 409,
      `expected a validation failure, got ${response.status}`
    );
    if (response.status === 422) {
      expect(
        Object.keys(response.body.error.details || {}).length > 0,
        'expected per-field validation details'
      );
    }
  });

  // =================================================================
  group('Uploads');
  // =================================================================

  await check('a patient can upload a PDF and then download it', async () => {
    const { makePdf } = require('./sampleFiles');
    const pdf = makePdf({ title: 'Uploaded in a test', lines: ['Fake data only.'] });

    const form = new FormData();
    form.append('report', new Blob([pdf], { type: 'application/pdf' }), 'test-upload.pdf');
    form.append('title', 'Test upload');

    const response = await api('POST', '/api/reports', { token: patientA, body: form });
    expectStatus(response, 201, 'uploading a PDF');
    expect(response.body.report.sizeBytes === pdf.length, 'the stored size is wrong');
    expect(response.body.report.fileKey === undefined, 'the file key leaked to the client');

    const link = await api('GET', `/api/reports/${response.body.report.id}/download-url`, {
      token: patientA,
    });
    expectStatus(link, 200, 'download link for the upload');

    const file = await fetch(link.body.url);
    const bytes = Buffer.from(await file.arrayBuffer());
    expect(bytes.length === pdf.length, 'the downloaded file differs in size');
    expect(bytes.equals(pdf), 'the downloaded bytes differ from what was uploaded');
  });

  await check('a non-allowed file type is refused', async () => {
    const form = new FormData();
    form.append(
      'report',
      new Blob([Buffer.from('<html>not a report</html>')], { type: 'text/html' }),
      'evil.html'
    );

    const response = await api('POST', '/api/reports', { token: patientA, body: form });
    expectStatus(response, 400, 'uploading an HTML file');
  });

  await check('a PDF extension with an HTML content type is refused', async () => {
    const form = new FormData();
    form.append(
      'report',
      new Blob([Buffer.from('<html></html>')], { type: 'text/html' }),
      'sneaky.pdf'
    );

    const response = await api('POST', '/api/reports', { token: patientA, body: form });
    expectStatus(response, 400, 'mismatched extension and type');
  });

  await check('a file over the size limit is refused', async () => {
    const tooBig = Buffer.alloc(6 * 1024 * 1024, 0x41); // 6 MB, limit is 5
    const form = new FormData();
    form.append('report', new Blob([tooBig], { type: 'application/pdf' }), 'big.pdf');

    const response = await api('POST', '/api/reports', { token: patientA, body: form });
    expectStatus(response, 413, 'uploading 6 MB');
  });

  await check('a patient cannot attach a report to another patient\'s appointment', async () => {
    const { makePdf } = require('./sampleFiles');
    const form = new FormData();
    form.append(
      'report',
      new Blob([makePdf({ title: 'x', lines: [] })], { type: 'application/pdf' }),
      'x.pdf'
    );
    form.append('appointmentId', patientBAppointment.id);

    const response = await api('POST', '/api/reports', { token: patientA, body: form });
    expectStatus(response, 403, 'attaching to another patient\'s appointment');
  });

  await check('an upload is always owned by the uploader', async () => {
    const { makePdf } = require('./sampleFiles');
    const form = new FormData();
    form.append(
      'report',
      new Blob([makePdf({ title: 'y', lines: [] })], { type: 'application/pdf' }),
      'y.pdf'
    );
    // Must be ignored.
    form.append('patientUserId', patientBId);
    form.append('uploadedByUserId', patientBId);

    const response = await api('POST', '/api/reports', { token: patientA, body: form });
    expectStatus(response, 201, 'upload with injected owner fields');
    expect(
      response.body.report.patientUserId === patientAId,
      'the report was assigned to the wrong patient'
    );
  });

  // =================================================================
  group('Admin management');
  // =================================================================

  await check('an admin can create a doctor, and the password is not returned', async () => {
    const specialties = await api('GET', '/api/admin/specialties', { token: adminToken });
    const specialtyId = specialties.body.specialties[0].id;

    const response = await api('POST', '/api/admin/doctors', {
      token: adminToken,
      body: {
        name: 'Dr. Test Newman',
        email: 'test.newman@medibook.local',
        phone: '9000000777',
        specialtyId,
        feeCents: 55000,
        qualification: 'MBBS',
        experienceYears: 4,
        bio: 'Created by the API test.',
      },
    });
    expectStatus(response, 201, 'creating a doctor');

    const serialized = JSON.stringify(response.body);
    expect(!/password/i.test(serialized), 'the response mentions a password');
    expect(response.body.doctor.isActive === true, 'a new doctor should be active');
  });

  await check('a duplicate doctor email is refused', async () => {
    const specialties = await api('GET', '/api/admin/specialties', { token: adminToken });
    const response = await api('POST', '/api/admin/doctors', {
      token: adminToken,
      body: {
        name: 'Dr. Test Newman Again',
        email: 'test.newman@medibook.local',
        phone: '9000000778',
        specialtyId: specialties.body.specialties[0].id,
        feeCents: 1000,
      },
    });
    expectStatus(response, 409, 'duplicate doctor email');
  });

  await check('a specialty in use cannot be deleted', async () => {
    const specialties = await api('GET', '/api/admin/specialties', { token: adminToken });
    const inUse = specialties.body.specialties.find((s) => s.doctorCount > 0);
    expect(Boolean(inUse), 'no specialty with doctors found');

    const response = await api('DELETE', `/api/admin/specialties/${inUse.id}`, {
      token: adminToken,
    });
    expectStatus(response, 409, 'deleting a specialty in use');
  });

  await check('an unused specialty can be created and then deleted', async () => {
    const created = await api('POST', '/api/admin/specialties', {
      token: adminToken,
      body: { name: 'Test Only Specialty', description: 'Created by the API test.' },
    });
    expectStatus(created, 201, 'creating a specialty');

    const duplicate = await api('POST', '/api/admin/specialties', {
      token: adminToken,
      body: { name: 'test only specialty' },
    });
    expectStatus(duplicate, 409, 'a duplicate name differing only in case');

    const deleted = await api('DELETE', `/api/admin/specialties/${created.body.specialty.id}`, {
      token: adminToken,
    });
    expectStatus(deleted, 200, 'deleting an unused specialty');
  });

  await check('the last active admin cannot be deactivated', async () => {
    const users = await api('GET', '/api/admin/users?role=admin', { token: adminToken });
    const admins = users.body.users.filter((u) => u.isActive);
    if (admins.length !== 1) return;

    const response = await api('PATCH', `/api/admin/users/${admins[0].id}/status`, {
      token: adminToken,
      body: { isActive: false },
    });
    expectStatus(response, 400, 'deactivating the only admin');
  });

  await check('deactivating a patient stops their existing token working', async () => {
    const registered = await api('POST', '/api/auth/register', {
      body: {
        name: 'Temp Tester',
        email: `temp.tester.${Date.now()}@example.com`,
        phone: '9000000888',
        // Must not contain the name or the email local part, or the
        // password rules reject it - as an earlier draft of this check
        // discovered with "TempTester#99a".
        password: 'Qwiklime#47Zed',
      },
    });
    expectStatus(registered, 201, 'registering a test patient');
    const token = registered.body.token;

    const before = await api('GET', '/api/auth/me', { token });
    expectStatus(before, 200, '/me before deactivation');

    const deactivated = await api(
      'PATCH',
      `/api/admin/users/${registered.body.user.id}/status`,
      { token: adminToken, body: { isActive: false } }
    );
    expectStatus(deactivated, 200, 'deactivating the test patient');

    // Same token, no re-login: it must now be refused.
    const after = await api('GET', '/api/auth/me', { token });
    expectStatus(after, 401, '/me after deactivation');
  });

  await check('a deactivated doctor disappears from the public list', async () => {
    const doctors = await api('GET', '/api/admin/doctors?limit=100', { token: adminToken });
    const victim = doctors.body.doctors.find((d) => d.email === 'test.newman@medibook.local');
    expect(Boolean(victim), 'the test doctor was not found');

    const publicBefore = await api('GET', '/api/doctors?limit=100');
    expect(
      publicBefore.body.doctors.some((d) => d.id === victim.id),
      'the new doctor is missing from the public list'
    );

    await api('PATCH', `/api/admin/users/${victim.userId}/status`, {
      token: adminToken,
      body: { isActive: false },
    });

    const publicAfter = await api('GET', '/api/doctors?limit=100');
    expect(
      !publicAfter.body.doctors.some((d) => d.id === victim.id),
      'a deactivated doctor is still listed publicly'
    );

    const detail = await api('GET', `/api/doctors/${victim.id}`);
    expectStatus(detail, 404, 'a deactivated doctor profile');
  });

  await check('the audit log records the sensitive actions', async () => {
    const logs = await api('GET', '/api/admin/audit-logs?limit=200', { token: adminToken });
    expectStatus(logs, 200, 'audit log');

    const actions = new Set(logs.body.logs.map((l) => l.action));
    for (const required of [
      'auth.login.success',
      'auth.register',
      'appointment.booked',
      'appointment.cancelled',
      'report.uploaded',
      'report.downloaded',
      'report.access.denied',
      'doctor.created',
      'specialty.created',
      'specialty.deleted',
      'user.deactivated',
    ]) {
      expect(actions.has(required), `the audit log is missing "${required}"`);
    }
  });

  await check('the audit log never contains a password or token', async () => {
    const logs = await api('GET', '/api/admin/audit-logs?limit=200', { token: adminToken });
    const text = JSON.stringify(logs.body.logs);
    for (const forbidden of [DEMO_PASSWORD, 'TempTester#99a', 'passwordHash', 'resetTokenHash']) {
      expect(!text.includes(forbidden), `the audit log contains "${forbidden}"`);
    }
  });

  // =================================================================
  group('Doctor workspace');
  // =================================================================

  await check('a doctor can save a weekly schedule', async () => {
    const response = await api('PUT', '/api/doctor/availability', {
      token: treatingToken,
      body: {
        availability: [
          { weekday: 1, startTime: '09:00', endTime: '12:00', slotMinutes: 30 },
          { weekday: 3, startTime: '14:00', endTime: '17:00', slotMinutes: 20 },
        ],
      },
    });
    expectStatus(response, 200, 'saving availability');
    expect(response.body.availability.length === 2, 'expected two blocks back');
    const monday = response.body.availability.find((b) => b.weekday === 1);
    expect(monday.slotCount === 6, `expected 6 slots on Monday, got ${monday.slotCount}`);
  });

  await check('overlapping blocks on one day are refused', async () => {
    const response = await api('PUT', '/api/doctor/availability', {
      token: treatingToken,
      body: {
        availability: [
          { weekday: 1, startTime: '09:00', endTime: '12:00', slotMinutes: 30 },
          { weekday: 1, startTime: '11:00', endTime: '14:00', slotMinutes: 30 },
        ],
      },
    });
    expectStatus(response, 400, 'overlapping availability');
  });

  await check('an end time before the start time is refused', async () => {
    const response = await api('PUT', '/api/doctor/availability', {
      token: treatingToken,
      body: {
        availability: [{ weekday: 2, startTime: '15:00', endTime: '09:00', slotMinutes: 30 }],
      },
    });
    expectStatus(response, 400, 'backwards availability');
  });

  await check('a slot length longer than the block is refused', async () => {
    const response = await api('PUT', '/api/doctor/availability', {
      token: treatingToken,
      body: {
        availability: [{ weekday: 2, startTime: '09:00', endTime: '09:20', slotMinutes: 30 }],
      },
    });
    expectStatus(response, 400, 'slot longer than the block');
  });

  await check('a patient cannot change a doctor\'s availability', async () => {
    const response = await api('PUT', '/api/doctor/availability', {
      token: patientA,
      body: { availability: [] },
    });
    expectStatus(response, 403, 'patient setting availability');
  });

  await check('a doctor can edit their own fee and bio', async () => {
    const response = await api('PATCH', '/api/doctor/profile', {
      token: treatingToken,
      body: { feeCents: 123400, bio: 'Updated by the API test.' },
    });
    expectStatus(response, 200, 'editing own doctor profile');
    expect(response.body.doctor.feeCents === 123400, 'the fee was not saved');
  });

  await check('a doctor cannot change their own specialty', async () => {
    const before = await api('GET', '/api/profile', { token: treatingToken });
    const originalSpecialtyId = before.body.doctor.specialtyId;

    const specialties = await api('GET', '/api/specialties');
    // Pick a specialty they are NOT already in, or the check proves
    // nothing (an earlier draft compared against the doctor's own
    // specialty and failed for that reason).
    const other = specialties.body.specialties.find(
      (s) => s.id !== originalSpecialtyId
    );
    expect(Boolean(other), 'need a second specialty to test with');

    const response = await api('PATCH', '/api/doctor/profile', {
      token: treatingToken,
      body: { specialtyId: other.id, bio: 'Attempting a specialty change.' },
    });

    // The field is stripped by the validator, so the request succeeds
    // and the specialty is simply unchanged.
    expectStatus(response, 200, 'doctor sending specialtyId');
    expect(
      response.body.doctor.specialtyId === originalSpecialtyId,
      'a doctor managed to reassign their own specialty'
    );
    expect(
      response.body.doctor.bio === 'Attempting a specialty change.',
      'the allowed field in the same request was not saved'
    );
  });

  await check('the doctor dashboard only counts their own work', async () => {
    const response = await api('GET', '/api/doctor/dashboard', { token: treatingToken });
    expectStatus(response, 200, 'doctor dashboard');
    expect(typeof response.body.todaysCount === 'number', 'expected todaysCount');
    const foreign = response.body.todaysAppointments.filter(
      (a) => a.doctorId !== treatingDoctorId
    );
    expect(foreign.length === 0, 'the dashboard showed another doctor\'s appointments');
  });

  await check('a patient cannot open the doctor dashboard', async () => {
    const response = await api('GET', '/api/doctor/dashboard', { token: patientA });
    expectStatus(response, 403, 'patient opening the doctor dashboard');
  });

  // =================================================================
  group('Patient dashboard and profile');
  // =================================================================

  await check('the patient dashboard returns their own data', async () => {
    const response = await api('GET', '/api/patient/dashboard', { token: patientA });
    expectStatus(response, 200, 'patient dashboard');
    expect(Array.isArray(response.body.upcomingAppointments), 'expected upcomingAppointments');
    expect(typeof response.body.reportCount === 'number', 'expected reportCount');
  });

  await check('a doctor cannot open the patient dashboard', async () => {
    const response = await api('GET', '/api/patient/dashboard', { token: treatingToken });
    expectStatus(response, 403, 'doctor opening the patient dashboard');
  });

  await check('a patient can edit their name and phone', async () => {
    const response = await api('PATCH', '/api/profile', {
      token: patientA,
      body: { name: 'Ravi Shankar Edited', phone: '9000001234' },
    });
    expectStatus(response, 200, 'editing a profile');
    expect(response.body.user.name === 'Ravi Shankar Edited', 'the name was not saved');
  });

  await check('a patient cannot change their own role or email through the profile', async () => {
    const response = await api('PATCH', '/api/profile', {
      token: patientA,
      body: { role: 'admin', email: 'hacker@example.com', isActive: false },
    });
    expectStatus(response, 200, 'profile with injected fields');
    expect(response.body.user.role === 'patient', 'the role was changed');
    expect(response.body.user.email === 'ravi@example.com', 'the email was changed');
    expect(response.body.user.isActive === true, 'isActive was changed');
  });

  // =================================================================
  group('Response hygiene');
  // =================================================================

  await check('no response anywhere contains a password hash or reset token', async () => {
    const routes = [
      ['GET', '/api/auth/me', patientA],
      ['GET', '/api/profile', patientA],
      ['GET', '/api/appointments', patientA],
      ['GET', '/api/reports', patientA],
      ['GET', '/api/prescriptions', patientA],
      ['GET', '/api/patient/dashboard', patientA],
      ['GET', '/api/doctor/dashboard', treatingToken],
      ['GET', '/api/doctor/patients', treatingToken],
      ['GET', '/api/admin/users', adminToken],
      ['GET', '/api/admin/doctors', adminToken],
      ['GET', '/api/admin/stats', adminToken],
      ['GET', '/api/admin/audit-logs', adminToken],
      ['GET', '/api/doctors', null],
      ['GET', '/api/specialties', null],
    ];

    for (const [method, route, token] of routes) {
      const response = await api(method, route, { token });
      const text = JSON.stringify(response.body || {});
      for (const forbidden of ['passwordHash', 'resetTokenHash', 'fileKey', '$2a$', '$2b$']) {
        expect(
          !text.includes(forbidden),
          `${route} leaked "${forbidden}"`
        );
      }
    }
  });

  await check('an error response never contains a stack trace', async () => {
    const responses = [
      await api('GET', '/api/appointments/not-a-real-id', { token: patientA }),
      await api('GET', '/api/does-not-exist'),
      await api('POST', '/api/appointments', { token: patientA, body: {} }),
      await api('GET', `/api/appointments/${patientBAppointment.id}`, { token: patientA }),
    ];

    for (const response of responses) {
      const text = JSON.stringify(response.body);
      expect(!/at \w+ \(/.test(text), 'a response contained a stack trace');
      expect(!text.includes('\\\\'), 'a response contained a file path');
      expect(!/node_modules/.test(text), 'a response mentioned node_modules');
      expect(Boolean(response.body.requestId), 'an error response had no requestId');
    }
  });

  await check('every error body has the same shape', async () => {
    const response = await api('GET', '/api/admin/stats', { token: patientA });
    expect(typeof response.body.error === 'object', 'expected an error object');
    expect(typeof response.body.error.code === 'string', 'expected error.code');
    expect(typeof response.body.error.message === 'string', 'expected error.message');
  });
}

function report() {
  let lastGroup = '';
  const failed = results.filter((r) => !r.ok);

  for (const result of results) {
    if (result.group !== lastGroup) {
      console.log('');
      console.log(result.group);
      console.log('-'.repeat(Math.min(result.group.length, 70)));
      lastGroup = result.group;
    }
    console.log(`${result.ok ? '  ok  ' : '  FAIL'}  ${result.name}`);
    if (!result.ok) console.log(`        ${result.message}`);
  }

  console.log('');
  console.log(`${results.length - failed.length} passed, ${failed.length} failed`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('The API checks could not run:');
  console.error(error);
  process.exit(1);
});
