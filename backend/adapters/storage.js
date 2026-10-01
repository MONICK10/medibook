// adapters/storage.js
// -----------------------------------------------------------------
// ADAPTER SWITCH: where uploaded files live.
//
//   STORAGE_MODE=local (default) -> backend/uploads/
//   STORAGE_MODE=s3              -> a private S3 bucket
//
// -----------------------------------------------------------------
// THE INTERFACE (storage.local.js and storage.s3.js both implement it)
// -----------------------------------------------------------------
//
//   init()                       -> Promise<void>
//   save({ buffer, originalName, mimeType, ownerId })
//                                -> Promise<{ key, sizeBytes }>
//   createDownloadUrl(key, { filename, mimeType })
//                                -> Promise<{ url, expiresAt }>
//   remove(key)                  -> Promise<boolean>
//   exists(key)                  -> Promise<boolean>
//   describe()                   -> { mode, location }
//
// -----------------------------------------------------------------
// WHY both modes hand back a short-lived URL
// -----------------------------------------------------------------
// The obvious local design is "stream the file through the backend" and
// the obvious S3 design is "give the browser a pre-signed link". Those
// are different enough that the frontend would need two code paths, and
// switching to S3 would mean changing React code - exactly what the
// adapter pattern is supposed to prevent.
//
// So local mode imitates S3: it returns a URL to our own backend
// carrying a signed, expiring token. The frontend always does the same
// two steps - ask the API for a download URL, then open it - and the
// mode is invisible to it.
//
// What this buys us either way: backend/uploads/ is never served as a
// static folder and the bucket is never public, so guessing a file name
// gets you nothing. Permission is checked when the URL is ISSUED, by
// the route, which is the only place that knows who is asking.
// -----------------------------------------------------------------

const config = require('../config');

const implementation =
  config.modes.storage === 's3' ? require('./storage.s3') : require('./storage.local');

module.exports = implementation;
