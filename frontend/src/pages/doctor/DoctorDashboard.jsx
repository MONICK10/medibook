// src/pages/doctor/DoctorDashboard.jsx
// -----------------------------------------------------------------
// The doctor's home screen: today's list, and how the week looks.
//
// Everything comes from /api/doctor/dashboard, which the backend
// scopes to the logged-in doctor. There is no doctor id in the URL,
// so there is nothing to tamper with.
// -----------------------------------------------------------------

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import {
  Empty,
  ErrorMessage,
  LoadingArea,
  StatusBadge,
  formatDate,
  formatTime,
} from '../../components/ui.jsx';
import './DoctorPages.css';

export default function DoctorDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const result = await api.get('/api/doctor/dashboard');
        if (!cancelled) setData(result);
      } catch (apiError) {
        if (!cancelled) setError(apiError);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="page">
        <ErrorMessage error={error} />
      </div>
    );
  }

  if (!data) return <LoadingArea label="Loading your dashboard..." />;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{user.name}</h1>
          <p>{formatDate(data.today, { weekday: true })}</p>
        </div>
        <div className="row">
          <Link to="/doctor/availability" className="btn btn--secondary">
            My schedule
          </Link>
          <Link to="/doctor/appointments" className="btn">
            All appointments
          </Link>
        </div>
      </div>

      {/* Four headline numbers: stat tiles, not a chart. */}
      <div className="stat-grid">
        <div className="stat stat--accent">
          <div className="stat__value">{data.todaysCount}</div>
          <div className="stat__label">Today</div>
        </div>
        <div className="stat">
          <div className="stat__value">{data.todaysRemaining}</div>
          <div className="stat__label">Still to see</div>
        </div>
        <div className="stat">
          <div className="stat__value">{data.upcomingThisWeekCount}</div>
          <div className="stat__label">Next 7 days</div>
        </div>
        <div className="stat">
          <div className="stat__value">{data.totalPatients}</div>
          <div className="stat__label">Patients seen</div>
        </div>
      </div>

      {/* ---------- today's list ---------- */}
      <section className="card today-card">
        <div className="card__head">
          <h2>Today&rsquo;s appointments</h2>
          <Link className="card__title-link" to="/doctor/appointments">
            See all
          </Link>
        </div>

        {data.todaysAppointments.length === 0 ? (
          <Empty title="Nothing booked today">
            <p className="small">
              Your schedule decides when patients can book.{' '}
              <Link to="/doctor/availability">Check your working hours</Link>.
            </p>
          </Empty>
        ) : (
          <ul className="today-list">
            {data.todaysAppointments.map((appointment) => (
              <li key={appointment.id} className="today-list__item">
                <div className="today-list__time">
                  {formatTime(appointment.startTime)}
                  <span className="today-list__duration">
                    {appointment.slotMinutes} min
                  </span>
                </div>

                <div className="today-list__who">
                  <Link
                    to={`/doctor/patients/${appointment.patientUserId}`}
                    className="strong"
                  >
                    {appointment.patientName}
                  </Link>
                  {appointment.reason ? (
                    <p className="small muted today-list__reason">{appointment.reason}</p>
                  ) : null}
                </div>

                <div className="today-list__status">
                  <StatusBadge status={appointment.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- all-time summary ----------
          A handful of counts again, so again tiles and not a chart.
          The status word is always written out, so the meaning never
          depends on a colour. */}
      <section className="card">
        <div className="card__head">
          <h2>Your record</h2>
          <span className="muted small">All time</span>
        </div>

        <ul className="status-counts">
          {[
            { status: 'booked', label: 'Booked', value: data.statusCounts.booked },
            { status: 'completed', label: 'Completed', value: data.statusCounts.completed },
            { status: 'cancelled', label: 'Cancelled', value: data.statusCounts.cancelled },
            { status: 'no_show', label: 'No-show', value: data.statusCounts.noShow },
          ].map((row) => (
            <li key={row.status}>
              <StatusBadge status={row.status} />
              <span className="status-counts__value">{row.value}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
