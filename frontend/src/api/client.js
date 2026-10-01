// src/api/client.js
// -----------------------------------------------------------------
// Every request to the backend goes through here.
//
// WHY one wrapper instead of calling fetch in each page:
//  * the token is attached in one place, so no page can forget it
//  * errors arrive as one predictable object, so no page has to know
//    that the backend returns { error: { code, message, details } }
//  * an expired session is handled once, globally, instead of in
//    thirty components
// -----------------------------------------------------------------

import { API_URL, TOKEN_STORAGE_KEY } from '../config.js';

// --- token storage ------------------------------------------------
// Wrapped in try/catch because localStorage throws in a private window
// with site data blocked. A visitor in that state should see "please
// log in", not a crashed page.

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // Ignored: the user stays logged in for this tab only.
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Ignored.
  }
}

// --- the error type -----------------------------------------------
// One shape for everything that can go wrong, so a form can do
// `catch (error) { setError(error.message); setFieldErrors(error.details) }`
// without caring whether the failure was a 422 or the network.

export class ApiError extends Error {
  constructor({ status, code, message, details, requestId }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    // Per-field messages from the backend validator: { email: '...' }
    this.details = details || null;
    // Shown with unexpected errors so a screenshot is enough to find
    // the matching server logs.
    this.requestId = requestId || null;
  }

  // Did the session expire or was it never valid?
  get isAuthError() {
    return this.status === 401;
  }

  // Logged in, but not allowed. Retrying or logging in again will not
  // help, so the UI sends these to the Access Denied page.
  get isForbidden() {
    return this.status === 403;
  }
}

// --- session expiry -----------------------------------------------
// When any request comes back 401 the stored token is dead. Rather than
// have every component handle that, the client clears it and announces
// it; AuthContext listens and resets to logged out.
//
// A plain browser event is used instead of importing the auth context
// here, which would be a circular import: the context uses the client.

const SESSION_EXPIRED_EVENT = 'medibook:session-expired';

export function onSessionExpired(handler) {
  window.addEventListener(SESSION_EXPIRED_EVENT, handler);
  return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
}

function announceSessionExpired() {
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

// --- the request function -----------------------------------------

async function request(method, path, options = {}) {
  const { body, auth = true, signal } = options;

  const headers = {};
  const token = auth ? getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (body instanceof FormData) {
    // Do NOT set Content-Type for FormData. The browser has to add it
    // itself, because it includes the multipart boundary string.
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(API_URL + path, { method, headers, body: payload, signal });
  } catch (error) {
    // An aborted request is not a failure: it means the component
    // unmounted or the user typed again. Re-throw so callers can ignore it.
    if (error.name === 'AbortError') throw error;

    // fetch only rejects for network-level problems, which from the
    // browser's point of view are indistinguishable: server down, wrong
    // port, DNS, or CORS. The most likely cause while developing is by
    // far "the backend is not running", so say that.
    throw new ApiError({
      status: 0,
      code: 'network_error',
      message:
        'Could not reach the server. Check that the backend is running, then try again.',
    });
  }

  // 204 No Content, or any empty body.
  if (response.status === 204) return null;

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // The server returned something that is not JSON. That usually
      // means a proxy or an error page got in the way.
      throw new ApiError({
        status: response.status,
        code: 'bad_response',
        message: 'The server sent a response we could not read.',
      });
    }
  }

  if (!response.ok) {
    const error = data && data.error ? data.error : {};

    if (response.status === 401) {
      clearToken();
      announceSessionExpired();
    }

    throw new ApiError({
      status: response.status,
      code: error.code || 'error',
      // The backend writes its messages for end users, so they are
      // safe to show as they are.
      message: error.message || 'Something went wrong. Please try again.',
      details: error.details,
      requestId: data ? data.requestId : null,
    });
  }

  return data;
}

// Turn { status: 'booked', limit: 20 } into '?status=booked&limit=20',
// leaving out anything empty so the backend sees absent rather than ''.
export function queryString(params = {}) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.append(key, String(value));
  }

  const text = search.toString();
  return text ? `?${text}` : '';
}

export const api = {
  get: (path, options) => request('GET', path, options),
  post: (path, body, options) => request('POST', path, { ...options, body }),
  patch: (path, body, options) => request('PATCH', path, { ...options, body }),
  put: (path, body, options) => request('PUT', path, { ...options, body }),
  delete: (path, options) => request('DELETE', path, options),
};
