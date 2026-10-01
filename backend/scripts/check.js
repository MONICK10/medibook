// scripts/check.js
// -----------------------------------------------------------------
// A small self-test for the backend foundation.  Run: npm run check
//
// WHY hand-rolled instead of a test framework: this is a teaching
// repo, and "npm install" should pull in as little as possible. Each
// check below is a plain function with an `expect`, so a student can
// read the file top to bottom and see what is being guaranteed.
//
// These are UNIT checks on the rules (slots, passwords, permissions,
// path safety, signed links). The end-to-end checks that hit real HTTP
// routes with real logins arrive with the API in phase 2.
// -----------------------------------------------------------------

const assert = require('node:assert/strict');

const results = [];
const pending = [];

// Handles both plain and async checks: a returned promise is collected
// and waited for before the summary is printed, so a failure inside an
// async check cannot slip past as an unhandled rejection.
function test(name, fn) {
  const record = { name, ok: true };
  results.push(record);

  try {
    const outcome = fn();
    if (outcome && typeof outcome.then === 'function') {
      pending.push(
        outcome.catch((error) => {
          record.ok = false;
          record.message = error.message;
        })
      );
    }
  } catch (error) {
    record.ok = false;
    record.message = error.message;
  }
}

// =================================================================
// Roles and permissions
// =================================================================
const { ROLES, PERMISSIONS, can, permissionsFor } = require('../auth/roles');

test('a patient can book an appointment', () => {
  assert.equal(can(ROLES.PATIENT, PERMISSIONS.APPOINTMENT_BOOK), true);
});

test('a patient cannot manage doctors', () => {
  assert.equal(can(ROLES.PATIENT, PERMISSIONS.DOCTOR_MANAGE), false);
});

test('a patient cannot read the audit log', () => {
  assert.equal(can(ROLES.PATIENT, PERMISSIONS.AUDIT_READ), false);
});

test('a doctor cannot read every appointment in the clinic', () => {
  assert.equal(can(ROLES.DOCTOR, PERMISSIONS.APPOINTMENT_READ_ALL), false);
});

test('a doctor cannot manage users', () => {
  assert.equal(can(ROLES.DOCTOR, PERMISSIONS.USER_MANAGE), false);
});

test('an admin cannot read a patient medical report', () => {
  // Deliberate: running the clinic is not a clinical reason to open
  // someone's test results. See the note in auth/roles.js.
  assert.equal(can(ROLES.ADMIN, PERMISSIONS.REPORT_READ_OWN), false);
  assert.equal(can(ROLES.ADMIN, PERMISSIONS.REPORT_READ_ASSIGNED), false);
});

test('an admin can read the audit log', () => {
  assert.equal(can(ROLES.ADMIN, PERMISSIONS.AUDIT_READ), true);
});

test('an unknown permission is a loud error, not a silent allow', () => {
  assert.throws(() => can(ROLES.ADMIN, 'does:not:exist'));
});

test('an unknown role is denied everything', () => {
  assert.equal(can('receptionist', PERMISSIONS.DOCTOR_READ), false);
  assert.deepEqual(permissionsFor('receptionist'), []);
});

// =================================================================
// Password rules
// =================================================================
const { checkPasswordStrength } = require('../lib/password');

test('a strong password is accepted', () => {
  assert.equal(checkPasswordStrength('CorrectHorse7Battery').ok, true);
});

test('a short password is rejected', () => {
  assert.equal(checkPasswordStrength('Abc12345').ok, false);
});

test('a password with no uppercase is rejected', () => {
  assert.equal(checkPasswordStrength('lowercase123456').ok, false);
});

test('a password with no digit is rejected', () => {
  assert.equal(checkPasswordStrength('NoDigitsInHere').ok, false);
});

test('a common password is rejected even when long enough', () => {
  assert.equal(checkPasswordStrength('Password123456').ok, false);
});

test('a password containing the user name is rejected', () => {
  const result = checkPasswordStrength('RaviShankar99', { name: 'Ravi Shankar' });
  assert.equal(result.ok, false);
});

test('a password containing the email name is rejected', () => {
  const result = checkPasswordStrength('Divya12345X', { email: 'divya@example.com' });
  assert.equal(result.ok, false);
});

test('the seeded demo password satisfies the real rules', () => {
  // If this fails, the seed creates accounts that could not be created
  // through the register form - a trap for whoever teaches from it.
  // The seed re-checks this at runtime too; see scripts/seed.js.
  assert.equal(checkPasswordStrength('ClinicDemo#2026').ok, true);
});

test('a password containing the app name is still rejected', () => {
  // The constraint that caught the first draft of the seed password.
  assert.equal(checkPasswordStrength('MediBook#2026').ok, false);
});

// =================================================================
// Login timing
// =================================================================
// A regression guard. An earlier version of adapters/auth.local.js used
// a malformed dummy hash, which bcryptjs rejected in about 1ms while a
// real check took 140ms. That gap tells an attacker which email
// addresses have accounts here.
test('checking a non-existent account costs the same as a real one', async () => {
  const auth = require('../adapters/auth.local');

  const realHash = await auth.hashPassword('SomeRealPassword#42');

  const measure = async (hash) => {
    const startedAt = process.hrtime.bigint();
    await auth.verifyPassword('WrongGuess#1', hash);
    return Number(process.hrtime.bigint() - startedAt) / 1e6;
  };

  await auth.verifyPassword('warmup', null); // build the dummy hash first

  const realMs = await measure(realHash);
  const missingMs = await measure(null);

  // Loose on purpose: this is a timing measurement on a shared machine,
  // so it checks the order of magnitude, not an exact match.
  assert.ok(
    missingMs > realMs * 0.5,
    `missing-account check took ${missingMs.toFixed(1)}ms vs ${realMs.toFixed(1)}ms ` +
      'for a real one - too fast, so it leaks which emails are registered'
  );

  // And a missing hash must never count as a successful login.
  assert.equal(await auth.verifyPassword('anything', null), false);
  assert.equal(await auth.verifyPassword('', null), false);
});

// =================================================================
// Slot generation
// =================================================================
const slots = require('../services/slots');
const time = require('../lib/time');

const MONDAY_BLOCKS = [
  { weekday: 1, startTime: '09:00', endTime: '11:00', slotMinutes: 30 },
];

test('a 2 hour block with 30 minute slots gives 4 slots', () => {
  // 2026-10-05 is a Monday.
  const result = slots.slotsForDate(MONDAY_BLOCKS, '2026-10-05');
  assert.equal(result.length, 4);
  assert.deepEqual(
    result.map((slot) => slot.startTime),
    ['09:00', '09:30', '10:00', '10:30']
  );
});

test('no slots are produced on a day the doctor does not work', () => {
  // 2026-10-06 is a Tuesday.
  assert.equal(slots.slotsForDate(MONDAY_BLOCKS, '2026-10-06').length, 0);
});

test('a slot that would not fit in the block is not offered', () => {
  // 09:00-10:20 with 30 minute slots: 09:00 and 09:30 fit, 10:00 does not.
  const result = slots.slotsForDate(
    [{ weekday: 1, startTime: '09:00', endTime: '10:20', slotMinutes: 30 }],
    '2026-10-05'
  );
  assert.deepEqual(
    result.map((slot) => slot.startTime),
    ['09:00', '09:30']
  );
});

test('overlapping blocks never offer the same slot twice', () => {
  const result = slots.slotsForDate(
    [
      { weekday: 1, startTime: '09:00', endTime: '11:00', slotMinutes: 60 },
      { weekday: 1, startTime: '10:00', endTime: '12:00', slotMinutes: 60 },
    ],
    '2026-10-05'
  );
  const startTimes = result.map((slot) => slot.startTime);
  assert.deepEqual(startTimes, [...new Set(startTimes)]);
  assert.deepEqual(startTimes, ['09:00', '10:00', '11:00']);
});

test('findSlot accepts a real slot and rejects an invented one', () => {
  assert.ok(slots.findSlot(MONDAY_BLOCKS, '2026-10-05', '09:30'));
  // Between slots: this is what stops a hand-crafted request from
  // blocking the 09:30 slot by booking 09:07.
  assert.equal(slots.findSlot(MONDAY_BLOCKS, '2026-10-05', '09:07'), null);
  // Outside working hours entirely.
  assert.equal(slots.findSlot(MONDAY_BLOCKS, '2026-10-05', '03:00'), null);
});

test('a taken slot is marked unavailable in the calendar', () => {
  const calendar = slots.buildCalendar({
    availabilityBlocks: MONDAY_BLOCKS,
    takenSlots: [{ date: '2026-10-05', startTime: '09:30' }],
    fromDate: '2026-10-05',
    days: 1,
    // "Now" is fixed well before the slots so none count as past.
    now: time.toLocalDate('2026-10-05', '00:01'),
  });

  const day = calendar[0];
  assert.equal(day.slots.length, 4);
  assert.equal(day.availableCount, 3);
  assert.equal(day.slots.find((slot) => slot.startTime === '09:30').available, false);
  assert.equal(day.slots.find((slot) => slot.startTime === '09:30').reason, 'booked');
});

test('a slot earlier today is not bookable', () => {
  const calendar = slots.buildCalendar({
    availabilityBlocks: MONDAY_BLOCKS,
    fromDate: '2026-10-05',
    days: 1,
    now: time.toLocalDate('2026-10-05', '10:15'),
  });

  const day = calendar[0];
  assert.equal(day.slots.find((slot) => slot.startTime === '09:00').reason, 'past');
  assert.equal(day.slots.find((slot) => slot.startTime === '10:30').available, true);
  assert.equal(day.availableCount, 1);
});

// =================================================================
// Dates and times
// =================================================================

test('an impossible date is rejected', () => {
  assert.equal(time.isValidDateString('2026-02-30'), false);
  assert.equal(time.isValidDateString('2026-13-01'), false);
  assert.equal(time.isValidDateString('2026-02-28'), true);
});

test('a leap day is accepted in a leap year only', () => {
  assert.equal(time.isValidDateString('2028-02-29'), true);
  assert.equal(time.isValidDateString('2026-02-29'), false);
});

test('an out-of-range time is rejected', () => {
  assert.equal(time.isValidTimeString('24:00'), false);
  assert.equal(time.isValidTimeString('09:60'), false);
  assert.equal(time.isValidTimeString('23:59'), true);
});

test('adding days crosses a month boundary correctly', () => {
  assert.equal(time.addDays('2026-10-30', 3), '2026-11-02');
  assert.equal(time.addDays('2026-01-01', -1), '2025-12-31');
});

test('the cancellation cutoff is measured correctly', () => {
  const now = time.toLocalDate('2026-10-05', '08:00');
  // A 10:00 slot is 120 minutes away: exactly on the 2 hour boundary.
  assert.equal(time.minutesUntil('2026-10-05', '10:00', now), 120);
  assert.equal(time.minutesUntil('2026-10-05', '09:30', now), 90);
  assert.equal(time.minutesUntil('2026-10-05', '07:00', now), -60);
});

// =================================================================
// Validation
// =================================================================
const { runSchema } = require('../lib/validate');

test('unknown fields are stripped, so a role cannot be injected', () => {
  const result = runSchema(
    { name: { type: 'string', required: true } },
    { name: 'Ravi', role: 'admin', isActive: false }
  );
  assert.deepEqual(result.value, { name: 'Ravi' });
  assert.equal(result.value.role, undefined);
});

test('a missing required field is reported per field', () => {
  const result = runSchema(
    {
      name: { type: 'string', required: true },
      email: { type: 'email', required: true },
    },
    { name: 'Ravi' }
  );
  assert.equal(result.errors.email, 'is required');
});

test('an email is lowercased so logins are case-insensitive', () => {
  const result = runSchema({ email: { type: 'email', required: true } }, {
    email: '  Ravi@Example.COM ',
  });
  assert.equal(result.value.email, 'ravi@example.com');
});

test('a phone number is cleaned of spaces and dashes', () => {
  const result = runSchema({ phone: { type: 'phone', required: true } }, {
    phone: '+91 98765-43210',
  });
  assert.equal(result.value.phone, '+919876543210');
});

test('a too-short phone number is rejected', () => {
  const result = runSchema({ phone: { type: 'phone', required: true } }, {
    phone: '12345',
  });
  assert.ok(result.errors.phone);
});

test('an id that is not a UUID is rejected', () => {
  const result = runSchema({ id: { type: 'id', required: true } }, {
    id: "1 OR 1=1; DROP TABLE users;--",
  });
  assert.ok(result.errors.id);
});

test('a number arriving as text from a query string is accepted', () => {
  const result = runSchema({ limit: { type: 'int', required: true, max: 200 } }, {
    limit: '50',
  });
  assert.equal(result.value.limit, 50);
});

test('a number above the maximum is rejected', () => {
  const result = runSchema({ limit: { type: 'int', required: true, max: 200 } }, {
    limit: '999999999',
  });
  assert.ok(result.errors.limit);
});

test('a list of medicines is validated item by item', () => {
  const schema = {
    medicines: {
      type: 'array',
      required: true,
      min: 1,
      of: {
        fields: {
          name: { type: 'string', required: true, max: 120 },
          dose: { type: 'string', required: true, max: 60 },
          frequency: { type: 'string', required: true, max: 60 },
          days: { type: 'int', required: true, min: 1, max: 365 },
        },
      },
    },
  };

  const good = runSchema(schema, {
    medicines: [{ name: 'Paracetamol', dose: '1 tablet', frequency: 'Twice a day', days: 3 }],
  });
  assert.equal(good.errors, undefined);

  const bad = runSchema(schema, {
    medicines: [{ name: 'Paracetamol', dose: '1 tablet', frequency: 'Twice a day', days: 0 }],
  });
  assert.ok(bad.errors['medicines[0].days']);
});

// =================================================================
// File storage safety
// =================================================================
const storage = require('../adapters/storage.local');

test('a path traversal file key is refused', () => {
  assert.throws(() => storage._resolveKeyToPath('../../server.js'));
  assert.throws(() => storage._resolveKeyToPath('reports/../../../etc/passwd'));
});

test('an absolute file key is refused', () => {
  assert.throws(() => storage._resolveKeyToPath('C:/Windows/System32/drivers/etc/hosts'));
  assert.throws(() => storage._resolveKeyToPath('/etc/passwd'));
});

test('a normal generated key is accepted', () => {
  const key = 'reports/abc-123/2026-10-05/deadbeef.pdf';
  assert.ok(storage._resolveKeyToPath(key).endsWith('deadbeef.pdf'));
});

test('a download link verifies, and a tampered one does not', () => {
  return storage
    .createDownloadUrl('reports/u1/2026-10-05/file.pdf', {
      filename: 'file.pdf',
      mimeType: 'application/pdf',
    })
    .then(({ url }) => {
      const token = url.split('/api/files/')[1];

      const payload = storage.verifyDownloadToken(token);
      assert.equal(payload.key, 'reports/u1/2026-10-05/file.pdf');

      // Flip one character of the signature.
      const broken = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
      assert.equal(storage.verifyDownloadToken(broken), null);

      // Swap the payload for a different file, keeping the signature.
      const forgedPayload = Buffer.from(
        JSON.stringify({ k: 'reports/someone-else/x.pdf', e: 9999999999 })
      ).toString('base64url');
      const forged = `${forgedPayload}.${token.split('.').pop()}`;
      assert.equal(storage.verifyDownloadToken(forged), null);

      assert.equal(storage.verifyDownloadToken('nonsense'), null);
      assert.equal(storage.verifyDownloadToken(''), null);
    });
});

test('an expired download link is refused', async () => {
  const { url } = await storage.createDownloadUrl('reports/u1/2026-10-05/file.pdf', {
    ttlSeconds: -10, // already expired
  });
  const token = url.split('/api/files/')[1];
  assert.equal(storage.verifyDownloadToken(token), null);
});

// =================================================================
// Sample file generation
// =================================================================
const { makePdf, makePng } = require('./sampleFiles');

test('the generated PDF starts with the PDF signature and ends cleanly', () => {
  const pdf = makePdf({ title: 'Test', lines: ['One', 'Two'] });
  assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.ok(pdf.toString('latin1').includes('%%EOF'));
  assert.ok(pdf.length > 400);
});

test('the generated PNG has a valid signature and an IEND chunk', () => {
  const png = makePng({ width: 16, height: 16 });
  assert.deepEqual(
    [...png.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  );
  assert.ok(png.subarray(-8).toString('latin1').includes('IEND'));
});

// =================================================================
// Report
// =================================================================

// Wait for every async check to settle before reporting.
Promise.all(pending).then(() => {
  const failed = results.filter((item) => !item.ok);

  for (const item of results) {
    console.log(`${item.ok ? '  ok  ' : '  FAIL'}  ${item.name}`);
    if (!item.ok) console.log(`        ${item.message}`);
  }

  console.log('');
  console.log(`${results.length - failed.length} passed, ${failed.length} failed`);

  process.exit(failed.length > 0 ? 1 : 0);
});
