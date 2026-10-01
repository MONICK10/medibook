// config.js
// -----------------------------------------------------------------
// The ONE place where we set the backend address.
//
// Vite reads VITE_API_URL from a .env file (or the environment).
// If it is not set, we use the local backend on port 3000.
//
// Example .env file inside the frontend folder:
//   VITE_API_URL=http://localhost:3000
// -----------------------------------------------------------------

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
