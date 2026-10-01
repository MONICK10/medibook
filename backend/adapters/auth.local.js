// adapters/auth.local.js
// -----------------------------------------------------------------
// LOCAL implementation of the auth adapter: email + password, hashed
// with bcryptjs, and a JWT we sign ourselves.
//
// bcryptjs (pure JavaScript) rather than bcrypt (native C++) because
// bcrypt needs a compiler toolchain, which on Windows means installing
// Visual Studio Build Tools. A student should not have to do that to
// run a demo app.
// -----------------------------------------------------------------

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const config = require('../config');
const db = require('./db');
const logger = require('../lib/logger');
const { unauthorized } = require('../lib/httpError');

// This mode owns passwords, so password features are available.
const capabilities = { passwords: true, selfRegister: true };

async function init() {
  // Build the dummy hash now, during startup, so the first failed login
  // is not slower than the rest (which would leak the same way).
  await getDummyHash();

  logger.info('Auth ready', {
    authMode: 'local',
    tokenLifetime: config.auth.jwtExpiresIn,
  });
}

// --- passwords -----------------------------------------------------

async function hashPassword(plain) {
  // bcrypt only reads the first 72 BYTES of input. Longer passwords are
  // silently truncated, so two different long passwords could match.
  // Pre-hashing with SHA-256 first folds the whole thing into 44 bytes.
  return bcrypt.hash(prehash(plain), config.auth.bcryptRounds);
}

// A real bcrypt hash of a random throwaway string, at the same cost
// factor as everyone else's.
//
// WHY it has to be a REAL hash: when an email does not exist there is
// no stored hash to check, and returning early would answer in about a
// millisecond while a genuine account takes ~140ms. That difference is
// measurable over the network, so the login form would reliably reveal
// which email addresses are registered at the clinic - which is itself
// private information about a person.
//
// A malformed string like '$2a$10$invalid...' does NOT work here:
// bcryptjs rejects it immediately without doing the work, which is the
// bug this comment replaced.
let dummyHashPromise = null;

function getDummyHash() {
  if (!dummyHashPromise) {
    dummyHashPromise = bcrypt.hash(
      crypto.randomBytes(32).toString('hex'),
      config.auth.bcryptRounds
    );
  }
  return dummyHashPromise;
}

async function verifyPassword(plain, hash) {
  // No stored hash: the account does not exist, or its password is
  // managed elsewhere. Do the same amount of work anyway, then fail.
  const target = hash || (await getDummyHash());
  const matches = await bcrypt.compare(prehash(plain), target);

  // Belt and braces: a random dummy hash will not match, but never let
  // a missing hash be treated as a successful login.
  return hash ? matches : false;
}

function prehash(plain) {
  return crypto.createHash('sha256').update(String(plain), 'utf8').digest('base64');
}

// --- tokens --------------------------------------------------------

async function issueToken(user) {
  // Keep the payload small and non-secret: anyone holding the token can
  // read it (a JWT is signed, not encrypted). Never put a phone number,
  // a diagnosis or anything else private in here.
  const payload = {
    sub: user.id,
    role: user.role,
    name: user.name,
  };

  const token = jwt.sign(payload, config.auth.jwtSecret, {
    expiresIn: config.auth.jwtExpiresIn,
    issuer: config.auth.jwtIssuer,
    algorithm: 'HS256',
  });

  const { exp } = jwt.decode(token);
  return { token, expiresAt: new Date(exp * 1000).toISOString() };
}

async function verifyToken(token) {
  try {
    // Pinning the algorithm matters. Without `algorithms`, a library can
    // be tricked into accepting a token whose header says alg:none, or
    // into verifying an RS256 token using the public key as an HMAC key.
    return jwt.verify(token, config.auth.jwtSecret, {
      algorithms: ['HS256'],
      issuer: config.auth.jwtIssuer,
    });
  } catch (error) {
    // Never pass the library's message to the client - "jwt expired" vs
    // "invalid signature" is a hint we do not need to give out.
    logger.debug('Token rejected', { reason: error.message });
    throw unauthorized('Your session is not valid. Please log in again.');
  }
}

// --- claims -> user ------------------------------------------------

async function resolveUser(claims) {
  const user = await db.users.findById(claims.sub);
  if (!user) return null;

  // Checked on EVERY request, not just at login: an admin deactivating
  // an account must take effect at once, not when the token expires.
  if (!user.isActive) {
    throw unauthorized('This account has been deactivated.');
  }

  // If the role in the token disagrees with the database, the database
  // wins and we force a fresh login. This is what stops a user who was
  // demoted from keeping admin powers until their token runs out.
  if (user.role !== claims.role) {
    logger.warn('Token role no longer matches the account', {
      userId: user.id,
      tokenRole: claims.role,
      actualRole: user.role,
    });
    throw unauthorized('Your permissions changed. Please log in again.');
  }

  return user;
}

// --- password reset tokens -----------------------------------------
// The token the user receives is random and never stored. We keep only
// its SHA-256 hash, so a leaked database does not hand over working
// reset links. SHA-256 (not bcrypt) is fine here because the token is
// already long and random - there is nothing to brute force.

function createResetToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, tokenHash: hashResetToken(token) };
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

function describe() {
  return {
    mode: 'local',
    tokenLifetime: config.auth.jwtExpiresIn,
    ephemeralSecret: config.ephemeralSecrets.includes('JWT_SECRET'),
  };
}

module.exports = {
  capabilities,
  init,
  hashPassword,
  verifyPassword,
  issueToken,
  verifyToken,
  resolveUser,
  createResetToken,
  hashResetToken,
  describe,
};
