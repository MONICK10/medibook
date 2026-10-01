// middleware/upload.js
// -----------------------------------------------------------------
// Multer configuration for report uploads.
//
// WHY memoryStorage and not multer's diskStorage:
// diskStorage would make multer decide where files land, which is the
// storage adapter's job. Holding the file in memory and handing the
// buffer to storage.save() is what lets STORAGE_MODE=s3 work without
// touching this file or the route.
//
// The cost is that the file sits in RAM. That is fine at 5 MB with a
// small number of users, and it is the reason the size limit below is
// a real control and not just a nicety. For large files you would
// switch to the browser uploading straight to S3 with a pre-signed PUT
// and the API never seeing the bytes at all.
// -----------------------------------------------------------------

const multer = require('multer');
const path = require('path');
const config = require('../config');
const { badRequest } = require('../lib/httpError');

// Extensions that match our allowed types. Checked as well as the MIME
// type because a browser can be talked into sending an odd MIME type,
// and because the extension is what ends up in the stored file name.
const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg'];

const reportUpload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: config.upload.maxBytes,
    // Exactly one file, and a tight cap on the other form fields.
    // WHY: without these, a request with 10,000 tiny fields is a cheap
    // way to make the server work hard for nothing.
    files: 1,
    fields: 10,
    fieldNameSize: 100,
    fieldSize: 1024,
  },

  fileFilter(req, file, callback) {
    const mimeOk = config.upload.allowedMimeTypes.includes(file.mimetype);
    const extension = path.extname(file.originalname || '').toLowerCase();
    const extensionOk = ALLOWED_EXTENSIONS.includes(extension);

    if (!mimeOk || !extensionOk) {
      // Rejected here, before any bytes are stored.
      //
      // Worth being honest with students about what this does and does
      // not prove: it checks what the browser CLAIMS the file is. It is
      // not proof of content - a renamed executable with a .pdf
      // extension passes. Real protection comes from never executing
      // uploaded files, serving them with a fixed Content-Type and
      // Content-Disposition: attachment (see routes/files.routes.js),
      // and scanning them if the stakes justify it.
      return callback(
        badRequest('Please upload a PDF, PNG or JPG file.')
      );
    }

    callback(null, true);
  },
}).single('report'); // the form field must be named "report"

// Wrap multer so its errors go through our normal error handler rather
// than crashing the route, and so a missing file is a clear message.
function uploadReportFile(req, res, next) {
  reportUpload(req, res, (error) => {
    if (error) return next(error); // middleware/errors.js translates these
    if (!req.file) return next(badRequest('Please choose a file to upload.'));
    next();
  });
}

module.exports = { uploadReportFile };
