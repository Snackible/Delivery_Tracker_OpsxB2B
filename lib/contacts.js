// Validation for contact details typed into the dashboard.
const EMAIL = /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]{2,}$/;

export function cleanEmail(value) {
  const v = String(value ?? "").trim().toLowerCase();
  return EMAIL.test(v) && v.length <= 120 ? v : null;
}

/** Digits with country code. A bare 10-digit number is taken as an Indian mobile (adds 91). */
export function cleanPhone(value) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

/** "a@x.com, b@y.com" or an array → { ok: [...], bad: [...] }. */
export function parseEmailList(input, max = 5) {
  const parts = Array.isArray(input) ? input : String(input ?? "").split(/[,;\n]+/);
  const ok = [];
  const bad = [];
  for (const raw of parts.map((p) => String(p).trim()).filter(Boolean)) {
    const e = cleanEmail(raw);
    if (e) ok.push(e);
    else bad.push(raw);
  }
  return { ok: [...new Set(ok)].slice(0, max), bad };
}

export function parsePhoneList(input, max = 5) {
  const parts = Array.isArray(input) ? input : String(input ?? "").split(/[,;\n]+/);
  const ok = [];
  const bad = [];
  for (const raw of parts.map((p) => String(p).trim()).filter(Boolean)) {
    const p = cleanPhone(raw);
    if (p) ok.push(p);
    else bad.push(raw);
  }
  return { ok: [...new Set(ok)].slice(0, max), bad };
}
