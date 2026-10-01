// scripts/smoke-render.js
// -----------------------------------------------------------------
// Renders the app's pages to HTML strings in Node, with no browser.
// Run: npm run smoke
//
// WHY this exists: `npm run build` only proves the code PARSES and
// that every import resolves. It will happily build a page that throws
// the moment it renders - a typo in a variable name, a hook called
// conditionally, reading a property of something undefined. This
// catches that class of bug in about a second.
//
// WHAT IT DOES NOT CATCH: anything that needs a real browser. Effects
// do not run during server rendering, so no data is fetched, no
// clicking happens, and layout and CSS are not checked at all. A green
// run here means "the pages render"; it does not mean "the app works".
// Click through it in a browser as well.
//
// ONE CONSEQUENCE WORTH KNOWING: react-router's <Navigate> redirects
// from an effect, so a guard that bounces someone to /login or
// /access-denied renders NOTHING here rather than the destination
// page. So the guard checks below assert that the protected content is
// ABSENT, which is the part that matters, instead of looking for the
// page it would have redirected to. (An earlier version of this file
// looked for the text "Log in" and passed on the header's log-in
// button while proving nothing at all.)
//
// It uses esbuild, which is already installed as part of Vite, so it
// adds no dependency of its own.
// -----------------------------------------------------------------

import { build } from 'esbuild';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';

// The permissions the backend sends for each role. Copied from
// backend/auth/roles.js so a stubbed login behaves like a real one.
const PERMISSIONS = {
  patient: [
    'appointment:book',
    'appointment:read:own',
    'appointment:cancel:own',
    'appointment:reschedule:own',
    'doctor:read',
    'report:uploadOwn',
    'report:readOwn',
    'prescription:readOwn',
    'stats:patient',
  ],
  doctor: [
    'appointment:read:assigned',
    'appointment:setOutcome',
    'doctor:read',
    'doctor:editOwnProfile',
    'availability:manageOwn',
    'report:readAssigned',
    'prescription:write',
    'prescription:readAssigned',
    'stats:doctor',
  ],
  admin: [
    'appointment:read:all',
    'doctor:read',
    'doctor:manage',
    'specialty:manage',
    'user:manage',
    'audit:read',
    'stats:admin',
  ],
};

// Routes reached without logging in.
const ROUTES = [
  { path: '/', mustContain: ['Book a doctor', 'How it works'], name: 'landing page' },
  { path: '/login', mustContain: ['Log in', 'Demo accounts'], name: 'login page' },
  { path: '/register', mustContain: ['Create an account'], name: 'register page' },
  { path: '/forgot-password', mustContain: ['Forgot your password'], name: 'forgot password' },
  {
    path: '/reset-password',
    mustContain: ['Reset link needed'],
    name: 'reset password without a token',
  },
  { path: '/access-denied', mustContain: ['Access denied'], name: 'access denied page' },
  { path: '/no-such-page', mustContain: ['Page not found'], name: '404 page' },
  // Logged out, so the guard must send these to the login page rather
  // than render the dashboard.
  // Logged out, the guard must keep the dashboards from rendering.
  {
    path: '/patient',
    mustNotContain: ['Loading your dashboard'],
    name: 'patient area blocked while logged out',
  },
  {
    path: '/doctor',
    mustNotContain: ['Loading your dashboard'],
    name: 'doctor area blocked while logged out',
  },
  {
    path: '/admin',
    mustNotContain: ['Loading the clinic overview'],
    name: 'admin area blocked while logged out',
  },
];

// Routes behind a login, rendered with a stubbed signed-in user.
//
// WHAT THIS PROVES: the page's own code runs without throwing, the
// right role gets in, and the wrong role is turned away.
//
// WHAT IT DOES NOT PROVE: how the page looks once its data arrives.
// Effects never run during a server render, so every one of these
// shows its loading state. The filled-in states are covered by the
// backend's API tests and by clicking through in a browser.
const PRIVATE_ROUTES = [
  // patient
  { path: '/patient', role: 'patient', name: 'patient dashboard' },
  { path: '/patient/doctors', role: 'patient', name: 'find a doctor' },
  { path: '/patient/doctors/abc', role: 'patient', name: 'doctor detail' },
  { path: '/patient/doctors/abc/book', role: 'patient', name: 'book appointment' },
  { path: '/patient/appointments', role: 'patient', name: 'my appointments' },
  { path: '/patient/reports', role: 'patient', name: 'my reports' },
  { path: '/patient/prescriptions', role: 'patient', name: 'my prescriptions' },
  { path: '/patient/profile', role: 'patient', name: 'patient profile' },

  // doctor
  { path: '/doctor', role: 'doctor', name: 'doctor dashboard' },
  { path: '/doctor/appointments', role: 'doctor', name: 'doctor appointments' },
  { path: '/doctor/patients', role: 'doctor', name: 'doctor patient list' },
  { path: '/doctor/patients/abc', role: 'doctor', name: 'doctor patient record' },
  {
    path: '/doctor/appointments/abc/prescription',
    role: 'doctor',
    name: 'prescription form',
  },
  { path: '/doctor/availability', role: 'doctor', name: 'availability editor' },
  { path: '/doctor/profile', role: 'doctor', name: 'doctor profile' },

  // Wrong role: the protected page must not render.
  {
    path: '/admin',
    role: 'patient',
    name: 'patient blocked from the admin area',
    mustNotContain: ['Loading the clinic overview'],
  },
  {
    path: '/doctor',
    role: 'patient',
    name: 'patient blocked from the doctor area',
    mustNotContain: ['Loading your dashboard'],
  },
  {
    path: '/patient',
    role: 'admin',
    name: 'admin blocked from the patient area',
    mustNotContain: ['Loading your dashboard'],
  },
  {
    path: '/patient/reports',
    role: 'doctor',
    name: 'doctor blocked from a patient\'s reports page',
    mustNotContain: ['Upload a report'],
  },
];

// The bundle is written INSIDE node_modules rather than in the system
// temp folder. WHY: react and the router are left external, so Node
// resolves them relative to wherever the bundle sits. From a temp
// folder that search walks up to the user's home directory and can
// find some unrelated copy of React; from here it finds this
// project's. (It is also already ignored by git.)
// Check one rendered page against its expectations. Returns a list of
// problems, empty when all is well.
function checkHtml(html, route) {
  const problems = [];

  for (const text of route.mustContain || []) {
    if (!html.includes(text)) problems.push(`did not contain: ${text}`);
  }

  for (const text of route.mustNotContain || []) {
    // The important one for the guards: content that should have been
    // blocked but rendered anyway.
    if (html.includes(text)) problems.push(`should NOT have contained: ${text}`);
  }

  // The header and footer alone are well over this, so anything
  // shorter means the whole tree came out empty.
  if (html.length < 200) problems.push('rendered almost nothing');

  return problems;
}

const workDir = join(process.cwd(), 'node_modules', '.medibook-smoke');
mkdirSync(workDir, { recursive: true });

try {
  // A tiny entry point that exposes the App component.
  const appPath = JSON.stringify(join(process.cwd(), 'src/App.jsx')).replace(/\\\\/g, '/');
  const authPath = JSON.stringify(
    join(process.cwd(), 'src/auth/AuthContext.jsx')
  ).replace(/\\\\/g, '/');

  const entry = join(workDir, 'entry.jsx');
  writeFileSync(
    entry,
    `export { default as App } from ${appPath};\n` +
      `export { AuthProvider, AuthContext } from ${authPath};\n`
  );

  const bundlePath = join(workDir, 'bundle.mjs');

  await build({
    entryPoints: [entry],
    outfile: bundlePath,
    bundle: true,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    // React and the router are resolved from node_modules at run time
    // rather than bundled, so the copies used here are the real ones.
    external: ['react', 'react-dom', 'react-dom/server', 'react-router-dom'],
    // Stylesheets contribute nothing to a server render.
    loader: { '.css': 'empty' },
    // Vite normally substitutes these at build time; esbuild needs to
    // be told.
    define: {
      'import.meta.env.VITE_API_URL': '"http://localhost:3000"',
      'import.meta.env.VITE_CLINIC_NAME': '"MediBook"',
      'import.meta.env.MODE': '"production"',
      'import.meta.env.DEV': 'false',
      'import.meta.env.PROD': 'true',
    },
    logLevel: 'silent',
  });

  const { App, AuthProvider, AuthContext } = await import(pathToFileURL(bundlePath).href);

  // A signed-in user, without a real login. Shaped exactly like the
  // value AuthProvider supplies, so the pages cannot tell the
  // difference.
  function stubAuth(role) {
    const user = {
      id: '11111111-1111-1111-1111-111111111111',
      role,
      name: role === 'doctor' ? 'Dr. Test Doctor' : 'Test Person',
      email: `${role}@example.com`,
      phone: '9000000000',
      isActive: true,
      permissions: PERMISSIONS[role],
    };

    return {
      user,
      role,
      status: 'authenticated',
      isLoading: false,
      isLoggedIn: true,
      login: async () => user,
      register: async () => user,
      logout: async () => {},
      updateUser: () => {},
      can: (permission) => PERMISSIONS[role].includes(permission),
    };
  }

  // React warns that useLayoutEffect does nothing on the server, once
  // per <Link>. It is expected here and there are dozens of links, so
  // it is filtered out - but ONLY that one message, so a real warning
  // still reaches the output.
  const realConsoleError = console.error;
  console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('useLayoutEffect does nothing on the server')) {
      return;
    }
    realConsoleError(...args);
  };

  let failures = 0;

  for (const route of ROUTES) {
    try {
      const html = renderToString(
        createElement(
          MemoryRouter,
          { initialEntries: [route.path] },
          createElement(AuthProvider, null, createElement(App, null))
        )
      );

      const problems = checkHtml(html, route);

      if (problems.length > 0) {
        failures += 1;
        console.log(`  FAIL  ${route.name} (${route.path})`);
        for (const problem of problems) console.log(`        ${problem}`);
      } else {
        console.log(`  ok    ${route.name} (${route.path})`);
      }
    } catch (error) {
      failures += 1;
      console.log(`  FAIL  ${route.name} (${route.path})`);
      console.log(`        threw while rendering: ${error.message}`);
    }
  }

  // ---------- logged-in routes ----------
  console.log('');
  for (const route of PRIVATE_ROUTES) {
    try {
      const html = renderToString(
        createElement(
          MemoryRouter,
          { initialEntries: [route.path] },
          createElement(
            AuthContext.Provider,
            { value: stubAuth(route.role) },
            createElement(App, null)
          )
        )
      );

      // With no expectation given, the page just has to render without
      // throwing and produce something.
      const problems = checkHtml(html, route);

      if (problems.length > 0) {
        failures += 1;
        console.log(`  FAIL  ${route.name} (${route.role} at ${route.path})`);
        for (const problem of problems) console.log(`        ${problem}`);
      } else {
        console.log(`  ok    ${route.name} (${route.role} at ${route.path})`);
      }
    } catch (error) {
      failures += 1;
      console.log(`  FAIL  ${route.name} (${route.role} at ${route.path})`);
      console.log(`        threw while rendering: ${error.message}`);
    }
  }

  console.error = realConsoleError;

  const total = ROUTES.length + PRIVATE_ROUTES.length;
  console.log('');
  console.log(`${total - failures} passed, ${failures} failed`);
  process.exitCode = failures > 0 ? 1 : 0;
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
