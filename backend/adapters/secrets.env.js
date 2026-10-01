// adapters/secrets.env.js
// -----------------------------------------------------------------
// LOCAL implementation of the secrets adapter: plain environment
// variables, which dotenv has already loaded from backend/.env.
//
// .env is listed in .gitignore, so the values stay on your machine.
// .env.example holds the NAMES with empty or dummy values, so a new
// student knows what to fill in without ever seeing a real secret.
// -----------------------------------------------------------------

const config = require('../config');
const logger = require('../lib/logger');

async function init() {
  logger.debug('Secrets adapter ready', { mode: 'env' });
}

async function get(key) {
  const value = process.env[key];
  // Empty string is treated as "not set", because a blank line in .env
  // (PGPASSWORD=) means the student has not filled it in yet.
  return value === undefined || value === '' ? null : value;
}

function describe() {
  return { mode: 'env', source: 'process.env (loaded from backend/.env)' };
}

module.exports = { init, get, describe };
