// src/config.js
// -----------------------------------------------------------------
// The ONE place the frontend reads its settings.
//
// Vite replaces import.meta.env.VITE_* at BUILD time, not at run time.
// That means the API address is baked into the bundle when you run
// `npm run build` - so a site built for localhost will still call
// localhost after you upload it to S3. Build it again with the right
// VITE_API_URL for each environment.
// -----------------------------------------------------------------

// Trailing slashes are stripped so `API_URL + '/api/doctors'` can never
// produce a double slash.
export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(
  /\/+$/,
  ''
);

export const CLINIC_NAME = import.meta.env.VITE_CLINIC_NAME || 'MediBook';

// Where the login token is kept in the browser.
//
// localStorage, not a cookie. The trade-off, in short: localStorage
// cannot be sent automatically by the browser, so there is no CSRF
// risk, but JavaScript can read it, so a cross-site-scripting bug
// could steal it. An httpOnly cookie flips those two round. This app
// chooses localStorage because it keeps working when the site is a
// static build on CloudFront calling an API on a different domain.
// See backend/adapters/auth.js for the same note from the other side.
export const TOKEN_STORAGE_KEY = 'medibook.token';

// How money is stored and shown. The backend keeps whole paise/cents
// as an integer, so there is no floating point money anywhere.
export const CURRENCY_SYMBOL = '₹'; // Indian rupee
export const CENTS_PER_UNIT = 100;
