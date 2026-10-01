// adapters/secrets.aws.js
// -----------------------------------------------------------------
// AWS VERSION OF THE SECRETS ADAPTER - NOT IMPLEMENTED.
//
//   AWS service: AWS Secrets Manager
//   npm package: @aws-sdk/client-secrets-manager
//                -> npm install @aws-sdk/client-secrets-manager
//   Turn on with: SECRETS_MODE=aws
//
// WHAT THIS IS FOR
// A database password in .env is fine on your laptop and wrong on a
// server: it ends up in backups, in screenshots, in git history, and
// in the output of anyone who can read the filesystem. In AWS the
// password lives in Secrets Manager, is fetched at boot using the
// instance's IAM role, and can be rotated without redeploying.
//
// Both modes look identical to the caller: await secrets.get('PGPASSWORD').
// db.postgres.js already calls it that way.
//
// HOW TO STORE IT
// Create ONE secret holding a JSON object, and put its name or ARN in
// AWS_SECRET_ID:
//
//   { "PGPASSWORD": "...", "JWT_SECRET": "...", "FILE_SIGNING_SECRET": "..." }
//
// One secret rather than one per value because Secrets Manager charges
// per secret and per API call, and because fetching once at startup is
// simpler than several round trips.
//
// IAM: the instance role needs secretsmanager:GetSecretValue on that
// one secret's ARN. Not on "*".
//
// CHEAPER ALTERNATIVE worth knowing about: SSM Parameter Store with
// SecureString parameters does much the same job and the standard tier
// is free. Secrets Manager adds built-in rotation. For learning, either
// is fine - Parameter Store uses @aws-sdk/client-ssm and GetParameter
// with WithDecryption: true.
// -----------------------------------------------------------------

const config = require('../config');
const logger = require('../lib/logger');

// TODO (Secrets Manager):
// const { SecretsManagerClient, GetSecretValueCommand } =
//   require('@aws-sdk/client-secrets-manager');

// The fetched secret, cached in memory.
//
// WHY cache: this is called while opening the database pool, and
// Secrets Manager is a paid API call with real latency. Fetch once at
// startup, keep it in memory, never write it to disk.
//
// The cost of caching is that a rotated secret is not picked up until
// the process restarts. For a teaching app that is the right trade;
// if you implement rotation, re-fetch when a connection fails
// authentication rather than polling.
// let cache = null;

function notImplemented(name) {
  return new Error(
    `secrets.aws.${name}() is not implemented yet. ` +
      'Fill it in, or run with SECRETS_MODE=env.'
  );
}

// -----------------------------------------------------------------
// TODO (Secrets Manager): fetch the secret once and cache it.
//
//   const client = new SecretsManagerClient({ region: config.awsSecrets.region });
//   const response = await client.send(new GetSecretValueCommand({
//     SecretId: config.awsSecrets.secretId,
//   }));
//   cache = JSON.parse(response.SecretString);
//
// Fail fast and loudly: if this throws, the app cannot get its database
// password, so there is no point starting. Let the error reach
// server.js, which logs it and exits.
//
// Do NOT log the parsed object, or any value from it, at any log level.
// Log the KEYS if you want to confirm what was loaded:
//   logger.info('Secrets loaded', { keys: Object.keys(cache) });
//
// Also handle response.SecretBinary: a secret can be stored as binary
// rather than a string. For this app it will always be a string, but a
// clear error beats "cannot read property of undefined".
// -----------------------------------------------------------------
async function init() {
  throw notImplemented('init');
}

// -----------------------------------------------------------------
// TODO (Secrets Manager): return one value from the cached secret.
//
//   if (!cache) throw new Error('secrets.init() was not called');
//   const value = cache[key];
//   return value === undefined || value === '' ? null : value;
//
// Return null for a missing key rather than throwing, matching
// secrets.env.js, so a caller can treat "not set" as a normal case.
// -----------------------------------------------------------------
async function get(key) {
  throw notImplemented('get');
}

function describe() {
  return {
    mode: 'aws',
    source: config.awsSecrets.secretId
      ? `Secrets Manager: ${config.awsSecrets.secretId}`
      : '(AWS_SECRET_ID not set)',
    implemented: false,
  };
}

module.exports = { init, get, describe };
