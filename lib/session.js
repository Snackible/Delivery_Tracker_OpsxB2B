// Stateless signed-cookie sessions. Nothing is stored server-side.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const COOKIE = "dt_session";
const TTL_SECONDS = 12 * 60 * 60;

let devSecret = null;
function secret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.VERCEL) throw new Error("SESSION_SECRET is not set.");
  devSecret ??= randomBytes(32).toString("hex"); // local dev: sessions reset on restart
  return devSecret;
}

const sign = (payload) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function createSessionCookie(username) {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS })).toString("base64url");
  const secure = process.env.VERCEL ? "; Secure" : "";
  return `${COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_SECONDS}${secure}`;
}

export function clearSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

/** Returns the username in a valid session cookie, or null. */
export function readSession(req) {
  const raw = cookies(req)[COOKIE];
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.exp > Date.now() / 1000 ? data.u : null;
  } catch {
    return null;
  }
}
