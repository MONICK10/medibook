// middleware/rateLimit.js
// -----------------------------------------------------------------
// Limits how often the same client can hit sensitive endpoints.
//
// WHY login needs this: without a limit, an attacker can try millions
// of passwords against one account. bcrypt makes each guess slow, but
// "slow" times "unlimited" is still a breach. A cap of ten tries per
// 15 minutes makes online guessing pointless while barely touching a
// real person who mistyped their password twice.
//
// WHY forgot-password needs it too: it is an unauthenticated endpoint
// that sends email. Left open it becomes a way to spam someone's inbox
// (and, with SES, to burn your sending reputation and your money).
//
// IMPORTANT for AWS: this counter lives in the memory of ONE process.
// Run two instances behind a load balancer and the real limit doubles;
// restart and it resets. For production you point express-rate-limit at
// a shared store (ElastiCache/Redis) so all instances share one count.
// -----------------------------------------------------------------

const rateLimit = require('express-rate-limit');
const config = require('../config');
const logger = require('../lib/logger');

const minutes = (count) => count * 60 * 1000;

// One shared response shape, so a rate-limited request looks like every
// other error to the frontend.
function limitHandler(message) {
  return (req, res) => {
    logger.warn('Rate limit hit', {
      path: req.path,
      ip: req.ip,
      requestId: req.id,
    });

    res.status(429).json({
      error: { code: 'rate_limited', message },
      requestId: req.id,
    });
  };
}

const baseOptions = {
  standardHeaders: true, // send RateLimit-* headers so clients can back off
  legacyHeaders: false,
};

// Login: keyed by IP **and** the email being tried.
// WHY both: keying on IP alone lets one attacker on a rotating proxy
// pool hammer a single account, and punishes a whole office behind one
// public IP. Keying on the email alone lets an attacker lock a victim
// out of their own account on purpose. Together, one attacker cannot
// grind one account, and a legitimate user elsewhere is unaffected.
const loginLimiter = rateLimit({
  ...baseOptions,
  windowMs: minutes(config.rateLimit.loginWindowMinutes),
  max: config.rateLimit.loginMaxAttempts,
  keyGenerator: (req) => {
    const email = String((req.body && req.body.email) || '').toLowerCase();
    return `${req.ip}|${email}`;
  },
  // Do not count a successful login against the limit: someone logging
  // in and out legitimately should never be locked out.
  skipSuccessfulRequests: true,
  handler: limitHandler(
    'Too many sign-in attempts. Please wait a few minutes and try again.'
  ),
});

const forgotPasswordLimiter = rateLimit({
  ...baseOptions,
  windowMs: minutes(config.rateLimit.forgotWindowMinutes),
  max: config.rateLimit.forgotMaxAttempts,
  keyGenerator: (req) => {
    const email = String((req.body && req.body.email) || '').toLowerCase();
    return `${req.ip}|${email}`;
  },
  handler: limitHandler(
    'Too many reset requests. Please wait and try again later.'
  ),
});

// Registration, so nobody can create thousands of accounts.
const registerLimiter = rateLimit({
  ...baseOptions,
  windowMs: minutes(60),
  max: 10,
  handler: limitHandler('Too many accounts created from here. Please try again later.'),
});

// A loose ceiling on the whole API. Not a security control so much as a
// guard against a runaway script (or a buggy useEffect loop in the
// frontend) overwhelming the server.
const globalLimiter = rateLimit({
  ...baseOptions,
  windowMs: minutes(config.rateLimit.globalWindowMinutes),
  max: config.rateLimit.globalMaxRequests,
  // Health checks must never be throttled or the load balancer will
  // decide a healthy instance is dead and take it out of service.
  skip: (req) => req.path === '/health' || req.path === '/api/health',
  handler: limitHandler('Too many requests. Please slow down.'),
});

module.exports = {
  loginLimiter,
  forgotPasswordLimiter,
  registerLimiter,
  globalLimiter,
};
