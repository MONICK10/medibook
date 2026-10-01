// lib/httpError.js
// -----------------------------------------------------------------
// One error type that carries an HTTP status code.
//
// WHY: route code can just `throw notFound('Doctor')` and the single
// error handler in middleware/errors.js turns it into the right status
// and a safe JSON body. Without this, every route grows its own
// res.status(...).json(...) branches and they drift apart.
// -----------------------------------------------------------------

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code; // short machine-readable string for the frontend
    this.details = details; // optional, e.g. per-field validation errors
    // Marks this as an error we created on purpose. Anything without it is
    // an unexpected crash and must not have its message shown to the user.
    this.expected = true;
  }
}

// 400 - the request itself is wrong.
const badRequest = (message, details) =>
  new HttpError(400, 'bad_request', message, details);

// 401 - we do not know who you are. The client should log in.
const unauthorized = (message = 'You must log in to do this.') =>
  new HttpError(401, 'unauthorized', message);

// 403 - we know who you are, and you are not allowed. Logging in again
// will not help, so the frontend sends these to the Access Denied page.
const forbidden = (message = 'You do not have permission to do this.') =>
  new HttpError(403, 'forbidden', message);

const notFound = (what = 'Item') =>
  new HttpError(404, 'not_found', `${what} not found.`);

// 409 - the request is valid but clashes with current state, e.g. the
// slot was taken a moment ago, or the email is already registered.
const conflict = (message, details) =>
  new HttpError(409, 'conflict', message, details);

const tooLarge = (message = 'That file is too large.') =>
  new HttpError(413, 'payload_too_large', message);

const unprocessable = (message, details) =>
  new HttpError(422, 'validation_failed', message, details);

const tooManyRequests = (message = 'Too many attempts. Please wait and try again.') =>
  new HttpError(429, 'rate_limited', message);

// 501 - the feature exists but the active adapter cannot do it, e.g.
// changing a password while AUTH_MODE=cognito (Cognito owns passwords).
const notSupported = (message) =>
  new HttpError(501, 'not_supported', message);

module.exports = {
  HttpError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  tooLarge,
  unprocessable,
  tooManyRequests,
  notSupported,
};
