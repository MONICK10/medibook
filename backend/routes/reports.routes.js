// routes/reports.routes.js
// -----------------------------------------------------------------
//   GET  /api/reports                   list (own, or a patient's)
//   POST /api/reports                   upload (patient)
//   GET  /api/reports/:id               one report's details
//   GET  /api/reports/:id/download-url  get a short-lived link
//
// This is the most sensitive data in the app, so the rules are:
//   * files are never in a public folder and never have a stable URL
//   * permission is checked when the LINK IS ISSUED, by this file
//   * the link expires in 5 minutes
//   * every download is written to the audit log
// -----------------------------------------------------------------

const express = require('express');

const config = require('../config');
const db = require('../adapters/db');
const storage = require('../adapters/storage');
const audit = require('../services/audit');
const access = require('../services/access');
const { validate } = require('../lib/validate');
const { requireAuth } = require('../middleware/requireAuth');
const { requireAnyPermission, requirePermission } = require('../middleware/requireRole');
const { uploadReportFile } = require('../middleware/upload');
const { PERMISSIONS, ROLES } = require('../auth/roles');
const { publicReport } = require('../lib/serializers');
const { badRequest, forbidden } = require('../lib/httpError');

const router = express.Router();

router.use(requireAuth);

// -----------------------------------------------------------------
// GET /api/reports
// -----------------------------------------------------------------
// A patient gets their own. A doctor must name a patient, and only
// gets them if they treat that patient.
router.get(
  '/',
  requireAnyPermission(PERMISSIONS.REPORT_READ_OWN, PERMISSIONS.REPORT_READ_ASSIGNED),
  validate(
    {
      patientUserId: { type: 'id', required: false },
      limit: { type: 'int', required: false, min: 1, max: 100, default: 50 },
      offset: { type: 'int', required: false, min: 0, default: 0 },
    },
    'query'
  ),
  async (req, res, next) => {
    try {
      const { limit, offset } = req.valid;
      let patientUserId = req.valid.patientUserId;

      if (req.user.role === ROLES.PATIENT) {
        // A patient's own id always wins, even if they sent someone
        // else's. Not an error - just ignored, so there is no way to
        // probe for other patients' ids.
        patientUserId = req.user.id;
      } else {
        if (!patientUserId) {
          throw badRequest('Please say which patient you want the reports for.');
        }
        // Throws 403 unless this doctor treats that patient.
        await access.assertCanViewPatientRecords(req.user, patientUserId);
      }

      const { rows, total } = await db.reports.listByPatient(patientUserId, {
        limit,
        offset,
      });

      res.json({ reports: rows.map(publicReport), total, limit, offset });
    } catch (error) {
      next(error);
    }
  }
);

// -----------------------------------------------------------------
// POST /api/reports        multipart/form-data, field name "report"
// -----------------------------------------------------------------
router.post(
  '/',
  requirePermission(PERMISSIONS.REPORT_UPLOAD_OWN),
  // Multer runs before validation, because the text fields arrive in
  // the same multipart body as the file and do not exist until it has
  // parsed them.
  uploadReportFile,
  validate({
    title: { type: 'string', required: false, max: 120 },
    appointmentId: { type: 'id', required: false },
  }),
  async (req, res, next) => {
    try {
      const { title, appointmentId } = req.valid;

      // The owner is always the uploader. A patient cannot upload a
      // file "for" someone else, which would be a way to plant a
      // document in another person's medical record.
      const patientUserId = req.user.id;

      // If they linked it to a visit, that visit must be theirs.
      // loadAppointment throws 403 for someone else's appointment.
      if (appointmentId) {
        await access.loadAppointment(req.user, appointmentId);
      }

      // The storage adapter decides where the bytes go and invents a
      // random file name. The browser's file name is kept only for
      // display - see adapters/storage.local.js for why.
      const { key, sizeBytes } = await storage.save({
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        ownerId: patientUserId,
      });

      const report = await db.reports.create({
        patientUserId,
        appointmentId: appointmentId || null,
        uploadedByUserId: req.user.id,
        fileKey: key,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        sizeBytes,
        title: title || req.file.originalname,
      });

      await audit.record(req, {
        action: audit.ACTIONS.REPORT_UPLOADED,
        entityType: 'report',
        entityId: report.id,
        metadata: { sizeBytes, mimeType: req.file.mimetype, appointmentId: appointmentId || null },
      });

      res.status(201).json({ report: publicReport(report) });
    } catch (error) {
      next(error);
    }
  }
);

// -----------------------------------------------------------------
// GET /api/reports/:id
// -----------------------------------------------------------------
router.get(
  '/:id',
  requireAnyPermission(PERMISSIONS.REPORT_READ_OWN, PERMISSIONS.REPORT_READ_ASSIGNED),
  validate({ id: { type: 'id', required: true } }, 'params'),
  async (req, res, next) => {
    try {
      // loadReport applies the same rule as the list above.
      const report = await access.loadReport(req.user, req.valid.id);
      res.json({ report: publicReport(report) });
    } catch (error) {
      next(error);
    }
  }
);

// -----------------------------------------------------------------
// GET /api/reports/:id/download-url
// -----------------------------------------------------------------
// THE permission gate for file access. Everything about who may read a
// medical report is decided here, once, while we still know who is
// asking. After this the client holds a signed link that works for a
// few minutes and proves nothing about identity.
//
// WHY not just stream the file from this endpoint? Because in S3 mode
// the browser fetches from S3 directly and the API never touches the
// bytes. Issuing a link works the same way in both modes, so the
// frontend has one code path. See adapters/storage.js.
router.get(
  '/:id/download-url',
  requireAnyPermission(PERMISSIONS.REPORT_READ_OWN, PERMISSIONS.REPORT_READ_ASSIGNED),
  validate({ id: { type: 'id', required: true } }, 'params'),
  async (req, res, next) => {
    try {
      let report;

      try {
        report = await access.loadReport(req.user, req.valid.id);
      } catch (error) {
        // A refused attempt on a medical file is worth recording. This
        // is the signal that someone is probing for other people's
        // records, and it is exactly what an audit log is for.
        if (error.status === 403) {
          await audit.record(req, {
            action: audit.ACTIONS.REPORT_ACCESS_DENIED,
            entityType: 'report',
            entityId: req.valid.id,
            metadata: { reason: error.message },
          });
        }
        throw error;
      }

      const { url, expiresAt } = await storage.createDownloadUrl(report.fileKey, {
        filename: report.originalName,
        mimeType: report.mimeType,
      });

      // Recorded BEFORE the link is handed over, so a download cannot
      // happen without a log entry existing for it.
      await audit.record(req, {
        action: audit.ACTIONS.REPORT_DOWNLOADED,
        entityType: 'report',
        entityId: report.id,
        metadata: {
          patientUserId: report.patientUserId,
          // Makes it obvious in the log when a doctor opened a patient's
          // file as opposed to the patient opening their own.
          viewerRole: req.user.role,
          onBehalfOf: report.patientUserId === req.user.id ? 'self' : 'other',
        },
      });

      res.json({
        url,
        expiresAt,
        expiresInSeconds: config.files.downloadUrlTtlSeconds,
        filename: report.originalName,
        mimeType: report.mimeType,
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
