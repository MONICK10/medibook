// src/pages/doctor/DoctorPatientDetailPage.jsx
// -----------------------------------------------------------------
// One patient's record, as far as this doctor may see it:
//   * their contact details
//   * visits with THIS doctor only
//   * their reports (the whole file - a treating doctor needs the
//     blood test another doctor ordered)
//   * prescriptions THIS doctor wrote
//
// If the doctor has never had an appointment with this patient, the
// backend returns 403 and this page shows the refusal rather than an
// empty record. That is the acceptance check "a doctor cannot open the
// reports of a patient they have never seen", seen from the UI side.
// -----------------------------------------------------------------

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import {
  Empty,
  ErrorMessage,
  LoadingArea,
  Message,
  Spinner,
  StatusBadge,
  formatDate,
  formatFileSize,
  formatTime,
  formatTimestamp,
} from '../../components/ui.jsx';
import './DoctorPages.css';

export default function DoctorPatientDetailPage() {
  const { patientUserId } = useParams();

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [downloadError, setDownloadError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const result = await api.get(`/api/doctor/patients/${patientUserId}`);
        if (!cancelled) setData(result);
      } catch (apiError) {
        if (!cancelled) setError(apiError);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [patientUserId]);

  if (error) {
    return (
      <div className="page page--narrow">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/doctor/patients">My patients</Link>
        </nav>

        <div className="card">
          {error.isForbidden ? (
            // Spelled out, because this is the interesting case.
            <>
              <h1>Not your patient</h1>
              <Message type="error" text={error.message} />
              <p className="muted">
                You can only open the record of a patient who has an appointment with
                you. This is checked by the server, not just hidden here.
              </p>
            </>
          ) : (
            <>
              <h1>Could not open this record</h1>
              <ErrorMessage error={error} />
            </>
          )}
          <Link to="/doctor/patients" className="btn btn--secondary">
            Back to my patients
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return <LoadingArea label="Loading the patient record..." />;

  return (
    <div className="page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/doctor/patients">My patients</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{data.patient.name}</span>
      </nav>

      {/* ---------- who ---------- */}
      <section className="card patient-header">
        <div>
          <h1>{data.patient.name}</h1>
          <p className="muted">
            {data.patient.email}
            {data.patient.phone ? (
              <>
                {' '}
                &middot; <a href={`tel:${data.patient.phone}`}>{data.patient.phone}</a>
              </>
            ) : null}
          </p>
          <p className="small muted">
            Registered {formatTimestamp(data.patient.memberSince)}
          </p>
        </div>

        <div className="patient-header__stats">
          <div className="stat">
            <div className="stat__value">{data.visits.length}</div>
            <div className="stat__label">Visits with you</div>
          </div>
          <div className="stat">
            <div className="stat__value">{data.reports.length}</div>
            <div className="stat__label">Reports</div>
          </div>
        </div>
      </section>

      <ErrorMessage error={downloadError} onDismiss={() => setDownloadError(null)} />

      <div className="dashboard-columns">
        {/* ---------- visits ---------- */}
        <section className="card">
          <div className="card__head">
            <h2>Visits with you</h2>
          </div>

          {data.visits.length === 0 ? (
            <Empty title="No visits recorded" />
          ) : (
            <ul className="mini-list">
              {data.visits.map((visit) => (
                <li key={visit.id}>
                  <div>
                    <div className="strong">
                      {formatDate(visit.date)}, {formatTime(visit.startTime)}
                    </div>
                    {visit.reason ? (
                      <div className="small muted">{visit.reason}</div>
                    ) : null}
                  </div>
                  <StatusBadge status={visit.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---------- reports ---------- */}
        <section className="card">
          <div className="card__head">
            <h2>Reports</h2>
            <span className="muted small">Uploaded by the patient</span>
          </div>

          {data.reports.length === 0 ? (
            <Empty title="No reports">
              <p className="small">This patient has not uploaded any files.</p>
            </Empty>
          ) : (
            <ul className="report-list">
              {data.reports.map((report) => (
                <ReportRow
                  key={report.id}
                  report={report}
                  onError={setDownloadError}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ---------- prescriptions ---------- */}
      <section className="card">
        <div className="card__head">
          <h2>Prescriptions you wrote</h2>
        </div>

        {data.prescriptions.length === 0 ? (
          <Empty title="None yet">
            <p className="small">
              After a completed visit you can write a prescription from the
              appointments list.
            </p>
          </Empty>
        ) : (
          <div className="stack">
            {data.prescriptions.map((prescription) => (
              <div className="prescription-block" key={prescription.id}>
                <div className="prescription-block__head">
                  <strong>
                    {prescription.appointmentDate
                      ? formatDate(prescription.appointmentDate)
                      : formatTimestamp(prescription.createdAt)}
                  </strong>
                  <Link
                    to={`/doctor/appointments/${prescription.appointmentId}/prescription`}
                    className="btn btn--ghost btn--small"
                  >
                    Edit
                  </Link>
                </div>

                <ul className="medicine-list">
                  {prescription.medicines.map((medicine, index) => (
                    <li key={index}>
                      <strong>{medicine.name}</strong> &middot; {medicine.dose} &middot;{' '}
                      {medicine.frequency} &middot; {medicine.days}{' '}
                      {medicine.days === 1 ? 'day' : 'days'}
                    </li>
                  ))}
                </ul>

                {prescription.notes ? (
                  <p className="small muted prescription-block__notes">
                    {prescription.notes}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* A plain statement of the boundary, for the student reading
          this screen as much as for the doctor using it. */}
      <p className="small muted">
        You are seeing this record because you have an appointment with this patient.
        Prescriptions written by other doctors are not shown. Every report you open is
        recorded in the clinic&rsquo;s audit log.
      </p>
    </div>
  );
}

function ReportRow({ report, onError }) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      // Permission is checked here, on the server, and the download is
      // written to the audit log before the link is handed over.
      const { url } = await api.get(`/api/reports/${report.id}/download-url`);
      const link = document.createElement('a');
      link.href = url;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (apiError) {
      onError(apiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="report-list__item">
      <span className="report-list__icon" aria-hidden="true">
        {report.mimeType === 'application/pdf' ? 'PDF' : 'IMG'}
      </span>

      <div className="report-list__info">
        <div className="strong">{report.title}</div>
        <div className="small muted">
          {formatTimestamp(report.createdAt)} &middot; {formatFileSize(report.sizeBytes)}
        </div>
      </div>

      <button
        type="button"
        className="btn btn--secondary btn--small"
        onClick={download}
        disabled={busy}
      >
        {busy ? <Spinner label="Preparing" /> : 'Open'}
      </button>
    </li>
  );
}
