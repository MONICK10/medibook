// routes/appointments.routes.js
// -----------------------------------------------------------------
//   POST   /api/appointments              book (patient)
//   GET    /api/appointments              list, scoped to who is asking
//   GET    /api/appointments/:id          one appointment
//   POST   /api/appointments/:id/cancel   cancel (patient)
//   POST   /api/appointments/:id/reschedule move to another slot (patient)
//   POST   /api/appointments/:id/outcome  completed / no-show (doctor)
//
// The interesting parts are the booking validation (which never trusts
// the slot the browser sends) and the reschedule, which has to move a
// booking without ever leaving two patients holding one slot.
// -----------------------------------------------------------------

const express = require('express');

const config = require('../config');
const db = require('../adapters/db');
const slots = require('../services/slots');
const time = require('../lib/time');
const audit = require('../services/audit');
const access = require('../services/access');
const { validate } = require('../lib/validate');
const { requireAuth } = require('../middleware/requireAuth');
const { requirePermission, requireAnyPermission } = require('../middleware/requireRole');
const { PERMISSIONS, ROLES } = require('../auth/roles');
const { appointmentFor } = require('../lib/serializers');
const { badRequest, conflict, forbidden, notFound } = require('../lib/httpError');

const router = express.Router();

// Everything here needs a login.
router.use(requireAuth);

// -----------------------------------------------------------------
// POST /api/appointments      book a slot
// -----------------------------------------------------------------
router.post(
  '/',
  requirePermission(PERMISSIONS.APPOINTMENT_BOOK),
  validate({
    doctorId: { type: 'id', required: true },
    date: { type: 'date', required: true },
    startTime: { type: 'time', required: true },
    reason: { type: 'string', required: true, min: 3, max: 500 },
  }),
  async (req, res, next) => {
    try {
      const { doctorId, date, startTime, reason } = req.valid;

      // Note what is NOT accepted from the request: patientUserId,
      // endTime, slotMinutes, status, or the fee. A patient books for
      // themselves, and the server works out the rest. Taking
      // patientUserId from the body would let anyone book in someone
      // else's name; taking the fee would let them set it to zero.
      const patientUserId = req.user.id;

      const doctor = await db.doctors.findDetailById(doctorId);
      if (!doctor || !doctor.isActive) throw notFound('That doctor');

      // --- is the date inside the booking window? ---
      const today = time.todayString();
      const lastBookableDate = time.addDays(today, config.booking.daysAhead - 1);

      if (date < today) {
        throw badRequest('That date has already passed.');
      }
      if (date > lastBookableDate) {
        throw badRequest(
          `You can only book up to ${config.booking.daysAhead} days ahead (until ${lastBookableDate}).`
        );
      }

      // --- is this a real slot in the doctor's schedule? ---
      // The browser sent a start time. It could have sent anything, so
      // we rebuild the doctor's actual slots and look for a match.
      // Without this, a hand-made request could book 03:00, or 09:07 -
      // which would sit between slots and quietly block the 09:00 one.
      const availabilityBlocks = await db.availability.listByDoctor(doctorId);
      const slot = slots.findSlot(availabilityBlocks, date, startTime);

      if (!slot) {
        throw badRequest('That time is not one of the doctor\'s appointment slots.');
      }

      // --- has it already started? ---
      if (time.isPastSlot(date, startTime)) {
        throw badRequest('That time has already passed.');
      }

      // --- is the patient already busy then? ---
      // Stops one patient holding two doctors' slots at the same moment,
      // which they could not attend anyway.
      const { rows: sameDay } = await db.appointments.list({ patientUserId, date });
      const clash = sameDay.find(
        (item) => item.startTime === startTime && item.status !== 'cancelled'
      );
      if (clash) {
        throw conflict('You already have an appointment at that time.');
      }

      // --- take the slot ---
      // One call that checks and inserts with no await in between, so
      // two patients clicking at the same instant cannot both succeed.
      // See adapters/db.local.js for why that is enough here, and what
      // PostgreSQL will use instead.
      const appointment = await db.appointments.createIfSlotFree({
        patientUserId,
        doctorId,
        date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        slotMinutes: slot.slotMinutes,
        reason,
        status: 'booked',
        // Copied in now, so a later fee change does not rewrite what
        // this patient was quoted.
        feeCentsAtBooking: doctor.feeCents,
      });

      if (!appointment) {
        // Someone else got it in the meantime. 409 Conflict, so the
        // frontend knows to refresh the calendar rather than retry.
        throw conflict('Sorry, that slot has just been taken. Please pick another.');
      }

      await audit.record(req, {
        action: audit.ACTIONS.APPOINTMENT_BOOKED,
        entityType: 'appointment',
        entityId: appointment.id,
        metadata: { doctorId, date, startTime },
      });

      const full = await db.appointments.findById(appointment.id);
      const { rows } = await db.appointments.list({ patientUserId, date });
      const joined = rows.find((row) => row.id === appointment.id) || full;

      res.status(201).json({ appointment: appointmentFor(req.user, joined) });
    } catch (error) {
      next(error);
    }
  }
);

// -----------------------------------------------------------------
// GET /api/appointments      list
// -----------------------------------------------------------------
// One endpoint for all three roles, because the SCOPE is decided here
// from the token - never from a query parameter.
//
// WHY that matters: the tempting design is
// GET /api/appointments?patientUserId=X. Then the authorization check
// has to compare X to the logged-in user everywhere, and the day
// someone forgets, patient A can read patient B's diary by editing a
// URL. Deriving the filter from req.user makes that impossible to get
// wrong: there is no parameter to tamper with.
router.get(
  '/',
  requireAnyPermission(
    PERMISSIONS.APPOINTMENT_READ_OWN,
    PERMISSIONS.APPOINTMENT_READ_ASSIGNED,
    PERMISSIONS.APPOINTMENT_READ_ALL
  ),
  validate(
    {
      status: {
        type: 'enum',
        required: false,
        values: ['booked', 'completed', 'cancelled', 'no_show'],
      },
      // 'upcoming' or 'past', as a convenience for the two tabs the
      // patient screen shows.
      when: { type: 'enum', required: false, values: ['upcoming', 'past'] },
      date: { type: 'date', required: false },
      limit: { type: 'int', required: false, min: 1, max: 100, default: 50 },
      offset: { type: 'int', required: false, min: 0, default: 0 },
    },
    'query'
  ),
  async (req, res, next) => {
    try {
      const { status, when, date, limit, offset } = req.valid;
      const filters = { status, date, limit, offset };

      if (req.user.role === ROLES.PATIENT) {
        filters.patientUserId = req.user.id;
      } else if (req.user.role === ROLES.DOCTOR) {
        const doctor = await access.requireDoctorProfile(req.user);
        filters.doctorId = doctor.id;
      }
      // An admin gets everything, which is what APPOINTMENT_READ_ALL
      // means. The paginated admin screen is in admin.routes.js.

      const today = time.todayString();
      if (when === 'upcoming') {
        filters.fromDate = today;
        filters.order = 'asc'; // soonest first
      } else if (when === 'past') {
        filters.toDate = today;
        filters.order = 'desc'; // most recent first
      }

      const { rows, total } = await db.appointments.list(filters);

      // 'upcoming' means "still to happen", so drop slots that have
      // already started today. Done after the query because the
      // database filters by date, not by time of day.
      let appointments = rows;
      if (when === 'upcoming') {
        appointments = rows.filter((row) => !time.isPastSlot(row.date, row.startTime));
      } else if (when === 'past') {
        appointments = rows.filter((row) => time.isPastSlot(row.date, row.startTime));
      }

      res.json({
        appointments: appointments.map((row) => appointmentFor(req.user, row)),
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
// GET /api/appointments/:id
// -----------------------------------------------------------------
router.get(
  '/:id',
  requireAnyPermission(
    PERMISSIONS.APPOINTMENT_READ_OWN,
    PERMISSIONS.APPOINTMENT_READ_ASSIGNED,
    PERMISSIONS.APPOINTMENT_READ_ALL
  ),
  validate({ id: { type: 'id', required: true } }, 'params'),
  async (req, res, next) => {
    try {
      // The ownership check is inside loadAppointment, so there is no
      // way to reach the row without having been checked.
      const { appointment } = await access.loadAppointment(req.user, req.valid.id);

      // Fetch the joined version for the names.
      const { rows } = await db.appointments.list({ date: appointment.date });
      const joined = rows.find((row) => row.id === appointment.id) || appointment;

      // A patient also gets the prescription for the visit, if there is
      // one, since that is what they came to the page for.
      const prescription = await db.prescriptions.findByAppointmentId(appointment.id);

      res.json({
        appointment: appointmentFor(req.user, joined),
        hasPrescription: Boolean(prescription),
        prescriptionId: prescription ? prescription.id : null,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Shared rule for cancel and reschedule.
// WHY a cutoff at all: a no-show with two minutes' notice wastes the
// slot, because nobody else can take it. Two hours gives the clinic a
// chance to offer it to someone.
function assertChangeableByPatient(appointment) {
  if (appointment.status !== 'booked') {
    throw badRequest(
      appointment.status === 'cancelled'
        ? 'That appointment is already cancelled.'
        : 'That appointment can no longer be changed.'
    );
  }

  const minutesLeft = time.minutesUntil(appointment.date, appointment.startTime);
  const cutoff = config.booking.cancelCutoffMinutes;

  if (minutesLeft < cutoff) {
    const hours = Math.round((cutoff / 60) * 10) / 10;
    throw badRequest(
      minutesLeft < 0
        ? 'That appointment has already started.'
        : `Changes must be made at least ${hours} hour(s) before the appointment. Please phone the clinic.`
    );
  }
}

// -----------------------------------------------------------------
// POST /api/appointments/:id/cancel
// -----------------------------------------------------------------
router.post(
  '/:id/cancel',
  requirePermission(PERMISSIONS.APPOINTMENT_CANCEL_OWN),
  validate({ id: { type: 'id', required: true } }, 'params'),
  validate({ reason: { type: 'string', required: false, max: 300 } }),
  async (req, res, next) => {
    try {
      const { appointment } = await access.loadAppointment(req.user, req.valid.id);
      assertChangeableByPatient(appointment);

      const updated = await db.appointments.update(appointment.id, {
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        cancelledByUserId: req.user.id,
        cancelReason: req.valid.reason || 'Cancelled by patient',
      });

      // Cancelling frees the slot: db.local.js treats any status except
      // 'cancelled' as holding it, so no extra bookkeeping is needed.

      await audit.record(req, {
        action: audit.ACTIONS.APPOINTMENT_CANCELLED,
        entityType: 'appointment',
        entityId: appointment.id,
        metadata: {
          date: appointment.date,
          startTime: appointment.startTime,
          noticeMinutes: time.minutesUntil(appointment.date, appointment.startTime),
        },
      });

      res.json({
        appointment: appointmentFor(req.user, { ...appointment, ...updated }),
        message: 'Your appointment has been cancelled.',
      });
    } catch (error) {
      next(error);
    }
  }
);

// -----------------------------------------------------------------
// POST /api/appointments/:id/reschedule
// -----------------------------------------------------------------
// Moves a booking to a different slot.
//
// WHY this creates a NEW row instead of editing the old one:
// editing in place would mean freeing the old slot and claiming the new
// one as two steps, and a failure between them loses the booking or
// double-books the new slot. Instead we claim the new slot first with
// the same atomic createIfSlotFree used by booking. If that fails, the
// original is untouched and the patient keeps their appointment. Only
// once the new slot is safely held do we cancel the old one.
//
// It also leaves an honest history: the old row stays as 'cancelled'
// with a reason, and the new row points back at it via rescheduledFrom.
router.post(
  '/:id/reschedule',
  requirePermission(PERMISSIONS.APPOINTMENT_RESCHEDULE_OWN),
  validate({ id: { type: 'id', required: true } }, 'params'),
  validate({
    date: { type: 'date', required: true },
    startTime: { type: 'time', required: true },
  }),
  async (req, res, next) => {
    try {
      const { date, startTime } = req.valid;
      const { appointment } = await access.loadAppointment(req.user, req.valid.id);

      assertChangeableByPatient(appointment);

      if (appointment.date === date && appointment.startTime === startTime) {
        throw badRequest('That is the same time as the current appointment.');
      }

      const doctor = await db.doctors.findDetailById(appointment.doctorId);
      if (!doctor || !doctor.isActive) {
        throw badRequest('That doctor is no longer available. Please cancel and book again.');
      }

      // The new slot faces exactly the same checks as a fresh booking.
      const today = time.todayString();
      const lastBookableDate = time.addDays(today, config.booking.daysAhead - 1);

      if (date < today) throw badRequest('That date has already passed.');
      if (date > lastBookableDate) {
        throw badRequest(
          `You can only book up to ${config.booking.daysAhead} days ahead (until ${lastBookableDate}).`
        );
      }

      const availabilityBlocks = await db.availability.listByDoctor(appointment.doctorId);
      const slot = slots.findSlot(availabilityBlocks, date, startTime);
      if (!slot) {
        throw badRequest('That time is not one of the doctor\'s appointment slots.');
      }
      if (time.isPastSlot(date, startTime)) {
        throw badRequest('That time has already passed.');
      }

      // Step 1: claim the new slot. Nothing has changed yet if this fails.
      const moved = await db.appointments.createIfSlotFree({
        patientUserId: appointment.patientUserId,
        doctorId: appointment.doctorId,
        date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        slotMinutes: slot.slotMinutes,
        reason: appointment.reason,
        status: 'booked',
        // The original quote is carried over: a patient rescheduling
        // should not be charged a new price.
        feeCentsAtBooking: appointment.feeCentsAtBooking,
        rescheduledFrom: appointment.id,
      });

      if (!moved) {
        throw conflict('Sorry, that slot has just been taken. Please pick another.');
      }

      // Step 2: now release the old one.
      await db.appointments.update(appointment.id, {
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        cancelledByUserId: req.user.id,
        cancelReason: `Rescheduled to ${date} at ${startTime}`,
      });

      await audit.record(req, {
        action: audit.ACTIONS.APPOINTMENT_RESCHEDULED,
        entityType: 'appointment',
        entityId: moved.id,
        metadata: {
          from: { date: appointment.date, startTime: appointment.startTime },
          to: { date, startTime },
          previousAppointmentId: appointment.id,
        },
      });

      const { rows } = await db.appointments.list({ date });
      const joined = rows.find((row) => row.id === moved.id) || moved;

      res.status(201).json({
        appointment: appointmentFor(req.user, joined),
        message: 'Your appointment has been moved.',
      });
    } catch (error) {
      next(error);
    }
  }
);

// -----------------------------------------------------------------
// POST /api/appointments/:id/outcome      doctor marks the result
// -----------------------------------------------------------------
router.post(
  '/:id/outcome',
  requirePermission(PERMISSIONS.APPOINTMENT_SET_OUTCOME),
  validate({ id: { type: 'id', required: true } }, 'params'),
  validate({
    status: { type: 'enum', required: true, values: ['completed', 'no_show'] },
  }),
  async (req, res, next) => {
    try {
      const { status } = req.valid;
      // loadAppointment already refuses an appointment belonging to a
      // different doctor.
      const { appointment } = await access.loadAppointment(req.user, req.valid.id);

      if (appointment.status !== 'booked') {
        throw badRequest(`That appointment is already marked as ${appointment.status}.`);
      }

      // An outcome only makes sense once the slot has started. Without
      // this a doctor could mark next week's patient a no-show today.
      if (!time.isPastSlot(appointment.date, appointment.startTime)) {
        throw badRequest('You can only set the outcome once the appointment has started.');
      }

      const updated = await db.appointments.update(appointment.id, {
        status,
        completedAt: status === 'completed' ? new Date().toISOString() : null,
      });

      await audit.record(req, {
        action: audit.ACTIONS.APPOINTMENT_OUTCOME_SET,
        entityType: 'appointment',
        entityId: appointment.id,
        metadata: { status, date: appointment.date, startTime: appointment.startTime },
      });

      res.json({
        appointment: appointmentFor(req.user, { ...appointment, ...updated }),
        message: status === 'completed' ? 'Marked as completed.' : 'Marked as a no-show.',
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
