const assert = require("node:assert/strict");

const weekdayShortLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const normalizeRecurrenceDays = (days = []) =>
  [...new Set(days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
    .sort((a, b) => a - b);

const parseTimeToMinutes = (time) => {
  const parts = time.split(" ");
  if (parts.length !== 2) return null;

  const [timePart, period] = parts;
  const [hoursStr, minutesStr] = timePart.split(":");
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;

  let normalizedHours = hours;
  if (period === "PM" && hours !== 12) normalizedHours += 12;
  if (period === "AM" && hours === 12) normalizedHours = 0;

  return normalizedHours * 60 + minutes;
};

const formatDateKey = (date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateKey = (dateKey) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
};

const matchesRecurrenceDate = (date, recurrence, recurrenceDays, weeklyAnchorDay) => {
  const day = date.getDay();

  if (recurrence === "daily") return true;
  if (recurrence === "weekdays") return day !== 0 && day !== 6;
  if (recurrence === "weekly") return day === weeklyAnchorDay;
  if (recurrence === "custom") return normalizeRecurrenceDays(recurrenceDays).includes(day);

  return false;
};

const getNextRecurringDate = ({
  fromDateKey,
  recurrence,
  recurrenceDays,
  includeFromDate = false,
  weeklyAnchorDateKey,
}) => {
  if (recurrence === "none") return null;

  const customDays = normalizeRecurrenceDays(recurrenceDays);
  if (recurrence === "custom" && customDays.length === 0) return null;

  const weeklyAnchorDay = weeklyAnchorDateKey
    ? parseDateKey(weeklyAnchorDateKey).getDay()
    : parseDateKey(fromDateKey).getDay();
  const cursor = parseDateKey(fromDateKey);
  if (!includeFromDate) cursor.setDate(cursor.getDate() + 1);

  for (let i = 0; i < 370; i += 1) {
    if (matchesRecurrenceDate(cursor, recurrence, customDays, weeklyAnchorDay)) {
      return formatDateKey(cursor);
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return null;
};

const buildRecurringDates = (startDateKey, recurrence, recurrenceDays) => {
  if (recurrence === "none") return [startDateKey];

  const firstDate = getNextRecurringDate({
    fromDateKey: startDateKey,
    recurrence,
    recurrenceDays,
    includeFromDate: true,
    weeklyAnchorDateKey: startDateKey,
  });

  return firstDate ? [firstDate] : [startDateKey];
};

assert.equal(parseTimeToMinutes("12:00 AM"), 0);
assert.equal(parseTimeToMinutes("12:00 PM"), 720);
assert.equal(parseTimeToMinutes("6:30 PM"), 1110);
assert.equal(parseTimeToMinutes("bad input"), null);

assert.deepEqual(normalizeRecurrenceDays([6, 1, 1, 7, -1, 3]), [1, 3, 6]);
assert.equal(weekdayShortLabels[1], "Mon");

// May 3, 2026 is a Sunday. A custom Mon-Thu routine should seed Monday, not
// dump a long list of future copies. This protects the ongoing-routine loop.
assert.deepEqual(buildRecurringDates("2026-05-03", "custom", [1, 2, 3, 4]), ["2026-05-04"]);
assert.deepEqual(buildRecurringDates("2026-05-04", "daily"), ["2026-05-04"]);
assert.deepEqual(buildRecurringDates("2026-05-03", "weekdays"), ["2026-05-04"]);
assert.deepEqual(buildRecurringDates("2026-05-03", "none"), ["2026-05-03"]);

console.log("Core logic checks passed.");
