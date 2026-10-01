// lib/logger.js
// -----------------------------------------------------------------
// Logs one JSON object per line to stdout.
//
// WHY JSON instead of friendly sentences:
// CloudWatch Logs Insights (and almost every other log tool) can filter
// and chart JSON fields directly. "level":"error" is searchable;
// "Something went wrong!" is not. stdout specifically, because on EC2,
// ECS and Lambda the platform collects stdout for you - an app that
// writes its own log files has to have those files shipped somehow.
// -----------------------------------------------------------------

const config = require('../config');

const LEVELS = { debug: 20, info: 30, warn: 40, error: 50 };
const threshold = LEVELS[config.logLevel] || LEVELS.info;

// Field names whose values must never reach the logs.
// WHY: logs get copied into tickets, shared in chat, and kept for years.
// A password or token in a log line is a breach with a long tail.
const SECRET_KEYS = [
  'password',
  'newpassword',
  'currentpassword',
  'confirmpassword',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'resettoken',
  'authorization',
  'secret',
  'jwtsecret',
  'apikey',
];

function redact(value, depth = 0) {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  const out = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = SECRET_KEYS.includes(key.toLowerCase())
      ? '[redacted]'
      : redact(item, depth + 1);
  }
  return out;
}

function write(level, message, fields) {
  if (LEVELS[level] < threshold) return;

  const line = {
    time: new Date().toISOString(),
    level,
    message,
    ...redact(fields || {}),
  };

  // JSON.stringify can throw on circular objects; never let logging crash
  // the request it is describing.
  let text;
  try {
    text = JSON.stringify(line);
  } catch {
    text = JSON.stringify({ time: line.time, level, message, logError: 'unserializable fields' });
  }

  process.stdout.write(text + '\n');
}

const logger = {
  debug: (message, fields) => write('debug', message, fields),
  info: (message, fields) => write('info', message, fields),
  warn: (message, fields) => write('warn', message, fields),
  error: (message, fields) => write('error', message, fields),

  // Returns a logger that adds the same fields to every line, so request
  // handlers do not have to pass requestId around by hand.
  child(baseFields) {
    return {
      debug: (m, f) => write('debug', m, { ...baseFields, ...f }),
      info: (m, f) => write('info', m, { ...baseFields, ...f }),
      warn: (m, f) => write('warn', m, { ...baseFields, ...f }),
      error: (m, f) => write('error', m, { ...baseFields, ...f }),
      child: (more) => logger.child({ ...baseFields, ...more }),
    };
  },
};

module.exports = logger;
