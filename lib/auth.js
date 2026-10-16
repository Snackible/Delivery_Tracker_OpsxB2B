import { timingSafeEqual, createHash } from "node:crypto";
import { getUsers } from "./store.js";
import { readSession } from "./session.js";

const attempts = new Map(); // best-effort, per function instance
const MAX_FAILS = 6;
const WINDOW_MS = 15 * 60 * 1000;

function safeEqual(a, b) {
  const ha = createHash("sha256").update(String(a)).digest();
  const hb = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

function publicUser(u) {
  return {
    username: u.username,
    role: String(u.role || "").toLowerCase(),
    name: u.display_name || u.username,
    poc: u.display_name || "",
  };
}

export function isRateLimited(key) {
  const rec = attempts.get(key);
  if (!rec) return false;
  if (Date.now() - rec.first > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return rec.count >= MAX_FAILS;
}

export async function login(username, password, ip = "") {
  const key = `${String(username).toLowerCase()}|${ip}`;
  if (isRateLimited(key)) return { ok: false, status: 429, error: "Too many attempts. Try again in a few minutes." };

  const users = await getUsers();
  const user = users.find((u) => u.username.toLowerCase() === String(username).trim().toLowerCase());
  // Compare even when the user is missing so timing does not reveal which usernames exist.
  const ok = safeEqual(password, user ? user.password : "\u0000no-such-user") && Boolean(user);
  if (!ok) {
    const rec = attempts.get(key);
    attempts.set(key, rec ? { ...rec, count: rec.count + 1 } : { first: Date.now(), count: 1 });
    return { ok: false, status: 401, error: "Wrong username or password." };
  }
  if (!["ops", "b2b", "admin"].includes(String(user.role).toLowerCase())) {
    return { ok: false, status: 403, error: "This account has no role assigned. Ask an admin to set one." };
  }
  attempts.delete(key);
  return { ok: true, user };
}

/** The full user row for the session on this request, or null. */
export async function sessionUser(req) {
  const username = readSession(req);
  if (!username) return null;
  const users = await getUsers();
  return users.find((u) => u.username.toLowerCase() === username.toLowerCase()) || null;
}

export { publicUser };
