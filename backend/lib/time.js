// lib/time.js
// -----------------------------------------------------------------
// Dates and times as plain strings: 'YYYY-MM-DD' and 'HH:MM'.
//
// WHY strings instead of Date objects:
// A clinic slot is "3pm on the 5th at this clinic" - a wall-clock time,
// not an instant. Storing a Date (which is UTC underneath) means a
// server in a different timezone shifts every appointment by hours, and
// daylight saving moves them twice a year. Strings keep what the doctor
// actually wrote on the schedule.
//
// The trade-off: comparing a slot to "now" needs a timezone. We use the
// server's local timezone and expect the server to be set to the
// clinic's timezone (set TZ in the environment). A multi-clinic system
// would store a timezone per clinic - out of scope here, but that is the
// upgrade path.
// -----------------------------------------------------------------

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isValidDateString(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  // Catches things like 2026-02-31, which matches the pattern but is not
  // a real day: JavaScript would roll it over to March.
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function isValidTimeString(value) {
  return typeof value === 'string' && TIME_PATTERN.test(value);
}

// Local date as 'YYYY-MM-DD'. Built from the local parts on purpose:
// toISOString() would convert to UTC and can give yesterday or tomorrow.
function toDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayString() {
  return toDateString(new Date());
}

function addDays(dateString, days) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return toDateString(date);
}

// 0 = Sunday ... 6 = Saturday, matching JavaScript's getDay().
function weekdayOf(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day).getDay();
}

// 'HH:MM' -> minutes since midnight. Makes slot maths plain arithmetic.
function timeToMinutes(timeString) {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// A real Date for one slot, in the server's local timezone.
function toLocalDate(dateString, timeString = '00:00') {
  const [year, month, day] = dateString.split('-').map(Number);
  const [hours, minutes] = timeString.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

// Minutes from now until the slot. Negative means it already started.
function minutesUntil(dateString, timeString, now = new Date()) {
  return Math.round((toLocalDate(dateString, timeString) - now) / 60000);
}

function isPastSlot(dateString, timeString, now = new Date()) {
  return minutesUntil(dateString, timeString, now) < 0;
}

// Compare two slots for sorting: earlier first.
function compareSlots(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.startTime === b.startTime) return 0;
  return a.startTime < b.startTime ? -1 : 1;
}

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

module.exports = {
  DATE_PATTERN,
  TIME_PATTERN,
  WEEKDAY_NAMES,
  isValidDateString,
  isValidTimeString,
  toDateString,
  todayString,
  addDays,
  weekdayOf,
  timeToMinutes,
  minutesToTime,
  toLocalDate,
  minutesUntil,
  isPastSlot,
  compareSlots,
};
