// routes/health.routes.js
// -----------------------------------------------------------------
// GET /health      - for the load balancer
// GET /api/health  - the same thing, for the frontend
//
// WHY a load balancer health check must check the database:
// if an instance can serve HTTP but cannot reach the database, every
// real request fails. A health check that only returns "ok" keeps that
// broken instance in rotation. So this one asks the db adapter and
// returns 503 when it is unhappy, which makes the ALB stop sending it
// traffic (and, with an auto-scaling group, eventually replace it).
//
// WHY it is deliberately thin: health checks run every few seconds,
// forever. Anything expensive here becomes a constant load. And it is
// unauthenticated, so it must never reveal versions, hostnames, or
// anything else useful to someone probing the service.
// -----------------------------------------------------------------

const express = require('express');
const config = require('../config');
const db = require('../adapters/db');

const router = express.Router();

async function handleHealth(req, res) {
  const dbHealth = await db.health();

  const body = {
    status: dbHealth.ok ? 'ok' : 'degraded',
    // The adapter modes are useful when teaching ("am I really on RDS
    // now?") and are not a secret: they are names, not endpoints or
    // credentials. If this app were public-facing you would drop them.
    modes: config.modes,
    checks: {
      database: { ok: dbHealth.ok, mode: dbHealth.mode },
    },
    time: new Date().toISOString(),
  };

  // 503, not 500: "I am temporarily unable to serve", which is what a
  // load balancer and a retrying client both understand.
  res.status(dbHealth.ok ? 200 : 503).json(body);
}

router.get('/health', handleHealth);
router.get('/api/health', handleHealth);

module.exports = router;
