// routes/admin.routes.js
// -----------------------------------------------------------------
// Admin-only endpoints.
//
// Phase 1 ships the audit log, because the audit trail is part of the
// foundation and it gives us a real admin route to test the role layer
// against. Manage-doctors, manage-specialties, manage-users and the
// dashboard stats are added in phase 2.
//
// Notice the middleware order on the router itself: requireAuth before
// requirePermission. Reversed, requirePermission would look at a
// req.user that does not exist yet and (correctly, but confusingly)
// return 401 from the wrong layer.
// -----------------------------------------------------------------

const express = require('express');

const db = require('../adapters/db');
const { validate } = require('../lib/validate');
const { requireAuth } = require('../middleware/requireAuth');
const { requirePermission } = require('../middleware/requireRole');
const { PERMISSIONS } = require('../auth/roles');

const router = express.Router();

// Applies to every route in this file.
router.use(requireAuth);

// -----------------------------------------------------------------
// GET /api/admin/audit-logs
// -----------------------------------------------------------------
// Paginated, newest first, with optional filters.
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
