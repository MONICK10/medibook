// src/pages/patient/PatientDashboard.jsx
// -----------------------------------------------------------------
// The patient's home screen: next appointment, upcoming list, recent
// reports and prescriptions, and a prominent way to book.
//
// One request to /api/patient/dashboard returns everything this screen
// needs. Four separate calls would mean four round trips and a page
// that assembles itself in pieces.
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
  formatFileSize,
  formatRelativeDate,
  formatTime,
  formatTimestamp,
} from '../../components/ui.jsx';
import './PatientPages.css';

export default function PatientDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const result = await api.get('/api/patient/dashboard');
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

  // 'Ravi Shankar' -> 'Ravi'. A first name is friendlier on a greeting.
  const firstName = user.name.split(/\s+/)[0];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Hello, {firstName}</h1>
          <p>Here is what is coming up.</p>
        </div>
        <Link to="/patient/doctors" className="btn">
          Book an appointment
        </Link>
      </div>

      {/* ---------- next appointment ---------- */}
      {data.nextAppointment ? (
        <section className="card next-appointment">
          <div className="next-appointment__label">Your next appointment</div>

          <div className="next-appointment__body">
            <div>
              <div className="next-appointment__when">
                {formatRelativeDate(data.nextAppointment.date)} at{' '}
                {formatTime(data.nextAppointment.startTime)}
              </div>
              <div className="next-appointment__who">
                {data.nextAppointment.doctorName}
                <span className="muted"> &middot; {data.nextAppointment.specialtyName}</span>
              </div>
              {data.nextAppointment.reason ? (
                <p className="small muted next-appointment__reason">
                  {data.nextAppointment.reason}
                </p>
              ) : null}
            </div>

            <Link to="/patient/appointments" className="btn btn--secondary btn--small">
              Manage
            </Link>
          </div>
        </section>
      ) : (
        <section className="card">
          <Empty title="No appointments booked">
            <p>When you book an appointment it will appear here.</p>
            <Link to="/patient/doctors" className="btn btn--small">
              Find a doctor
            </Link>
          </Empty>
        </section>
      )}

      {/* ---------- counts ----------
          Four headline numbers, so these are stat tiles rather than a
          chart. A four-bar bar chart of "3 upcoming, 7 completed"
          would be harder to read than the numbers themselves. */}
      <div className="stat-grid patient-stats">
        <div className="stat stat--accent">
          <div className="stat__value">{data.upcomingCount}</div>
          <div className="stat__label">Upcoming</div>
        </div>
        <div className="stat">
          <div className="stat__value">{data.visitCounts.completed}</div>
          <div className="stat__label">Visits completed</div>
        </div>
        <div className="stat">
          <div className="stat__value">{data.reportCount}</div>
          <div className="stat__label">Reports</div>
        </div>
        <div className="stat">
          <div className="stat__value">{data.prescriptionCount}</div>
          <div className="stat__label">Prescriptions</div>
        </div>
      </div>

      <div className="dashboard-columns">
        {/* ---------- upcoming ---------- */}
        <section className="card">
          <div className="card__head">
            <h2>Upcoming appointments</h2>
            <Link className="card__title-link" to="/patient/appointments">
              See all
            </Link>
          </div>

          {data.upcomingAppointments.length === 0 ? (
            <Empty title="Nothing booked">
              <p className="small">You have no upcoming appointments.</p>
            </Empty>
          ) : (
            <ul className="mini-list">
              {data.upcomingAppointments.map((appointment) => (
                <li key={appointment.id}>
                  <div>
                    <div className="strong">
                      {formatRelativeDate(appointment.date)},{' '}
                      {formatTime(appointment.startTime)}
                    </div>
                    <div className="small muted">
                      {appointment.doctorName} &middot; {appointment.specialtyName}
                    </div>
                  </div>
                  <StatusBadge status={appointment.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---------- recent reports ---------- */}
        <section className="card">
          <div className="card__head">
            <h2>Recent reports</h2>
            <Link className="card__title-link" to="/patient/reports">
              See all
            </Link>
          </div>

          {data.recentReports.length === 0 ? (
            <Empty title="No reports yet">
              <p className="small">
                Upload a scan or a test result to share it with your doctor.
              </p>
              <Link to="/patient/reports" className="btn btn--small btn--secondary">
                Upload a report
              </Link>
            </Empty>
          ) : (
            <ul className="mini-list">
              {data.recentReports.map((report) => (
                <li key={report.id}>
                  <div>
                    <div className="strong">{report.title}</div>
                    <div className="small muted">
                      {formatTimestamp(report.createdAt)} &middot;{' '}
                      {formatFileSize(report.sizeBytes)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ---------- prescriptions ---------- */}
      {data.recentPrescriptions.length > 0 ? (
        <section className="card">
          <div className="card__head">
            <h2>Recent prescriptions</h2>
            <Link className="card__title-link" to="/patient/prescriptions">
              See all
            </Link>
          </div>

          <ul className="mini-list">
            {data.recentPrescriptions.map((prescription) => (
              <li key={prescription.id}>
                <div>
                  <div className="strong">{prescription.doctorName}</div>
                  <div className="small muted">
                    {prescription.appointmentDate
                      ? formatRelativeDate(prescription.appointmentDate)
                      : formatTimestamp(prescription.createdAt)}{' '}
                    &middot; {prescription.medicines.length}{' '}
                    {prescription.medicines.length === 1 ? 'medicine' : 'medicines'}
                  </div>
                </div>
                <Link
                  to="/patient/prescriptions"
                  className="btn btn--ghost btn--small"
                >
                  View
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
