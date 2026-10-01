// routes/prescriptions.routes.js
// -----------------------------------------------------------------
//   GET   /api/prescriptions        list (patient: mine, doctor: ones I wrote)
//   GET   /api/prescriptions/:id    one prescription
//   POST  /api/prescriptions        write one (doctor)
//   PATCH /api/prescriptions/:id    correct one (the doctor who wrote it)
// -----------------------------------------------------------------

const express = require('express');

const db = require('../adapters/db');
const audit = require('../services/audit');
const access = require('../services/access');
const { validate } = require('../lib/validate');
const { requireAuth } = require('../middleware/requireAuth');
const { requireAnyPermission, requirePermission } = require('../middleware/requireRole');
const { PERMISSIONS, ROLES } = require('../auth/roles');
const { publicPrescription } = require('../lib/serializers');
const { badRequest, conflict } = require('../lib/httpError');

const router = express.Router();

router.use(requireAuth);

// One medicine line. Used by both create and update so the rules
// cannot drift between them.
const MEDICINE_FIELDS = {
  name: { type: 'string', required: true, min: 2, max: 120 },
  dose: { type: 'string', required: true, min: 1, max: 60 },
  frequency: { type: 'string', required: true, min: 1, max: 80 },
  // A sanity range, not medical advice: it stops a typo like 3650 days.
  days: { type: 'int', required: true, min: 1, max: 365 },
};

const PRESCRIPTION_BODY = {
  medicines: {
    type: 'array',
    required: true,
    min: 1,
    max: 20,
    of: { fields: MEDICINE_FIELDS },
  },
  notes: { type: 'string', required: false, max: 2000 },
};

// -----------------------------------------------------------------
// GET /api/prescriptions
// -----------------------------------------------------------------
router.get(
  '/',
  requireAnyPermission(
    PERMISSIONS.PRESCRIPTION_READ_OWN,
    PERMISSIONS.PRESCRIPTION_READ_ASSIGNED
  ),
  validate(
    {
      limit: { type: 'int', required: false, min: 1, max: 100, default: 50 },
      offset: { type: 'int', required: false, min: 0, default: 0 },
    },
    'query'
  ),
  async (req, res, next) => {
    try {
      const { limit, offset } = req.valid;

      // Scope comes from the token, not from a query parameter. Same
      // reasoning as the appointments list.
      if (req.user.role === ROLES.PATIENT) {
        const { rows, total } = await db.prescriptions.listByPatient(req.user.id, {
          limit,
          offset,
        });
        return res.json({
          prescriptions: rows.map(publicPrescription),
          total,
          limit,
          offset,
        });
      }

      const doctor = await access.requireDoctorProfile(req.user);
      const { rows, total } = await db.prescriptions.listByDoctor(doctor.id, {
        limit,
        offset,
      });

      res.json({
        prescriptions: rows.map(publicPrescription),
        total,
        limit,
        offset,
      });
    } catch (error) {
      next(error);
    }
  }
);

// -----------------------------------------------------------------
// GET /api/prescriptions/:id
// -----------------------------------------------------------------
router.get(
  '/:id',
  requireAnyPermission(
    PERMISSIONS.PRESCRIPTION_READ_OWN,
    PERMISSIONS.PRESCRIPTION_READ_ASSIGNED
  ),
  validate({ id: { type: 'id', required: true } }, 'params'),
  async (req, res, next) => {
    try {
      const { prescription } = await access.loadPrescription(req.user, req.valid.id);

      // Fetch the joined version (doctor name, visit date) that the
      // patient's screen displays.
      const { rows } = await db.prescriptions.listByPatient(prescription.patientUserId);
      const joined = rows.find((row) => row.id === prescription.id) || prescription;

      res.json({ prescription: publicPrescription(joined) });
    } catch (error) {
      next(error);
    }
  }
);

// -----------------------------------------------------------------
// POST /api/prescriptions
// -----------------------------------------------------------------
router.post(
  '/',
  requirePermission(PERMISSIONS.PRESCRIPTION_WRITE),
  validate({
    appointmentId: { type: 'id', required: true },
    ...PRESCRIPTION_BODY,
  }),
  async (req, res, next) => {
    try {
      const { appointmentId, medicines, notes } = req.valid;

      // Refuses an appointment belonging to another doctor, so a doctor
      // cannot prescribe into a colleague's consultation.
      const { appointment, doctor } = await access.loadAppointment(
        req.user,
        appointmentId
      );

      // A prescription records what happened at a visit, so the visit
      // has to have happened. This also means a no-show or a cancelled
      // appointment can never carry one.
      if (appointment.status !== 'completed') {
        throw badRequest(
          'You can only write a prescription for an appointment marked as completed.'
        );
      }

      // One per appointment: a correction is an edit, not a second
      // prescription, so the patient never sees two conflicting lists
      // for the same visit.
      const existing = await db.prescriptions.findByAppointmentId(appointmentId);
      if (existing) {
        throw conflict(
          'This appointment already has a prescription. Edit the existing one instead.'
        );
      }

      // patientUserId and doctorId are taken from the APPOINTMENT, not
      // the request body. The body cannot point a prescription at a
      // different patient.
      const prescription = await db.prescriptions.create({
        appointmentId,
        patientUserId: appointment.patientUserId,
        doctorId: doctor.id,
        medicines,
        notes: notes || '',
      });

      await audit.record(req, {
        action: audit.ACTIONS.PRESCRIPTION_CREATED,
        entityType: 'prescription',
        entityId: prescription.id,
        metadata: {
          appointmentId,
          patientUserId: appointment.patientUserId,
          medicineCount: medicines.length,
          // Deliberately not logging the medicines themselves: the
          // audit log is read by admins, who have no clinical role.
        },
      });

      res.status(201).json({ prescription: publicPrescription(prescription) });
    } catch (error) {
      next(error);
    }
  }
);

// -----------------------------------------------------------------
// PATCH /api/prescriptions/:id
// -----------------------------------------------------------------
router.patch(
  '/:id',
  requirePermission(PERMISSIONS.PRESCRIPTION_WRITE),
  validate({ id: { type: 'id', required: true } }, 'params'),
  validate(PRESCRIPTION_BODY),
  async (req, res, next) => {
    try {
      const { medicines, notes } = req.valid;

      // loadPrescription allows a doctor only the ones they wrote.
      const { prescription } = await access.loadPrescription(req.user, req.valid.id);

      const updated = await db.prescriptions.update(prescription.id, {
        medicines,
        notes: notes || '',
      });

      await audit.record(req, {
        action: audit.ACTIONS.PRESCRIPTION_UPDATED,
        entityType: 'prescription',
        entityId: prescription.id,
        metadata: {
          appointmentId: prescription.appointmentId,
          medicineCount: medicines.length,
        },
      });

      res.json({ prescription: publicPrescription(updated) });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
