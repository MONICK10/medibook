// scripts/init-env.js
// -----------------------------------------------------------------
// Creates backend/.env from .env.example, with freshly generated
// random secrets.  Run with: npm run init-env
//
// WHY this script exists: the rule is "never hardcode secrets", and a
// .env.example containing a real JWT secret would break it the moment
// it was committed. But a student should not have to invent a random
// 48-byte string by hand either. So the example file ships with the
// secret lines empty, and this script fills them in locally with
// crypto.randomBytes - which is also what you would do on a server.
//
// It never overwrites an existing .env.
// -----------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BACKEND_DIR = path.join(__dirname, '..');
const ENV_PATH = path.join(BACKEND_DIR, '.env');
const EXAMPLE_PATH = path.join(BACKEND_DIR, '.env.example');

// Any variable named here gets a generated value instead of the
// example's placeholder.
const GENERATED = ['JWT_SECRET', 'FILE_SIGNING_SECRET'];

function generateSecret() {
  // 48 random bytes, base64url encoded: ~64 characters, no quoting
  // problems in a .env file.
  return crypto.randomBytes(48).toString('base64url');
}

function main() {
  if (!fs.existsSync(EXAMPLE_PATH)) {
    console.error('Could not find backend/.env.example - nothing to copy from.');
    process.exit(1);
  }

  if (fs.existsSync(ENV_PATH)) {
    console.log('backend/.env already exists. Leaving it alone.');
    console.log('Delete it first if you want a fresh one with new secrets.');
    return;
  }

  const lines = fs.readFileSync(EXAMPLE_PATH, 'utf8').split(/\r?\n/);

  const filled = lines.map((line) => {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (!match) return line; // comment or blank line
    if (!GENERATED.includes(match[1])) return line;
    return `${match[1]}=${generateSecret()}`;
  });

  fs.writeFileSync(ENV_PATH, filled.join('\n'), 'utf8');

  console.log('Created backend/.env with new random secrets.');
  console.log(`Generated: ${GENERATED.join(', ')}`);
  console.log('');
  console.log('This file is in .gitignore, so it will not be committed.');
}

main();
