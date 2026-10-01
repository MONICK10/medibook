// src/pages/LandingPage.jsx
// -----------------------------------------------------------------
// The public home page: hero, how it works, specialties, a few
// featured doctors, and the footer (from Layout).
//
// It calls /api/specialties and /api/doctors, both of which are
// deliberately public on the backend - a clinic's departments and
// doctors are its shop window. Nothing here identifies a patient.
// -----------------------------------------------------------------

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { CLINIC_NAME } from '../config.js';
import { Message, Spinner, formatMoney } from '../components/ui.jsx';
import './LandingPage.css';

const STEPS = [
  {
    title: 'Find a doctor',
    text: 'Browse by specialty or search by name. Every doctor lists their qualifications, experience and fee.',
  },
  {
    title: 'Pick a free slot',
    text: 'See real availability for the next seven days and choose a time that suits you.',
  },
  {
    title: 'Attend and follow up',
    text: 'Share reports before your visit, then read your prescription online afterwards.',
  },
];

export default function LandingPage() {
  const { isLoggedIn, role } = useAuth();

  const [specialties, setSpecialties] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Both at once rather than one after the other: they do not
        // depend on each other, so waiting twice would be wasteful.
        const [specialtyResult, doctorResult] = await Promise.all([
          api.get('/api/specialties', { auth: false }),
          api.get('/api/doctors?limit=3', { auth: false }),
        ]);
        if (cancelled) return;
        setSpecialties(specialtyResult.specialties);
        setDoctors(doctorResult.doctors);
      } catch {
        // The landing page must still render if the backend is down -
        // the hero and the explanation are static. Only the live lists
        // are skipped, with a quiet note.
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="landing">
      {/* ---------- hero ---------- */}
      <section className="hero">
        <div className="hero__inner">
          <div className="hero__text">
            <p className="hero__eyebrow">Clinic appointments, online</p>
            <h1>Book a doctor without the phone queue</h1>
            <p className="hero__lead">
              {CLINIC_NAME} lets you see which doctors are free, book a slot in a few
              clicks, and keep your reports and prescriptions in one place.
            </p>

            <div className="hero__actions">
              {isLoggedIn ? (
                <Link to={`/${role}`} className="btn">
                  Go to my dashboard
                </Link>
              ) : (
                <>
                  <Link to="/register" className="btn">
                    Create an account
                  </Link>
                  <Link to="/login" className="btn btn--secondary">
                    Log in
                  </Link>
                </>
              )}
            </div>

            <p className="demo-note hero__demo">
              This is a teaching demo. All doctors, patients and medical records in it
              are invented. Please do not enter real personal information.
            </p>
          </div>

          {/* A decorative panel. aria-hidden because it says nothing a
              screen reader needs - the text alongside carries it all. */}
          <div className="hero__panel" aria-hidden="true">
            <div className="hero__card">
              <div className="hero__card-row">
                <span className="hero__avatar" />
                <div>
                  <div className="hero__card-name">Dr. Asha Rao</div>
                  <div className="hero__card-meta">General Medicine</div>
                </div>
              </div>
              <div className="hero__slots">
                <span className="hero__slot">09:00</span>
                <span className="hero__slot hero__slot--taken">09:20</span>
                <span className="hero__slot">09:40</span>
                <span className="hero__slot">10:00</span>
                <span className="hero__slot hero__slot--taken">10:20</span>
                <span className="hero__slot">10:40</span>
              </div>
              <div className="hero__cta">Confirm booking</div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- how it works ---------- */}
      <section className="page landing__section" id="how-it-works">
        <div className="landing__section-head">
          <h2>How it works</h2>
          <p className="muted">Three steps, start to finish.</p>
        </div>

        <ol className="steps">
          {STEPS.map((step, index) => (
            <li className="step" key={step.title}>
              <span className="step__number" aria-hidden="true">
                {index + 1}
              </span>
              <h3>{step.title}</h3>
              <p className="muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- specialties ---------- */}
      <section className="page landing__section">
        <div className="landing__section-head">
          <h2>Specialties</h2>
          <p className="muted">Departments covered by the clinic.</p>
        </div>

        {loading ? (
          <Spinner block />
        ) : failed ? (
          <Message
            type="warning"
            text="The live doctor and specialty lists could not be loaded."
            detail="If you are running this locally, start the backend and refresh the page."
          />
        ) : (
          <ul className="specialties">
            {specialties.map((specialty) => (
              <li className="specialty" key={specialty.id}>
                <h3>{specialty.name}</h3>
                <p className="muted small">{specialty.description}</p>
                <span className="specialty__count">
                  {specialty.doctorCount}{' '}
                  {specialty.doctorCount === 1 ? 'doctor' : 'doctors'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- featured doctors ---------- */}
      {!loading && !failed && doctors.length > 0 ? (
        <section className="page landing__section">
          <div className="landing__section-head">
            <h2>Meet some of our doctors</h2>
            <p className="muted">
              {isLoggedIn ? (
                <Link to="/patient/doctors">See all doctors</Link>
              ) : (
                'Create an account to see everyone and book a slot.'
              )}
            </p>
          </div>

          <div className="grid">
            {doctors.map((doctor) => (
              <article className="card doctor-card" key={doctor.id}>
                <div className="doctor-card__head">
                  <span className="doctor-card__initials" aria-hidden="true">
                    {initialsOf(doctor.name)}
                  </span>
                  <div>
                    <h3>{doctor.name}</h3>
                    <p className="muted small">{doctor.specialtyName}</p>
                  </div>
                </div>

                <p className="small doctor-card__bio">{doctor.bio}</p>

                <dl className="doctor-card__facts">
                  <div>
                    <dt>Experience</dt>
                    <dd>{doctor.experienceYears} years</dd>
                  </div>
                  <div>
                    <dt>Fee</dt>
                    <dd>{formatMoney(doctor.feeCents)}</dd>
                  </div>
                </dl>

                <Link
                  to={isLoggedIn ? `/patient/doctors/${doctor.id}` : '/register'}
                  className="btn btn--secondary btn--small"
                >
                  {isLoggedIn ? 'View profile' : 'Register to book'}
                </Link>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {/* ---------- closing call to action ---------- */}
      {!isLoggedIn ? (
        <section className="page">
          <div className="card landing__cta">
            <div>
              <h2>Ready to book?</h2>
              <p className="muted">
                Registering takes a minute. You will need a name, an email address and a
                phone number.
              </p>
            </div>
            <Link to="/register" className="btn">
              Create an account
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}

// 'Dr. Asha Rao' -> 'AR'. Skips the title so it does not become 'DA'.
function initialsOf(name) {
  return String(name)
    .replace(/^(Dr|Mr|Mrs|Ms|Prof)\.?\s+/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || '')
    .join('')
    .toUpperCase();
}
