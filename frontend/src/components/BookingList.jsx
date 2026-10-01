// BookingList.jsx
// Shows all bookings in a table.

function BookingList({ appointments, doctors }) {
  if (appointments.length === 0) {
    return <p>No bookings yet.</p>;
  }

  // Bookings only store the doctor's id, so look up the doctor's name.
  function getDoctorName(doctorId) {
    const doctor = doctors.find((d) => d.id === doctorId);
    return doctor ? doctor.name : 'Unknown';
  }

  return (
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Patient</th>
          <th>Phone</th>
          <th>Doctor</th>
          <th>Date</th>
          <th>Time</th>
          <th>Report</th>
        </tr>
      </thead>
      <tbody>
        {appointments.map((a) => (
          <tr key={a.id}>
            <td>{a.id}</td>
            <td>{a.patientName}</td>
            <td>{a.phone}</td>
            <td>{getDoctorName(a.doctorId)}</td>
            <td>{a.date}</td>
            <td>{a.time}</td>
            <td>{a.reportFile ? a.reportFile : '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default BookingList;
