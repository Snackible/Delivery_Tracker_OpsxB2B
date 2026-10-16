// Date helpers. Everything is calendar-day arithmetic in India time (Asia/Kolkata),
// so a "date" here is a plain {y, m, d} and never carries a clock time.

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function todayIST(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = parts.split("-").map(Number);
  return { y, m, d };
}

export function hourIST(now = new Date()) {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(now)
  ) % 24;
}

export function dayNumber({ y, m, d }) {
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

export function dayDiff(a, b) {
  return dayNumber(a) - dayNumber(b);
}

export function addDays(date, n) {
  const t = new Date(Date.UTC(date.y, date.m - 1, date.d) + n * 86400000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

function valid(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function fullYear(y) {
  return y < 100 ? 2000 + y : y;
}

/** Parse one cell into a calendar date. `ref` (an order date) lets "17th October" infer a year. */
export function parseDate(input, ref = null) {
  if (input == null) return null;
  const s = String(input).trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return valid(y, mo, d) ? { y, m: mo, d } : null;
  }

  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/);
  if (m) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), fullYear(Number(m[3]))];
    return valid(y, mo, d) ? { y, m: mo, d } : null;
  }

  // "17th October", "17 Oct 2026", "October 17", "Oct 17th, 26"
  const lower = s.toLowerCase().replace(/,/g, " ");
  m = lower.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]{3,9})(?:\s+(\d{2}|\d{4}))?$/);
  let day, monthWord, yearWord;
  if (m) {
    [day, monthWord, yearWord] = [Number(m[1]), m[2], m[3]];
  } else {
    m = lower.match(/^([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{2}|\d{4}))?$/);
    if (!m) return null;
    [monthWord, day, yearWord] = [m[1], Number(m[2]), m[3]];
  }
  const mo = MONTHS.indexOf(monthWord.slice(0, 3)) + 1;
  if (!mo) return null;

  if (yearWord) {
    const y = fullYear(Number(yearWord));
    return valid(y, mo, day) ? { y, m: mo, d: day } : null;
  }
  const base = ref || todayIST();
  let y = base.y;
  if (valid(y, mo, day) && dayDiff({ y, m: mo, d: day }, base) < -60) y += 1;
  return valid(y, mo, day) ? { y, m: mo, d: day } : null;
}

/** Expected-delivery cell → {kind: 'date', date} | {kind: 'asap'} | {kind: 'none'}. */
export function parseExpected(input, orderDate = null) {
  const s = input == null ? "" : String(input).trim();
  if (!s) return { kind: "none" };
  if (/^(asap|a\.s\.a\.p|urgent|immediate(ly)?|today)\b/i.test(s)) return { kind: "asap" };
  const date = parseDate(s, orderDate);
  return date ? { kind: "date", date } : { kind: "none" };
}

export function formatDMY(date) {
  if (!date) return "";
  const dd = String(date.d).padStart(2, "0");
  const mm = String(date.m).padStart(2, "0");
  return `${dd}/${mm}/${date.y}`;
}

export function formatShort(date) {
  if (!date) return "";
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${date.d} ${names[date.m - 1]}`;
}

export function toISO(date) {
  if (!date) return "";
  return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
}
