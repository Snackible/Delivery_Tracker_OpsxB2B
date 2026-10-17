import { timingSafeEqual, createHash } from "node:crypto";
import { getUsers, isMasterAdmin } from "./store.js";
import { readSession } from "./session.js";

const attempts = new Map(); // best-effort, per function instance
const MAX_FAILS = 6;
const WINDOW_MS = 15 * 60 * 1000;

function safeEqual(a, b) {
  const ha = createHash("sha256").update(String(a)).digest();
  const hb = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

/** Admins, plus the usernames listed in MASTER_SENDERS (default: Dhyana), may email ops about every open order. */
export function isMasterSender(u) {
  if (!u) return false;
  if (String(u.role).toLowerCase() === "admin") return true;
  const list = (process.env.MASTER_SENDERS ?? "Dhyana").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(String(u.username).toLowerCase());
}

function publicUser(u) {
  return {
    username: u.username,
    role: String(u.role || "").toLowerCase(),
    name: u.display_name || u.username,
    poc: u.display_name || "",
    master: isMasterSender(u),
  };
}

export function recordFail(key) {
  const rec = attempts.get(key);
  attempts.set(key, rec ? { ...rec, count: rec.count + 1 } : { first: Date.now(), count: 1 });
}

/**
 * The master password is the password of the user whose role is "master-admin" in the users sheet.
 * null = no master-admin exists, so registration is off; otherwise whether the guess matches one.
 */
export async function masterMatches(guess) {
  const masters = (await getUsers()).filter((u) => isMasterAdmin(u) && u.password); // an empty password is never a master password
  if (!masters.length) return null;
  return masters.map((u) => safeEqual(guess, u.password)).some(Boolean);
}

export async function registrationEnabled() {
  return (await getUsers()).some((u) => isMasterAdmin(u) && u.password);
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
  // A row with no password (or no username) is a contact only: it can never sign in.
  const ok = safeEqual(password, user ? user.password : "\u0000no-such-user") && Boolean(user) && !user.noLogin;
  if (!ok) {
    recordFail(key);
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
  const user = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  return user && !user.noLogin ? user : null;
}

export { publicUser };
