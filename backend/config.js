// config.js
// -----------------------------------------------------------------
// Reads environment variables ONCE and turns them into a plain object.
//
// WHY a single config file:
// The rest of the code never touches process.env. That means you can
// read this one file to learn every switch the app has, and a typo in
// an env name fails here at startup instead of deep inside a route at
// 2am. It also keeps the adapter choice (local vs AWS) in one place.
// -----------------------------------------------------------------

const path = require('path');
const crypto = require('crypto');

// Load backend/.env into process.env (if the file exists).
require('dotenv').config({ path: path.join(__dirname, '.env') });

const env = process.env.NODE_ENV || 'development';
const isProduction = env === 'production';

// --- small helpers -------------------------------------------------

// Pick one value out of a fixed list of allowed values.
// WHY: a typo like STORAGE_MODE=S3x should stop the server now, with a
// clear message, rather than silently falling back to local storage and
// writing patient files to the wrong place.
function readMode(name, allowed, fallback) {
  const value = (process.env[name] || fallback).trim().toLowerCase();
  if (!allowed.includes(value)) {
    throw new Error(
      `Invalid ${name}="${value}". Allowed values: ${allowed.join(', ')}`
    );
  }
  return value;
}

function readInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid ${name}="${raw}". Expected a whole number.`);
  }
  return value;
}

function readBool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

function readList(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

// --- which implementation does each adapter use? -------------------

const modes = {
  db: readMode('DB_MODE', ['local', 'postgres'], 'local'),
  storage: readMode('STORAGE_MODE', ['local', 's3'], 'local'),
  auth: readMode('AUTH_MODE', ['local', 'cognito'], 'local'),
  mail: readMode('MAIL_MODE', ['console', 'ses'], 'console'),
  secrets: readMode('SECRETS_MODE', ['env', 'aws'], 'env'),
};

// --- signing secrets -----------------------------------------------
// In production a missing secret is a hard error: we will not start.
// In development we generate a throwaway secret so a student can clone
// and run with no setup. The cost is that restarting the server logs
// everyone out and invalidates open download links, so we say so loudly
// instead of hiding it.
const ephemeralSecrets = [];

function readSigningSecret(name, { required }) {
  let value = process.env[name] || '';

  if (!value) {
    if (isProduction && required) {
      throw new Error(
        `${name} is required when NODE_ENV=production. Run "npm run init-env" or set it in your environment.`
      );
    }
    value = crypto.randomBytes(48).toString('base64url');
    ephemeralSecrets.push(name);
    return value;
  }

  if (isProduction && value.length < 32) {
    throw new Error(`${name} must be at least 32 characters in production.`);
  }
  return value;
}

// Only needed when we issue our own tokens. In Cognito mode AWS signs them.
const jwtSecret = readSigningSecret('JWT_SECRET', { required: modes.auth === 'local' });

// Signs short-lived file download links in local storage mode, which is
// how we avoid ever serving backend/uploads/ as a public folder.
// WHY a separate secret from JWT_SECRET: different lifetime and blast
// radius. Rotating file links should not log every user out, and in
// Cognito mode there is no JWT_SECRET to borrow.
const fileSigningSecret = readSigningSecret('FILE_SIGNING_SECRET', {
  required: modes.storage === 'local',
});

// --- the config object ---------------------------------------------

const config = {
  env,
  isProduction,
  port: readInt('PORT', 3000),
  logLevel: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),

  // Express needs to know it is behind a proxy so that req.ip is the real
  // client IP and not the load balancer's. Rate limiting depends on this.
  // WHY off by default: trusting a proxy that is not there lets a client
  // spoof X-Forwarded-For and dodge the rate limiter. Turn it on only
  // when you actually put an ALB or CloudFront in front.
  trustProxy: readBool('TRUST_PROXY', false),

  // CORS is restricted to these origins. The frontend dev server is the
  // default. Add the CloudFront domain here when you deploy.
  allowedOrigins: readList('FRONTEND_URL', ['http://localhost:5173']),

  // How the browser reaches this API. Used to build absolute download
  // links in local storage mode. Behind an ALB this is the public name,
  // which is why it cannot be worked out from req.headers reliably.
  apiPublicUrl: (process.env.API_PUBLIC_URL || `http://localhost:${readInt('PORT', 3000)}`)
    .replace(/\/+$/, ''),

  modes,

  paths: {
    dataDir: process.env.DATA_DIR
      ? path.resolve(process.env.DATA_DIR)
      : path.join(__dirname, 'data'),
    uploadDir: process.env.UPLOAD_DIR
      ? path.resolve(process.env.UPLOAD_DIR)
      : path.join(__dirname, 'uploads'),
  },

  // Names of secrets that were generated on the fly this boot. server.js
  // warns about these so nobody mistakes a dev default for a real secret.
  ephemeralSecrets,

  auth: {
    jwtSecret,
    // Short-lived tokens limit the damage if one leaks.
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
    jwtIssuer: process.env.JWT_ISSUER || 'medibook',
    // 10 rounds is the usual balance of safety and speed. bcryptjs is pure
    // JavaScript (slower than native bcrypt) so we do not raise this.
    bcryptRounds: readInt('BCRYPT_ROUNDS', 10),
    passwordResetTtlMinutes: readInt('PASSWORD_RESET_TTL_MINUTES', 30),
  },

  upload: {
    maxBytes: readInt('UPLOAD_MAX_BYTES', 5 * 1024 * 1024), // 5 MB
    allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg'],
  },

  files: {
    signingSecret: fileSigningSecret,
    // Download links expire fast, in both local and S3 mode, so a link
    // copied out of a browser history or a chat message is already dead.
    downloadUrlTtlSeconds: readInt('FILE_URL_TTL_SECONDS', 300), // 5 min
  },

  booking: {
    // How many days of slots a patient can see and book.
    daysAhead: readInt('BOOKING_DAYS_AHEAD', 7),
    // Cancel or reschedule is blocked inside this window before the slot.
    cancelCutoffMinutes: readInt('BOOKING_CANCEL_CUTOFF_MINUTES', 120),
  },

  rateLimit: {
    // Login: a handful of tries per IP per 15 minutes.
    loginWindowMinutes: readInt('RATE_LIMIT_LOGIN_WINDOW_MINUTES', 15),
    loginMaxAttempts: readInt('RATE_LIMIT_LOGIN_MAX', 10),
    // Forgot password is stricter: it sends mail, so it is a spam vector.
    forgotWindowMinutes: readInt('RATE_LIMIT_FORGOT_WINDOW_MINUTES', 60),
    forgotMaxAttempts: readInt('RATE_LIMIT_FORGOT_MAX', 5),
    // A loose ceiling on everything else.
    globalWindowMinutes: readInt('RATE_LIMIT_GLOBAL_WINDOW_MINUTES', 15),
    globalMaxRequests: readInt('RATE_LIMIT_GLOBAL_MAX', 1000),
  },

  mail: {
    from: process.env.MAIL_FROM || 'MediBook <no-reply@medibook.local>',
    sesRegion: process.env.SES_REGION || process.env.AWS_REGION || '',
  },

  // --- AWS-mode settings (unused while the modes above are local) ---

  postgres: {
    // A full connection string is the simplest option (and what RDS gives
    // you). The separate PG* values are the fallback.
    url: process.env.DATABASE_URL || '',
    host: process.env.PGHOST || 'localhost',
    port: readInt('PGPORT', 5432),
    database: process.env.PGDATABASE || 'medibook',
    user: process.env.PGUSER || 'medibook',
    // The password is fetched through the secrets adapter, not read here,
    // so that AWS mode can pull it from Secrets Manager instead of .env.
    passwordSecretKey: process.env.PGPASSWORD_SECRET_KEY || 'PGPASSWORD',
    ssl: readBool('PGSSL', false),
    maxPoolSize: readInt('PGPOOL_MAX', 10),
  },

  s3: {
    bucket: process.env.S3_BUCKET || '',
    region: process.env.S3_REGION || process.env.AWS_REGION || '',
    keyPrefix: process.env.S3_KEY_PREFIX || 'reports/',
    // Pre-signed download links expire fast. A medical report link that
    // works for a week is a leak waiting to happen.
    signedUrlTtlSeconds: readInt('S3_SIGNED_URL_TTL_SECONDS', 300), // 5 min
  },

  cognito: {
    region: process.env.COGNITO_REGION || process.env.AWS_REGION || '',
    userPoolId: process.env.COGNITO_USER_POOL_ID || '',
    clientId: process.env.COGNITO_CLIENT_ID || '',
    // Cognito groups are mapped to MediBook roles, so group names in the
    // user pool do not have to match our role names.
    groupRoleMap: {
      admins: 'admin',
      doctors: 'doctor',
      patients: 'patient',
      ...safeJson(process.env.COGNITO_GROUP_ROLE_MAP),
    },
  },

  awsSecrets: {
    // One Secrets Manager secret holding a JSON object of key/value pairs.
    secretId: process.env.AWS_SECRET_ID || '',
    region: process.env.AWS_SECRET_REGION || process.env.AWS_REGION || '',
  },
};

// Parse an optional JSON env variable without crashing on bad input.
function safeJson(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw new Error('COGNITO_GROUP_ROLE_MAP must be valid JSON.');
  }
}

module.exports = config;
