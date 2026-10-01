// routes/files.routes.js
// -----------------------------------------------------------------
//   GET /api/files/:token   serve a file against a signed link
//
// This route exists only for STORAGE_MODE=local. In S3 mode the signed
// link points at S3 and this is never called.
//
// WHY there is no requireAuth here:
// the token IS the authorisation. It was issued by
// /api/reports/:id/download-url, which checked who was asking, and it
// carries a signature we verify plus an expiry. This is how an S3
// pre-signed URL works too - and it is why a browser can simply follow
// the link, or an <img> tag can load it, without attaching a header.
//
// The trade-off is honest: for the few minutes it is alive, anyone
// holding that link can fetch that one file. That is why the expiry is
// short, the link is per-file rather than per-folder, and the
// permission check and the audit entry happen at issue time.
// -----------------------------------------------------------------

const express = require('express');
const config = require('../config');
const storage = require('../adapters/storage');
const { notFound, badRequest } = require('../lib/httpError');

const router = express.Router();

router.get('/:token', async (req, res, next) => {
  try {
    // Only the local adapter serves bytes through the API.
    if (typeof storage.verifyDownloadToken !== 'function') {
      throw notFound('That file');
    }

    const payload = storage.verifyDownloadToken(req.params.token);

    // One message for a forged signature, a tampered payload and an
    // expired link alike. Telling them apart would help someone work
    // out how the signing works.
    if (!payload) {
      throw badRequest('That download link is invalid or has expired.');
    }

    if (!(await storage.exists(payload.key))) {
      // The database row says there is a file but the bytes are gone.
      req.log.error('A report file is missing from storage', { key: payload.key });
      throw notFound('That file');
    }

    // Send the exact type we recorded at upload, never a type guessed
    // from the file's contents. Together with nosniff (set by helmet)
    // this stops a file that is secretly HTML from being rendered as a
    // page in our origin.
    res.setHeader('Content-Type', payload.mimeType || 'application/octet-stream');

    // attachment = download it, do not display it in the page.
    // WHY: it is the safest default for a file somebody else uploaded.
    // Switch to 'inline' per MIME type if you want PDFs to preview in
    // the browser, but do it knowing you are choosing to render a
    // stranger's file.
    const safeName = String(payload.filename || 'report')
      .replace(/[^a-zA-Z0-9._ -]/g, '_')
      .slice(0, 100);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);

    // Never let a shared cache or a proxy keep a medical file.
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');

    const info = await storage.stat(payload.key);
    if (info) res.setHeader('Content-Length', info.sizeBytes);

    const stream = storage.createReadStream(payload.key);

    // If the file read fails midway the headers are already sent, so
    // there is nothing useful to say to the client - log it and close.
    stream.on('error', (error) => {
      req.log.error('Failed while streaming a file', { error: error.message });
      res.destroy();
    });

    stream.pipe(res);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
