// adapters/auth.js
// -----------------------------------------------------------------
// ADAPTER SWITCH: who proves a user is who they say they are.
//
//   AUTH_MODE=local   (default) -> email + password, bcryptjs, our own JWT
//   AUTH_MODE=cognito           -> verify JWTs issued by Amazon Cognito
//
// -----------------------------------------------------------------
// THE INTERFACE (auth.local.js and auth.cognito.js both implement it)
// -----------------------------------------------------------------
//
//   init()                 -> Promise<void>
//   capabilities           -> { passwords: boolean, selfRegister: boolean }
//   hashPassword(plain)    -> Promise<string>
//   verifyPassword(plain, hash) -> Promise<boolean>
//   issueToken(user)       -> Promise<{ token, expiresAt }>
//   verifyToken(token)     -> Promise<claims>    throws if invalid
//   resolveUser(claims)    -> Promise<user|null> claims -> a MediBook user
//   describe()             -> { mode, ... } for /health
//
// -----------------------------------------------------------------
// WHY resolveUser() is a separate step from verifyToken()
// -----------------------------------------------------------------
// Verifying a token proves the token is genuine. It does NOT prove the
// account is still allowed in: the user may have been deactivated, or
// had their role changed, in the two hours since the token was issued.
// resolveUser() goes back to the database every request and is the
// place that refuses a deactivated account.
//
// It is also where the two modes genuinely differ. In local mode the
// role comes from our own users table. In Cognito mode the role comes
// from the user's Cognito GROUPS, mapped through
// config.cognito.groupRoleMap - because in that world AWS owns the
// identity and we only own the clinical data.
//
// A note on where the token is kept: the frontend stores it in
// localStorage and sends it as "Authorization: Bearer ...". That choice
// means no CSRF risk (the browser never attaches it automatically) but
// it is readable by JavaScript, so a cross-site-scripting bug could
// steal it. The alternative - an httpOnly cookie - flips those two
// risks. localStorage is chosen here because it works unchanged when
// the frontend is a static site on CloudFront calling an API on a
// different domain, which is the deployment we are heading for.
// -----------------------------------------------------------------

const config = require('../config');

const implementation =
  config.modes.auth === 'cognito' ? require('./auth.cognito') : require('./auth.local');

module.exports = implementation;
