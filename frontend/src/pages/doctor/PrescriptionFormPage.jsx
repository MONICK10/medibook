// src/pages/doctor/PrescriptionFormPage.jsx
// -----------------------------------------------------------------
// Write or correct the prescription for one completed appointment.
//
// The page works out for itself whether it is creating or editing, by
// asking the appointment whether it already has one. There is one
// prescription per visit, so a correction is an edit - the patient
// should never see two conflicting medicine lists for the same
// appointment.
// -----------------------------------------------------------------

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import {
  ErrorMessage,
  Field,
  LoadingArea,
  Message,
  Spinner,
  formatDate,
  formatTime,
} from '../../components/ui.jsx';
import './DoctorPages.css';

const EMPTY_MEDICINE = { name: '', dose: '', frequency: '', days: '' };

export default function PrescriptionFormPage() {
  const { appointmentId } = useParams();
  const navigate = useNavigate();

  const [appointment, setAppointment] = useState(null);
  const [existing, setExisting] = useState(null);
  const [medicines, setMedicines] = useState([{ ...EMPTY_MEDICINE }]);
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // The appointment first: it tells us whether a prescription
        // already exists, and refuses outright if this is not our
        // appointment.
        const result = await api.get(`/api/appointments/${appointmentId}`);
        if (cancelled) return;
        setAppointment(result.appointment);

        if (result.prescriptionId) {
          const detail = await api.get(`/api/prescriptions/${result.prescriptionId}`);
          if (cancelled) return;
          setExisting(detail.prescription);
          setMedicines(
            detail.prescription.medicines.map((medicine) => ({
              ...medicine,
              days: String(medicine.days),
            }))
          );
          setNotes(detail.prescription.notes || '');
        }
      } catch (apiError) {
        if (!cancelled) setLoadError(apiError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [appointmentId]);

  function updateMedicine(index, field, value) {
    setMedicines((current) =>
      current.map((medicine, i) =>
        i === index ? { ...medicine, [field]: value } : medicine
      )
    );
    // Clear this row's error for the edited field.
    setFieldErrors((current) => ({
      ...current,
      [`medicines[${index}].${field}`]: undefined,
    }));
    setNotice(null);
  }

  function addMedicine() {
    setMedicines((current) => [...current, { ...EMPTY_MEDICINE }]);
  }

  function removeMedicine(index) {
    setMedicines((current) =>
      // Never drop to zero rows: the form would look broken, and the
      // backend requires at least one medicine anyway.
      current.length === 1 ? current : current.filter((_, i) => i !== index)
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setBusy(true);

    const payload = {
      medicines: medicines.map((medicine) => ({
        name: medicine.name.trim(),
        dose: medicine.dose.trim(),
        frequency: medicine.frequency.trim(),
        // The input gives a string; the API wants a whole number.
        days: Number(medicine.days),
      })),
      notes: notes.trim() || undefined,
    };

    try {
      if (existing) {
        const result = await api.patch(`/api/prescriptions/${existing.id}`, payload);
        setExisting(result.prescription);
        setNotice('The prescription has been updated.');
      } else {
        const result = await api.post('/api/prescriptions', {
          appointmentId,
          ...payload,
        });
        setExisting(result.prescription);
        setNotice('The prescription has been saved.');
      }
    } catch (apiError) {
      if (apiError.details) setFieldErrors(apiError.details);
      setError(apiError);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingArea label="Loading the appointment..." />;

  if (loadError) {
    return (
      <div className="page page--narrow">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/doctor/appointments">Appointments</Link>
        </nav>
        <div className="card">
          <h1>Cannot open this appointment</h1>
          <ErrorMessage error={loadError} />
          {loadError.isForbidden ? (
            <p className="muted">
              You can only write a prescription for your own appointments.
            </p>
          ) : null}
          <Link to="/doctor/appointments" className="btn btn--secondary">
            Back to appointments
          </Link>
        </div>
      </div>
    );
  }

  // A prescription records what happened at a visit, so the visit has
  // to have happened. The backend refuses otherwise; saying so here
  // saves the doctor filling in a form that cannot be saved.
  if (appointment && appointment.status !== 'completed') {
    return (
      <div className="page page--narrow">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/doctor/appointments">Appointments</Link>
        </nav>
        <div className="card">
          <h1>Not completed yet</h1>
          <Message
            type="warning"
            text={`This appointment is marked as "${appointment.status}".`}
            detail="Mark it as completed first, then write the prescription."
          />
          <Link to="/doctor/appointments" className="btn btn--secondary">
            Back to appointments
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/doctor/appointments">Appointments</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{existing ? 'Edit prescription' : 'New prescription'}</span>
      </nav>

      <div className="page-head">
        <div>
          <h1>{existing ? 'Edit prescription' : 'Write a prescription'}</h1>
          <p>For the visit below. The patient can read this straight away.</p>
        </div>
      </div>

      {/* ---------- which visit ---------- */}
      <section className="card prescription-context">
        <div className="row">
          <div>
            <div className="strong">{appointment.patientName}</div>
            <div className="small muted">
              {formatDate(appointment.date)} at {formatTime(appointment.startTime)}
            </div>
          </div>
          <div className="spacer" />
          <Link
            to={`/doctor/patients/${appointment.patientUserId}`}
            className="btn btn--ghost btn--small"
          >
            Patient record
          </Link>
        </div>

        {appointment.reason ? (
          <p className="small muted" style={{ margin: '10px 0 0' }}>
            <span className="strong">Reason given: </span>
            {appointment.reason}
          </p>
        ) : null}
      </section>

      {notice ? (
        <Message type="success" text={notice} onDismiss={() => setNotice(null)} />
      ) : null}

      <form className="card" onSubmit={handleSubmit} noValidate>
        <div className="card__head">
          <h2>Medicines</h2>
          <span className="muted small">
            {medicines.length} {medicines.length === 1 ? 'item' : 'items'}
          </span>
        </div>

        <ErrorMessage error={error} onDismiss={() => setError(null)} />

        {medicines.map((medicine, index) => (
          <div className="medicine-row" key={index}>
            <Field
              label={index === 0 ? 'Medicine' : `Medicine ${index + 1}`}
              name={`medicine-name-${index}`}
              value={medicine.name}
              onChange={(event) => updateMedicine(index, 'name', event.target.value)}
              error={fieldErrors[`medicines[${index}].name`]}
              placeholder="e.g. Paracetamol 500mg"
              required
            />

            <Field
              label="Dose"
              name={`medicine-dose-${index}`}
              value={medicine.dose}
              onChange={(event) => updateMedicine(index, 'dose', event.target.value)}
              error={fieldErrors[`medicines[${index}].dose`]}
              placeholder="1 tablet"
              required
            />

            <Field
              label="How often"
              name={`medicine-frequency-${index}`}
              value={medicine.frequency}
              onChange={(event) =>
                updateMedicine(index, 'frequency', event.target.value)
              }
              error={fieldErrors[`medicines[${index}].frequency`]}
              placeholder="Twice a day"
              required
            />

            <Field
              label="Days"
              name={`medicine-days-${index}`}
              type="number"
              min="1"
              max="365"
              value={medicine.days}
              onChange={(event) => updateMedicine(index, 'days', event.target.value)}
              error={fieldErrors[`medicines[${index}].days`]}
              placeholder="5"
              required
            />

            <button
              type="button"
              className="btn btn--ghost btn--small medicine-row__remove"
              onClick={() => removeMedicine(index)}
              disabled={medicines.length === 1}
            >
              Remove
              <span className="sr-only"> medicine {index + 1}</span>
            </button>
          </div>
        ))}

        <div className="row" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn--secondary btn--small" onClick={addMedicine}>
            Add another medicine
          </button>
        </div>

        <hr className="divider" />

        <Field
          label="Notes for the patient"
          name="notes"
          error={fieldErrors.notes}
          hint="Advice, warnings, or when to come back. The patient reads this."
        >
          <textarea
            id="notes"
            name="notes"
            rows={5}
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
              setNotice(null);
            }}
            maxLength={2000}
            aria-describedby="notes-hint"
            placeholder="e.g. Take after food. Come back if the fever lasts beyond three days."
          />
        </Field>

        <div className="row row--end">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => navigate('/doctor/appointments')}
            disabled={busy}
          >
            Back to appointments
          </button>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? (
              <Spinner label="Saving" />
            ) : existing ? (
              'Save changes'
            ) : (
              'Save prescription'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
