// UploadReport.jsx
// Pick a booking, choose a PDF or image file, and upload it
// to POST /api/reports.

import { useState } from 'react';
import { API_URL } from '../config.js';
import Message from './Message.jsx';

function UploadReport({ appointments, onUploaded }) {
  const [appointmentId, setAppointmentId] = useState('');
  const [file, setFile] = useState(null);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setSuccess('');
    setError('');

    if (!file) {
      setError('Please choose a file');
      return;
    }

    // Files are sent using FormData (not JSON).
    // The field name "report" must match upload.single('report') in the backend.
    const formData = new FormData();
    formData.append('appointmentId', appointmentId);
    formData.append('report', file);

    try {
      const response = await fetch(API_URL + '/api/reports', {
        method: 'POST',
        body: formData, // no Content-Type header: the browser sets it for us
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Upload failed');
        return;
      }

      setSuccess('Report uploaded: ' + data.fileName);
      setFile(null);
      event.target.reset(); // clears the file input box
      onUploaded();
    } catch (err) {
      setError('Could not reach the server');
    }
  }

  if (appointments.length === 0) {
    return <p>Make a booking first, then you can upload a report for it.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="form">
      <label>
        Booking
        <select value={appointmentId} onChange={(e) => setAppointmentId(e.target.value)} required>
          <option value="">-- Choose a booking --</option>
          {appointments.map((a) => (
            <option key={a.id} value={a.id}>
              #{a.id} - {a.patientName} on {a.date} at {a.time}
            </option>
          ))}
        </select>
      </label>

      <label>
        Report file (PDF, PNG or JPG, max 5 MB)
        <input
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          onChange={(e) => setFile(e.target.files[0])}
          required
        />
      </label>

      <button type="submit">Upload Report</button>

      <Message type="success" text={success} />
      <Message type="error" text={error} />
    </form>
  );
}

export default UploadReport;
