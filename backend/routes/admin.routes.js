// routes/admin.routes.js
// -----------------------------------------------------------------
// Admin-only endpoints.
//
//   GET    /api/admin/stats
//   GET    /api/admin/doctors
//   POST   /api/admin/doctors
//   PATCH  /api/admin/doctors/:id
//   GET    /api/admin/specialties
//   POST   /api/admin/specialties
//   PATCH  /api/admin/specialties/:id
//   DELETE /api/admin/specialties/:id
//   GET    /api/admin/users
//   PATCH  /api/admin/users/:id/status
//   GET    /api/admin/appointments
//   GET    /api/admin/audit-logs
//
// Notice the middleware order on the router: requireAuth before
// requirePermission. Reversed, requirePermission would look at a
// req.user that does not exist yet and return 401 from the wrong layer.
//
// Notice too that there is no admin route for reading reports or
// prescriptions. An admin runs the clinic; they have no clinical reason
// to open a patient's test results, and the permission table in
// auth/roles.js does not give them one.
// -----------------------------------------------------------------

const express = require('express');

const db = require('../adapters/db');
const auth = require('../adapters/auth');
const mailer = require('../adapters/mailer');
const config = require('../config');
const time = require('../lib/time');
const audit = require('../services/audit');
const { validate } = require('../lib/validate');
const { requireAuth } = require('../middleware/requireAuth');
const { requirePermission } = require('../middleware/requireRole');
const { PERMISSIONS, ROLES } = require('../auth/roles');
const { generateTemporaryPassword } = require('../lib/password');
const {
  userForAdmin,
  doctorForAdmin,
  publicSpecialty,
  appointmentFor,
} = require('../lib/serializers');
const { badRequest, conflict, notFound, notSupported } = require('../lib/httpError');

const router = express.Router();

// Applies to every route in this file.
router.use(requireAuth);

// =================================================================
// GET /api/admin/stats
// =================================================================
router.get(
  '/stats',
  requirePermission(PERMISSIONS.STATS_ADMIN),
  async (req, res, next) => {
    try {
      const today = time.todayString();

      // Run the independent counts together rather than one after
      // another. With a real database these are separate queries, and
      // waiting for each in turn makes the dashboard needlessly slow.
      const [
        patientCount,
        activePatientCount,
        doctorCount,
        activeDoctorCount,
        specialties,
        todayCounts,
        allCounts,
      ] = await Promise.all([
        db.users.count({ role: ROLES.PATIENT }),
        db.users.count({ role: ROLES.PATIENT, isActive: true }),
        db.users.count({ role: ROLES.DOCTOR }),
        db.doctors.countActive(),
        db.specialties.list(),
        db.appointments.countByStatus({ date: today }),
        db.appointments.countByStatus(),
      ]);

      const { total: appointmentsToday } = await db.appointments.list({ date: today });

      res.json({
        today,
        totals: {
          patients: patientCount,
          activePatients: activePatientCount,
          doctors: doctorCount,
          activeDoctors: activeDoctorCount,
          specialties: specialties.length,
          appointments: Object.values(allCounts).reduce((sum, n) => sum + n, 0),
        },
        appointmentsToday,
        todayByStatus: {
          booked: todayCounts.booked,
          completed: todayCounts.completed,
          cancelled: todayCounts.cancelled,
          noShow: todayCounts.no_show,
        },
        allTimeByStatus: {
          booked: allCounts.booked,
          completed: allCounts.completed,
          cancelled: allCounts.cancelled,
          noShow: allCounts.no_show,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// =================================================================
// Doctors
// =================================================================

// GET /api/admin/doctors - includes deactivated ones, unlike the
// public list in doctors.routes.js.
router.get(
  '/doctors',
  requirePermission(PERMISSIONS.DOCTOR_MANAGE),
  validate(
    {
      specialtyId: { type: 'id', required: false },
      search: { type: 'string', required: false, max: 80 },
      // The admin screen can filter, but the DEFAULT is everyone -
      // the opposite of the public route, which hardcodes active only.
      isActive: { type: 'boolean', required: false },
      limit: { type: 'int', required: false, min: 1, max: 100, default: 50 },
      offset: { type: 'int', required: false, min: 0, default: 0 },
    },
    'query'
  ),
  async (req, res, next) => {
    try {
      const { specialtyId, search, isActive, limit, offset } = req.valid;

      const { rows, total } = await db.doctors.list({
        specialtyId,
        search,
        isActive, // undefined means "all"
        limit,
        offset,
      });

      res.json({ doctors: rows.map(doctorForAdmin), total, limit, offset });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/admin/doctors - create a doctor account.
//
// WHY only an admin can do this: a doctor account can read patient
// records. If doctors could self-register, anyone could sign up as one
// and start reading medical files. So registration is patients only
// (auth.routes.js hardcodes the role) and doctors are created here.
router.post(
  '/doctors',
  requirePermission(PERMISSIONS.DOCTOR_MANAGE),
  validate({
    name: { type: 'string', required: true, min: 2, max: 80 },
    email: { type: 'email', required: true },
    phone: { type: 'phone', required: true },
    specialtyId: { type: 'id', required: true },
    qualification: { type: 'string', required: false, max: 160 },
    experienceYears: { type: 'int', required: false, min: 0, max: 70, default: 0 },
    feeCents: { type: 'int', required: true, min: 0, max: 100000000 },
    bio: { type: 'string', required: false, max: 2000 },
  }),
  async (req, res, next) => {
    try {
      // In Cognito mode AWS owns account creation, so this would have to
      // call the Cognito admin API instead of writing a password hash.
      if (!auth.capabilities.passwords) {
        throw notSupported(
          `Accounts are managed by the identity provider in AUTH_MODE=${config.modes.auth}.`
        );
      }

      const {
        name,
        email,
        phone,
        specialtyId,
        qualification,
        experienceYears,
        feeCents,
        bio,
      } = req.valid;

      const existing = await db.users.findByEmail(email);
      if (existing) {
        throw conflict('An account with that email address already exists.');
      }

      const specialty = await db.specialties.findById(specialtyId);
      if (!specialty) throw badRequest('That specialty does not exist.');

      // The app generates the password, the admin never chooses it.
      // See lib/password.js for why.
      const temporaryPassword = generateTemporaryPassword();
      const passwordHash = await auth.hashPassword(temporaryPassword);

      const user = await db.users.create({
        role: ROLES.DOCTOR, // hardcoded, never from the request body
        name,
        email,
        phone,
        passwordHash,
        isActive: true,
      });

      const doctor = await db.doctors.create({
        userId: user.id,
        specialtyId,
        bio: bio || '',
        feeCents,
        experienceYears: experienceYears || 0,
        qualification: qualification || '',
      });

      // Sent by email, not returned in the response.
      // WHY: the admin creating the account should not learn the
      // password. With MAIL_MODE=console it prints in the backend
      // terminal, which is where you read it while teaching.
      await mailer.send({
        to: user.email,
        subject: 'Your MediBook doctor account',
        text:
          `Hello ${name},\n\n` +
          `An account has been created for you on MediBook.\n\n` +
          `Email:    ${email}\n` +
          `Password: ${temporaryPassword}\n\n` +
          `Please sign in and change your password straight away.\n` +
          `${config.allowedOrigins[0]}/login\n`,
      });

      await audit.record(req, {
        action: audit.ACTIONS.DOCTOR_CREATED,
        entityType: 'doctor',
        entityId: doctor.id,
        metadata: { userId: user.id, email, specialtyId },
      });

      const detail = await db.doctors.findDetailById(doctor.id);

      res.status(201).json({
        doctor: doctorForAdmin(detail),
        message:
          config.modes.mail === 'console'
            ? 'Doctor created. The sign-in details were printed in the backend terminal.'
            : 'Doctor created. Their sign-in details have been emailed to them.',
      });
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /api/admin/doctors/:id
router.patch(
  '/doctors/:id',
  requirePermission(PERMISSIONS.DOCTOR_MANAGE),
  validate({ id: { type: 'id', required: true } }, 'params'),
  validate({
    name: { type: 'string', required: false, min: 2, max: 80 },
    phone: { type: 'phone', required: false },
    specialtyId: { type: 'id', required: false },
    qualification: { type: 'string', required: false, max: 160 },
    experienceYears: { type: 'int', required: false, min: 0, max: 70 },
    feeCents: { type: 'int', required: false, min: 0, max: 100000000 },
    bio: { type: 'string', required: false, max: 2000 },
  }),
  async (req, res, next) => {
    try {
      const doctor = await db.doctors.findById(req.valid.id);
      if (!doctor) throw notFound('That doctor');

      const { name, phone, specialtyId } = req.valid;

      if (specialtyId) {
        const specialty = await db.specialties.findById(specialtyId);
        if (!specialty) throw badRequest('That specialty does not exist.');
      }

      // Name and phone live on the user row; the rest on the doctor row.
      const userPatch = {};
      if (name !== undefined) userPatch.name = name;
      if (phone !== undefined) userPatch.phone = phone;
      if (Object.keys(userPatch).length) {
        await db.users.update(doctor.userId, userPatch);
      }

      const doctorPatch = {};
      for (const key of ['specialtyId', 'qualification', 'experienceYears', 'feeCents', 'bio']) {
        if (req.valid[key] !== undefined) doctorPatch[key] = req.valid[key];
      }
      if (Object.keys(doctorPatch).length) {
        await db.doctors.update(doctor.id, doctorPatch);
      }

      await audit.record(req, {
        action: audit.ACTIONS.DOCTOR_UPDATED,
        entityType: 'doctor',
        entityId: doctor.id,
        metadata: {
          change: 'adminEdit',
          fields: [...Object.keys(userPatch), ...Object.keys(doctorPatch)],
        },
      });

      const detail = await db.doctors.findDetailById(doctor.id);
      res.json({ doctor: doctorForAdmin(detail), message: 'Doctor updated.' });
    } catch (error) {
      next(error);
    }
  }
);

// =================================================================
// Specialties
// =================================================================

router.get(
  '/specialties',
  requirePermission(PERMISSIONS.SPECIALTY_MANAGE),
  async (req, res, next) => {
    try {
      const specialties = await db.specialties.list();

      const withCounts = await Promise.all(
        specialties.map(async (specialty) => ({
          ...publicSpecialty(specialty),
          // Shown so the admin can see which ones cannot be deleted.
          doctorCount: await db.specialties.countDoctors(specialty.id),
        }))
      );

      res.json({ specialties: withCounts });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/specialties',
  requirePermission(PERMISSIONS.SPECIALTY_MANAGE),
  validate({
    name: { type: 'string', required: true, min: 2, max: 80 },
    description: { type: 'string', required: false, max: 500 },
  }),
  async (req, res, next) => {
    try {
      const { name, description } = req.valid;

      // Case-insensitive, so "Cardiology" and "cardiology" cannot both
      // exist and split the doctors between two identical filters.
      const existing = await db.specialties.findByName(name);
      if (existing) throw conflict('A specialty with that name already exists.');

      const specialty = await db.specialties.create({
        name,
        description: description || '',
      });

      await audit.record(req, {
        action: audit.ACTIONS.SPECIALTY_CREATED,
        entityType: 'specialty',
        entityId: specialty.id,
        metadata: { name },
      });

      res.status(201).json({ specialty: publicSpecialty(specialty) });
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/specialties/:id',
  requirePermission(PERMISSIONS.SPECIALTY_MANAGE),
  validate({ id: { type: 'id', required: true } }, 'params'),
  validate({
    name: { type: 'string', required: false, min: 2, max: 80 },
    description: { type: 'string', required: false, max: 500 },
  }),
  async (req, res, next) => {
    try {
      const specialty = await db.specialties.findById(req.valid.id);
      if (!specialty) throw notFound('That specialty');

      const { name, description } = req.valid;

      if (name && name.toLowerCase() !== specialty.name.toLowerCase()) {
        const clash = await db.specialties.findByName(name);
        if (clash) throw conflict('A specialty with that name already exists.');
      }

      const updated = await db.specialties.update(specialty.id, { name, description });

      await audit.record(req, {
        action: audit.ACTIONS.SPECIALTY_UPDATED,
        entityType: 'specialty',
        entityId: specialty.id,
        metadata: { name: updated.name },
      });

      res.json({ specialty: publicSpecialty(updated), message: 'Specialty updated.' });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/admin/specialties/:id
//
// Refused while any doctor still uses it. In PostgreSQL a foreign key
// would also refuse, but checking here lets us explain why instead of
// returning a database error - and the check has to exist anyway,
// because the local JSON adapter has no foreign keys.
router.delete(
  '/specialties/:id',
  requirePermission(PERMISSIONS.SPECIALTY_MANAGE),
  validate({ id: { type: 'id', required: true } }, 'params'),
  async (req, res, next) => {
    try {
      const specialty = await db.specialties.findById(req.valid.id);
      if (!specialty) throw notFound('That specialty');

      const doctorCount = await db.specialties.countDoctors(specialty.id);
      if (doctorCount > 0) {
        throw conflict(
          `${doctorCount} doctor(s) are still in ${specialty.name}. Move them to another specialty first.`
        );
      }

      await db.specialties.remove(specialty.id);

      await audit.record(req, {
        action: audit.ACTIONS.SPECIALTY_DELETED,
        entityType: 'specialty',
        entityId: specialty.id,
        metadata: { name: specialty.name },
      });

      res.json({ message: `${specialty.name} has been deleted.` });
    } catch (error) {
      next(error);
    }
  }
);

// =================================================================
// Users
// =================================================================

router.get(
  '/users',
  requirePermission(PERMISSIONS.USER_MANAGE),
  validate(
    {
      role: { type: 'enum', required: false, values: ['patient', 'doctor', 'admin'] },
      isActive: { type: 'boolean', required: false },
      search: { type: 'string', required: false, max: 80 },
      limit: { type: 'int', required: false, min: 1, max: 100, default: 50 },
      offset: { type: 'int', required: false, min: 0, default: 0 },
    },
    'query'
  ),
  async (req, res, next) => {
    try {
      const { role, isActive, search, limit, offset } = req.valid;

      const { rows, total } = await db.users.list({
        role,
        isActive,
        search,
        limit,
        offset,
      });

      res.json({ users: rows.map(userForAdmin), total, limit, offset });
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /api/admin/users/:id/status - deactivate or reactivate.
//
// WHY deactivate rather than delete: the appointments, reports and
// prescriptions attached to a person have to stay, both because the
// clinic needs its records and because deleting the user row would
// leave every one of them pointing at nothing. Deactivating stops the
// login immediately (adapters/auth.local.js checks isActive on every
// request) while the history stays intact.
router.patch(
  '/users/:id/status',
  requirePermission(PERMISSIONS.USER_MANAGE),
  validate({ id: { type: 'id', required: true } }, 'params'),
  validate({ isActive: { type: 'boolean', required: true } }),
  async (req, res, next) => {
    try {
      const { isActive } = req.valid;
      const user = await db.users.findById(req.valid.id);
      if (!user) throw notFound('That user');

      // An admin cannot deactivate themselves. Without this, one admin
      // can lock the only admin account out of the system, and there is
      // no way back in through the UI.
      if (user.id === req.user.id) {
        throw badRequest('You cannot change your own account status.');
      }

      // Nor can the last active admin be deactivated, for the same
      // reason by a different route.
      if (user.role === ROLES.ADMIN && isActive === false) {
        const activeAdmins = await db.users.count({ role: ROLES.ADMIN, isActive: true });
        if (activeAdmins <= 1) {
          throw badRequest('This is the only active admin. Create another one first.');
        }
      }

      if (user.isActive === isActive) {
        return res.json({
          user: userForAdmin(user),
          message: `That account is already ${isActive ? 'active' : 'deactivated'}.`,
        });
      }

      const updated = await db.users.update(user.id, { isActive });

      await audit.record(req, {
        action: isActive
          ? audit.ACTIONS.USER_REACTIVATED
          : audit.ACTIONS.USER_DEACTIVATED,
        entityType: 'user',
        entityId: user.id,
        metadata: { email: user.email, role: user.role },
      });

      res.json({
        user: userForAdmin(updated),
        message: isActive
          ? `${user.name} can sign in again.`
          : `${user.name} has been deactivated and can no longer sign in.`,
      });
    } catch (error) {
      next(error);
    }
  }
);

// =================================================================
// All appointments
// =================================================================

router.get(
  '/appointments',
  requirePermission(PERMISSIONS.APPOINTMENT_READ_ALL),
  validate(
    {
      date: { type: 'date', required: false },
      fromDate: { type: 'date', required: false },
      toDate: { type: 'date', required: false },
      doctorId: { type: 'id', required: false },
      status: {
        type: 'enum',
        required: false,
        values: ['booked', 'completed', 'cancelled', 'no_show'],
      },
      search: { type: 'string', required: false, max: 80 },
      limit: { type: 'int', required: false, min: 1, max: 100, default: 25 },
      offset: { type: 'int', required: false, min: 0, default: 0 },
    },
    'query'
  ),
  async (req, res, next) => {
    try {
      const { date, fromDate, toDate, doctorId, status, search, limit, offset } =
        req.valid;

      const { rows, total } = await db.appointments.list({
        date,
        fromDate,
        toDate,
        doctorId,
        status,
        search,
        limit,
        offset,
        order: 'desc', // newest first for an admin browsing history
      });

      res.json({
        appointments: rows.map((row) => appointmentFor(req.user, row)),
        total,
        limit,
        offset,
        // So the screen can render "Showing 1-25 of 312" and page links.
        hasMore: offset + rows.length < total,
      });
    } catch (error) {
      next(error);
    }
  }
);

// =================================================================
// Audit log
// =================================================================

router.get(
  '/audit-logs',
  requirePermission(PERMISSIONS.AUDIT_READ),
  validate(
    {
      action: { type: 'string', required: false, max: 60 },
      actorUserId: { type: 'id', required: false },
      // A hard ceiling on limit. WHY: without a max, ?limit=999999999
      // asks the server to build one enormous response and is an easy
      // way to exhaust its memory.
      limit: { type: 'int', required: false, min: 1, max: 200, default: 50 },
      offset: { type: 'int', required: false, min: 0, default: 0 },
    },
    'query'
  ),
  async (req, res, next) => {
    try {
      const { action, actorUserId, limit, offset } = req.valid;

      const { rows, total } = await db.auditLogs.list({
        action,
        actorUserId,
        limit,
        offset,
      });

      res.json({
        logs: rows,
        total,
        limit,
        offset,
        hasMore: offset + rows.length < total,
        // So the admin screen can build its filter dropdown from what is
        // actually in the log rather than a hardcoded list.
        availableActions: await db.auditLogs.distinctActions(),
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
