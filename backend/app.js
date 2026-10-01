// app.js
// -----------------------------------------------------------------
// Builds the Express application: middleware, then routes, then the
// error handlers. Kept separate from server.js so that the app can be
// created without opening a port (useful for tests).
//
// ORDER MATTERS in this file. Middleware runs top to bottom, so
// security headers and body limits have to be registered before the
// routes they are meant to protect, and the error handler has to be
// last or it will never see anything.
// -----------------------------------------------------------------

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const config = require('./config');
const logger = require('./lib/logger');
const { requestContext } = require('./middleware/requestContext');
const { notFoundHandler, errorHandler } = require('./middleware/errors');
const { globalLimiter } = require('./middleware/rateLimit');

const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');

function createApp() {
  const app = express();

  // --- 1. proxy awareness ------------------------------------------
  // Must come first: req.ip is used by the rate limiter and the audit
  // log, and behind an ALB the real client IP is in X-Forwarded-For.
  // Off by default - see the comment in config.js for why trusting a
  // proxy that is not there is a security hole rather than a nuisance.
  if (config.trustProxy) {
    app.set('trust proxy', 1);
  }

  // Do not advertise what we are built with.
  app.disable('x-powered-by');

  // --- 2. security headers -----------------------------------------
  app.use(
    helmet({
      // This is a JSON API: it serves no HTML, so a Content-Security-
      // Policy here protects nothing. The CSP that matters belongs on
      // whatever serves the frontend (Vite in dev, CloudFront later).
      contentSecurityPolicy: false,
      // Let the browser fetch a download URL we hand out. Helmet's
      // default (same-origin) would block the frontend on :5173 from
      // reading a file response from the API on :3000.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  // --- 3. CORS ------------------------------------------------------
  // A browser will only let the frontend call this API if we say so.
  // Restricted to an explicit list from FRONTEND_URL - never '*',
  // which would let any website on the internet make authenticated
  // requests on behalf of a logged-in user.
  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header: curl, a health check, a server-to-server
        // call. Those are not browsers, so CORS has nothing to protect
        // and blocking them would break the load balancer check.
        if (!origin) return callback(null, true);

        if (config.allowedOrigins.includes(origin)) return callback(null, true);

        logger.warn('Blocked a cross-origin request', { origin });
        // An Error here makes the CORS headers absent, which is what
        // makes the browser refuse. The request itself still returns.
        return callback(new Error('Origin not allowed by CORS'));
      },
      // We use Authorization headers, not cookies, so credentials are
      // not needed. Leaving this false keeps the Origin check strict.
      credentials: false,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
      maxAge: 600,
    })
  );

  // --- 4. request id + logging --------------------------------------
  app.use(requestContext);

  // --- 5. body parsing ----------------------------------------------
  // The limit is small on purpose. A JSON endpoint has no reason to
  // accept a megabyte, and the default (100kb) is already generous.
  // File uploads do NOT come through here - multer handles those, with
  // its own limit from config.upload.maxBytes.
  app.use(express.json({ limit: '64kb' }));
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));

  // --- 6. a loose global rate limit ---------------------------------
  app.use(globalLimiter);

  // --- 7. routes ----------------------------------------------------
  // Health first, and outside /api as well, so a load balancer can
  // reach it at /health.
  app.use(healthRoutes);

  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);

  // Phase 2 adds: /api/doctors, /api/specialties, /api/appointments,
  // /api/reports, /api/prescriptions, /api/files, /api/profile.

  // --- 8. fallbacks -------------------------------------------------
  // Anything unmatched is a 404...
  app.use(notFoundHandler);
  // ...and this must be the very last thing registered.
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
