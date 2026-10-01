// src/pages/patient/MyAppointmentsPage.jsx
// -----------------------------------------------------------------
// Upcoming and past appointments, with cancel and reschedule.
//
// Cancel and reschedule are only offered more than 2 hours before the
// slot, which is the same rule the backend enforces. The button is
// hidden when it would be refused - but the refusal itself lives on
// the server, so hiding it is only politeness.
// -----------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, queryString } from '../../api/client.js';
import SlotPicker from '../../components/SlotPicker.jsx';
import {
  Empty,
  ErrorMessage,
  LoadingArea,
  Message,
  Spinner,
  StatusBadge,
  formatDate,
  formatMoney,
  formatRelativeDate,
  formatTime,
} from '../../components/ui.jsx';
import './PatientPages.css';

// Must match BOOKING_CANCEL_CUTOFF_MINUTES in the backend's .env.
// Duplicated knowledge, so it is named rather than buried as "120".
const CANCEL_CUTOFF_MINUTES = 120;

function minutesUntil(date, startTime) {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = startTime.split(':').map(Number);
  const when = new Date(year, month - 1, day, hours, minutes);
  return Math.round((when - new Date()) / 60000);
}

export default function MyAppointmentsPage() {
  const location = useLocation();

  const [tab, setTab] = useState('upcoming');
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(
    // Set by BookAppointmentPage after a successful booking.
    location.state && location.state.justBooked
      ? 'Your appointment is booked.'
      : null
  );

  // Which appointment has its reschedule panel open.
  const [reschedulingId, setReschedulingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get(
        `/api/appointments${queryString({ when: tab, limit: 100 })}`
      );
      setAppointments(result.appointments);
    } catch (apiError) {
      setError(apiError);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>My appointments</h1>
          <p>Everything you have booked, past and upcoming.</p>
        </div>
        <Link to="/patient/doctors" className="btn">
          Book another
        </Link>
      </div>

      {notice ? (
        <Message type="success" text={notice} onDismiss={() => setNotice(null)} />
      ) : null}

      {/* ---------- tabs ---------- */}
      <div className="tabs" role="tablist" aria-label="Which appointments">
        {[
          { id: 'upcoming', label: 'Upcoming' },
          { id: 'past', label: 'Past' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`tab ${tab === item.id ? 'tab--active' : ''}`}
            onClick={() => {
              setTab(item.id);
              setReschedulingId(null);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <ErrorMessage error={error} onDismiss={() => setError(null)} />

      {loading ? (
        <LoadingArea label="Loading your appointments..." />
      ) : appointments.length === 0 ? (
        <div className="card">
          <Empty title={tab === 'upcoming' ? 'Nothing booked' : 'No past appointments'}>
            <p className="small">
              {tab === 'upcoming'
                ? 'When you book an appointment it will appear here.'
                : 'Appointments you have attended will appear here.'}
            </p>
            {tab === 'upcoming' ? (
              <Link to="/patient/doctors" className="btn btn--small">
                Find a doctor
              </Link>
            ) : null}
          </Empty>
        </div>
      ) : (
        <div className="stack">
          {appointments.map((appointment) => (
            <AppointmentCard
              key={appointment.id}
              appointment={appointment}
              isRescheduling={reschedulingId === appointment.id}
              onStartReschedule={() => setReschedulingId(appointment.id)}
              onCancelReschedule={() => setReschedulingId(null)}
              onChanged={(message) => {
                setNotice(message);
                setReschedulingId(null);
                load();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AppointmentCard({
  appointment,
  isRescheduling,
  onStartReschedule,
  onCancelReschedule,
  onChanged,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const noticeMinutes = minutesUntil(appointment.date, appointment.startTime);
  const canChange =
    appointment.status === 'booked' && noticeMinutes >= CANCEL_CUTOFF_MINUTES;

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/appointments/${appointment.id}/cancel`, {
        reason: cancelReason || undefined,
      });
      onChanged('Your appointment has been cancelled.');
    } catch (apiError) {
      setError(apiError);
      setBusy(false);
    }
  }

  async function reschedule(slot) {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/appointments/${appointment.id}/reschedule`, {
        date: slot.date,
        startTime: slot.startTime,
      });
      onChanged('Your appointment has been moved.');
    } catch (apiError) {
      setError(apiError);
      setBusy(false);
    }
  }

  return (
    <article className="card appointment-card">
      <div className="appointment-card__main">
        <div className="appointment-card__when">
          <div className="appointment-card__date">
            {formatRelativeDate(appointment.date)}
          </div>
          <div className="appointment-card__time">
            {formatTime(appointment.startTime)}
          </div>
          <div className="small muted">{formatDate(appointment.date)}</div>
        </div>

        <div className="appointment-card__detail">
          <div className="row">
            <h2 className="appointment-card__doctor">{appointment.doctorName}</h2>
            <StatusBadge status={appointment.status} />
          </div>
          <p className="muted small">{appointment.specialtyName}</p>

          {appointment.reason ? (
            <p className="appointment-card__reason">{appointment.reason}</p>
          ) : null}

          <div className="appointment-card__meta small muted">
            <span>{appointment.slotMinutes} minutes</span>
            <span>&middot;</span>
            <span>{formatMoney(appointment.feeCentsAtBooking)}</span>
            {appointment.rescheduledFrom ? (
              <>
                <span>&middot;</span>
                <span>Moved from an earlier time</span>
              </>
            ) : null}
          </div>

          {appointment.status === 'cancelled' && appointment.cancelReason ? (
            <p className="small muted">Reason: {appointment.cancelReason}</p>
          ) : null}
        </div>
      </div>

      <ErrorMessage error={error} onDismiss={() => setError(null)} />

      {/* ---------- actions ---------- */}
      {appointment.status === 'booked' ? (
        canChange ? (
          <div className="appointment-card__actions">
            {!confirmingCancel && !isRescheduling ? (
              <>
                <button
                  type="button"
                  className="btn btn--secondary btn--small"
                  onClick={onStartReschedule}
                >
                  Reschedule
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={() => setConfirmingCancel(true)}
                >
                  Cancel
                </button>
              </>
            ) : null}
          </div>
        ) : (
          // Explains WHY there are no buttons, instead of leaving an
          // empty space the patient has to guess about.
          <p className="small muted appointment-card__locked">
            {noticeMinutes < 0
              ? 'This appointment has started.'
              : `Changes close 2 hours before the appointment. Please phone the clinic.`}
          </p>
        )
      ) : null}

      {/* ---------- cancel confirmation ---------- */}
      {confirmingCancel ? (
        <div className="appointment-card__panel">
          <h3>Cancel this appointment?</h3>
          <p className="small muted">
            The slot will be offered to other patients. You can book again at any time.
          </p>

          <div className="field">
            <label htmlFor={`cancel-reason-${appointment.id}`}>
              Reason (optional)
            </label>
            <input
              id={`cancel-reason-${appointment.id}`}
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              maxLength={300}
              placeholder="e.g. Feeling better"
            />
          </div>

          <div className="row row--end">
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => setConfirmingCancel(false)}
              disabled={busy}
            >
              Keep it
            </button>
            <button
              type="button"
              className="btn btn--danger btn--small"
              onClick={cancel}
              disabled={busy}
            >
              {busy ? <Spinner label="Cancelling" /> : 'Yes, cancel'}
            </button>
          </div>
        </div>
      ) : null}

      {/* ---------- reschedule panel ---------- */}
      {isRescheduling ? (
        <div className="appointment-card__panel">
          <div className="card__head">
            <h3>Move this appointment</h3>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={onCancelReschedule}
              disabled={busy}
            >
              Close
            </button>
          </div>

          <p className="small muted">
            Pick a new time with {appointment.doctorName}. Your reason for the visit and
            the fee stay the same.
          </p>

          {busy ? (
            <LoadingArea label="Moving your appointment..." />
          ) : (
            <SlotPicker
              doctorId={appointment.doctorId}
              selected={null}
              onSelect={reschedule}
            />
          )}
        </div>
      ) : null}
    </article>
  );
}
