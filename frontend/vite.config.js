// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    // Fail instead of silently moving to 5174. The backend's CORS list
    // names port 5173 exactly, so a silent move would look like a
    // mysterious "cannot reach the server" error.
    strictPort: true,
  },

  build: {
    outDir: 'dist',
    // Source maps so a production error can be traced back to real
    // code. They are separate .map files, which you can choose not to
    // upload if you would rather not publish your source.
    sourcemap: true,
  },
});
