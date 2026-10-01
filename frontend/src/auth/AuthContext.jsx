// src/auth/AuthContext.jsx
// -----------------------------------------------------------------
// Who is logged in, available to the whole app.
//
// IMPORTANT, and worth saying to students out loud:
// everything in here is for CONVENIENCE and APPEARANCE only. Hiding a
// menu item does not protect anything - anyone can open the browser
// console, or use curl, and call the API directly. Every rule is
// enforced again in the backend. If you ever find a rule that exists
// only in this file, that rule does not exist.
// -----------------------------------------------------------------

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  api,
  getToken,
  setToken,
  clearToken,
  onSessionExpired,
  ApiError,
} from '../api/client.js';

const AuthContext = createContext(null);

// 'loading' until we know; then 'authenticated' or 'anonymous'.
//
// WHY three states and not just `user === null`: on a page refresh we
// have a token but not yet a user, because confirming it takes a
// request. Without a loading state, every protected page would flash
// the login screen for a moment before the answer arrives.
const LOADING = 'loading';
const AUTHENTICATED = 'authenticated';
const ANONYMOUS = 'anonymous';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(getToken() ? LOADING : ANONYMOUS);

  // Check the stored token once, when the app starts.
  useEffect(() => {
    if (!getToken()) {
      setStatus(ANONYMOUS);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { user: me } = await api.get('/api/auth/me');
        if (cancelled) return;
        setUser(me);
        setStatus(AUTHENTICATED);
      } catch (error) {
        if (cancelled) return;
        // A 401 means the token has expired or the account was
        // deactivated. The client has already cleared it.
        clearToken();
        setUser(null);
        setStatus(ANONYMOUS);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Any request that comes back 401 ends the session everywhere at
  // once, including in another tab's worth of open components.
  useEffect(
    () =>
      onSessionExpired(() => {
        setUser(null);
        setStatus(ANONYMOUS);
      }),
    []
  );

  const login = useCallback(async (email, password) => {
    const result = await api.post(
      '/api/auth/login',
      { email, password },
      { auth: false }
    );
    setToken(result.token);
    setUser(result.user);
    setStatus(AUTHENTICATED);
    return result.user;
  }, []);

  const register = useCallback(async (details) => {
    // The backend logs a new patient straight in, since they have just
    // proved they know the password.
    const result = await api.post('/api/auth/register', details, { auth: false });
    setToken(result.token);
    setUser(result.user);
    setStatus(AUTHENTICATED);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      // Tells the backend to write the audit entry. The token stays
      // technically valid until it expires - see the note in
      // backend/routes/auth.routes.js - so throwing it away here is
      // what actually logs the user out.
      await api.post('/api/auth/logout', {});
    } catch {
      // Already expired, or the server is unreachable. Log out locally
      // either way: refusing to log someone out because the network is
      // down would be absurd.
    }
    clearToken();
    setUser(null);
    setStatus(ANONYMOUS);
  }, []);

  // Replaces the stored user after a profile edit, so the header name
  // updates without a reload.
  const updateUser = useCallback((next) => setUser(next), []);

  const value = useMemo(
    () => ({
      user,
      status,
      isLoading: status === LOADING,
      isLoggedIn: status === AUTHENTICATED,
      login,
      register,
      logout,
      updateUser,

      // Mirrors the backend's permission table, which sends the list in
      // the login response. Used to decide what to SHOW. The backend
      // checks the same permission again when the request arrives.
      can: (permission) =>
        Boolean(user && user.permissions && user.permissions.includes(permission)),

      role: user ? user.role : null,
    }),
    [user, status, login, register, logout, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    // A clear message beats "cannot read property of null" when
    // somebody renders a page outside the provider.
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return context;
}

// Where each role lands after logging in.
export function homePathForRole(role) {
  if (role === 'admin') return '/admin';
  if (role === 'doctor') return '/doctor';
  if (role === 'patient') return '/patient';
  return '/';
}
