// adapters/auth.cognito.js
// -----------------------------------------------------------------
// AWS VERSION OF THE AUTH ADAPTER - NOT IMPLEMENTED.
//
//   AWS service: Amazon Cognito (a User Pool)
//   npm packages: aws-jwt-verify                    (verifying tokens)
//                 @aws-sdk/client-cognito-identity-provider
//                                                    (creating users)
//                 -> npm install aws-jwt-verify @aws-sdk/client-cognito-identity-provider
//   Turn on with: AUTH_MODE=cognito
//
// THE BIG IDEA, AND THE BIG DIFFERENCE
// In local mode this app owns identity: it stores password hashes and
// signs its own tokens. In Cognito mode AWS owns identity, and this
// app only VERIFIES tokens that Cognito issued. That flips several
// things, which is why capabilities below says passwords: false:
//
//   * The browser logs in against Cognito, not against /api/auth/login.
//     The frontend gets a token from Cognito (usually via its Hosted
//     UI or Amplify) and sends it to us as a Bearer token exactly as
//     before. Our login, register, forgot-password, reset-password and
//     change-password endpoints all return 501 - see
//     requirePasswordSupport in routes/auth.routes.js, which already
//     handles this for you.
//
//   * A user's ROLE comes from their Cognito GROUPS, not from our users
//     table. config.cognito.groupRoleMap maps group names to our roles
//     (admins -> admin, doctors -> doctor, patients -> patient).
//
//   * We still keep a row in our own users table for every person,
//     because appointments and reports have to point at something. That
//     row is created on first sign-in ("just-in-time provisioning") in
//     resolveUser below.
//
// WHY use aws-jwt-verify rather than jsonwebtoken: Cognito signs with
// RS256 using rotating keys published at a JWKS endpoint. The library
// fetches and caches those keys, and checks the issuer, audience and
// token_use claims for you. Hand-rolling this is where the classic JWT
// vulnerabilities come from.
// -----------------------------------------------------------------

const config = require('../config');
const db = require('./db');
const logger = require('../lib/logger');
const { unauthorized, notSupported } = require('../lib/httpError');

// TODO (Cognito): const { CognitoJwtVerifier } = require('aws-jwt-verify');
// let verifier = null;

// Cognito owns passwords, so every password feature is refused.
// routes/auth.routes.js reads this and returns 501 rather than
// pretending to work.
const capabilities = { passwords: false, selfRegister: false };

function notImplemented(name) {
  return new Error(
    `auth.cognito.${name}() is not implemented yet. ` +
      'Fill it in, or run with AUTH_MODE=local.'
  );
}

// -----------------------------------------------------------------
// TODO (Cognito): build the verifier once, at startup.
//
//   verifier = CognitoJwtVerifier.create({
//     userPoolId: config.cognito.userPoolId,
//     clientId: config.cognito.clientId,
//     tokenUse: 'id',     // or 'access' - see the note below
//   });
//
// Creating it here (not per request) matters: the library caches the
// signing keys, so verifying a token needs no network call. Building it
// inside verifyToken would fetch the JWKS on every single request.
//
// 'id' vs 'access' token: the ID token carries email and name, which is
// what we want for provisioning the user row. The access token is for
// authorising API calls and carries scopes instead. If you switch to
// 'access', expect email to be missing and fetch it separately.
//
// Also fail fast here if userPoolId or clientId is empty.
// -----------------------------------------------------------------
async function init() {
  throw notImplemented('init');
}

// --- passwords: all refused in this mode ---------------------------

async function hashPassword() {
  throw notSupported('Passwords are managed by Cognito in AUTH_MODE=cognito.');
}

async function verifyPassword() {
  throw notSupported('Passwords are managed by Cognito in AUTH_MODE=cognito.');
}

// TODO (Cognito): nothing to implement. We never issue tokens in this
// mode - Cognito does. The frontend obtains one and sends it to us.
//
// If you want the API to log users in directly (so the frontend keeps
// calling /api/auth/login), that is a different design: you would call
// the InitiateAuth API with the USER_PASSWORD_AUTH flow and return
// Cognito's tokens. It works, but it means your server handles
// passwords again, which is most of what Cognito is for.
async function issueToken() {
  throw notSupported('Tokens are issued by Cognito in AUTH_MODE=cognito.');
}

// -----------------------------------------------------------------
// TODO (Cognito): verify the token and return its claims.
//
//   try {
//     return await verifier.verify(token);
//   } catch (error) {
//     logger.debug('Cognito token rejected', { reason: error.message });
//     throw unauthorized('Your session is not valid. Please log in again.');
//   }
//
// Always convert the library's error into our own 401 with a flat
// message. "Token expired" versus "signature invalid" is a detail for
// the logs, not for whoever is holding the token.
// -----------------------------------------------------------------
async function verifyToken(token) {
  throw notImplemented('verifyToken');
}

// -----------------------------------------------------------------
// TODO (Cognito): turn verified claims into a MediBook user row.
//
// This is the function that actually matters in this file. Steps:
//
// 1. Map the Cognito groups to one of our roles.
//
//      const groups = claims['cognito:groups'] || [];
//      const role = groups
//        .map((g) => config.cognito.groupRoleMap[g])
//        .find(Boolean);
//
//    If no group maps to a role, REFUSE. Do not fall back to 'patient':
//    a misconfigured group would then silently grant access. Throw
//    unauthorized('Your account has no role assigned.').
//
//    If someone is in several mapped groups, decide deliberately which
//    wins (most privileged, or first match) and comment the choice.
//
// 2. Find our user row by the Cognito subject id:
//
//      let user = await db.users.findByCognitoSub(claims.sub);
//
//    Match on `sub`, never on email. An email address can be changed
//    and reassigned; `sub` is permanent for that Cognito user.
//
// 3. If there is no row, create one (just-in-time provisioning):
//
//      user = await db.users.create({
//        role,
//        name: claims.name || claims.email,
//        email: claims.email,
//        phone: claims.phone_number || null,
//        passwordHash: null,          // Cognito holds the password
//        cognitoSub: claims.sub,
//        isActive: true,
//      });
//
//    Watch for the case where a row already exists with that email but
//    no cognitoSub - for example data from the local-mode seed. Decide
//    whether to link it (set cognitoSub) or refuse. Linking by email is
//    convenient and is also how account-takeover bugs happen, so only
//    do it if the email is verified (claims.email_verified === true).
//
// 4. Enforce the same two rules auth.local.js does, on EVERY request:
//
//      if (!user.isActive) throw unauthorized('This account has been deactivated.');
//
//      if (user.role !== role) {
//        // Cognito is the source of truth for roles, so update our copy
//        // rather than refusing. This is the opposite of local mode,
//        // where our table is authoritative.
//        user = await db.users.update(user.id, { role });
//      }
//
// 5. Return the user.
// -----------------------------------------------------------------
async function resolveUser(claims) {
  throw notImplemented('resolveUser');
}

// --- password reset: Cognito's job ---------------------------------
// Cognito has its own forgot-password flow (ForgotPassword /
// ConfirmForgotPassword, or the Hosted UI). These exist so the shape
// matches auth.local.js; they are never reached, because
// routes/auth.routes.js refuses those endpoints when
// capabilities.passwords is false.

function createResetToken() {
  throw notSupported('Password reset is handled by Cognito in AUTH_MODE=cognito.');
}

function hashResetToken() {
  throw notSupported('Password reset is handled by Cognito in AUTH_MODE=cognito.');
}

// -----------------------------------------------------------------
// TODO (Cognito), OPTIONAL: creating doctor accounts.
//
// routes/admin.routes.js POST /api/admin/doctors currently refuses in
// this mode, because it would write a password hash. To make it work,
// add a function here that calls the Cognito admin API:
//
//   AdminCreateUserCommand   - creates the user, Cognito emails them a
//                              temporary password
//   AdminAddUserToGroupCommand - puts them in the 'doctors' group,
//                              which is what gives them the role
//
// Needs @aws-sdk/client-cognito-identity-provider and an IAM policy
// allowing cognito-idp:AdminCreateUser and AdminAddUserToGroup on your
// user pool only.
// -----------------------------------------------------------------

function describe() {
  return {
    mode: 'cognito',
    userPoolId: config.cognito.userPoolId || '(COGNITO_USER_POOL_ID not set)',
    implemented: false,
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
