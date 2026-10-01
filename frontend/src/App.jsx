// App.jsx
// -----------------------------------------------------------------
// The main page. It loads doctors and bookings from the backend,
// then shows the 3 sections:
//   1. Doctors
//   2. Book Appointment (form + list of bookings)
//   3. Upload Report
// -----------------------------------------------------------------

import { useEffect, useState } from 'react';
import { API_URL } from './config.js';
import DoctorList from './components/DoctorList.jsx';
import BookingForm from './components/BookingForm.jsx';
import BookingList from './components/BookingList.jsx';
import UploadReport from './components/UploadReport.jsx';
import Message from './components/Message.jsx';

function App() {
  // "State" = data that can change. When it changes, React redraws the page.
  const [doctors, setDoctors] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loadError, setLoadError] = useState('');

  // Get the list of doctors from the backend.
  async function loadDoctors() {
    try {
      const response = await fetch(API_URL + '/api/doctors');
      const data = await response.json();
      setDoctors(data);
    } catch (err) {
      setLoadError('Could not reach the server. Is the backend running?');
    }
  }

  // Get the list of bookings from the backend.
  async function loadAppointments() {
    try {
      const response = await fetch(API_URL + '/api/appointments');
      const data = await response.json();
      setAppointments(data);
    } catch (err) {
      setLoadError('Could not reach the server. Is the backend running?');
    }
  }

  // useEffect with [] runs ONCE, when the page first opens.
  useEffect(() => {
    loadDoctors();
    loadAppointments();
  }, []);

  return (
    <div className="container">
      <header>
        <h1>MediBook</h1>
        <p className="subtitle">Book a doctor appointment (demo app, fake data only)</p>
      </header>

      <Message type="error" text={loadError} />

      <section className="card">
        <h2>1. Doctors</h2>
        <DoctorList doctors={doctors} />
      </section>

      <section className="card">
        <h2>2. Book Appointment</h2>
        {/* After a booking is saved, reload the list so it appears. */}
        <BookingForm doctors={doctors} onBooked={loadAppointments} />
        <h3>All Bookings</h3>
        <BookingList appointments={appointments} doctors={doctors} />
      </section>

      <section className="card">
        <h2>3. Upload Report</h2>
        {/* After a report is uploaded, reload the list to show the file name. */}
        <UploadReport appointments={appointments} onUploaded={loadAppointments} />
      </section>
    </div>
  );
}

export default App;
