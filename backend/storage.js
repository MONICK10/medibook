// storage.js
// -----------------------------------------------------------------
// This file is the ONLY place that knows WHERE uploaded files go.
//
// Right now we save files to a local folder: backend/uploads/
//
// Later we will replace this file with an AWS S3 version.
// As long as the new file exports a saveFile() function that works
// the same way, server.js will not need to change at all.
// -----------------------------------------------------------------

const fs = require('fs');
const path = require('path');

// The folder where files are saved: backend/uploads
const UPLOAD_FOLDER = path.join(__dirname, 'uploads');

// Create the folder if it does not exist yet.
if (!fs.existsSync(UPLOAD_FOLDER)) {
  fs.mkdirSync(UPLOAD_FOLDER);
}

// Save one uploaded file.
//
// "file" comes from multer. It has:
//   file.originalname -> the name on the user's computer, e.g. "report.pdf"
//   file.buffer       -> the actual file contents (bytes)
//
// Returns the name the file was saved as.
async function saveFile(file) {
  // Build a safe, unique file name, e.g. "1727600000000-report.pdf".
  // - Date.now() makes it unique, so two uploads never overwrite each other.
  // - We replace unusual characters with "_" to keep the name safe.
  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const savedName = Date.now() + '-' + safeName;

  const fullPath = path.join(UPLOAD_FOLDER, savedName);
  await fs.promises.writeFile(fullPath, file.buffer);

  return savedName;
}

module.exports = { saveFile };
