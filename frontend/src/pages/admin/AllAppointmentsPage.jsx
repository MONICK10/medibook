// src/pages/admin/AllAppointmentsPage.jsx
// -----------------------------------------------------------------
// Every appointment in the clinic, filtered by date, doctor and
// status, and paginated.
//
// Note what is shown and what is not: who, when, with whom, and the
// status. The reason the patient gave is NOT displayed - it is
// clinical information, and an admin running the clinic has no reason
// to read it. The backend does return it on this endpoint, so this is
// a judgement made here; the stricter version would drop it from the
// admin serializer too.
// -----------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { api, queryString } from '../../api/client.js';
import {
  Empty,
  ErrorMessage,
  LoadingArea,
  Pager,
  StatusBadge,
  formatDate,
  formatMoney,
  formatTime,
} from '../../components/ui.jsx';
import './AdminPages.css';

const PAGE_SIZE = 25;

// Today in local time, as YYYY-MM-DD. Built from the parts, because
// toISOString() converts to UTC and can give the wrong day.
function todayString() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

export default function AllAppointmentsPage() {
  const [filters, setFilters] = useState({
    date: '',
    doctorId: '',
    status: '',
    search: '',
  });
  const [searchInput, setSearchInput] = useState('');
  const [offset, setOffset] = useState(0);

  const [appointments, setAppointments] = useState([]);
  const [total, setTotal] = useState(0);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get('/api/admin/doctors?limit=100')
      .then((result) => setDoctors(result.doctors))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get(
        `/api/admin/appointments${queryString({
          date: filters.date,
          doctorId: filters.doctorId,
          status: filters.status,
          search: filters.search,
          limit: PAGE_SIZE,
          offset,
        })}`
      );
      setAppointments(result.appointments);
      setTotal(result.total);
    } catch (apiError) {
      setError(apiError);
    } finally {
      setLoading(false);
    }
  }, [filters, offset]);

  useEffect(() => {
    load();
  }, [load]);

  function setFilter(changes) {
    setOffset(0); // a new filter always starts at page one
    setFilters((current) => ({ ...current, ...changes }));
  }

  const hasFilters =
    filters.date || filters.doctorId || filters.status || filters.search;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>All appointments</h1>
          <p>Every booking in the clinic.</p>
        </div>
      </div>

      {/* ---------- filters ---------- */}
      <section className="card browse-filters">
        <form
          className="filters"
          onSubmit={(event) => {
            event.preventDefault();
            setFilter({ search: searchInput.trim() });
          }}
        >
          <div className="field">
            <label htmlFor="date">Date</label>
            <input
              id="date"
              type="date"
              value={filters.date}
              onChange={(event) => setFilter({ date: event.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor="doctorId">Doctor</label>
            <select
              id="doctorId"
              value={filters.doctorId}
              onChange={(event) => setFilter({ doctorId: event.target.value })}
            >
              <option value="">All doctors</option>
              {doctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="status">Status</label>
            <select
              id="status"
              value={filters.status}
              onChange={(event) => setFilter({ status: event.target.value })}
            >
              <option value="">Any status</option>
              <option value="booked">Booked</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No-show</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="search">Patient or doctor</label>
            <input
              id="search"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Name"
            />
          </div>

          <div className="filters__actions">
            <button type="submit" className="btn">
              Apply
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setFilter({ date: todayString() })}
            >
              Today
            </button>
            {hasFilters ? (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setSearchInput('');
                  setFilter({ date: '', doctorId: '', status: '', search: '' });
                }}
              >
                Clear
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <ErrorMessage error={error} onDismiss={() => setError(null)} />

      {loading ? (
        <LoadingArea label="Loading appointments..." />
      ) : appointments.length === 0 ? (
        <div className="card">
          <Empty title="No appointments found">
            <p className="small">
              {hasFilters
                ? 'Nothing matches those filters.'
                : 'There are no appointments yet.'}
            </p>
          </Empty>
        </div>
      ) : (
        <>
          <section className="card card--flush">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th className="wrap">Patient</th>
                    <th className="wrap">Doctor</th>
                    <th>Fee</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.map((appointment) => (
                    <tr key={appointment.id}>
                      <td>
                        <div className="strong">{formatDate(appointment.date)}</div>
                        <div className="small muted">
                          {formatTime(appointment.startTime)}
                        </div>
                      </td>
                      <td className="wrap">
                        <div>{appointment.patientName}</div>
                        {appointment.patientPhone ? (
                          <div className="small muted">{appointment.patientPhone}</div>
                        ) : null}
                      </td>
                      <td className="wrap">
                        <div>{appointment.doctorName}</div>
                        <div className="small muted">{appointment.specialtyName}</div>
                      </td>
                      <td>{formatMoney(appointment.feeCentsAtBooking)}</td>
                      <td>
                        <StatusBadge status={appointment.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <Pager total={total} limit={PAGE_SIZE} offset={offset} onChange={setOffset} />
        </>
      )}

      <p className="small muted">
        The reason a patient gave for their visit is not shown here. It is clinical
        information, and only the patient and their doctor can see it.
      </p>
    </div>
  );
}
