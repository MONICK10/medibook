// src/pages/patient/BookAppointmentPage.jsx
// -----------------------------------------------------------------
// The confirm step: show the chosen doctor and time, take the reason
// for the visit, and book.
//
// The most interesting case is the 409: somebody else took the slot in
// the seconds between choosing it and confirming. That is not an error
// the patient did anything wrong, so it gets its own treatment - a
// clear message and the calendar reopened, rather than a red box.
// -----------------------------------------------------------------

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import SlotPicker from '../../components/SlotPicker.jsx';
import {
  ErrorMessage,
  Field,
  LoadingArea,
  Message,
  Spinner,
  formatDate,
  formatMoney,
  formatTime,
} from '../../components/ui.jsx';
import './PatientPages.css';

export default function BookAppointmentPage() {
  const { doctorId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [doctor, setDoctor] = useState(null);
  const [loadError, setLoadError] = useState(null);

  // The slot comes from the URL, so a refresh keeps it.
  const slot = {
    date: searchParams.get('date') || '',
    startTime: searchParams.get('time') || '',
  };
  const hasSlot = Boolean(slot.date && slot.startTime);

  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const [slotTaken, setSlotTaken] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const result = await api.get(`/api/doctors/${doctorId}`);
        if (!cancelled) setDoctor(result.doctor);
      } catch (apiError) {
        if (!cancelled) setLoadError(apiError);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doctorId]);

  function chooseSlot(next) {
    setSlotTaken(false);
    setError(null);
    setSearchParams(
      { date: next.date, time: next.startTime },
      { replace: true }
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setSlotTaken(false);
    setBusy(true);

    try {
      await api.post('/api/appointments', {
        doctorId,
        date: slot.date,
        startTime: slot.startTime,
        reason,
      });

      // Straight to the appointments list, with a flag so it can show
      // a confirmation. Using router state rather than a query string
      // keeps the message out of the URL, so a refresh does not repeat
      // it.
      navigate('/patient/appointments', {
        replace: true,
        state: { justBooked: true },
      });
    } catch (apiError) {
      if (apiError.details) setFieldErrors(apiError.details);

      // 409 means the slot went while this page was open.
      if (apiError.status === 409) {
        setSlotTaken(true);
        // Drop the dead slot from the URL so the picker reopens.
        setSearchParams({}, { replace: true });
      } else {
        setError(apiError);
      }

      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="page">
        <ErrorMessage error={loadError} />
        <Link to="/patient/doctors" className="btn btn--secondary">
          Back to all doctors
        </Link>
      </div>
    );
  }

  if (!doctor) return <LoadingArea label="Loading..." />;

  return (
    <div className="page page--narrow">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/patient/doctors">Find a doctor</Link>
        <span aria-hidden="true"> / </span>
        <Link to={`/patient/doctors/${doctorId}`}>{doctor.name}</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Book</span>
      </nav>

      <div className="page-head">
        <div>
          <h1>Confirm your appointment</h1>
          <p>Check the details and tell the doctor why you are coming.</p>
        </div>
      </div>

      {slotTaken ? (
        <Message
          type="warning"
          text="Sorry, that time was just booked by someone else."
          detail="Please choose another time below."
        />
      ) : null}

      {!hasSlot ? (
        // No slot chosen (or the chosen one was taken): show the picker.
        <section className="card">
          <div className="card__head">
            <h2>Choose a time</h2>
          </div>
          <SlotPicker doctorId={doctorId} selected={null} onSelect={chooseSlot} />
        </section>
      ) : (
        <>
          <section className="card booking-summary">
            <h2 className="booking-summary__title">Your appointment</h2>

            <dl className="booking-summary__list">
              <div>
                <dt>Doctor</dt>
                <dd>
                  {doctor.name}
                  <span className="muted"> &middot; {doctor.specialtyName}</span>
                </dd>
              </div>
              <div>
                <dt>Date</dt>
                <dd>{formatDate(slot.date)}</dd>
              </div>
              <div>
                <dt>Time</dt>
                <dd>{formatTime(slot.startTime)}</dd>
              </div>
              <div>
                <dt>Fee</dt>
                <dd>{formatMoney(doctor.feeCents)}</dd>
              </div>
            </dl>

            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => setSearchParams({}, { replace: true })}
            >
              Change time
            </button>
          </section>

          <section className="card">
            <form className="form" onSubmit={handleSubmit} noValidate>
              <ErrorMessage error={error} onDismiss={() => setError(null)} />

              <Field
                label="Why are you coming?"
                name="reason"
                error={fieldErrors.reason}
                hint="A sentence is enough. The doctor sees this before your visit."
                required
              >
                <textarea
                  id="reason"
                  name="reason"
                  rows={4}
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value);
                    setFieldErrors({});
                  }}
                  maxLength={500}
                  required
                  aria-describedby="reason-hint"
                  placeholder="e.g. Sore throat and fever for three days"
                />
              </Field>

              <p className="small muted">
                You can cancel or move this appointment up to 2 hours beforehand.
              </p>

              <button type="submit" className="btn btn--block" disabled={busy}>
                {busy ? <Spinner label="Booking" /> : 'Confirm booking'}
              </button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
