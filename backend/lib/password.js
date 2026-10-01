// lib/password.js
// -----------------------------------------------------------------
// The password strength rules, in one place.
//
// WHY these rules: length does far more for safety than a zoo of
// required symbols, which mostly pushes people to "Password1!". So we
// ask for 10+ characters with some variety, and separately block the
// passwords attackers actually try first - including ones built from
// the user's own name, email or this app's name, which a generic
// character-class check happily accepts.
// -----------------------------------------------------------------

const MIN_LENGTH = 10;
const MAX_LENGTH = 128; // bcrypt only uses the first 72 bytes; cap well above that but bounded

// Short list of the usual suspects. A real system would check against a
// large breached-password list (for example Have I Been Pwned's API).
const COMMON_PASSWORDS = [
  'password',
  'password1',
  'password123',
  'passw0rd',
  '1234567890',
  '12345678',
  'qwertyuiop',
  'qwerty123',
  'letmein',
  'welcome1',
  'admin123',
  'iloveyou',
  'abc12345',
  'medibook',
  'medibook1',
  'medibook123',
  'doctor123',
  'hospital1',
];

// Returns { ok: true } or { ok: false, message }.
function checkPasswordStrength(password, context = {}) {
  if (typeof password !== 'string') {
    return { ok: false, message: 'must be text' };
  }
  if (password.length < MIN_LENGTH) {
    return { ok: false, message: `must be at least ${MIN_LENGTH} characters long` };
  }
  if (password.length > MAX_LENGTH) {
    return { ok: false, message: `must be ${MAX_LENGTH} characters or fewer` };
  }
  if (!/[a-z]/.test(password)) {
    return { ok: false, message: 'must include a lowercase letter' };
  }
  if (!/[A-Z]/.test(password)) {
    return { ok: false, message: 'must include an uppercase letter' };
  }
  if (!/\d/.test(password)) {
    return { ok: false, message: 'must include a number' };
  }

  const lower = password.toLowerCase();

  if (COMMON_PASSWORDS.some((common) => lower.includes(common))) {
    return { ok: false, message: 'is too easy to guess, please pick something less common' };
  }

  // A password containing the user's own email name or their real name is
  // the first thing an attacker who knows them will try.
  const personalBits = [];
  if (context.email) personalBits.push(String(context.email).split('@')[0]);
  if (context.name) personalBits.push(...String(context.name).split(/\s+/));

  for (const bit of personalBits) {
    const clean = String(bit).toLowerCase();
    if (clean.length >= 4 && lower.includes(clean)) {
      return { ok: false, message: 'must not contain your name or email address' };
    }
  }

  return { ok: true };
}

// Build a random password that is guaranteed to pass the rules above.
//
// WHY the app generates this instead of letting an admin type one:
// when an admin creates a doctor account, any password the admin
// chooses is a password the admin knows. Generating it and emailing it
// to the doctor means only the doctor ever sees it. (With
// MAIL_MODE=console it prints to the backend terminal, which is how you
// read it while teaching.)
function generateTemporaryPassword() {
  const crypto = require('crypto');

  // No look-alike characters (0/O, 1/l/I), because somebody has to read
  // this out of an email and type it correctly.
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = lower + upper + digits;

  const pickFrom = (set) => set[crypto.randomInt(set.length)];

  // One of each required kind first, so the result cannot fail the rules
  // by chance, then fill up to length 14.
  const characters = [pickFrom(lower), pickFrom(upper), pickFrom(digits)];
  while (characters.length < 14) characters.push(pickFrom(all));

  // Shuffle, so the guaranteed characters are not always in positions
  // 1-3. Fisher-Yates with a cryptographic random source.
  for (let i = characters.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [characters[i], characters[j]] = [characters[j], characters[i]];
  }

  const password = characters.join('');

  // Belt and braces: if this ever fails the rules, try again rather
  // than create an account whose password the app would reject.
  return checkPasswordStrength(password).ok ? password : generateTemporaryPassword();
}

// The same rules as text, so the frontend and the docs can show them
// without the list drifting out of sync with the check above.
const PASSWORD_RULES_TEXT = [
  `At least ${MIN_LENGTH} characters`,
  'One uppercase letter',
  'One lowercase letter',
  'One number',
  'Not a common password, your name, or your email',
];

module.exports = {
  checkPasswordStrength,
  generateTemporaryPassword,
  PASSWORD_RULES_TEXT,
  MIN_LENGTH,
  MAX_LENGTH,
};
