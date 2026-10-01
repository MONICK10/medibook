// src/main.jsx
// The entry point: mount the app into index.html's <div id="root">.

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App.jsx';
import { AuthProvider } from './auth/AuthContext.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

// The global stylesheet is imported once, here. Page-specific CSS is
// imported by the page that uses it, so a page's styles arrive with it.
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  // StrictMode deliberately runs effects twice in development to
  // expose missing cleanup. If something flickers or fetches twice
  // while developing but behaves in a production build, this is why -
  // and it usually means an effect needs a cleanup function.
  <React.StrictMode>
    <ErrorBoundary>
      {/* Router outside AuthProvider, because the provider's children
          use <Navigate> and useLocation. */}
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
