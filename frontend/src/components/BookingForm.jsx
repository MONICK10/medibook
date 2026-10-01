// BookingForm.jsx
// A form where the patient enters their details and picks a doctor.
// On submit, it sends the data to POST /api/appointments.

import { useState } from 'react';
import { API_URL } from '../config.js';
import Message from './Message.jsx';

function BookingForm({ doctors, onBooked }) {
  // One piece of state for each form field.
  const [patientName, setPatientName] = useState('');
  const [phone, setPhone] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');

  // Messages to show after submitting.
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    // Stop the browser from reloading the page (the default form behaviour).
    event.preventDefault();
    setSuccess('');
    setError('');

    try {
      const response = await fetch(API_URL + '/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientName, phone, doctorId, date, time }),
      });
      const data = await response.json();

      // response.ok is true for status codes 200-299.
      if (!response.ok) {
        setError(data.error || 'Booking failed');
        return;
      }

      setSuccess('Booking saved! Your booking ID is ' + data.id);

      // Clear the form.
      setPatientName('');
      setPhone('');
      setDoctorId('');
      setDate('');
      setTime('');

      // Tell App.jsx to reload the bookings list.
      onBooked();
    } catch (err) {
      setError('Could not reach the server');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form">
      <label>
        Patient name
        <input
          type="text"
          value={patientName}
          onChange={(e) => setPatientName(e.target.value)}
          placeholder="e.g. Test Patient"
          required
        />
      </label>

      <label>
        Phone (10 digits)
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="e.g. 9000000000"
          required
        />
      </label>

      <label>
        Doctor
        <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} required>
          <option value="">-- Choose a doctor --</option>
          {doctors.map((doctor) => (
            <option key={doctor.id} value={doctor.id}>
              {doctor.name} ({doctor.speciality})
            </option>
          ))}
        </select>
      </label>

      <div className="row">
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label>
          Time
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </label>
      </div>

      <button type="submit">Book Appointment</button>

      <Message type="success" text={success} />
      <Message type="error" text={error} />
    </form>
  );
}

export default BookingForm;
