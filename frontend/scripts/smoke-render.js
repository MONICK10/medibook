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
  { path: '/patient', mustContain: ['Log in'], name: 'patient area while logged out' },
  { path: '/doctor', mustContain: ['Log in'], name: 'doctor area while logged out' },
  { path: '/admin', mustContain: ['Log in'], name: 'admin area while logged out' },
];

// The bundle is written INSIDE node_modules rather than in the system
// temp folder. WHY: react and the router are left external, so Node
// resolves them relative to wherever the bundle sits. From a temp
// folder that search walks up to the user's home directory and can
// find some unrelated copy of React; from here it finds this
// project's. (It is also already ignored by git.)
const workDir = join(process.cwd(), 'node_modules', '.medibook-smoke');
mkdirSync(workDir, { recursive: true });

try {
  // A tiny entry point that exposes the App component.
  const entry = join(workDir, 'entry.jsx');
  writeFileSync(
    entry,
    `export { default as App } from ${JSON.stringify(
      join(process.cwd(), 'src/App.jsx')
    ).replace(/\\\\/g, '/')};\n` +
      `export { AuthProvider } from ${JSON.stringify(
        join(process.cwd(), 'src/auth/AuthContext.jsx')
      ).replace(/\\\\/g, '/')};\n`
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

  const { App, AuthProvider } = await import(pathToFileURL(bundlePath).href);

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

      const missing = route.mustContain.filter((text) => !html.includes(text));

      if (missing.length > 0) {
        failures += 1;
        console.log(`  FAIL  ${route.name} (${route.path})`);
        console.log(`        rendered, but did not contain: ${missing.join(', ')}`);
      } else {
        console.log(`  ok    ${route.name} (${route.path})`);
      }
    } catch (error) {
      failures += 1;
      console.log(`  FAIL  ${route.name} (${route.path})`);
      console.log(`        threw while rendering: ${error.message}`);
    }
  }

  console.error = realConsoleError;

  console.log('');
  console.log(`${ROUTES.length - failures} passed, ${failures} failed`);
  process.exitCode = failures > 0 ? 1 : 0;
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
