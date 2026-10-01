// src/pages/admin/AdminDashboard.jsx
// -----------------------------------------------------------------
// The clinic overview: how many patients and doctors, what is
// happening today, and the all-time breakdown by status.
//
// Note what an admin dashboard does NOT show: anything clinical. No
// reports, no prescriptions, no reasons for visits. Running the clinic
// does not require reading patients' medical records, and the backend
// refuses those endpoints for an admin account.
// -----------------------------------------------------------------

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import {
  ErrorMessage,
  LoadingArea,
  StatusBadge,
  formatDate,
} from '../../components/ui.jsx';
import './AdminPages.css';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const result = await api.get('/api/admin/stats');
        if (!cancelled) setStats(result);
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

  if (!stats) return <LoadingArea label="Loading the clinic overview..." />;

  const statusRows = [
    { status: 'booked', value: stats.todayByStatus.booked, allTime: stats.allTimeByStatus.booked },
    { status: 'completed', value: stats.todayByStatus.completed, allTime: stats.allTimeByStatus.completed },
    { status: 'cancelled', value: stats.todayByStatus.cancelled, allTime: stats.allTimeByStatus.cancelled },
    { status: 'no_show', value: stats.todayByStatus.noShow, allTime: stats.allTimeByStatus.noShow },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Clinic overview</h1>
          <p>{formatDate(stats.today, { weekday: true })}</p>
        </div>
        <div className="row">
          <Link to="/admin/doctors" className="btn btn--secondary">
            Manage doctors
          </Link>
          <Link to="/admin/appointments" className="btn">
            All appointments
          </Link>
        </div>
      </div>

      {/* Headline numbers as stat tiles. A grouped bar chart of five
          unrelated totals would be slower to read than the numbers. */}
      <div className="stat-grid">
        <div className="stat stat--accent">
          <div className="stat__value">{stats.appointmentsToday}</div>
          <div className="stat__label">Appointments today</div>
        </div>
        <div className="stat">
          <div className="stat__value">{stats.totals.activePatients}</div>
          <div className="stat__label">Active patients</div>
        </div>
        <div className="stat">
          <div className="stat__value">{stats.totals.activeDoctors}</div>
          <div className="stat__label">Active doctors</div>
        </div>
        <div className="stat">
          <div className="stat__value">{stats.totals.specialties}</div>
          <div className="stat__label">Specialties</div>
        </div>
        <div className="stat">
          <div className="stat__value">{stats.totals.appointments}</div>
          <div className="stat__label">Appointments, all time</div>
        </div>
      </div>

      {/* ---------- status breakdown ----------
          A small table rather than a chart. Four statuses across two
          periods is a 4x2 grid of numbers: a table shows it exactly,
          and every row is named in words so no meaning rests on the
          colour of the pill. */}
      <section className="card admin-breakdown">
        <div className="card__head">
          <h2>Appointments by status</h2>
          <Link className="card__title-link" to="/admin/appointments">
            Browse all
          </Link>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th className="center">Today</th>
                <th className="center">All time</th>
              </tr>
            </thead>
            <tbody>
              {statusRows.map((row) => (
                <tr key={row.status}>
                  <td>
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="center admin-breakdown__number">{row.value}</td>
                  <td className="center admin-breakdown__number">{row.allTime}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------- quick links ---------- */}
      <section className="card">
        <div className="card__head">
          <h2>Manage</h2>
        </div>

        <div className="admin-links">
          {[
            {
              to: '/admin/doctors',
              title: 'Doctors',
              text: 'Add a doctor, edit their details, or deactivate an account.',
            },
            {
              to: '/admin/specialties',
              title: 'Specialties',
              text: 'The departments the clinic covers.',
            },
            {
              to: '/admin/users',
              title: 'Users',
              text: 'Deactivate or reactivate patient accounts.',
            },
            {
              to: '/admin/audit-log',
              title: 'Audit log',
              text: 'Logins, failed logins, record changes and report downloads.',
            },
          ].map((link) => (
            <Link to={link.to} className="admin-link" key={link.to}>
              <span className="admin-link__title">{link.title}</span>
              <span className="admin-link__text">{link.text}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
