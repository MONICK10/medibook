// src/pages/doctor/DoctorPatientsPage.jsx
// -----------------------------------------------------------------
// The doctor's own patient list.
//
// The backend builds this from the appointments table, so it can only
// ever contain patients this doctor has actually seen. There is no way
// to ask it for anybody else - and asking for a stranger's record
// directly returns 403.
// -----------------------------------------------------------------

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, queryString } from '../../api/client.js';
import {
  Empty,
  ErrorMessage,
  LoadingArea,
  formatDate,
} from '../../components/ui.jsx';
import './DoctorPages.css';

export default function DoctorPatientsPage() {
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    api
      .get(`/api/doctor/patients${queryString({ search: submitted })}`, {
        signal: controller.signal,
      })
      .then((result) => {
        setPatients(result.patients);
        setLoading(false);
      })
      .catch((apiError) => {
        if (apiError.name === 'AbortError') return;
        setError(apiError);
        setLoading(false);
      });

    return () => controller.abort();
  }, [submitted]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>My patients</h1>
          <p>Everyone who has had an appointment with you.</p>
        </div>
      </div>

      <section className="card browse-filters">
        <form
          className="filters"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(search.trim());
          }}
        >
          <div className="field">
            <label htmlFor="search">Search by name or email</label>
            <input
              id="search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="e.g. Ravi"
            />
          </div>
          <div className="filters__actions">
            <button type="submit" className="btn">
              Search
            </button>
            {submitted ? (
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => {
                  setSearch('');
                  setSubmitted('');
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
        <LoadingArea label="Loading your patients..." />
      ) : patients.length === 0 ? (
        <div className="card">
          <Empty title={submitted ? 'No matches' : 'No patients yet'}>
            <p className="small">
              {submitted
                ? 'No patient of yours matches that search.'
                : 'Once a patient books with you, they will appear here.'}
            </p>
          </Empty>
        </div>
      ) : (
        <section className="card card--flush">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="wrap">Patient</th>
                  <th>Phone</th>
                  <th>Visits</th>
                  <th>Last seen</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {patients.map((patient) => (
                  <tr key={patient.id}>
                    <td className="wrap">
                      <Link to={`/doctor/patients/${patient.id}`} className="strong">
                        {patient.name}
                      </Link>
                      <div className="small muted">{patient.email}</div>
                    </td>
                    <td>
                      {patient.phone ? (
                        <a href={`tel:${patient.phone}`}>{patient.phone}</a>
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </td>
                    <td>{patient.visitCount}</td>
                    <td>{formatDate(patient.lastVisitDate)}</td>
                    <td>
                      <div className="table-actions">
                        <Link
                          to={`/doctor/patients/${patient.id}`}
                          className="btn btn--secondary btn--small"
                        >
                          Open
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
