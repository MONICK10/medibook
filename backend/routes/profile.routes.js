// routes/profile.routes.js
// -----------------------------------------------------------------
//   GET   /api/profile    my details (plus my doctor profile if any)
//   PATCH /api/profile    change my name or phone number
//
// Changing a password is in auth.routes.js, because it belongs with
// login rather than with personal details.
// -----------------------------------------------------------------

const express = require('express');

const db = require('../adapters/db');
const access = require('../services/access');
const { validate } = require('../lib/validate');
const { requireAuth } = require('../middleware/requireAuth');
const { ROLES } = require('../auth/roles');
const { publicUser, publicDoctor } = require('../lib/serializers');
const { unauthorized } = require('../lib/httpError');

const router = express.Router();

router.use(requireAuth);

// -----------------------------------------------------------------
// GET /api/profile
// -----------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const user = await db.users.findById(req.user.id);
    if (!user) throw unauthorized();

    const body = { user: publicUser(user) };

    // A doctor also gets their clinical profile, so the Profile screen
    // can show the bio and fee in the same form.
    if (user.role === ROLES.DOCTOR) {
      const doctor = await db.doctors.findByUserId(user.id);
      if (doctor) {
        const detail = await db.doctors.findDetailById(doctor.id);
        body.doctor = publicDoctor(detail || doctor);
      }
    }

    res.json(body);
  } catch (error) {
    next(error);
  }
});

// -----------------------------------------------------------------
// PATCH /api/profile
// -----------------------------------------------------------------
// Only name and phone.
//
// WHY email is NOT editable here: the email address is the login
// identity. Changing it changes who the account is, so doing it
// properly means proving the new address works first (send a
// confirmation link, apply the change only when it is clicked) and
// keeping the old one until then. Letting it be edited with one PATCH
// would also let someone who has stolen a session quietly take
// ownership of the account by pointing password resets at themselves.
// Since this app has no verified-email flow, the field is left out
// rather than done badly.
//
// WHY role and isActive are not here either: those are an admin's to
// change, and lib/validate.js strips them from the body anyway.
router.patch(
  '/',
  validate({
    name: { type: 'string', required: false, min: 2, max: 80 },
    phone: { type: 'phone', required: false },
  }),
  async (req, res, next) => {
    try {
      const { name, phone } = req.valid;

      const patch = {};
      if (name !== undefined) patch.name = name;
      if (phone !== undefined) patch.phone = phone;

      if (Object.keys(patch).length === 0) {
        // Nothing to do. Return the current state rather than an error,
        // so a form that submits unchanged values is not a failure.
        const user = await db.users.findById(req.user.id);
        return res.json({ user: publicUser(user) });
      }

      const updated = await db.users.update(req.user.id, patch);

      res.json({
        user: publicUser(updated),
        message: 'Your details have been saved.',
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
