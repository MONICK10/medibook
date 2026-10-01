// src/components/ui.jsx
// -----------------------------------------------------------------
// The small building blocks used on nearly every page: messages,
// spinners, form fields, badges, empty states, pagination.
//
// Kept in one file because each is a handful of lines, and one import
// is easier to follow than a dozen tiny files.
// -----------------------------------------------------------------

import { CURRENCY_SYMBOL, CENTS_PER_UNIT } from '../config.js';

// --- messages -----------------------------------------------------

// A success/error/info/warning box. Renders nothing without text, so a
// page can write <Message type="error" text={error} /> unconditionally.
export function Message({ type = 'info', text, detail, onDismiss }) {
  if (!text) return null;

  return (
    <div
      className={`message message--${type}`}
      // role="alert" makes a screen reader announce it as soon as it
      // appears, which is the point of an error message. Other kinds
      // use "status", which is announced more politely.
      role={type === 'error' ? 'alert' : 'status'}
    >
      <div className="message__text">
        {text}
        {detail ? <span className="message__detail">{detail}</span> : null}
      </div>
      {onDismiss ? (
        <button type="button" className="btn btn--ghost btn--small" onClick={onDismiss}>
          Dismiss
        </button>
      ) : null}
    </div>
  );
}

// Shows an ApiError, including the request id for unexpected ones so a
// student can match it to the backend log line.
export function ErrorMessage({ error, onDismiss }) {
  if (!error) return null;

  const detail =
    error.status >= 500 && error.requestId ? `Reference: ${error.requestId}` : null;

  return (
    <Message type="error" text={error.message} detail={detail} onDismiss={onDismiss} />
  );
}

// --- loading ------------------------------------------------------

export function Spinner({ block = false, label = 'Loading' }) {
  return (
    <span
      className={block ? 'spinner spinner--block' : 'spinner'}
      role="status"
      aria-label={label}
    />
  );
}

export function LoadingArea({ label = 'Loading...' }) {
  return (
    <div className="loading-area">
      <Spinner block label={label} />
      <p className="muted">{label}</p>
    </div>
  );
}

// --- form fields --------------------------------------------------

// One labelled input, with its hint and its error.
//
// `error` is the message for this field from the backend validator.
// Wiring aria-invalid and aria-describedby means a screen reader
// reads the error with the field instead of leaving it unexplained.
export function Field({
  label,
  name,
  type = 'text',
  value,
  onChange,
  error,
  hint,
  required,
  children,
  ...rest
}) {
  const errorId = error ? `${name}-error` : undefined;
  const hintId = hint ? `${name}-hint` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="field">
      <label htmlFor={name}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </label>

      {/* `children` lets a caller swap in a <select> or <textarea>
          while keeping the label, hint and error handling. */}
      {children ? (
        children
      ) : (
        <input
          id={name}
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          required={required}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          {...rest}
        />
      )}

      {hint ? (
        <span className="field__hint" id={hintId}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="field__error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

// --- status badge -------------------------------------------------

const STATUS_LABELS = {
  booked: 'Booked',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};

export function StatusBadge({ status }) {
  return (
    <span className={`badge badge--${status}`}>{STATUS_LABELS[status] || status}</span>
  );
}

// --- empty state --------------------------------------------------

export function Empty({ title, children }) {
  return (
    <div className="empty">
      {title ? <div className="empty__title">{title}</div> : null}
      {children}
    </div>
  );
}

// --- pagination ---------------------------------------------------

export function Pager({ total, limit, offset, onChange }) {
  if (total <= limit) return null;

  const from = offset + 1;
  const to = Math.min(offset + limit, total);
  const canGoBack = offset > 0;
  const canGoForward = offset + limit < total;

  return (
    <div className="pager">
      <span className="pager__info">
        Showing {from}&ndash;{to} of {total}
      </span>
      <div className="row">
        <button
          type="button"
          className="btn btn--secondary btn--small"
          disabled={!canGoBack}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          Previous
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--small"
          disabled={!canGoForward}
          onClick={() => onChange(offset + limit)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

// --- formatting ---------------------------------------------------
// Kept here so every screen shows a date, a time and a fee the same
// way, and the rules live in one place.

// Money arrives as whole paise/cents. Dividing by 100 for display is
// the ONLY place the value becomes a decimal.
export function formatMoney(cents) {
  if (cents === null || cents === undefined) return '-';
  const amount = cents / CENTS_PER_UNIT;
  return (
    CURRENCY_SYMBOL +
    amount.toLocaleString(undefined, {
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    })
  );
}

// 'YYYY-MM-DD' -> 'Mon 5 Oct 2026'
//
// Built from the parts rather than new Date(string), because
// new Date('2026-10-05') is parsed as UTC midnight and shows as the
// 4th for anyone west of Greenwich.
export function formatDate(dateString, { withYear = true, weekday = true } = {}) {
  if (!dateString) return '-';
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  return date.toLocaleDateString(undefined, {
    weekday: weekday ? 'short' : undefined,
    day: 'numeric',
    month: 'short',
    year: withYear ? 'numeric' : undefined,
  });
}

// 'HH:MM' (24-hour) -> '2:30 pm' in the reader's locale.
export function formatTime(timeString) {
  if (!timeString) return '-';
  const [hours, minutes] = timeString.split(':').map(Number);
  const date = new Date(2000, 0, 1, hours, minutes);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatDateTime(dateString, timeString) {
  return `${formatDate(dateString)} at ${formatTime(timeString)}`;
}

// An ISO timestamp -> a readable local date and time.
export function formatTimestamp(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// 'Today', 'Tomorrow', or the date. Appointment lists are much easier
// to scan when the next two days are named.
export function formatRelativeDate(dateString) {
  const today = new Date();
  const todayString = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');

  if (dateString === todayString) return 'Today';

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowString = [
    tomorrow.getFullYear(),
    String(tomorrow.getMonth() + 1).padStart(2, '0'),
    String(tomorrow.getDate()).padStart(2, '0'),
  ].join('-');

  if (dateString === tomorrowString) return 'Tomorrow';

  return formatDate(dateString);
}
