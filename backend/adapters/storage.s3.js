// adapters/storage.s3.js
// -----------------------------------------------------------------
// AWS VERSION OF THE STORAGE ADAPTER - NOT IMPLEMENTED.
//
//   AWS service: Amazon S3 (a PRIVATE bucket)
//   npm packages: @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner
//                 -> npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
//   Turn on with: STORAGE_MODE=s3
//
// Compare with storage.local.js as you go: it already does the same
// job, including the signed expiring links, so the shapes match.
//
// BUCKET SETUP, BEFORE ANY CODE
// * Block all public access (the account-level and bucket-level
//   settings). Downloads work through pre-signed URLs, so the bucket
//   never needs to be readable by anonymous users. A public bucket of
//   medical reports is the headline you are avoiding.
// * Turn on default encryption (SSE-S3 is one click; SSE-KMS if you
//   need an audit trail of key use).
// * Turn on versioning if you want protection against accidental
//   overwrite or deletion.
// * Give the EC2 instance role s3:PutObject, s3:GetObject and
//   s3:DeleteObject on arn:aws:s3:::YOUR_BUCKET/reports/* and nothing
//   more. Not s3:* and not the whole bucket.
//
// NO ACCESS KEYS IN THIS FILE. The SDK finds credentials by itself
// from the instance's IAM role (the "default credential chain"). If you
// find yourself pasting a key, stop: that key ends up in git, and it
// does not expire.
// -----------------------------------------------------------------

const path = require('path');
const crypto = require('crypto');
const config = require('../config');

// TODO (S3): const { S3Client, PutObjectCommand, GetObjectCommand,
//                    DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
// TODO (S3): const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
// let client = null;

function notImplemented(name) {
  return new Error(
    `storage.s3.${name}() is not implemented yet. ` +
      'Fill it in, or run with STORAGE_MODE=local.'
  );
}

// -----------------------------------------------------------------
// TODO (S3): create the client and check the bucket is reachable.
//
//   client = new S3Client({ region: config.s3.region });
//
// Then fail fast if config.s3.bucket is empty - a missing bucket name
// should stop the server at startup, not surface as a confusing error
// the first time a patient uploads a file.
//
// Optionally send a HeadBucketCommand so a wrong name or a missing IAM
// permission is caught now rather than later.
// -----------------------------------------------------------------
async function init() {
  throw notImplemented('init');
}

// Builds the object key. Copied from storage.local.js deliberately: the
// same key format in both modes means the fileKey already in your
// database keeps its meaning if you migrate files across.
//
// Shape: reports/<ownerId>/<date>/<random>.<ext>
//
// The random name matters as much in S3 as on disk: never let the
// user's own file name decide the key. It can contain anything, and
// "../" in a key is a valid S3 key that will confuse every tool you own.
function buildKey({ originalName, ownerId }) {
  const extension = path.extname(originalName || '').toLowerCase();
  const safeExtension = ['.pdf', '.png', '.jpg', '.jpeg'].includes(extension)
    ? extension
    : '.bin';

  const datePart = new Date().toISOString().slice(0, 10);
  const random = crypto.randomBytes(16).toString('hex');

  // config.s3.keyPrefix defaults to 'reports/'.
  return `${config.s3.keyPrefix}${ownerId}/${datePart}/${random}${safeExtension}`;
}

// -----------------------------------------------------------------
// TODO (S3): upload the file to the reports bucket.
//
//   const key = buildKey({ originalName, ownerId });
//   await client.send(new PutObjectCommand({
//     Bucket: config.s3.bucket,
//     Key: key,
//     Body: buffer,
//     ContentType: mimeType,
//     // Store the type we validated, so the download serves the same
//     // thing. Never let S3 guess it later.
//     ServerSideEncryption: 'AES256',
//     Metadata: { ownerId },   // handy when debugging; not a permission
//   }));
//   return { key, sizeBytes: buffer.length };
//
// Note what is NOT set: ACL. Do not pass ACL: 'public-read'. Modern
// buckets reject it anyway, and it is the single mistake that turns
// this into a data breach.
// -----------------------------------------------------------------
async function save({ buffer, originalName, mimeType, ownerId }) {
  throw notImplemented('save');
}

// -----------------------------------------------------------------
// TODO (S3): return a pre-signed GET URL that expires.
//
//   const command = new GetObjectCommand({
//     Bucket: config.s3.bucket,
//     Key: key,
//     // Make the browser download rather than render it, and send the
//     // patient's original file name back:
//     ResponseContentDisposition: `attachment; filename="${safeName}"`,
//     ResponseContentType: mimeType,
//   });
//   const url = await getSignedUrl(client, command, {
//     expiresIn: ttlSeconds || config.s3.signedUrlTtlSeconds,  // 300 = 5 min
//   });
//   return { url, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() };
//
// WHY the expiry is short: a pre-signed URL is a bearer token in a
// query string. It will end up in browser history, in a chat message,
// in a server log somewhere. Five minutes is long enough to download a
// file and short enough that a leaked link is already dead.
//
// The permission check does NOT happen here - it happens in
// routes/reports.routes.js before this is called. By the time a URL
// exists, access has already been granted and audited.
// -----------------------------------------------------------------
async function createDownloadUrl(key, { filename, mimeType, ttlSeconds } = {}) {
  throw notImplemented('createDownloadUrl');
}

// -----------------------------------------------------------------
// TODO (S3): HeadObjectCommand, true if it exists.
//
// A 404 or NotFound error means "false", not "throw". Anything else
// (403, for instance, which usually means the IAM policy is wrong)
// should throw, because silently returning false would hide a
// misconfiguration as "file missing".
// -----------------------------------------------------------------
async function exists(key) {
  throw notImplemented('exists');
}

// TODO (S3): HeadObjectCommand -> { sizeBytes: response.ContentLength }
async function stat(key) {
  throw notImplemented('stat');
}

// TODO (S3): DeleteObjectCommand.
// Note S3 returns success when deleting a key that was never there, so
// there is no "not found" to report.
async function remove(key) {
  throw notImplemented('remove');
}

function describe() {
  return {
    mode: 's3',
    location: config.s3.bucket ? `s3://${config.s3.bucket}/${config.s3.keyPrefix}` : '(S3_BUCKET not set)',
    implemented: false,
  };
}

// NOTE: storage.local.js also exports verifyDownloadToken and
// createReadStream, which serve files through our own API. S3 mode does
// not need them, because the browser fetches from S3 directly - and
// routes/files.routes.js checks whether verifyDownloadToken exists
// before offering that route. Leaving them out here is deliberate.

module.exports = {
  init,
  save,
  createDownloadUrl,
  exists,
  stat,
  remove,
  describe,
};
