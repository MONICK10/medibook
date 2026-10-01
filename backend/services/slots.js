// services/slots.js
// -----------------------------------------------------------------
// Turns a doctor's weekly schedule into actual bookable slots.
//
// WHY slots are calculated and not stored: a doctor says "Mondays,
// 9am to 1pm, 30 minute slots". Storing that as one availability row
// per weekday is a few rows. Storing every slot as a row would mean
// generating thousands of them in advance, deciding how far ahead to
// go, and regenerating the lot whenever the doctor changes their hours.
// Calculating on demand keeps one source of truth: the weekly schedule.
//
// What IS stored is the booked appointment, which is the only thing we
// actually need to remember.
// -----------------------------------------------------------------

const time = require('../lib/time');

// Build the list of slot start times inside one availability block.
function slotsInBlock(block) {
  const start = time.timeToMinutes(block.startTime);
  const end = time.timeToMinutes(block.endTime);
  const size = block.slotMinutes;

  const slots = [];
  // Stop when a whole slot no longer fits. A 20-minute gap at the end of
  // the day is not a 30-minute appointment.
  for (let minute = start; minute + size <= end; minute += size) {
    slots.push({
      startTime: time.minutesToTime(minute),
      endTime: time.minutesToTime(minute + size),
      slotMinutes: size,
    });
  }
  return slots;
}

// All slots a doctor works on one date, ignoring who has booked them.
function slotsForDate(availabilityBlocks, dateString) {
  const weekday = time.weekdayOf(dateString);

  const slots = availabilityBlocks
    .filter((block) => block.weekday === weekday)
    .flatMap(slotsInBlock);

  // A doctor could enter overlapping blocks (9-12 and 11-13). Collapse
  // duplicate start times so a slot can never be offered twice.
  const byStart = new Map();
  for (const slot of slots) {
    if (!byStart.has(slot.startTime)) byStart.set(slot.startTime, slot);
  }

  return [...byStart.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
}

// The calendar a patient sees: one entry per day, each with its slots
// marked free or taken.
//
// `takenSlots` is [{ date, startTime }] from db.appointments.listTakenSlots.
function buildCalendar({
  availabilityBlocks,
  takenSlots = [],
  fromDate = time.todayString(),
  days = 7,
  now = new Date(),
}) {
  // A Set of "date time" strings makes the "is it taken" test O(1)
  // instead of scanning the appointment list for every slot.
  const taken = new Set(takenSlots.map((item) => `${item.date} ${item.startTime}`));

  const calendar = [];

  for (let offset = 0; offset < days; offset += 1) {
    const date = time.addDays(fromDate, offset);

    const slots = slotsForDate(availabilityBlocks, date).map((slot) => {
      const isTaken = taken.has(`${date} ${slot.startTime}`);
      // A slot earlier today is not bookable even though nobody took it.
      const isPast = time.isPastSlot(date, slot.startTime, now);

      return {
        ...slot,
        available: !isTaken && !isPast,
        // Told apart so the UI can say "already booked" vs just hide it.
        reason: isTaken ? 'booked' : isPast ? 'past' : null,
      };
    });

    calendar.push({
      date,
      weekday: time.weekdayOf(date),
      weekdayName: time.WEEKDAY_NAMES[time.weekdayOf(date)],
      slots,
      availableCount: slots.filter((slot) => slot.available).length,
    });
  }

  return calendar;
}

// Is this exact slot a real one in the doctor's schedule?
//
// WHY the booking route must call this: the frontend sends a start time,
// and the frontend can be bypassed. Without this check a patient could
// post startTime "03:00" and book an appointment at 3am, or "09:07" and
// land between slots, quietly blocking the 09:00 one.
//
// Returns { startTime, endTime, slotMinutes } or null.
function findSlot(availabilityBlocks, dateString, startTime) {
  return (
    slotsForDate(availabilityBlocks, dateString).find(
      (slot) => slot.startTime === startTime
    ) || null
  );
}

module.exports = { buildCalendar, slotsForDate, findSlot, slotsInBlock };
