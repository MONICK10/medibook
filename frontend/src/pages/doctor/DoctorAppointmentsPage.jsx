// src/pages/doctor/DoctorAppointmentsPage.jsx
// -----------------------------------------------------------------
// The doctor's appointment list, with the two actions that only a
// doctor can take: mark a visit Completed or a No-show.
//
// The outcome buttons only appear once the slot has started, matching
// the backend rule. Otherwise a doctor could mark next week's patient
// a no-show today.
// -----------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, queryString } from '../../api/client.js';
import {
  Empty,
  ErrorMessage,
  LoadingArea,
  Message,
  Spinner,
  StatusBadge,
  formatDate,
  formatRelativeDate,
  formatTime,
} from '../../components/ui.jsx';
import './DoctorPages.css';

function hasStarted(date, startTime) {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = startTime.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes) <= new Date();
}

export default function DoctorAppointmentsPage() {
  const [filters, setFilters] = useState({ when: 'upcoming', status: '' });
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get(
        `/api/appointments${queryString({
          when: filters.when || undefined,
          status: filters.status || undefined,
          limit: 100,
        })}`
      );
      setAppointments(result.appointments);
    } catch (apiError) {
      setError(apiError);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Appointments</h1>
          <p>Your schedule, and what happened at each visit.</p>
        </div>
        <Link to="/doctor/availability" className="btn btn--secondary">
          My schedule
        </Link>
      </div>

      {notice ? (
        <Message type="success" text={notice} onDismiss={() => setNotice(null)} />
      ) : null}

      {/* ---------- filters ---------- */}
      <section className="card browse-filters">
        <div className="filters">
          <div className="field">
            <label htmlFor="when">Show</label>
            <select
              id="when"
              value={filters.when}
              onChange={(event) =>
                setFilters((current) => ({ ...current, when: event.target.value }))
              }
            >
              <option value="upcoming">Upcoming</option>
              <option value="past">Past</option>
              <option value="">All</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="status">Status</label>
            <select
              id="status"
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({ ...current, status: event.target.value }))
              }
            >
              <option value="">Any status</option>
              <option value="booked">Booked</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No-show</option>
            </select>
          </div>
        </div>
      </section>

      <ErrorMessage error={error} onDismiss={() => setError(null)} />

      {loading ? (
        <LoadingArea label="Loading your appointments..." />
      ) : appointments.length === 0 ? (
        <div className="card">
          <Empty title="Nothing to show">
            <p className="small">No appointments match those filters.</p>
          </Empty>
        </div>
      ) : (
        <div className="stack">
          {appointments.map((appointment) => (
            <DoctorAppointmentCard
              key={appointment.id}
              appointment={appointment}
              onChanged={(message) => {
                setNotice(message);
                load();
              }}
              onError={setError}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DoctorAppointmentCard({ appointment, onChanged, onError }) {
  const [busy, setBusy] = useState(null); // which button is working

  const started = hasStarted(appointment.date, appointment.startTime);
  const canSetOutcome = appointment.status === 'booked' && started;

  async function setOutcome(status) {
    setBusy(status);
    try {
      await api.post(`/api/appointments/${appointment.id}/outcome`, { status });
      onChanged(
        status === 'completed' ? 'Marked as completed.' : 'Marked as a no-show.'
      );
    } catch (apiError) {
      onError(apiError);
    } finally {
      setBusy(null);
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
            {/* The patient's name links to their record - which the
                backend only opens because this doctor has an
                appointment with them. */}
            <h2 className="appointment-card__doctor">
              <Link to={`/doctor/patients/${appointment.patientUserId}`}>
                {appointment.patientName}
              </Link>
            </h2>
            <StatusBadge status={appointment.status} />
          </div>

          {appointment.patientPhone ? (
            <p className="muted small">
              {/* A tel: link, because a doctor looking at a no-show
                  usually wants to call. */}
              <a href={`tel:${appointment.patientPhone}`}>{appointment.patientPhone}</a>
            </p>
          ) : null}

          {appointment.reason ? (
            <p className="appointment-card__reason">
              <span className="muted small">Reason given: </span>
              {appointment.reason}
            </p>
          ) : null}

          <div className="appointment-card__meta small muted">
            <span>{appointment.slotMinutes} minutes</span>
            {appointment.status === 'cancelled' && appointment.cancelReason ? (
              <>
                <span>&middot;</span>
                <span>{appointment.cancelReason}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* ---------- actions ---------- */}
      <div className="appointment-card__actions">
        {canSetOutcome ? (
          <>
            <button
              type="button"
              className="btn btn--small"
              onClick={() => setOutcome('completed')}
              disabled={Boolean(busy)}
            >
              {busy === 'completed' ? <Spinner label="Saving" /> : 'Mark completed'}
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--small"
              onClick={() => setOutcome('no_show')}
              disabled={Boolean(busy)}
            >
              {busy === 'no_show' ? <Spinner label="Saving" /> : 'Mark no-show'}
            </button>
          </>
        ) : appointment.status === 'booked' ? (
          <span className="small muted">
            You can set the outcome once the appointment has started.
          </span>
        ) : null}

        {/* A prescription can only be attached to a completed visit,
            which is also what the backend requires. */}
        {appointment.status === 'completed' ? (
          <Link
            to={`/doctor/appointments/${appointment.id}/prescription`}
            className="btn btn--secondary btn--small"
          >
            Prescription
          </Link>
        ) : null}

        <Link
          to={`/doctor/patients/${appointment.patientUserId}`}
          className="btn btn--ghost btn--small"
        >
          Patient record
        </Link>
      </div>
    </article>
  );
}
