// DoctorList.jsx
// Shows each doctor's name and speciality.

function DoctorList({ doctors }) {
  if (doctors.length === 0) {
    return <p>No doctors loaded.</p>;
  }

  return (
    <ul className="doctor-list">
      {/* .map() turns each doctor into one <li>. "key" helps React track items. */}
      {doctors.map((doctor) => (
        <li key={doctor.id}>
          <strong>{doctor.name}</strong>
          <span>{doctor.speciality}</span>
        </li>
      ))}
    </ul>
  );
}

export default DoctorList;
