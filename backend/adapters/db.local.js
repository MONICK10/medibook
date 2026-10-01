// adapters/db.local.js
// -----------------------------------------------------------------
// LOCAL implementation of the db adapter: one JSON file, held in
// memory. See adapters/db.js for the interface and the rules, and
// lib/jsonStore.js for why this is safe enough to demo with.
//
// The shape of the collections below is also the shape of the SQL
// tables in schema.sql, so the two implementations stay comparable.
// -----------------------------------------------------------------

const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const logger = require('../lib/logger');
const { createJsonStore } = require('../lib/jsonStore');
const { compareSlots } = require('../lib/time');

const EMPTY_STATE = {
  version: 1,
  users: [],
  specialties: [],
  doctors: [],
  availability: [],
  appointments: [],
  reports: [],
  prescriptions: [],
  auditLogs: [],
};

const store = createJsonStore({
  filePath: path.join(config.paths.dataDir, 'db.json'),
  emptyState: EMPTY_STATE,
});

// --- helpers -------------------------------------------------------

const newId = () => crypto.randomUUID();
const now = () => new Date().toISOString();

// Deep copy on the way out. WHY: without this, a route doing
// `user.role = 'admin'` on a returned object would silently edit the
// in-memory database. PostgreSQL hands back fresh rows, so copying here
// keeps the two adapters behaving the same way.
const clone = (value) => (value == null ? null : structuredClone(value));
const cloneAll = (list) => list.map((item) => structuredClone(item));

// Case-insensitive, accent-naive text search used by the list functions.
function matchesSearch(haystack, needle) {
  if (!needle) return true;
  return String(haystack || '')
    .toLowerCase()
    .includes(String(needle).toLowerCase());
}

// Apply limit/offset and report the total before paging, which is what
// a paginated UI needs.
function paginate(rows, { limit, offset } = {}) {
  const total = rows.length;
  const start = offset || 0;
  const end = limit === undefined || limit === null ? undefined : start + limit;
  return { rows: cloneAll(rows.slice(start, end)), total };
}

// --- lifecycle -----------------------------------------------------

async function init() {
  store.load();
  const state = store.getState();
  logger.info('Database ready', {
    dbMode: 'local',
    file: store.filePath,
    users: state.users.length,
    appointments: state.appointments.length,
  });
}

async function close() {
  // Make sure nothing is left only in memory.
  await store.flush();
}

async function health() {
  try {
    const state = store.getState();
    return {
      ok: true,
      mode: 'local',
      detail: `JSON store with ${state.users.length} user(s)`,
    };
  } catch (error) {
    return { ok: false, mode: 'local', detail: error.message };
  }
}

async function reset() {
  await store.reset();
}

// =================================================================
// users
// =================================================================

const users = {
  async create(data) {
    const state = store.getState();
    const user = {
      id: data.id || newId(),
      role: data.role,
      name: data.name,
      email: data.email.toLowerCase(),
      phone: data.phone || null,
      passwordHash: data.passwordHash || null,
      // Set only in Cognito mode, where AWS owns the identity.
      cognitoSub: data.cognitoSub || null,
      isActive: data.isActive !== false,
      lastLoginAt: null,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
      createdAt: now(),
      updatedAt: now(),
    };
    state.users.push(user);
    await store.save();
    return clone(user);
  },

  async findById(id) {
    const state = store.getState();
    return clone(state.users.find((user) => user.id === id) || null);
  },

  async findByEmail(email) {
    const state = store.getState();
    const target = String(email || '').toLowerCase();
    return clone(state.users.find((user) => user.email === target) || null);
  },

  async findByCognitoSub(sub) {
    const state = store.getState();
    return clone(state.users.find((user) => user.cognitoSub === sub) || null);
  },

  async update(id, patch) {
    const state = store.getState();
    const user = state.users.find((item) => item.id === id);
    if (!user) return null;

    // Only these fields may ever be changed through update(). WHY: an
    // allow-list here means a bug elsewhere that passes the whole request
    // body cannot change `role` or `passwordHash`.
    const allowed = [
      'name',
      'email',
      'phone',
      'passwordHash',
      'isActive',
      'role',
      'lastLoginAt',
      'cognitoSub',
    ];
    for (const key of allowed) {
      if (patch[key] !== undefined) {
        user[key] = key === 'email' ? String(patch[key]).toLowerCase() : patch[key];
      }
    }
    user.updatedAt = now();

    await store.save();
    return clone(user);
  },

  async list({ role, isActive, search, limit, offset, sort = 'name' } = {}) {
    const state = store.getState();
    let rows = state.users.filter((user) => {
      if (role && user.role !== role) return false;
      if (isActive !== undefined && user.isActive !== isActive) return false;
      if (search && !matchesSearch(user.name, search) && !matchesSearch(user.email, search)) {
        return false;
      }
      return true;
    });

    rows = rows.sort((a, b) =>
      sort === 'createdAt'
        ? b.createdAt.localeCompare(a.createdAt)
        : a.name.localeCompare(b.name)
    );

    return paginate(rows, { limit, offset });
  },

  async count({ role, isActive } = {}) {
    const state = store.getState();
    return state.users.filter((user) => {
      if (role && user.role !== role) return false;
      if (isActive !== undefined && user.isActive !== isActive) return false;
      return true;
    }).length;
  },

  // Password reset stores a HASH of the token, not the token.
  // WHY: if someone reads the database they still cannot use the tokens,
  // exactly like passwords. The plain token only exists in the email.
  async setResetToken(id, { tokenHash, expiresAt }) {
    const state = store.getState();
    const user = state.users.find((item) => item.id === id);
    if (!user) return null;
    user.resetTokenHash = tokenHash;
    user.resetTokenExpiresAt = expiresAt;
    user.updatedAt = now();
    await store.save();
    return clone(user);
  },

  async findByResetToken(tokenHash) {
    const state = store.getState();
    return clone(state.users.find((user) => user.resetTokenHash === tokenHash) || null);
  },

  async clearResetToken(id) {
    const state = store.getState();
    const user = state.users.find((item) => item.id === id);
    if (!user) return null;
    user.resetTokenHash = null;
    user.resetTokenExpiresAt = null;
    user.updatedAt = now();
    await store.save();
    return clone(user);
  },
};

// =================================================================
// specialties
// =================================================================

const specialties = {
  async create(data) {
    const state = store.getState();
    const specialty = {
      id: data.id || newId(),
      name: data.name,
      description: data.description || '',
      createdAt: now(),
      updatedAt: now(),
    };
    state.specialties.push(specialty);
    await store.save();
    return clone(specialty);
  },

  async findById(id) {
    const state = store.getState();
    return clone(state.specialties.find((item) => item.id === id) || null);
  },

  async findByName(name) {
    const state = store.getState();
    const target = String(name || '').trim().toLowerCase();
    return clone(
      state.specialties.find((item) => item.name.toLowerCase() === target) || null
    );
  },

  async list() {
    const state = store.getState();
    return cloneAll([...state.specialties].sort((a, b) => a.name.localeCompare(b.name)));
  },

  async update(id, patch) {
    const state = store.getState();
    const specialty = state.specialties.find((item) => item.id === id);
    if (!specialty) return null;
    if (patch.name !== undefined) specialty.name = patch.name;
    if (patch.description !== undefined) specialty.description = patch.description;
    specialty.updatedAt = now();
    await store.save();
    return clone(specialty);
  },

  async remove(id) {
    const state = store.getState();
    const index = state.specialties.findIndex((item) => item.id === id);
    if (index === -1) return false;
    state.specialties.splice(index, 1);
    await store.save();
    return true;
  },

  // Used to block deleting a specialty that doctors still use. In
  // PostgreSQL a foreign key would also refuse, but checking here lets us
  // return a helpful message instead of a database error.
  async countDoctors(specialtyId) {
    const state = store.getState();
    return state.doctors.filter((doctor) => doctor.specialtyId === specialtyId).length;
  },
};

// =================================================================
// doctors  (a doctor = a user row with role 'doctor' + this profile)
// =================================================================
// WHY split across two tables: login details belong to every user, but
// a bio and a fee only make sense for a doctor. Keeping them apart means
// adding a receptionist later does not add empty "bio" columns for them.

const doctors = {
  async create(data) {
    const state = store.getState();
    const doctor = {
      id: data.id || newId(),
      userId: data.userId,
      specialtyId: data.specialtyId,
      bio: data.bio || '',
      // Integer paise/cents. WHY: 0.1 + 0.2 !== 0.3 in floating point, and
      // money that is a fraction of a rupee out is a bug nobody wants.
      feeCents: data.feeCents || 0,
      experienceYears: data.experienceYears || 0,
      qualification: data.qualification || '',
      createdAt: now(),
      updatedAt: now(),
    };
    state.doctors.push(doctor);
    await store.save();
    return clone(doctor);
  },

  async findById(id) {
    const state = store.getState();
    return clone(state.doctors.find((item) => item.id === id) || null);
  },

  async findByUserId(userId) {
    const state = store.getState();
    return clone(state.doctors.find((item) => item.userId === userId) || null);
  },

  async update(id, patch) {
    const state = store.getState();
    const doctor = state.doctors.find((item) => item.id === id);
    if (!doctor) return null;
    for (const key of ['specialtyId', 'bio', 'feeCents', 'experienceYears', 'qualification']) {
      if (patch[key] !== undefined) doctor[key] = patch[key];
    }
    doctor.updatedAt = now();
    await store.save();
    return clone(doctor);
  },

  // Returns doctors joined with their user row and specialty, because
  // every screen that lists doctors needs the name and the specialty too.
  // This is the one place the local adapter does a "join" by hand; the
  // PostgreSQL version does it with a real JOIN.
  async list({ specialtyId, search, isActive = true, limit, offset } = {}) {
    const state = store.getState();

    const joined = state.doctors
      .map((doctor) => {
        const user = state.users.find((item) => item.id === doctor.userId);
        const specialty = state.specialties.find((item) => item.id === doctor.specialtyId);
        return { doctor, user, specialty };
      })
      // A doctor profile with no user row should not exist; skip it rather
      // than crash if the data file was hand-edited.
      .filter((row) => Boolean(row.user))
      .filter((row) => {
        if (isActive !== undefined && row.user.isActive !== isActive) return false;
        if (specialtyId && row.doctor.specialtyId !== specialtyId) return false;
        if (search && !matchesSearch(row.user.name, search)) return false;
        return true;
      })
      .map((row) => ({
        ...row.doctor,
        name: row.user.name,
        email: row.user.email,
        phone: row.user.phone,
        isActive: row.user.isActive,
        specialtyName: row.specialty ? row.specialty.name : null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return paginate(joined, { limit, offset });
  },

  // One doctor with the same joined shape as list().
  async findDetailById(id) {
    const { rows } = await doctors.list({ isActive: undefined });
    return rows.find((row) => row.id === id) || null;
  },
};

// =================================================================
// availability  (a doctor's weekly working hours)
// =================================================================

const availability = {
  async listByDoctor(doctorId) {
    const state = store.getState();
    return cloneAll(
      state.availability
        .filter((item) => item.doctorId === doctorId)
        .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime))
    );
  },

  // Replace the whole weekly schedule in one go.
  // WHY replace instead of add/edit/delete per row: the doctor's screen
  // edits the week as a single form, so one call keeps the saved schedule
  // exactly what they see. No chance of a half-saved week.
  async replaceForDoctor(doctorId, blocks) {
    const state = store.getState();
    state.availability = state.availability.filter((item) => item.doctorId !== doctorId);

    const created = blocks.map((block) => ({
      id: newId(),
      doctorId,
      weekday: block.weekday,
      startTime: block.startTime,
      endTime: block.endTime,
      slotMinutes: block.slotMinutes,
      createdAt: now(),
    }));

    state.availability.push(...created);
    await store.save();
    return cloneAll(created);
  },
};

// =================================================================
// appointments
// =================================================================

const APPOINTMENT_STATUSES = ['booked', 'completed', 'cancelled', 'no_show'];

// A cancelled appointment frees its slot; every other status holds it.
const HOLDS_SLOT = (status) => status !== 'cancelled';

const appointments = {
  // Book a slot, but only if it is still free.
  //
  // WHY this is one function instead of "check" then "create":
  // if a route checked availability and then inserted, two patients
  // clicking at the same moment could both pass the check and both
  // insert - a double booking. Node runs JavaScript on a single thread,
  // so as long as the check and the push happen with no `await` between
  // them (as below), no other request can slip in. The PostgreSQL version
  // gets the same guarantee from a UNIQUE index on
  // (doctor_id, date, start_time) WHERE status <> 'cancelled'.
  //
  // Returns the appointment, or null if the slot was already taken.
  async createIfSlotFree(data) {
    const state = store.getState();

    // --- start of the critical section: no awaits in here ---
    const taken = state.appointments.some(
      (item) =>
        item.doctorId === data.doctorId &&
        item.date === data.date &&
        item.startTime === data.startTime &&
        HOLDS_SLOT(item.status)
    );
    if (taken) return null;

    const appointment = {
      id: data.id || newId(),
      patientUserId: data.patientUserId,
      doctorId: data.doctorId,
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      slotMinutes: data.slotMinutes,
      reason: data.reason || '',
      status: data.status || 'booked',
      // The fee is copied in at booking time. WHY: if the doctor later
      // raises their fee, an old appointment must still show what the
      // patient was actually quoted.
      feeCentsAtBooking: data.feeCentsAtBooking || 0,
      cancelledAt: null,
      cancelledByUserId: null,
      cancelReason: null,
      completedAt: null,
      rescheduledFrom: data.rescheduledFrom || null,
      createdAt: data.createdAt || now(),
      updatedAt: now(),
    };
    state.appointments.push(appointment);
    // --- end of the critical section ---

    await store.save();
    return clone(appointment);
  },

  async findById(id) {
    const state = store.getState();
    return clone(state.appointments.find((item) => item.id === id) || null);
  },

  async update(id, patch) {
    const state = store.getState();
    const appointment = state.appointments.find((item) => item.id === id);
    if (!appointment) return null;

    for (const key of [
      'status',
      'reason',
      'cancelledAt',
      'cancelledByUserId',
      'cancelReason',
      'completedAt',
      'date',
      'startTime',
      'endTime',
    ]) {
      if (patch[key] !== undefined) appointment[key] = patch[key];
    }
    appointment.updatedAt = now();

    await store.save();
    return clone(appointment);
  },

  // The one query every screen uses, with filters layered on top.
  // Returns appointments joined with patient and doctor names.
  async list({
    patientUserId,
    doctorId,
    status,
    date,
    fromDate,
    toDate,
    search,
    limit,
    offset,
    order = 'asc',
  } = {}) {
    const state = store.getState();

    const joined = state.appointments
      .filter((item) => {
        if (patientUserId && item.patientUserId !== patientUserId) return false;
        if (doctorId && item.doctorId !== doctorId) return false;
        if (status && item.status !== status) return false;
        if (date && item.date !== date) return false;
        if (fromDate && item.date < fromDate) return false;
        if (toDate && item.date > toDate) return false;
        return true;
      })
      .map((item) => {
        const patient = state.users.find((user) => user.id === item.patientUserId);
        const doctor = state.doctors.find((row) => row.id === item.doctorId);
        const doctorUser = doctor
          ? state.users.find((user) => user.id === doctor.userId)
          : null;
        const specialty = doctor
          ? state.specialties.find((row) => row.id === doctor.specialtyId)
          : null;

        return {
          ...item,
          patientName: patient ? patient.name : 'Unknown patient',
          patientPhone: patient ? patient.phone : null,
          doctorName: doctorUser ? doctorUser.name : 'Unknown doctor',
          doctorUserId: doctor ? doctor.userId : null,
          specialtyName: specialty ? specialty.name : null,
        };
      })
      .filter((row) => {
        if (!search) return true;
        return matchesSearch(row.patientName, search) || matchesSearch(row.doctorName, search);
      })
      .sort((a, b) => (order === 'desc' ? compareSlots(b, a) : compareSlots(a, b)));

    return paginate(joined, { limit, offset });
  },

  // Which slots are already taken for one doctor in a date range.
  // Used to build the "free slots" list without loading everything.
  async listTakenSlots({ doctorId, fromDate, toDate }) {
    const state = store.getState();
    return state.appointments
      .filter(
        (item) =>
          item.doctorId === doctorId &&
          item.date >= fromDate &&
          item.date <= toDate &&
          HOLDS_SLOT(item.status)
      )
      .map((item) => ({ date: item.date, startTime: item.startTime }));
  },

  // { booked: 4, completed: 9, ... } for the admin dashboard.
  async countByStatus({ date, fromDate, toDate, doctorId } = {}) {
    const state = store.getState();
    const counts = Object.fromEntries(APPOINTMENT_STATUSES.map((status) => [status, 0]));

    for (const item of state.appointments) {
      if (date && item.date !== date) continue;
      if (fromDate && item.date < fromDate) continue;
      if (toDate && item.date > toDate) continue;
      if (doctorId && item.doctorId !== doctorId) continue;
      if (counts[item.status] !== undefined) counts[item.status] += 1;
    }

    return counts;
  },

  async count(filters = {}) {
    const { total } = await appointments.list(filters);
    return total;
  },

  // Does this doctor have (or has they had) any appointment with this
  // patient? This is the rule behind "a doctor may only see the reports
  // of patients they actually treat".
  async existsForDoctorAndPatient(doctorId, patientUserId) {
    const state = store.getState();
    return state.appointments.some(
      (item) => item.doctorId === doctorId && item.patientUserId === patientUserId
    );
  },

  // Distinct patients a doctor has seen, for the doctor's patient list.
  async listPatientsForDoctor(doctorId) {
    const state = store.getState();
    const seen = new Map();

    for (const item of state.appointments) {
      if (item.doctorId !== doctorId) continue;
      const patient = state.users.find((user) => user.id === item.patientUserId);
      if (!patient) continue;

      const existing = seen.get(patient.id);
      if (!existing || item.date > existing.lastVisitDate) {
        seen.set(patient.id, {
          id: patient.id,
          name: patient.name,
          email: patient.email,
          phone: patient.phone,
          lastVisitDate: item.date,
          visitCount: (existing ? existing.visitCount : 0) + 1,
        });
      } else {
        existing.visitCount += 1;
      }
    }

    return [...seen.values()].sort((a, b) => b.lastVisitDate.localeCompare(a.lastVisitDate));
  },
};

// =================================================================
// reports  (uploaded medical files)
// =================================================================
// Only the file KEY is stored, never the file itself and never a public
// URL. The storage adapter turns a key into bytes or a signed link.

const reports = {
  async create(data) {
    const state = store.getState();
    const report = {
      id: data.id || newId(),
      patientUserId: data.patientUserId,
      appointmentId: data.appointmentId || null,
      uploadedByUserId: data.uploadedByUserId,
      fileKey: data.fileKey,
      originalName: data.originalName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      title: data.title || data.originalName,
      createdAt: data.createdAt || now(),
    };
    state.reports.push(report);
    await store.save();
    return clone(report);
  },

  async findById(id) {
    const state = store.getState();
    return clone(state.reports.find((item) => item.id === id) || null);
  },

  async listByPatient(patientUserId, { limit, offset } = {}) {
    const state = store.getState();
    const rows = state.reports
      .filter((item) => item.patientUserId === patientUserId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return paginate(rows, { limit, offset });
  },

  async remove(id) {
    const state = store.getState();
    const index = state.reports.findIndex((item) => item.id === id);
    if (index === -1) return false;
    state.reports.splice(index, 1);
    await store.save();
    return true;
  },

  async countByPatient(patientUserId) {
    const state = store.getState();
    return state.reports.filter((item) => item.patientUserId === patientUserId).length;
  },
};

// =================================================================
// prescriptions
// =================================================================

const prescriptions = {
  async create(data) {
    const state = store.getState();
    const prescription = {
      id: data.id || newId(),
      appointmentId: data.appointmentId,
      patientUserId: data.patientUserId,
      doctorId: data.doctorId,
      // [{ name, dose, frequency, days }]
      medicines: data.medicines || [],
      notes: data.notes || '',
      createdAt: data.createdAt || now(),
      updatedAt: now(),
    };
    state.prescriptions.push(prescription);
    await store.save();
    return clone(prescription);
  },

  async findById(id) {
    const state = store.getState();
    return clone(state.prescriptions.find((item) => item.id === id) || null);
  },

  // One prescription per appointment, so the doctor edits rather than
  // adding a second one for the same visit.
  async findByAppointmentId(appointmentId) {
    const state = store.getState();
    return clone(state.prescriptions.find((item) => item.appointmentId === appointmentId) || null);
  },

  async update(id, patch) {
    const state = store.getState();
    const prescription = state.prescriptions.find((item) => item.id === id);
    if (!prescription) return null;
    if (patch.medicines !== undefined) prescription.medicines = patch.medicines;
    if (patch.notes !== undefined) prescription.notes = patch.notes;
    prescription.updatedAt = now();
    await store.save();
    return clone(prescription);
  },

  // Joined with doctor name and visit date, which is what a patient needs
  // to make sense of the list.
  async listByPatient(patientUserId, { limit, offset } = {}) {
    const state = store.getState();

    const joined = state.prescriptions
      .filter((item) => item.patientUserId === patientUserId)
      .map((item) => {
        const doctor = state.doctors.find((row) => row.id === item.doctorId);
        const doctorUser = doctor
          ? state.users.find((user) => user.id === doctor.userId)
          : null;
        const appointment = state.appointments.find((row) => row.id === item.appointmentId);
        return {
          ...item,
          doctorName: doctorUser ? doctorUser.name : 'Unknown doctor',
          appointmentDate: appointment ? appointment.date : null,
          appointmentTime: appointment ? appointment.startTime : null,
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return paginate(joined, { limit, offset });
  },

  async listByDoctor(doctorId, { limit, offset } = {}) {
    const state = store.getState();
    const rows = state.prescriptions
      .filter((item) => item.doctorId === doctorId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return paginate(rows, { limit, offset });
  },
};

// =================================================================
// auditLogs
// =================================================================
// Append-only on purpose: there is no update() or remove(). An audit
// trail you can edit is not an audit trail.

const auditLogs = {
  async create(data) {
    const state = store.getState();
    const entry = {
      id: newId(),
      action: data.action,
      actorUserId: data.actorUserId || null,
      actorRole: data.actorRole || null,
      actorEmail: data.actorEmail || null,
      entityType: data.entityType || null,
      entityId: data.entityId || null,
      ip: data.ip || null,
      userAgent: data.userAgent || null,
      metadata: data.metadata || {},
      createdAt: data.createdAt || now(),
    };
    state.auditLogs.push(entry);
    await store.save();
    return clone(entry);
  },

  async list({ action, actorUserId, fromDate, toDate, limit = 50, offset = 0 } = {}) {
    const state = store.getState();
    const rows = state.auditLogs
      .filter((item) => {
        if (action && item.action !== action) return false;
        if (actorUserId && item.actorUserId !== actorUserId) return false;
        if (fromDate && item.createdAt < fromDate) return false;
        if (toDate && item.createdAt > toDate) return false;
        return true;
      })
      // Newest first: when you open an audit log you want what just happened.
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return paginate(rows, { limit, offset });
  },

  async distinctActions() {
    const state = store.getState();
    return [...new Set(state.auditLogs.map((item) => item.action))].sort();
  },
};

module.exports = {
  init,
  close,
  health,
  reset,
  APPOINTMENT_STATUSES,
  users,
  specialties,
  doctors,
  availability,
  appointments,
  reports,
  prescriptions,
  auditLogs,
};
