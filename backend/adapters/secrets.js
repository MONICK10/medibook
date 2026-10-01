// adapters/secrets.js
// -----------------------------------------------------------------
// ADAPTER SWITCH: where secret values come from.
//
//   SECRETS_MODE=env  (default) -> read process.env, filled from .env
//   SECRETS_MODE=aws            -> AWS Secrets Manager
//
// WHY an adapter for something as simple as reading a value:
// a database password in .env is fine on a laptop and wrong on a
// server - it ends up in backups, screenshots and git history. In AWS
// the password lives in Secrets Manager, is fetched at boot with the
// instance's IAM role, and can be rotated without redeploying. Both
// look identical to the caller: `await secrets.get('PGPASSWORD')`.
//
// INTERFACE every implementation must provide:
//   init()            -> Promise<void>   load/prime anything needed
//   get(key)          -> Promise<string|null>
//   describe()        -> { mode, source } for logs and /health
// -----------------------------------------------------------------

const config = require('../config');

// Loaded with require() only for the active mode. WHY: the AWS version
// pulls in the AWS SDK, and we do not want local mode to need those
// packages installed at all.
const implementation =
  config.modes.secrets === 'aws'
    ? require('./secrets.aws')
    : require('./secrets.env');

module.exports = implementation;
