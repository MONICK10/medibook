// middleware/requireRole.js
// -----------------------------------------------------------------
// LAYER 2 of the security chain: is this ROLE allowed on this route?
//
// Prefer requirePermission() over requireRole(). A route that says
// requirePermission('specialty:manage') keeps working when you add a
// receptionist role; a route that says requireRole('admin') has to be
// found and edited. See auth/roles.js for the table.
//
// Neither of these checks WHICH rows you may touch - that is layer 3,
// services/access.js. "A doctor may read appointments" is true; "a
// doctor may read every appointment in the clinic" is not.
// -----------------------------------------------------------------

const { forbidden, unauthorized } = require('../lib/httpError');
const { can, isValidRole } = require('../auth/roles');

// Allow only these roles. Use when a route is genuinely about identity
// rather than capability (for example "the admin area").
function requireRole(...allowedRoles) {
  // Catch a typo at startup rather than on the first request.
  for (const role of allowedRoles) {
    if (!isValidRole(role)) {
      throw new Error(`requireRole: "${role}" is not a role. See auth/roles.js.`);
    }
  }

  return function requireRoleMiddleware(req, res, next) {
    // requireAuth must run first. If it did not, fail closed.
    if (!req.user) return next(unauthorized());

    if (!allowedRoles.includes(req.user.role)) {
      if (req.log) {
        req.log.warn('Access denied by role', {
          needed: allowedRoles,
          actual: req.user.role,
          path: req.originalUrl,
        });
      }
      return next(forbidden('This area is not available for your account type.'));
    }

    next();
  };
}

// The one to reach for. Allow anyone whose role holds this permission.
function requirePermission(permission) {
  return function requirePermissionMiddleware(req, res, next) {
    if (!req.user) return next(unauthorized());

    // can() throws for an unknown permission string, which is a bug in
    // the route, not a client error - let it become a 500.
    if (!can(req.user.role, permission)) {
      if (req.log) {
        req.log.warn('Access denied by permission', {
          needed: permission,
          actual: req.user.role,
          path: req.originalUrl,
        });
      }
      return next(forbidden('You do not have permission to do this.'));
    }

    next();
  };
}

// Allow the request if ANY of these permissions is held. Useful where
// one route serves several roles, e.g. reading an appointment as its
// patient, as its doctor, or as an admin.
function requireAnyPermission(...permissions) {
  return function requireAnyPermissionMiddleware(req, res, next) {
    if (!req.user) return next(unauthorized());

    if (!permissions.some((permission) => can(req.user.role, permission))) {
      if (req.log) {
        req.log.warn('Access denied by permission', {
          neededAnyOf: permissions,
          actual: req.user.role,
          path: req.originalUrl,
        });
      }
      return next(forbidden('You do not have permission to do this.'));
    }

    next();
  };
}

module.exports = { requireRole, requirePermission, requireAnyPermission };
