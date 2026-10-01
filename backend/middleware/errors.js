// middleware/errors.js
// -----------------------------------------------------------------
// The single place that turns an error into an HTTP response.
//
// WHY one handler: so there is exactly one piece of code deciding what
// the outside world learns when something breaks - and it can be
// audited. The rule it enforces is that a stack trace, a file path, a
// SQL fragment or a library message NEVER reaches the client. Those
// tell an attacker which packages and versions you run; they go to the
// logs, where you can read them and they cannot.
// -----------------------------------------------------------------

const multer = require('multer');
const config = require('../config');
const logger = require('../lib/logger');
const { HttpError, tooLarge, badRequest } = require('../lib/httpError');

// 404 for any route that did not match. Registered after all routes.
// Deliberately vague: it does not say whether the path exists but the
// METHOD was wrong, which would help someone map the API.
function notFoundHandler(req, res, next) {
  next(new HttpError(404, 'not_found', 'That endpoint does not exist.'));
}

// Translate errors thrown by libraries into our own HttpError, so the
// handler below only has one kind of error to think about.
function normalize(error) {
  if (error instanceof HttpError) return error;

  // Multer rejects oversized or unexpected uploads with coded errors.
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      const megabytes = Math.round(config.upload.maxBytes / (1024 * 1024));
      return tooLarge(`That file is too large. The limit is ${megabytes} MB.`);
    }
    if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
      return badRequest('Please upload a single file in the expected field.');
    }
    return badRequest('That file could not be accepted.');
  }

  // express.json() throws this on malformed JSON bodies.
  if (error.type === 'entity.parse.failed') {
    return badRequest('The request body was not valid JSON.');
  }
  if (error.type === 'entity.too.large') {
    return tooLarge('The request body is too large.');
  }

  return null; // unexpected - handled as a 500 below
}

// The error handler. Express identifies it by having FOUR arguments, so
// `next` must stay even though it is unused.
// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, next) {
  const log = req.log || logger;
  const known = normalize(error);

  if (known) {
    // An expected error: the message was written for the user, so it is
    // safe to send. Log 4xx at warn so patterns (many 403s from one IP)
    // are still visible.
    log.warn('Request failed', {
      status: known.status,
      code: known.code,
      message: known.message,
      path: req.path,
      method: req.method,
    });

    return res.status(known.status).json({
      error: {
        code: known.code,
        message: known.message,
        // Per-field validation messages. Safe: they are our own text
        // about the client's own input.
        ...(known.details ? { details: known.details } : {}),
      },
      requestId: req.id,
    });
  }

  // Unexpected: a bug or an outage. The full detail goes to the log...
  log.error('Unhandled error', {
    message: error && error.message,
    name: error && error.name,
    code: error && error.code,
    stack: error && error.stack,
    path: req.path,
    method: req.method,
  });

  // ...and the client gets a flat, generic message plus the request id,
  // which is all they need to report it.
  res.status(500).json({
    error: {
      code: 'internal_error',
      message: 'Something went wrong on our side. Please try again.',
    },
    requestId: req.id,
  });
}

module.exports = { notFoundHandler, errorHandler };
