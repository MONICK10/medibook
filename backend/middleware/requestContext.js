// middleware/requestContext.js
// -----------------------------------------------------------------
// Gives every request an id and a logger, and logs how it finished.
//
// WHY a request id: when a user reports "it failed at 2:15", one id ties
// together every log line from that request. It is also returned in
// error responses, so a screenshot of the error is enough to find the
// logs. Behind a load balancer this is the difference between
// debugging and guessing.
// -----------------------------------------------------------------

const crypto = require('crypto');
const logger = require('../lib/logger');

function requestContext(req, res, next) {
  // Reuse the id from an upstream proxy if there is one, so the trace
  // spans the ALB and the app. ALB sends X-Amzn-Trace-Id.
  const incoming = req.get('x-request-id') || req.get('x-amzn-trace-id');
  req.id = incoming || crypto.randomUUID();

  res.setHeader('X-Request-Id', req.id);

  req.log = logger.child({ requestId: req.id });

  const startedAt = process.hrtime.bigint();

  // 'finish' fires once the response is fully sent, so we can log the
  // real status and duration.
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

    // Health checks run every few seconds; logging them at info level
    // would bury everything else.
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    const isHealthCheck = req.path === '/health' || req.path === '/api/health';

    req.log[isHealthCheck ? 'debug' : level]('Request handled', {
      method: req.method,
      // originalUrl can carry a query string with an email or a search
      // term in it, so log only the path.
      path: req.path,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 10) / 10,
      userId: req.user ? req.user.id : undefined,
      ip: req.ip,
    });
  });

  next();
}

module.exports = { requestContext };
