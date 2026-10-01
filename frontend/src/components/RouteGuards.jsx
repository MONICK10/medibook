// src/components/RouteGuards.jsx
// -----------------------------------------------------------------
// Route wrappers that keep people out of pages they cannot use.
//
// READ THIS BEFORE TRUSTING IT:
// these guards are about user experience, not security. They stop a
// patient from landing on a doctor's page and seeing a confusing wall
// of errors. They do NOT protect any data - the data lives behind the
// API, and the API checks every request for itself. Anyone can edit
// the JavaScript in their own browser; nobody can edit the backend.
//
// The rule of thumb: if removing a guard here would expose something,
// the real bug is in the backend.
// -----------------------------------------------------------------

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { LoadingArea } from './ui.jsx';

// Needs a logged-in user.
export function RequireAuth({ children }) {
  const { isLoading, isLoggedIn } = useAuth();
  const location = useLocation();

  // While the stored token is being checked, show nothing conclusive.
  // Without this the login page flashes on every refresh.
  if (isLoading) return <LoadingArea label="Checking your session..." />;

  if (!isLoggedIn) {
    // `from` lets the login page send them back where they were going,
    // so a bookmarked page still works after signing in.
    // `replace` keeps the Back button from bouncing between the two.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}

// Needs a logged-in user with one of these roles.
export function RequireRole({ roles, children }) {
  const { isLoading, isLoggedIn, role } = useAuth();
  const location = useLocation();

  if (isLoading) return <LoadingArea label="Checking your session..." />;

  if (!isLoggedIn) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Logged in but wrong role: Access Denied, not the login page.
  // Sending them to log in again would be a dead end - they are
  // already signed in, and signing in again changes nothing.
  if (!roles.includes(role)) {
    return <Navigate to="/access-denied" replace state={{ from: location }} />;
  }

  return children;
}

// For pages that only make sense when logged OUT: login, register,
// forgot password. A signed-in user who opens /login is sent to their
// own dashboard instead.
export function RequireAnonymous({ children }) {
  const { isLoading, isLoggedIn, role } = useAuth();

  if (isLoading) return <LoadingArea label="Checking your session..." />;

  if (isLoggedIn) {
    const home = role === 'admin' ? '/admin' : role === 'doctor' ? '/doctor' : '/patient';
    return <Navigate to={home} replace />;
  }

  return children;
}
