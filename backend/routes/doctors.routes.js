// routes/doctors.routes.js
// -----------------------------------------------------------------
// Browsing doctors and seeing their free slots. All public.
//
//   GET /api/doctors              list, filter by specialty, search
//   GET /api/doctors/:id          one doctor's profile
//   GET /api/doctors/:id/slots    the next few days of availability
//
// WHY these are public: a clinic's list of doctors and when they have
// free appointments is the shop window. Requiring a login to see it
// would be like a surgery that will not tell you its opening hours.
// Nothing here identifies a patient - a taken slot is reported as
// unavailable, never as "booked by Ravi".
// -----------------------------------------------------------------

const express = require('express');

const config = require('../config');
const db = require('../adapters/db');
const slots = require('../services/slots');
const time = require('../lib/time');
const { validate } = require('../lib/validate');
const { publicDoctor } = require('../lib/serializers');
const { notFound } = require('../lib/httpError');

const router = express.Router();

// -----------------------------------------------------------------
// GET /api/doctors
// -----------------------------------------------------------------
router.get(
  '/',
  validate(
    {
      specialtyId: { type: 'id', required: false },
      search: { type: 'string', required: false, max: 80 },
      limit: { type: 'int', required: false, min: 1, max: 100, default: 50 },
      offset: { type: 'int', required: false, min: 0, default: 0 },
    },
    'query'
  ),
  async (req, res, next) => {
    try {
      const { specialtyId, search, limit, offset } = req.valid;

      // isActive: true is hardcoded, not taken from the query.
      // WHY: a deactivated doctor must not appear in a public list, and
      // leaving it to a query parameter would mean anyone could ask for
      // ?isActive=false and enumerate staff who have left.
      const { rows, total } = await db.doctors.list({
        specialtyId,
        search,
        isActive: true,
        limit,
        offset,
      });

      res.json({
        doctors: rows.map(publicDoctor),
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
// GET /api/doctors/:id
// -----------------------------------------------------------------
router.get(
  '/:id',
  validate({ id: { type: 'id', required: true } }, 'params'),
  async (req, res, next) => {
    try {
      const doctor = await db.doctors.findDetailById(req.valid.id);

      // A deactivated doctor is treated as not existing on the public
      // side, so an old bookmarked link stops working.
      if (!doctor || !doctor.isActive) throw notFound('That doctor');

      res.json({ doctor: publicDoctor(doctor) });
    } catch (error) {
      next(error);
    }
  }
);

// -----------------------------------------------------------------
// GET /api/doctors/:id/slots
// -----------------------------------------------------------------
// The booking calendar: one entry per day for the next
// BOOKING_DAYS_AHEAD days, each slot marked free or not.
router.get(
  '/:id/slots',
  validate({ id: { type: 'id', required: true } }, 'params'),
  validate(
    {
      // Lets the frontend page forward a week at a time. Defaults to today.
      from: { type: 'date', required: false },
      days: {
        type: 'int',
        required: false,
        min: 1,
        max: config.booking.daysAhead,
        default: config.booking.daysAhead,
      },
    },
    'query'
  ),
  async (req, res, next) => {
    try {
      const { id, days } = req.valid;

      const doctor = await db.doctors.findDetailById(id);
      if (!doctor || !doctor.isActive) throw notFound('That doctor');

      const today = time.todayString();
      let from = req.valid.from || today;

      // Never show slots in the past, even if asked for them. A patient
      // cannot book yesterday, so offering it is only confusing.
      if (from < today) from = today;

      // And never further ahead than the booking window, so the public
      // calendar cannot be used to read a doctor's schedule for next year.
      const lastBookableDate = time.addDays(today, config.booking.daysAhead - 1);
      if (from > lastBookableDate) from = lastBookableDate;

      const availabilityBlocks = await db.availability.listByDoctor(id);

      const toDate = time.addDays(from, days - 1);
      const takenSlots = await db.appointments.listTakenSlots({
        doctorId: id,
        fromDate: from,
        toDate,
      });

      const calendar = slots.buildCalendar({
        availabilityBlocks,
        takenSlots,
        fromDate: from,
        days,
      });

      res.json({
        doctorId: id,
        doctorName: doctor.name,
        feeCents: doctor.feeCents,
        from,
        to: toDate,
        bookingWindowEnds: lastBookableDate,
        calendar,
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
