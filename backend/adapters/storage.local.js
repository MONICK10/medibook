// adapters/storage.local.js
// -----------------------------------------------------------------
// LOCAL implementation of the storage adapter: files in backend/uploads/.
//
// Download links are signed with HMAC-SHA256 and expire, which is a
// deliberate imitation of an S3 pre-signed URL. See adapters/storage.js
// for why. The route GET /api/files/:token (routes/files.routes.js) is
// what verifies the signature and streams the bytes.
// -----------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const logger = require('../lib/logger');

const UPLOAD_DIR = config.paths.uploadDir;

async function init() {
  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
  logger.info('Storage ready', { storageMode: 'local', directory: UPLOAD_DIR });
}

// Build the stored file name ("key"). The same key format is used in S3
// mode so one piece of data means the same thing in both.
//
// Shape: reports/<ownerId>/<date>/<random>.<ext>
//
// WHY a random name rather than the original: two patients both
// uploading "scan.pdf" must not collide, and the original name can
// contain anything at all - "../../server.js", a 400-character name, a
// Windows reserved name like CON. We keep the original in the database
// for display and never let it decide where bytes land.
function buildKey({ originalName, ownerId }) {
  const extension = path.extname(originalName || '').toLowerCase();
  // Allow-list the extension. Anything unexpected becomes .bin.
  const safeExtension = ['.pdf', '.png', '.jpg', '.jpeg'].includes(extension)
    ? extension
    : '.bin';

  const datePart = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const random = crypto.randomBytes(16).toString('hex');

  return `reports/${ownerId}/${datePart}/${random}${safeExtension}`;
}

// Turn a key into a path inside UPLOAD_DIR, refusing anything that
// escapes it. WHY: path traversal is the classic file-storage bug. Even
// though we generate our own keys, a key also arrives from the database
// on download, and defending at the boundary is cheaper than trusting
// every caller forever.
function resolveKeyToPath(key) {
  if (typeof key !== 'string' || !key) {
    throw new Error('A file key is required.');
  }
  // Reject absolute paths, drive letters and parent-directory hops.
  if (key.includes('..') || key.includes('\0') || path.isAbsolute(key) || /^[a-zA-Z]:/.test(key)) {
    throw new Error('Invalid file key.');
  }

  const fullPath = path.resolve(UPLOAD_DIR, key);
  const root = path.resolve(UPLOAD_DIR);

  // The final check: after resolving, is it still under the upload root?
  if (fullPath !== root && !fullPath.startsWith(root + path.sep)) {
    throw new Error('Invalid file key.');
  }

  return fullPath;
}

async function save({ buffer, originalName, mimeType, ownerId }) {
  const key = buildKey({ originalName, ownerId });
  const fullPath = resolveKeyToPath(key);

  await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.promises.writeFile(fullPath, buffer);

  logger.info('File saved', {
    storageMode: 'local',
    key,
    sizeBytes: buffer.length,
    mimeType,
  });

  return { key, sizeBytes: buffer.length };
}

// --- signed download links -----------------------------------------

function sign(payloadBase64) {
  return crypto
    .createHmac('sha256', config.files.signingSecret)
    .update(payloadBase64)
    .digest('base64url');
}

async function createDownloadUrl(key, { filename, mimeType, ttlSeconds } = {}) {
  // Make sure the key is sane before we sign anything for it.
  resolveKeyToPath(key);

  const ttl = ttlSeconds || config.files.downloadUrlTtlSeconds;
  const expiresAt = new Date(Date.now() + ttl * 1000);

  const payload = {
    k: key,
    f: filename || path.basename(key),
    m: mimeType || 'application/octet-stream',
    e: Math.floor(expiresAt.getTime() / 1000), // expiry, seconds since epoch
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const token = `${payloadBase64}.${sign(payloadBase64)}`;

  return {
    url: `${config.apiPublicUrl}/api/files/${token}`,
    expiresAt: expiresAt.toISOString(),
  };
}

// Verify a token from the download route. Returns the payload, or null.
// Called by routes/files.routes.js, which exists only to serve these.
function verifyDownloadToken(token) {
  if (typeof token !== 'string') return null;

  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;

  const payloadBase64 = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = sign(payloadBase64);

  // Compare in constant time. WHY: a plain === leaks, through timing, how
  // many leading characters of a guessed signature were right, which is
  // enough to forge one byte at a time.
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (!payload || typeof payload.k !== 'string') return null;
  if (typeof payload.e !== 'number' || payload.e * 1000 < Date.now()) return null; // expired

  return { key: payload.k, filename: payload.f, mimeType: payload.m };
}

// Open a read stream for the download route.
function createReadStream(key) {
  return fs.createReadStream(resolveKeyToPath(key));
}

async function exists(key) {
  try {
    await fs.promises.access(resolveKeyToPath(key), fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function stat(key) {
  try {
    const info = await fs.promises.stat(resolveKeyToPath(key));
    return { sizeBytes: info.size };
  } catch {
    return null;
  }
}

async function remove(key) {
  try {
    await fs.promises.unlink(resolveKeyToPath(key));
    logger.info('File deleted', { storageMode: 'local', key });
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function describe() {
  return { mode: 'local', location: UPLOAD_DIR };
}

module.exports = {
  init,
  save,
  createDownloadUrl,
  verifyDownloadToken,
  createReadStream,
  exists,
  stat,
  remove,
  describe,
  // Exported for the tests in scripts/check.js.
  _resolveKeyToPath: resolveKeyToPath,
};
