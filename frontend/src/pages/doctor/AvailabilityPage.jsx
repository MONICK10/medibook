// src/pages/doctor/AvailabilityPage.jsx
// -----------------------------------------------------------------
// The doctor's weekly working hours.
//
// The whole week is edited as one form and saved in one PUT. That
// matches the backend, which replaces the schedule wholesale - so what
// is saved is exactly what is on screen, and a failure cannot leave a
// half-saved week where the doctor thinks Friday is blocked off but it
// is not.
//
// Saving does NOT cancel appointments that fall outside the new hours.
// The backend reports any that are now orphaned and this page warns
// about them, because silently cancelling people's appointments
// because a form was saved would be far worse than a warning.
// -----------------------------------------------------------------

import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import {
  Empty,
  ErrorMessage,
  LoadingArea,
  Message,
  Spinner,
  formatDate,
  formatTime,
} from '../../components/ui.jsx';
import './DoctorPages.css';

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const SLOT_LENGTHS = [10, 15, 20, 30, 45, 60];

// How many appointments a block produces, worked out the same way the
// backend does: whole slots only, so a 20-minute tail is not offered
// as a 30-minute appointment.
function slotCount(block) {
  const toMinutes = (time) => {
    const [hours, minutes] = String(time).split(':').map(Number);
    return hours * 60 + minutes;
  };
  const span = toMinutes(block.endTime) - toMinutes(block.startTime);
  if (!Number.isFinite(span) || span <= 0 || !block.slotMinutes) return 0;
  return Math.floor(span / block.slotMinutes);
}

export default function AvailabilityPage() {
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [orphaned, setOrphaned] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const result = await api.get('/api/doctor/availability');
        if (cancelled) return;
        setBlocks(
          result.availability.map((block) => ({
            weekday: block.weekday,
            startTime: block.startTime,
            endTime: block.endTime,
            slotMinutes: block.slotMinutes,
          }))
        );
      } catch (apiError) {
        if (!cancelled) setError(apiError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function updateBlock(index, changes) {
    setBlocks((current) =>
      current.map((block, i) => (i === index ? { ...block, ...changes } : block))
    );
    setNotice(null);
  }

  function addBlock() {
    setBlocks((current) => [
      ...current,
      { weekday: 1, startTime: '09:00', endTime: '13:00', slotMinutes: 20 },
    ]);
    setNotice(null);
  }

  function removeBlock(index) {
    setBlocks((current) => current.filter((_, i) => i !== index));
    setNotice(null);
  }

  async function save(event) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setWarnings([]);
    setOrphaned([]);
    setBusy(true);

    try {
      const result = await api.put('/api/doctor/availability', {
        availability: blocks.map((block) => ({
          weekday: Number(block.weekday),
          startTime: block.startTime,
          endTime: block.endTime,
          slotMinutes: Number(block.slotMinutes),
        })),
      });

      setBlocks(
        result.availability.map((block) => ({
          weekday: block.weekday,
          startTime: block.startTime,
          endTime: block.endTime,
          slotMinutes: block.slotMinutes,
        }))
      );
      setNotice(result.message);
      setWarnings(result.warnings || []);
      setOrphaned(result.orphanedAppointments || []);
    } catch (apiError) {
      setError(apiError);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingArea label="Loading your schedule..." />;

  const totalSlots = blocks.reduce((sum, block) => sum + slotCount(block), 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>My weekly schedule</h1>
          <p>When patients can book with you. This repeats every week.</p>
        </div>
      </div>

      {notice ? (
        <Message type="success" text={notice} onDismiss={() => setNotice(null)} />
      ) : null}

      {warnings.map((warning) => (
        <Message key={warning} type="warning" text={warning} />
      ))}

      {/* Lists the appointments now outside the new hours, so the
          doctor knows exactly who to contact. */}
      {orphaned.length > 0 ? (
        <section className="card">
          <div className="card__head">
            <h2>Appointments outside your new hours</h2>
          </div>
          <p className="small muted">
            These are still booked. Nothing has been cancelled - please contact these
            patients or change your hours back.
          </p>
          <ul className="mini-list">
            {orphaned.map((appointment) => (
              <li key={appointment.id}>
                <div>
                  <div className="strong">
                    {formatDate(appointment.date)}, {formatTime(appointment.startTime)}
                  </div>
                  <div className="small muted">
                    {appointment.patientName}
                    {appointment.patientPhone ? ` · ${appointment.patientPhone}` : ''}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ErrorMessage error={error} onDismiss={() => setError(null)} />

      <form className="card" onSubmit={save}>
        <div className="card__head">
          <h2>Working hours</h2>
          <span className="muted small">
            {blocks.length} {blocks.length === 1 ? 'block' : 'blocks'} &middot;{' '}
            {totalSlots} appointments a week
          </span>
        </div>

        {blocks.length === 0 ? (
          <div className="availability-empty">
            <Empty title="No working hours set">
              <p className="small">
                Patients cannot book with you until you add at least one block of time.
              </p>
            </Empty>
          </div>
        ) : (
          blocks.map((block, index) => {
            const count = slotCount(block);

            return (
              // The index is the key because these rows have no id of
              // their own until they are saved. Acceptable here since
              // the list is never reordered.
              <div className="availability-day" key={index}>
                <div className="field">
                  <label htmlFor={`weekday-${index}`}>Day</label>
                  <select
                    id={`weekday-${index}`}
                    value={block.weekday}
                    onChange={(event) =>
                      updateBlock(index, { weekday: Number(event.target.value) })
                    }
                  >
                    {WEEKDAYS.map((name, day) => (
                      <option key={day} value={day}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor={`start-${index}`}>From</label>
                  <input
                    id={`start-${index}`}
                    type="time"
                    value={block.startTime}
                    onChange={(event) =>
                      updateBlock(index, { startTime: event.target.value })
                    }
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor={`end-${index}`}>To</label>
                  <input
                    id={`end-${index}`}
                    type="time"
                    value={block.endTime}
                    onChange={(event) =>
                      updateBlock(index, { endTime: event.target.value })
                    }
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor={`slot-${index}`}>Each appointment</label>
                  <select
                    id={`slot-${index}`}
                    value={block.slotMinutes}
                    onChange={(event) =>
                      updateBlock(index, { slotMinutes: Number(event.target.value) })
                    }
                  >
                    {SLOT_LENGTHS.map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes} minutes
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={() => removeBlock(index)}
                >
                  Remove
                  <span className="sr-only">
                    {' '}
                    the {WEEKDAYS[block.weekday]} {block.startTime} block
                  </span>
                </button>

                {/* Immediate feedback on what the block produces, so a
                    mistake is obvious before saving. */}
                <p className="availability-day__summary">
                  {count > 0
                    ? `${count} appointment${count === 1 ? '' : 's'} on ${
                        WEEKDAYS[block.weekday]
                      }, ${formatTime(block.startTime)} to ${formatTime(block.endTime)}`
                    : 'This block is shorter than one appointment, so it produces none.'}
                </p>
              </div>
            );
          })
        )}

        <div className="availability-actions">
          <button type="button" className="btn btn--secondary" onClick={addBlock}>
            Add a block
          </button>

          <button type="submit" className="btn" disabled={busy}>
            {busy ? <Spinner label="Saving" /> : 'Save schedule'}
          </button>
        </div>
      </form>

      <p className="small muted">
        You can add more than one block to a day, for example a morning and an evening
        clinic. Blocks on the same day must not overlap.
      </p>
    </div>
  );
}
