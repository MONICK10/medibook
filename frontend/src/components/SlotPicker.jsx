// src/components/SlotPicker.jsx
// -----------------------------------------------------------------
// The appointment calendar: a day to choose, then a free slot.
//
// Shared by booking and rescheduling, so the two behave identically -
// including refusing the same things, since both end up calling a
// backend that rebuilds the doctor's real slots and checks.
//
// The backend already marks each slot available or not, and says why
// ('booked' or 'past'). This component does not work any of that out
// for itself; recalculating it here would only create a second set of
// rules to disagree with the first.
// -----------------------------------------------------------------

import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { ErrorMessage, LoadingArea, Empty, formatRelativeDate, formatTime } from './ui.jsx';
import './SlotPicker.css';

export default function SlotPicker({ doctorId, selected, onSelect }) {
  const [calendar, setCalendar] = useState(null);
  const [activeDate, setActiveDate] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const result = await api.get(`/api/doctors/${doctorId}/slots`);
        if (cancelled) return;

        setCalendar(result.calendar);

        // Open the first day that actually has a free slot, so the
        // patient is not greeted by an empty day they have to click
        // past.
        const firstOpen =
          result.calendar.find((day) => day.availableCount > 0) || result.calendar[0];
        setActiveDate(firstOpen ? firstOpen.date : null);
      } catch (apiError) {
        if (!cancelled) setError(apiError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doctorId]);

  if (loading) return <LoadingArea label="Loading available times..." />;
  if (error) return <ErrorMessage error={error} />;
  if (!calendar) return null;

  const totalFree = calendar.reduce((sum, day) => sum + day.availableCount, 0);

  if (totalFree === 0) {
    return (
      <Empty title="No free appointments">
        <p className="small">
          This doctor has no free slots in the next {calendar.length} days. Please try
          another doctor, or check back later.
        </p>
      </Empty>
    );
  }

  const activeDay = calendar.find((day) => day.date === activeDate);

  return (
    <div className="slot-picker">
      {/* ---------- day strip ---------- */}
      {/* A tablist, so a keyboard user can arrow between days. */}
      <div className="slot-picker__days" role="tablist" aria-label="Choose a day">
        {calendar.map((day) => {
          const isActive = day.date === activeDate;
          const isFull = day.availableCount === 0;

          return (
            <button
              key={day.date}
              type="button"
              role="tab"
              aria-selected={isActive}
              // A day the doctor does not work, or one that is fully
              // booked, cannot be chosen.
              disabled={isFull}
              className={`slot-picker__day ${isActive ? 'slot-picker__day--active' : ''} ${
                isFull ? 'slot-picker__day--full' : ''
              }`}
              onClick={() => setActiveDate(day.date)}
            >
              <span className="slot-picker__day-name">{day.weekdayName.slice(0, 3)}</span>
              <span className="slot-picker__day-date">
                {formatRelativeDate(day.date) === 'Today'
                  ? 'Today'
                  : day.date.slice(8, 10)}
              </span>
              <span className="slot-picker__day-count">
                {isFull ? '-' : `${day.availableCount} free`}
              </span>
            </button>
          );
        })}
      </div>

      {/* ---------- slots for the chosen day ---------- */}
      {activeDay ? (
        <div className="slot-picker__slots">
          <h3 className="slot-picker__heading">
            {formatRelativeDate(activeDay.date)}
            <span className="muted small"> &middot; {activeDay.availableCount} free</span>
          </h3>

          {activeDay.slots.length === 0 ? (
            <p className="muted small">The doctor does not work on this day.</p>
          ) : (
            <div className="slot-picker__grid">
              {activeDay.slots.map((slot) => {
                const isSelected =
                  selected &&
                  selected.date === activeDay.date &&
                  selected.startTime === slot.startTime;

                return (
                  <button
                    key={slot.startTime}
                    type="button"
                    disabled={!slot.available}
                    className={`slot ${isSelected ? 'slot--selected' : ''} ${
                      !slot.available ? 'slot--unavailable' : ''
                    }`}
                    onClick={() =>
                      onSelect({
                        date: activeDay.date,
                        startTime: slot.startTime,
                        endTime: slot.endTime,
                        slotMinutes: slot.slotMinutes,
                      })
                    }
                    // Spells out WHY a slot cannot be picked. Without
                    // this a greyed-out button is just mysterious.
                    title={
                      slot.available
                        ? `${formatTime(slot.startTime)} - ${formatTime(slot.endTime)}`
                        : slot.reason === 'booked'
                          ? 'Already booked'
                          : 'This time has passed'
                    }
                  >
                    {formatTime(slot.startTime)}
                    {!slot.available ? (
                      <span className="sr-only">
                        {slot.reason === 'booked' ? ' (already booked)' : ' (time has passed)'}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}

          <p className="slot-picker__legend small muted">
            Each appointment lasts{' '}
            {activeDay.slots[0] ? activeDay.slots[0].slotMinutes : '-'} minutes. Greyed
            out times are already booked or have passed.
          </p>
        </div>
      ) : null}
    </div>
  );
}
