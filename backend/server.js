// server.js
// -----------------------------------------------------------------
// Starts the application: wake up the adapters, then listen.
//
// WHY adapters are initialised before the port opens:
// if the server starts accepting requests while the database is still
// connecting, the first requests fail for no good reason. Worse, in
// AWS the load balancer's health check could pass on an instance that
// is not actually ready. Connect first, then open the door.
// -----------------------------------------------------------------

const config = require('./config');
const logger = require('./lib/logger');
const { createApp } = require('./app');

const secrets = require('./adapters/secrets');
const db = require('./adapters/db');
const storage = require('./adapters/storage');
const auth = require('./adapters/auth');
const mailer = require('./adapters/mailer');

async function start() {
  logger.info('Starting MediBook backend', {
    env: config.env,
    nodeVersion: process.version,
    modes: config.modes,
  });

  // Warn about secrets we invented at boot. This is the loud version of
  // "it works on my machine": handy locally, fatal in production (where
  // config.js refuses to start without them).
  if (config.ephemeralSecrets.length > 0) {
    logger.warn('Using generated development secrets', {
      secrets: config.ephemeralSecrets,
      consequence:
        'Logins and download links stop working when the server restarts. Run "npm run init-env" to fix.',
    });
  }

  // Secrets first: the database may need a password from it.
  await secrets.init();
  await db.init();
  await storage.init();
  await auth.init();

  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info('Backend listening', {
      port: config.port,
      url: config.apiPublicUrl,
      allowedOrigins: config.allowedOrigins,
      storage: storage.describe(),
      mailer: mailer.describe(),
    });
  });

  // --- shutting down cleanly ---------------------------------------
  // WHY this matters more in AWS than on a laptop: when an auto-scaling
  // group or ECS replaces an instance it sends SIGTERM and then waits a
  // short grace period. Exiting immediately would cut off requests that
  // are mid-flight; ignoring the signal gets the process killed anyway.
  // So: stop accepting new connections, let the open ones finish, flush
  // the data file, exit.
  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info('Shutting down', { signal });

    // A hard deadline, in case a connection never closes. Without it the
    // process can hang forever and be SIGKILLed with data unflushed.
    const forceExit = setTimeout(() => {
      logger.error('Shutdown took too long, exiting now');
      process.exit(1);
    }, 10000);
    forceExit.unref();

    server.close(async () => {
      try {
        await db.close();
        logger.info('Shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error: error.message });
        process.exit(1);
      }
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT')); // Ctrl+C

  return server;
}

// A crash that reaches here means our error handling missed something.
// Log it in the same structured format (so it is searchable in
// CloudWatch) and exit, rather than carrying on in an unknown state.
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { message: error.message, stack: error.stack });
  process.exit(1);
});

start().catch((error) => {
  logger.error('Failed to start', { message: error.message, stack: error.stack });
  process.exit(1);
});
