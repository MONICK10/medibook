// lib/jsonStore.js
// -----------------------------------------------------------------
// Holds the whole local database as one JSON file, kept in memory.
//
// WHY this exists: a student should be able to clone the repo and run
// the app with no PostgreSQL install. This is NOT a real database and
// it would fall over with real traffic - it rewrites the entire file on
// every change and keeps everything in RAM. It is a stand-in that lets
// adapters/db.local.js offer the same functions as db.postgres.js.
//
// WHY it is safe enough to demo with:
// Node runs our JavaScript on one thread. Any code that does not
// `await` in the middle runs to completion before another request is
// handled. So "check the slot is free, then insert" is atomic as long
// as it happens in one synchronous block - which is exactly how
// db.local.js does it. PostgreSQL gets the same guarantee from a UNIQUE
// index instead.
// -----------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

function createJsonStore({ filePath, emptyState }) {
  let state = null;

  // Writes are chained one after another so two saves can never interleave
  // and leave half-written JSON on disk.
  let saveChain = Promise.resolve();
  let pendingSave = false;

  function load() {
    if (state) return state;

    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    if (!fs.existsSync(filePath)) {
      state = structuredClone(emptyState);
      return state;
    }

    const text = fs.readFileSync(filePath, 'utf8');
    if (!text.trim()) {
      state = structuredClone(emptyState);
      return state;
    }

    try {
      const parsed = JSON.parse(text);
      // Merge onto the empty shape so a file written by an older version,
      // missing a collection we have since added, still loads.
      state = { ...structuredClone(emptyState), ...parsed };
    } catch (error) {
      // Refuse to start rather than silently throwing away the data file.
      throw new Error(
        `Could not read the data file at ${filePath}: ${error.message}\n` +
          'Fix the JSON, or delete the file and run "npm run seed" again.'
      );
    }

    return state;
  }

  function getState() {
    return state || load();
  }

  function writeNow() {
    const text = JSON.stringify(state, null, 2);
    const tempPath = filePath + '.tmp';

    // Write to a temp file, then rename over the real one. A crash
    // mid-write then leaves the previous good file intact instead of a
    // truncated one.
    return fs.promises
      .writeFile(tempPath, text, 'utf8')
      .then(() => fs.promises.rename(tempPath, filePath))
      .catch(async (error) => {
        // On Windows a rename can fail if antivirus or another process has
        // the target open. Fall back to writing in place.
        logger.warn('Atomic rename failed, writing data file directly', {
          error: error.message,
        });
        await fs.promises.writeFile(filePath, text, 'utf8');
        await fs.promises.unlink(tempPath).catch(() => {});
      });
  }

  // Ask for a save. Several changes in a row collapse into one write.
  function save() {
    if (pendingSave) return saveChain;
    pendingSave = true;

    saveChain = saveChain.then(() => {
      pendingSave = false;
      return writeNow();
    });

    return saveChain;
  }

  // Wait for every queued write to finish. Used on shutdown so the
  // process does not exit with changes still only in memory.
  function flush() {
    return saveChain;
  }

  // Throw the file away and start over. Used by the seed script.
  function reset() {
    state = structuredClone(emptyState);
    return save();
  }

  return { load, getState, save, flush, reset, filePath };
}

module.exports = { createJsonStore };
