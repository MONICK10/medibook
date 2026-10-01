// src/pages/patient/MyReportsPage.jsx
// -----------------------------------------------------------------
// Upload a medical report, and download your own.
//
// DOWNLOADING IS TWO STEPS, and that is the point:
//   1. ask the API for a download URL - it checks permission, writes
//      the audit entry, and returns a link that dies in 5 minutes
//   2. open that link
//
// The same two steps work whether the file is on the server's disk or
// in a private S3 bucket, so this code does not change when the
// storage adapter does. See backend/adapters/storage.js.
// -----------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import {
  Empty,
  ErrorMessage,
  Field,
  LoadingArea,
  Message,
  Spinner,
  formatFileSize,
  formatTimestamp,
} from '../../components/ui.jsx';
import './PatientPages.css';

const MAX_BYTES = 5 * 1024 * 1024; // keep in step with UPLOAD_MAX_BYTES
const ACCEPTED = '.pdf,.png,.jpg,.jpeg';

export default function MyReportsPage() {
  const [reports, setReports] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reportResult, appointmentResult] = await Promise.all([
        api.get('/api/reports?limit=100'),
        api.get('/api/appointments?limit=100'),
      ]);
      setReports(reportResult.reports);
      setAppointments(appointmentResult.appointments);
    } catch (apiError) {
      setError(apiError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>My reports</h1>
          <p>Scans, test results and letters you want your doctor to see.</p>
        </div>
      </div>

      {notice ? (
        <Message type="success" text={notice} onDismiss={() => setNotice(null)} />
      ) : null}
      <ErrorMessage error={error} onDismiss={() => setError(null)} />

      <UploadCard
        appointments={appointments}
        onUploaded={(message) => {
          setNotice(message);
          load();
        }}
      />

      <section className="card">
        <div className="card__head">
          <h2>Uploaded reports</h2>
          <span className="muted small">
            {reports.length} {reports.length === 1 ? 'file' : 'files'}
          </span>
        </div>

        {loading ? (
          <LoadingArea label="Loading your reports..." />
        ) : reports.length === 0 ? (
          <Empty title="No reports yet">
            <p className="small">
              Upload a PDF or a photo above. Only you and the doctors you have
              appointments with can open it.
            </p>
          </Empty>
        ) : (
          <ul className="report-list">
            {reports.map((report) => (
              <ReportRow key={report.id} report={report} onError={setError} />
            ))}
          </ul>
        )}
      </section>

      <p className="small muted">
        Your reports are private. They are never available at a public web address -
        each download uses a one-off link that expires after a few minutes, and every
        download is recorded.
      </p>
    </div>
  );
}

// ---------- upload ----------
function UploadCard({ appointments, onUploaded }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [appointmentId, setAppointmentId] = useState('');
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);

  function chooseFile(event) {
    const chosen = event.target.files[0] || null;
    setFieldErrors({});
    setError(null);

    // Checked here purely to save the patient a pointless upload of a
    // large file. The real limit is enforced by multer on the server.
    if (chosen && chosen.size > MAX_BYTES) {
      setFieldErrors({
        report: `That file is ${formatFileSize(chosen.size)}. The limit is 5 MB.`,
      });
      setFile(null);
      return;
    }

    setFile(chosen);
    // Pre-fill the title with the file name, which is usually what the
    // patient would have typed anyway.
    if (chosen && !title) setTitle(chosen.name.replace(/\.[^.]+$/, ''));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    if (!file) {
      setFieldErrors({ report: 'Please choose a file.' });
      return;
    }

    setBusy(true);

    // FormData, not JSON, because this carries a file. The field name
    // "report" has to match upload.single('report') in the backend.
    const form = new FormData();
    form.append('report', file);
    if (title) form.append('title', title);
    if (appointmentId) form.append('appointmentId', appointmentId);

    try {
      await api.post('/api/reports', form);
      setFile(null);
      setTitle('');
      setAppointmentId('');
      // Clears the file input, which React cannot reset by state alone.
      if (fileInputRef.current) fileInputRef.current.value = '';
      onUploaded('Your report has been uploaded.');
    } catch (apiError) {
      if (apiError.details) setFieldErrors(apiError.details);
      setError(apiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="card__head">
        <h2>Upload a report</h2>
      </div>

      <form className="form" onSubmit={handleSubmit} noValidate>
        <ErrorMessage error={error} onDismiss={() => setError(null)} />

        <Field
          label="File"
          name="report"
          error={fieldErrors.report}
          hint="PDF, PNG or JPG. Up to 5 MB."
          required
        >
          <input
            id="report"
            name="report"
            type="file"
            accept={ACCEPTED}
            ref={fileInputRef}
            onChange={chooseFile}
            required
            aria-describedby="report-hint"
          />
        </Field>

        {file ? (
          <p className="small muted">
            Selected: <strong>{file.name}</strong> ({formatFileSize(file.size)})
          </p>
        ) : null}

        <Field
          label="Title"
          name="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          error={fieldErrors.title}
          hint="What is this? e.g. Blood test, March"
          maxLength={120}
        />

        <Field
          label="Link to an appointment (optional)"
          name="appointmentId"
          error={fieldErrors.appointmentId}
          hint="Helps the doctor see it in context."
        >
          <select
            id="appointmentId"
            name="appointmentId"
            value={appointmentId}
            onChange={(event) => setAppointmentId(event.target.value)}
            aria-describedby="appointmentId-hint"
          >
            <option value="">Not linked to an appointment</option>
            {appointments.map((appointment) => (
              <option key={appointment.id} value={appointment.id}>
                {appointment.date} - {appointment.doctorName}
              </option>
            ))}
          </select>
        </Field>

        <div className="row row--end">
          <button type="submit" className="btn" disabled={busy || !file}>
            {busy ? <Spinner label="Uploading" /> : 'Upload report'}
          </button>
        </div>
      </form>
    </section>
  );
}

// ---------- one report row ----------
function ReportRow({ report, onError }) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      // Step 1: the permission check happens here, on the server.
      const { url } = await api.get(`/api/reports/${report.id}/download-url`);

      // Step 2: open the short-lived link.
      //
      // A hidden <a download> click rather than window.open, because a
      // popup blocker will often stop window.open when it happens after
      // an await rather than directly in the click handler.
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
          {report.appointmentId ? ' · linked to an appointment' : ''}
        </div>
      </div>

      <button
        type="button"
        className="btn btn--secondary btn--small"
        onClick={download}
        disabled={busy}
      >
        {busy ? <Spinner label="Preparing" /> : 'Download'}
      </button>
    </li>
  );
}
