// routes/specialties.routes.js
// -----------------------------------------------------------------
// GET /api/specialties  - public, for the landing page and the filter
//                         on the Browse Doctors screen.
//
// Creating, editing and deleting specialties is an admin job and lives
// in routes/admin.routes.js. They are kept apart so that the public
// read path has no admin middleware anywhere near it.
// -----------------------------------------------------------------

const express = require('express');

const db = require('../adapters/db');
const { publicSpecialty } = require('../lib/serializers');

const router = express.Router();

// No requireAuth: the landing page shows the specialties a clinic
// covers before anyone logs in. There is nothing private in a list of
// medical departments.
router.get('/', async (req, res, next) => {
  try {
    const specialties = await db.specialties.list();

    // Each one carries how many doctors are available, so the frontend
    // can hide an empty specialty rather than show a dead end.
    const withCounts = await Promise.all(
      specialties.map(async (specialty) => {
        const { total } = await db.doctors.list({
          specialtyId: specialty.id,
          isActive: true,
        });
        return { ...publicSpecialty(specialty), doctorCount: total };
      })
    );

    res.json({ specialties: withCounts });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
