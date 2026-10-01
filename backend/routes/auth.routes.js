// routes/auth.routes.js
// -----------------------------------------------------------------
// Register, log in, log out, and the password reset flow.
//
// Several deliberate choices in here are about not leaking information
// to someone who is probing the API. They are commented individually,
// because each one looks like worse user experience until you see why.
// -----------------------------------------------------------------

const express = require('express');

const config = require('../config');
const db = require('../adapters/db');
const auth = require('../adapters/auth');
const mailer = require('../adapters/mailer');
const audit = require('../services/audit');
const { validate } = require('../lib/validate');
const { PASSWORD_RULES_TEXT } = require('../lib/password');
const { requireAuth } = require('../middleware/requireAuth');
const { ROLES, permissionsFor } = require('../auth/roles');
const {
  loginLimiter,
  forgotPasswordLimiter,
  registerLimiter,
} = require('../middleware/rateLimit');
const {
  badRequest,
  unauthorized,
  conflict,
  notSupported,
} = require('../lib/httpError');

const router = express.Router();

// The shape of a user that is safe to send to the browser.
// WHY a function instead of returning the row: the user row holds
// passwordHash and resetTokenHash. One helper used everywhere means a
// new sensitive column cannot leak just because someone forgot to strip
// it in one route.
function publicUser(user) {
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    phone: user.phone,
    isActive: user.isActive,
    createdAt: user.createdAt,
    // Sent so the frontend can hide menu items it knows are forbidden.
    // Convenience only - every route still checks for itself.
    permissions: permissionsFor(user.role),
  };
}

// Guard for the routes that only make sense when WE own the passwords.
// In Cognito mode AWS runs registration, login and reset, so these
// endpoints must refuse rather than pretend to work.
function requirePasswordSupport(req, res, next) {
  if (!auth.capabilities.passwords) {
    return next(
      notSupported(
        `Passwords are managed by the identity provider in AUTH_MODE=${config.modes.auth}.`
      )
    );
  }
  next();
}

// -----------------------------------------------------------------
// POST /api/auth/register   (patients only)
// -----------------------------------------------------------------
router.post(
  '/register',
  registerLimiter,
  requirePasswordSupport,
  validate({
    name: { type: 'string', required: true, min: 2, max: 80 },
    email: { type: 'email', required: true },
    phone: { type: 'phone', required: true },
    password: { type: 'password', required: true },
  }),
  async (req, res, next) => {
    try {
      const { name, email, phone, password } = req.valid;

      const existing = await db.users.findByEmail(email);
      if (existing) {
        // This does tell an attacker the address is registered, which is
        // a real trade-off. The alternative - always claiming success and
        // emailing the existing owner - confuses honest users badly, and
        // the login page leaks the same fact anyway through its own
        // behaviour. So we accept it here and spend the effort on rate
        // limiting instead.
        throw conflict('An account with that email already exists. Try logging in.');
      }

      const passwordHash = await auth.hashPassword(password);

      // The role is hardcoded, NOT taken from the request.
      // WHY: this is a public endpoint. If the role came from the body,
      // anyone could POST {"role":"admin"} and make themselves an admin.
      // (lib/validate.js would already have stripped the field, since it
      // is not in the schema above - this is the second layer.)
      const user = await db.users.create({
        role: ROLES.PATIENT,
        name,
        email,
        phone,
        passwordHash,
        isActive: true,
      });

      await audit.record(req, {
        action: audit.ACTIONS.REGISTER,
        entityType: 'user',
        entityId: user.id,
        actor: { id: user.id, role: user.role, email: user.email },
        metadata: { selfRegistered: true },
      });

      // Log them straight in: they just proved they know the password.
      const { token, expiresAt } = await auth.issueToken(user);

      res.status(201).json({ user: publicUser(user), token, expiresAt });
    } catch (error) {
      next(error);
    }
  }
);

// -----------------------------------------------------------------
// POST /api/auth/login
// -----------------------------------------------------------------
router.post(
  '/login',
  loginLimiter,
  requirePasswordSupport,
  // Note: no `password` strength rule here, only `string`. The rules
  // apply when SETTING a password. Checking them at login would reject
  // an old password that predates the rules, and would quietly tell an
  // attacker which guesses are not worth making.
  validate({
    email: { type: 'email', required: true },
    password: { type: 'string', required: true, min: 1, max: 200, trim: false },
  }),
  async (req, res, next) => {
    try {
      const { email, password } = req.valid;
      const user = await db.users.findByEmail(email);

      // ONE message for every failure: wrong email, wrong password, or a
      // deactivated account. WHY: distinct messages turn the login form
      // into a tool for discovering which email addresses have accounts
      // here - which, for a healthcare app, is itself private
      // information about a person.
      const genericFailure = unauthorized('Email or password is incorrect.');

      // Always run the password check, even when the user does not exist,
      // using a dummy hash. Without this, a missing account answers in
      // 2ms and a real one in 80ms, and that gap alone reveals which
      // addresses are registered.
      const passwordOk = await auth.verifyPassword(
        password,
        user ? user.passwordHash : null
      );

      if (!user || !passwordOk || !user.isActive) {
        await audit.record(req, {
          action: audit.ACTIONS.LOGIN_FAILED,
          entityType: 'user',
          entityId: user ? user.id : null,
          // The audit log DOES record the attempted address and the real
          // reason. That is the point of it: the detail is kept where only
          // an admin can read it, not handed to whoever is trying.
          metadata: {
            attemptedEmail: email,
            reason: !user
              ? 'no_such_user'
              : !passwordOk
                ? 'wrong_password'
                : 'account_inactive',
          },
          actor: user ? { id: user.id, role: user.role, email: user.email } : null,
        });

        throw genericFailure;
      }

      await db.users.update(user.id, { lastLoginAt: new Date().toISOString() });

      await audit.record(req, {
        action: audit.ACTIONS.LOGIN_SUCCESS,
        entityType: 'user',
        entityId: user.id,
        actor: { id: user.id, role: user.role, email: user.email },
      });

      const { token, expiresAt } = await auth.issueToken(user);
      res.json({ user: publicUser(user), token, expiresAt });
    } catch (error) {
      next(error);
    }
  }
);

// -----------------------------------------------------------------
// POST /api/auth/logout
// -----------------------------------------------------------------
// WHY this endpoint does not really "end a session":
// our JWT is stateless - the server keeps no session table, which is
// what lets you run several instances behind a load balancer with no
// shared session store. The flip side is that a token stays valid until
// it expires, so logging out means the FRONTEND throws its token away.
// This endpoint exists to write the audit entry.
//
// The real fix, if you need instant revocation, is a denylist of token
// ids in a fast shared store (ElastiCache), checked on every request -
// which trades away some of the statelessness you came for. Short token
// lifetimes (2h here) are the usual compromise.
router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await audit.record(req, {
      action: audit.ACTIONS.LOGOUT,
      entityType: 'user',
      entityId: req.user.id,
    });
    res.json({ message: 'Logged out. Please discard your token.' });
  } catch (error) {
    next(error);
  }
});

// -----------------------------------------------------------------
// GET /api/auth/me
// -----------------------------------------------------------------
// The frontend calls this on page load to find out whether the token in
// localStorage is still good, and who it belongs to.
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await db.users.findById(req.user.id);
    if (!user) throw unauthorized('Your account could not be found.');
    res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

// -----------------------------------------------------------------
// GET /api/auth/password-rules
// -----------------------------------------------------------------
// So the register and reset forms can display the rules that the
// backend actually enforces, instead of keeping their own copy that
// drifts out of date.
router.get('/password-rules', (req, res) => {
  res.json({ rules: PASSWORD_RULES_TEXT });
});

// -----------------------------------------------------------------
// POST /api/auth/forgot-password
// -----------------------------------------------------------------
router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  requirePasswordSupport,
  validate({ email: { type: 'email', required: true } }),
  async (req, res, next) => {
    try {
      const { email } = req.valid;
      const user = await db.users.findByEmail(email);

      // Here we DO hide whether the account exists, unlike register.
      // WHY the difference: register has to tell you, or you cannot
      // finish signing up. This endpoint has nothing to gain from
      // telling you, so it is free to say nothing - and it is the
      // endpoint an attacker would use to test a list of addresses
      // against the clinic.
      if (user && user.isActive) {
        const { token, tokenHash } = auth.createResetToken();
        const expiresAt = new Date(
          Date.now() + config.auth.passwordResetTtlMinutes * 60 * 1000
        ).toISOString();

        await db.users.setResetToken(user.id, { tokenHash, expiresAt });

        // The link points at the FRONTEND, which then posts the token
        // back to /reset-password.
        const frontend = config.allowedOrigins[0];
        const resetUrl = `${frontend}/reset-password?token=${encodeURIComponent(token)}`;

        await mailer.send({
          to: user.email,
          subject: 'Reset your MediBook password',
          text:
            `Hello ${user.name},\n\n` +
            `Someone asked to reset the password for your MediBook account.\n` +
            `If that was you, open this link within ${config.auth.passwordResetTtlMinutes} minutes:\n\n` +
            `${resetUrl}\n\n` +
            `If it was not you, you can ignore this email. Your password has not changed.\n`,
        });

        await audit.record(req, {
          action: audit.ACTIONS.PASSWORD_RESET_REQUESTED,
          entityType: 'user',
          entityId: user.id,
          actor: { id: user.id, role: user.role, email: user.email },
        });
      } else {
        // Nothing happened, but say nothing about it. Logged so an admin
        // can still see the pattern of attempts.
        req.log.info('Password reset requested for unknown or inactive account', {
          attemptedEmail: email,
        });
      }

      // The same reply either way.
      res.json({
        message:
          'If that email address has an account, a reset link is on its way.',
      });
    } catch (error) {
      next(error);
    }
  }
);

// -----------------------------------------------------------------
// POST /api/auth/reset-password
// -----------------------------------------------------------------
router.post(
  '/reset-password',
  requirePasswordSupport,
  validate({
    token: { type: 'string', required: true, min: 10, max: 200 },
    password: { type: 'password', required: true },
  }),
  async (req, res, next) => {
    try {
      const { token, password } = req.valid;

      // We stored only the hash, so hash the incoming token and look
      // that up. See adapters/auth.local.js for why.
      const tokenHash = auth.hashResetToken(token);
      const user = await db.users.findByResetToken(tokenHash);

      const invalid = badRequest(
        'That reset link is invalid or has expired. Please request a new one.'
      );

      if (!user || !user.resetTokenExpiresAt) throw invalid;
      if (new Date(user.resetTokenExpiresAt) < new Date()) throw invalid;
      if (!user.isActive) throw invalid;

      const passwordHash = await auth.hashPassword(password);
      await db.users.update(user.id, { passwordHash });

      // Single use. Clearing it means a reset link in someone's email
      // history cannot be replayed later.
      await db.users.clearResetToken(user.id);

      await audit.record(req, {
        action: audit.ACTIONS.PASSWORD_RESET_COMPLETED,
        entityType: 'user',
        entityId: user.id,
        actor: { id: user.id, role: user.role, email: user.email },
      });

      // Deliberately NOT logged in automatically: whoever holds the link
      // has not typed the new password into a login form yet, and making
      // them do so proves they know it.
      res.json({ message: 'Your password has been changed. You can now log in.' });
    } catch (error) {
      next(error);
    }
  }
);

// -----------------------------------------------------------------
// POST /api/auth/change-password   (while logged in)
// -----------------------------------------------------------------
router.post(
  '/change-password',
  requireAuth,
  requirePasswordSupport,
  validate({
    currentPassword: { type: 'string', required: true, min: 1, max: 200, trim: false },
    newPassword: { type: 'password', required: true },
  }),
  async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.valid;

      const user = await db.users.findById(req.user.id);
      if (!user) throw unauthorized();

      // Asking for the current password matters even though they are
      // already logged in: it means a stolen token alone cannot be used
      // to lock the real owner out of their account.
      const ok = await auth.verifyPassword(currentPassword, user.passwordHash);
      if (!ok) throw badRequest('Your current password is not correct.');

      if (currentPassword === newPassword) {
        throw badRequest('Your new password must be different from the current one.');
      }

      const passwordHash = await auth.hashPassword(newPassword);
      await db.users.update(user.id, { passwordHash });

      await audit.record(req, {
        action: audit.ACTIONS.PASSWORD_CHANGED,
        entityType: 'user',
        entityId: user.id,
      });

      res.json({ message: 'Your password has been changed.' });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
module.exports.publicUser = publicUser;
