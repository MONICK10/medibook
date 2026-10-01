// routes/patient.routes.js
// -----------------------------------------------------------------
//   GET /api/patient/dashboard
//
// One request that returns everything the patient's home screen shows.
//
// WHY one endpoint instead of letting the page call four:
// the dashboard needs upcoming appointments, recent reports and a
// couple of counts. Four separate requests means four round trips, four
// loading spinners, and a screen that assembles itself in pieces. One
// endpoint that returns exactly what the screen needs is simpler to
// build against and faster. The trade-off is that this endpoint is
// shaped by the UI, so a redesign changes it - which is fine for a
// screen that belongs to one app.
// -----------------------------------------------------------------

const express = require('express');

const db = require('../adapters/db');
const time = require('../lib/time');
const { requireAuth } = require('../middleware/requireAuth');
const { requirePermission } = require('../middleware/requireRole');
const { PERMISSIONS } = require('../auth/roles');
const { appointmentFor, publicReport, publicPrescription } = require('../lib/serializers');

const router = express.Router();

router.use(requireAuth);

router.get(
  '/dashboard',
  requirePermission(PERMISSIONS.STATS_PATIENT),
  async (req, res, next) => {
    try {
      const patientUserId = req.user.id;
      const today = time.todayString();

      // Upcoming: booked, from today onwards, soonest first.
      const { rows: upcomingRows } = await db.appointments.list({
        patientUserId,
        status: 'booked',
        fromDate: today,
        order: 'asc',
      });

      // Drop slots that have already started today.
      const upcoming = upcomingRows.filter(
        (row) => !time.isPastSlot(row.date, row.startTime)
      );

      const { rows: reportRows, total: reportTotal } = await db.reports.listByPatient(
        patientUserId,
        { limit: 5 }
      );

      const { rows: prescriptionRows, total: prescriptionTotal } =
        await db.prescriptions.listByPatient(patientUserId, { limit: 3 });

      const statusCounts = await db.appointments.countByStatus({ patientUserId });

      res.json({
        // Enough for a "your next appointment" panel plus a short list.
        nextAppointment: upcoming[0] ? appointmentFor(req.user, upcoming[0]) : null,
        upcomingAppointments: upcoming.slice(0, 5).map((row) => appointmentFor(req.user, row)),
        upcomingCount: upcoming.length,

        recentReports: reportRows.map(publicReport),
        reportCount: reportTotal,

        recentPrescriptions: prescriptionRows.map(publicPrescription),
        prescriptionCount: prescriptionTotal,

        visitCounts: {
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

module.exports = router;
