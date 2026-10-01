// middleware/requireAuth.js
// -----------------------------------------------------------------
// LAYER 1 of 3 in the security chain:
//
//   requireAuth        -> are you logged in?            401 if not
//   requirePermission  -> may your ROLE do this at all?  403 if not
//   services/access.js -> may you touch THIS ROW?         403 if not
//
// WHY three layers instead of one check: they answer different
// questions and get reused differently. "Is there a valid token" is the
// same for every route. "May a doctor write prescriptions" depends on
// the route. "Is this particular patient yours" depends on the data
// being requested. Collapsing them produces copy-pasted checks, and the
// one that gets missed is the hole.
//
// WHY 401 vs 403 matters: 401 means "log in and try again", so the
// frontend redirects to the login page. 403 means "logging in again
// will not help", so it shows Access Denied. Returning the wrong one
// sends users round a redirect loop.
// -----------------------------------------------------------------

const auth = require('../adapters/auth');
const { unauthorized } = require('../lib/httpError');
const { permissionsFor } = require('../auth/roles');

// Pull the token out of "Authorization: Bearer <token>".
function readBearerToken(req) {
  const header = req.get('authorization');
  if (!header) return null;

  const [scheme, value] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !value) return null;

  return value.trim();
}

// Blocks the request unless there is a valid token for an active user.
async function requireAuth(req, res, next) {
  try {
    const token = readBearerToken(req);
    if (!token) {
      throw unauthorized('You must log in to do this.');
    }

    const claims = await auth.verifyToken(token);
    const user = await auth.resolveUser(claims);

    if (!user) {
      // The token is genuine but the account is gone: treat as logged out.
      throw unauthorized('Your account could not be found. Please log in again.');
    }

    // Everything downstream reads req.user. Note what is NOT attached:
    // passwordHash and resetTokenHash are stripped here so they cannot
    // leak out through a route that returns req.user by mistake.
    req.user = {
      id: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
      phone: user.phone,
      isActive: user.isActive,
      permissions: permissionsFor(user.role),
    };

    // Add the user to this request's log lines, so the logs show who did
    // what without each route remembering to include it.
    if (req.log) req.log = req.log.child({ userId: user.id, role: user.role });

    next();
  } catch (error) {
    next(error);
  }
}

// For routes that behave differently when logged in but do not require
// it. Never throws; just leaves req.user undefined if there is no token.
async function optionalAuth(req, res, next) {
  const token = readBearerToken(req);
  if (!token) return next();

  try {
    const claims = await auth.verifyToken(token);
    const user = await auth.resolveUser(claims);
    if (user) {
      req.user = {
        id: user.id,
        role: user.role,
        name: user.name,
        email: user.email,
        phone: user.phone,
        isActive: user.isActive,
        permissions: permissionsFor(user.role),
      };
    }
  } catch {
    // A bad token on an optional route is the same as no token.
  }

  next();
}

module.exports = { requireAuth, optionalAuth, readBearerToken };
