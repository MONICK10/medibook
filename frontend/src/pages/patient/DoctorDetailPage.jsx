// src/pages/patient/DoctorDetailPage.jsx
// -----------------------------------------------------------------
// One doctor: their profile, and the next seven days of free slots.
//
// Choosing a slot moves to the confirm step (BookAppointmentPage) with
// the chosen time in the URL. Two steps rather than one, because the
// second step is where the reason for the visit is typed - and a
// booking should not be one accidental click away.
// -----------------------------------------------------------------

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import SlotPicker from '../../components/SlotPicker.jsx';
import { ErrorMessage, LoadingArea, formatMoney } from '../../components/ui.jsx';
import './PatientPages.css';

export default function DoctorDetailPage() {
  const { doctorId } = useParams();
  const navigate = useNavigate();

  const [doctor, setDoctor] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const result = await api.get(`/api/doctors/${doctorId}`);
        if (!cancelled) setDoctor(result.doctor);
      } catch (apiError) {
        if (!cancelled) setError(apiError);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doctorId]);

  if (error) {
    return (
      <div className="page">
        <ErrorMessage error={error} />
        <Link to="/patient/doctors" className="btn btn--secondary">
          Back to all doctors
        </Link>
      </div>
    );
  }

  if (!doctor) return <LoadingArea label="Loading the doctor's details..." />;

  return (
    <div className="page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/patient/doctors">Find a doctor</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{doctor.name}</span>
      </nav>

      {/* ---------- profile ---------- */}
      <section className="card doctor-profile">
        <div className="doctor-profile__head">
          <span className="doctor-profile__initials" aria-hidden="true">
            {initialsOf(doctor.name)}
          </span>

          <div className="doctor-profile__identity">
            <h1>{doctor.name}</h1>
            <p className="doctor-profile__specialty">{doctor.specialtyName}</p>
            {doctor.qualification ? (
              <p className="muted small">{doctor.qualification}</p>
            ) : null}
          </div>

          <dl className="doctor-profile__facts">
            <div>
              <dt>Experience</dt>
              <dd>{doctor.experienceYears} years</dd>
            </div>
            <div>
              <dt>Consultation fee</dt>
              <dd className="doctor-profile__fee">{formatMoney(doctor.feeCents)}</dd>
            </div>
          </dl>
        </div>

        {doctor.bio ? (
          <>
            <hr className="divider" />
            <h2 className="doctor-profile__about">About</h2>
            <p className="doctor-profile__bio">{doctor.bio}</p>
          </>
        ) : null}
      </section>

      {/* ---------- slots ---------- */}
      <section className="card">
        <div className="card__head">
          <h2>Choose a time</h2>
          <span className="muted small">Next 7 days</span>
        </div>

        <SlotPicker
          doctorId={doctorId}
          selected={null}
          onSelect={(slot) =>
            // The chosen slot travels in the URL rather than in router
            // state, so the confirm page survives a refresh.
            navigate(
              `/patient/doctors/${doctorId}/book?date=${slot.date}&time=${encodeURIComponent(
                slot.startTime
              )}`
            )
          }
        />
      </section>
    </div>
  );
}

function initialsOf(name) {
  return String(name)
    .replace(/^(Dr|Mr|Mrs|Ms|Prof)\.?\s+/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || '')
    .join('')
    .toUpperCase();
}
