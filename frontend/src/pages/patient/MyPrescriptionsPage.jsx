// src/pages/patient/MyPrescriptionsPage.jsx
// -----------------------------------------------------------------
// Prescriptions written for the logged-in patient, newest first.
//
// Read-only. A patient can see what was prescribed but not change it,
// which is enforced on the server: the patient role holds
// prescription:readOwn and not prescription:write.
// -----------------------------------------------------------------

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import {
  Empty,
  ErrorMessage,
  LoadingArea,
  formatDate,
  formatTimestamp,
} from '../../components/ui.jsx';
import './PatientPages.css';

export default function MyPrescriptionsPage() {
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const result = await api.get('/api/prescriptions?limit=100');
        if (!cancelled) setPrescriptions(result.prescriptions);
      } catch (apiError) {
        if (!cancelled) setError(apiError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>My prescriptions</h1>
          <p>What your doctors have prescribed, most recent first.</p>
        </div>
      </div>

      <ErrorMessage error={error} onDismiss={() => setError(null)} />

      {loading ? (
        <LoadingArea label="Loading your prescriptions..." />
      ) : prescriptions.length === 0 ? (
        <div className="card">
          <Empty title="No prescriptions yet">
            <p className="small">
              After a visit, anything your doctor prescribes will appear here.
            </p>
            <Link to="/patient/appointments" className="btn btn--small btn--secondary">
              See my appointments
            </Link>
          </Empty>
        </div>
      ) : (
        <div className="stack">
          {prescriptions.map((prescription) => (
            <article className="card prescription" key={prescription.id}>
              <div className="prescription__head">
                <div>
                  <h2 className="prescription__doctor">{prescription.doctorName}</h2>
                  <p className="muted small">
                    {prescription.appointmentDate
                      ? `Visit on ${formatDate(prescription.appointmentDate)}`
                      : `Written ${formatTimestamp(prescription.createdAt)}`}
                  </p>
                </div>
                {/* Shown when a doctor has corrected a prescription, so
                    a patient is not confused by a changed dose. */}
                {prescription.updatedAt !== prescription.createdAt ? (
                  <span className="badge badge--neutral">
                    Updated {formatTimestamp(prescription.updatedAt)}
                  </span>
                ) : null}
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th className="wrap">Medicine</th>
                      <th>Dose</th>
                      <th>How often</th>
                      <th>For</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prescription.medicines.map((medicine, index) => (
                      // The index is acceptable as a key here: the list
                      // is read-only and never reordered.
                      <tr key={index}>
                        <td className="wrap strong">{medicine.name}</td>
                        <td>{medicine.dose}</td>
                        <td className="wrap">{medicine.frequency}</td>
                        <td className="nowrap">
                          {medicine.days} {medicine.days === 1 ? 'day' : 'days'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {prescription.notes ? (
                <div className="prescription__notes">
                  <h3>Notes from your doctor</h3>
                  {/* white-space: pre-wrap in the CSS keeps the
                      doctor's line breaks. */}
                  <p>{prescription.notes}</p>
                </div>
              ) : null}
            </article>
          ))}

          <p className="small muted">
            Always follow your doctor&rsquo;s instructions. Contact the clinic if
            anything here is unclear.
          </p>
        </div>
      )}
    </div>
  );
}
