// routes/doctor.routes.js
// -----------------------------------------------------------------
// The doctor's own workspace.
//
//   GET   /api/doctor/dashboard
//   GET   /api/doctor/patients
//   GET   /api/doctor/patients/:patientUserId
//   GET   /api/doctor/availability
//   PUT   /api/doctor/availability
//   PATCH /api/doctor/profile
//
// Every route here works on "the logged-in doctor". There is no
// /api/doctor/:id workspace, on purpose: with no id in the URL there is
// no id to tamper with, so one doctor cannot open another's diary by
// editing an address.
// -----------------------------------------------------------------

const express = require('express');

const db = require('../adapters/db');
const time = require('../lib/time');
const slots = require('../services/slots');
const audit = require('../services/audit');
const access = require('../services/access');
const { validate } = require('../lib/validate');
const { requireAuth } = require('../middleware/requireAuth');
const { requirePermission } = require('../middleware/requireRole');
const { PERMISSIONS } = require('../auth/roles');
const {
  appointmentFor,
  publicDoctor,
  publicReport,
  patientForDoctor,
} = require('../lib/serializers');
const { badRequest } = require('../lib/httpError');

const router = express.Router();

router.use(requireAuth);

// -----------------------------------------------------------------
// GET /api/doctor/dashboard
// -----------------------------------------------------------------
router.get(
  '/dashboard',
  requirePermission(PERMISSIONS.STATS_DOCTOR),
  async (req, res, next) => {
    try {
      const doctor = await access.requireDoctorProfile(req.user);
      const today = time.todayString();

      // Today's list, in time order.
      const { rows: todayRows } = await db.appointments.list({
        doctorId: doctor.id,
        date: today,
        order: 'asc',
      });

      // The next 7 days including today, for the "this week" count.
      const weekEnd = time.addDays(today, 6);
      const { rows: weekRows } = await db.appointments.list({
        doctorId: doctor.id,
        status: 'booked',
        fromDate: today,
        toDate: weekEnd,
      });

      const upcomingThisWeek = weekRows.filter(
        (row) => !time.isPastSlot(row.date, row.startTime)
      );

      const statusCounts = await db.appointments.countByStatus({ doctorId: doctor.id });
      const patients = await db.appointments.listPatientsForDoctor(doctor.id);

      res.json({
        today,
        todaysAppointments: todayRows.map((row) => appointmentFor(req.user, row)),
        todaysCount: todayRows.length,
        // Still to be seen today, so the doctor knows what is left.
        todaysRemaining: todayRows.filter(
          (row) => row.status === 'booked' && !time.isPastSlot(row.date, row.startTime)
        ).length,

        upcomingThisWeekCount: upcomingThisWeek.length,
        weekEnds: weekEnd,

        totalPatients: patients.length,
        statusCounts: {
          booked: statusCounts.booked,
          completed: statusCounts.completed,
          cancelled: statusCounts.cancelled,
          noShow: statusCounts.no_show,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// -----------------------------------------------------------------
// GET /api/doctor/patients
// -----------------------------------------------------------------
// Only patients who have an appointment with this doctor. The adapter
// derives the list from the appointments table, so there is no way for
// it to include anybody else.
router.get(
  '/patients',
  requirePermission(PERMISSIONS.REPORT_READ_ASSIGNED),
  validate({ search: { type: 'string', required: false, max: 80 } }, 'query'),
  async (req, res, next) => {
    try {
      const doctor = await access.requireDoctorProfile(req.user);
      const { search } = req.valid;

      let patients = await db.appointments.listPatientsForDoctor(doctor.id);

      if (search) {
        const needle = search.toLowerCase();
        patients = patients.filter(
          (patient) =>
            patient.name.toLowerCase().includes(needle) ||
            patient.email.toLowerCase().includes(needle)
        );
      }

      res.json({
        patients: patients.map(patientForDoctor),
        total: patients.length,
      });
    } catch (error) {
      next(error);
    }
  }
);

// -----------------------------------------------------------------
// GET /api/doctor/patients/:patientUserId
// -----------------------------------------------------------------
// One patient's record, as far as this doctor is allowed to see it:
// their details, the visits they had with THIS doctor, and their
// reports.
//
// This is the route behind your acceptance check "a doctor cannot open
// the reports of a patient they have never seen" - the guard is the
// assertCanViewPatientRecords call below.
router.get(
  '/patients/:patientUserId',
  requirePermission(PERMISSIONS.REPORT_READ_ASSIGNED),
  validate({ patientUserId: { type: 'id', required: true } }, 'params'),
  async (req, res, next) => {
    try {
      const { patientUserId } = req.valid;

      // Throws 403 unless this doctor has an appointment with them.
      const { doctor } = await access.assertCanViewPatientRecords(
        req.user,
        patientUserId
      );

      const patient = await db.users.findById(patientUserId);
      if (!patient) throw badRequest('That patient could not be found.');

      // Visits with THIS doctor only. A patient's appointments with
      // other doctors are not this doctor's business.
      const { rows: visits } = await db.appointments.list({
        patientUserId,
        doctorId: doctor.id,
        order: 'desc',
      });

      // Reports, though, are the patient's whole file - which is the
      // point of uploading them. A treating doctor needs the blood test
      // another doctor ordered.
      const { rows: reports } = await db.reports.listByPatient(patientUserId);

      // Prescriptions are narrowed to this doctor's own, matching the
      // rule in services/access.js.
      const { rows: allPrescriptions } = await db.prescriptions.listByPatient(
        patientUserId
      );
      const myPrescriptions = allPrescriptions.filter(
        (row) => row.doctorId === doctor.id
      );

      res.json({
        patient: {
          id: patient.id,
          name: patient.name,
          email: patient.email,
          phone: patient.phone,
          memberSince: patient.createdAt,
        },
        visits: visits.map((row) => appointmentFor(req.user, row)),
        reports: reports.map(publicReport),
        prescriptions: myPrescriptions.map((row) => ({
          id: row.id,
          appointmentId: row.appointmentId,
          appointmentDate: row.appointmentDate,
          medicines: row.medicines,
          notes: row.notes,
          createdAt: row.createdAt,
        })),
      });
    } catch (error) {
      next(error);
    }
  }
);

// -----------------------------------------------------------------
// GET /api/doctor/availability
// -----------------------------------------------------------------
router.get(
  '/availability',
  requirePermission(PERMISSIONS.AVAILABILITY_MANAGE_OWN),
  async (req, res, next) => {
    try {
      const doctor = await access.requireDoctorProfile(req.user);
      const blocks = await db.availability.listByDoctor(doctor.id);

      res.json({
        availability: blocks.map((block) => ({
          id: block.id,
          weekday: block.weekday,
          weekdayName: time.WEEKDAY_NAMES[block.weekday],
          startTime: block.startTime,
          endTime: block.endTime,
          slotMinutes: block.slotMinutes,
          // How many appointments this block produces, so the doctor
          // can see the effect of a change before saving.
          slotCount: slots.slotsInBlock(block).length,
        })),
        weekdayNames: time.WEEKDAY_NAMES,
      });
    } catch (error) {
      next(error);
    }
  }
);

// -----------------------------------------------------------------
// PUT /api/doctor/availability
// -----------------------------------------------------------------
// Replaces the whole weekly schedule.
//
// WHY PUT and a full replace rather than add/edit/delete per row:
// the screen edits the week as one form, so sending the whole week
// means what is saved is exactly what the doctor sees. With per-row
// calls, a failure halfway leaves a half-saved week - a doctor who
// thinks they have blocked Friday off but has not.
router.put(
  '/availability',
  requirePermission(PERMISSIONS.AVAILABILITY_MANAGE_OWN),
  validate({
    availability: {
      type: 'array',
      required: true,
      min: 0,
      max: 21, // at most three blocks a day
      of: {
        fields: {
          weekday: { type: 'int', required: true, min: 0, max: 6 },
          startTime: { type: 'time', required: true },
          endTime: { type: 'time', required: true },
          // 5 minutes is the shortest sensible appointment; 4 hours the
          // longest. Also stops slotMinutes: 0, which would loop forever
          // when generating slots.
          slotMinutes: { type: 'int', required: true, min: 5, max: 240 },
        },
      },
    },
  }),
  async (req, res, next) => {
    try {
      const doctor = await access.requireDoctorProfile(req.user);
      const { availability } = req.valid;

      // Checks the validator cannot do, because they compare fields to
      // each other rather than checking one field's shape.
      for (const block of availability) {
        const start = time.timeToMinutes(block.startTime);
        const end = time.timeToMinutes(block.endTime);

        if (end <= start) {
          throw badRequest(
            `${time.WEEKDAY_NAMES[block.weekday]}: the end time must be after the start time.`
          );
        }
        if (end - start < block.slotMinutes) {
          throw badRequest(
            `${time.WEEKDAY_NAMES[block.weekday]}: the block is shorter than one ${block.slotMinutes} minute slot.`
          );
        }
      }

      // Overlapping blocks on the same day. services/slots.js already
      // refuses to offer a slot twice, so this is not a correctness
      // problem - but a doctor who has typed 9-12 and 11-2 has probably
      // made a mistake and would rather be told.
      const byWeekday = new Map();
      for (const block of availability) {
        const list = byWeekday.get(block.weekday) || [];
        list.push(block);
        byWeekday.set(block.weekday, list);
      }

      for (const [weekday, blocks] of byWeekday) {
        const sorted = [...blocks].sort((a, b) => a.startTime.localeCompare(b.startTime));
        for (let i = 1; i < sorted.length; i += 1) {
          if (time.timeToMinutes(sorted[i].startTime) < time.timeToMinutes(sorted[i - 1].endTime)) {
            throw badRequest(
              `${time.WEEKDAY_NAMES[weekday]}: two time blocks overlap.`
            );
          }
        }
      }

      const saved = await db.availability.replaceForDoctor(doctor.id, availability);

      // Note what this does NOT do: cancel appointments that fall
      // outside the new schedule. A doctor who removes Friday still has
      // Friday's patients booked, and the clinic has to deal with them
      // by hand. Silently cancelling people's appointments because a
      // form was saved would be much worse.
      const today = time.todayString();
      const { rows: upcoming } = await db.appointments.list({
        doctorId: doctor.id,
        status: 'booked',
        fromDate: today,
      });

      const orphaned = upcoming.filter((appointment) => {
        if (time.isPastSlot(appointment.date, appointment.startTime)) return false;
        return !slots.findSlot(saved, appointment.date, appointment.startTime);
      });

      await audit.record(req, {
        action: audit.ACTIONS.DOCTOR_UPDATED,
        entityType: 'doctor',
        entityId: doctor.id,
        metadata: { change: 'availability', blocks: saved.length, orphanedAppointments: orphaned.length },
      });

      res.json({
        availability: saved.map((block) => ({
          ...block,
          weekdayName: time.WEEKDAY_NAMES[block.weekday],
          slotCount: slots.slotsInBlock(block).length,
        })),
        // The frontend shows this as a warning.
        warnings:
          orphaned.length > 0
            ? [
                `${orphaned.length} upcoming appointment(s) are now outside your working hours. They are still booked - please contact those patients.`,
              ]
            : [],
        orphanedAppointments: orphaned.map((row) => appointmentFor(req.user, row)),
        message: 'Your weekly schedule has been saved.',
      });
    } catch (error) {
      next(error);
    }
  }
);

// -----------------------------------------------------------------
// PATCH /api/doctor/profile
// -----------------------------------------------------------------
// A doctor edits their own bio and fee.
//
// Note what is absent: specialtyId. Which department a doctor belongs
// to is a clinic decision, so it sits with the admin. A doctor
// reassigning themselves to Cardiology would change who the booking
// filters show them to.
router.patch(
  '/profile',
  requirePermission(PERMISSIONS.DOCTOR_EDIT_OWN_PROFILE),
  validate({
    bio: { type: 'string', required: false, max: 2000 },
    // Integer paise/cents, so there is no floating point money. The
    // frontend multiplies the rupee value the doctor types by 100.
    feeCents: { type: 'int', required: false, min: 0, max: 100000000 },
    qualification: { type: 'string', required: false, max: 160 },
    experienceYears: { type: 'int', required: false, min: 0, max: 70 },
  }),
  async (req, res, next) => {
    try {
      const doctor = await access.requireDoctorProfile(req.user);
      const { bio, feeCents, qualification, experienceYears } = req.valid;

      const patch = {};
      if (bio !== undefined) patch.bio = bio;
      if (feeCents !== undefined) patch.feeCents = feeCents;
      if (qualification !== undefined) patch.qualification = qualification;
      if (experienceYears !== undefined) patch.experienceYears = experienceYears;

      const updated = Object.keys(patch).length
        ? await db.doctors.update(doctor.id, patch)
        : doctor;

      if (Object.keys(patch).length) {
        await audit.record(req, {
          action: audit.ACTIONS.DOCTOR_UPDATED,
          entityType: 'doctor',
          entityId: doctor.id,
          metadata: { change: 'ownProfile', fields: Object.keys(patch) },
        });
      }

      const detail = await db.doctors.findDetailById(updated.id);
      res.json({
        doctor: publicDoctor(detail),
        message: 'Your profile has been saved.',
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
