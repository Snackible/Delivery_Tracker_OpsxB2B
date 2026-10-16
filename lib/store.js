// One data layer for the whole app. With Google credentials it reads and writes the
// real spreadsheets; without them it runs on bundled demo data (and keeps edits in
// memory, plus a local file when the disk is writable) so the app works out of the box.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readRange, writeRange, appendRows, ensureTab, colLetter, batchWrite } from "./sheetsClient.js";
import { serviceAccountConfigured } from "./sheetsAuth.js";
import { demoOrders, demoMeta, demoLeads } from "../data/demo-orders.js";
import { demoUsers } from "../data/demo-users.js";
import { todayIST, formatDMY } from "./dates.js";

const env = (k, d = "") => (process.env[k] || d).trim();
const ORDERS_ID = () => env("SHEET_ID_ORDERS");
const USERS_ID = () => env("SHEET_ID_USERS");
const ORDERS_TAB = () => env("ORDERS_TAB", "Sheet1");
const LEADS_TAB = () => env("LEADS_TAB", "Sheet2");
const USERS_TAB = () => env("USERS_TAB", "Sheet1");
const META_TAB = "Tracker_Meta";
const STATE_TAB = "Tracker_State";

export function mode() {
  return serviceAccountConfigured() && ORDERS_ID() ? "sheets" : "demo";
}

const norm = (h) => String(h || "").toLowerCase().replace(/\s+/g, " ").trim();

const ORDER_FIELDS = {
  date: ["date"],
  poc: ["snackible poc", "poc"],
  ref: ["ref no", "ref", "reference", "ref number"],
  client: ["client name", "client"],
  kind: ["hampers / loose products", "hampers/loose products", "hampers loose products"],
  products: ["product list", "products"],
  expected: ["expected delivery date", "expected delivery", "expected"],
  opsDate: ["operations delivery date", "ops delivery date", "operations delivery"],
  status: ["delivery status", "status"],
};
const LEAD_FIELDS = {
  date: ["date"],
  poc: ["snackible poc", "poc"],
  leadRef: ["lead ref", "lead ref no"],
  client: ["client name", "client"],
  kind: ["hampers / loose products", "hampers/loose products"],
  products: ["product list", "products"],
  expected: ["expected delivery date", "expected delivery"],
  stage: ["stage"],
  followUp: ["follow-up date", "follow up date", "followup date"],
  converted: ["converted ref no", "converted ref"],
};
const USER_FIELDS = {
  username: ["username", "user name", "user"],
  password: ["password"],
  role: ["role"],
  account_id: ["account_id", "account id"],
  display_name: ["display_name", "display name", "name"],
  email: ["email", "e-mail"],
  contact: ["contact", "whatsapp", "phone"],
};
const LEAD_HEADERS = [
  "Date", "Snackible POC", "Lead Ref", "Client Name", "Hampers / Loose Products",
  "Product List", "Expected Delivery date", "Stage", "Follow-up Date", "Converted Ref No",
];

// ---------- table parsing ----------

async function readTable(sheetId, tab, fieldMap, keyField) {
  const rows = await readRange(sheetId, `${tab}!A1:Z`);
  const headerAt = rows.slice(0, 5).findIndex((r) => {
    const cells = r.map(norm);
    return Object.values(fieldMap).filter((aliases) => aliases.some((a) => cells.includes(a))).length >= 3;
  });
  if (headerAt < 0) return { headers: [], cols: {}, items: [], headerRow: 0 };
  const headers = rows[headerAt];
  const cols = {};
  for (const [field, aliases] of Object.entries(fieldMap)) {
    const idx = headers.findIndex((h) => aliases.includes(norm(h)));
    if (idx >= 0) cols[field] = idx;
  }
  const items = [];
  for (let i = headerAt + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const item = { rowNumber: i + 1 };
    for (const [field, idx] of Object.entries(cols)) item[field] = String(row[idx] ?? "").trim();
    if (item[keyField]) items.push(item);
  }
  return { headers, cols, items, headerRow: headerAt + 1 };
}

function sameKey(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

// ---------- demo state ----------

const here = dirname(fileURLToPath(import.meta.url));
const DEMO_FILE = join(here, "..", "data", ".demo-state.json");
let demo = null;

function demoState() {
  if (demo) return demo;
  const fresh = {
    orders: demoOrders.map((o) => ({ ...o })),
    meta: JSON.parse(JSON.stringify(demoMeta)),
    leads: demoLeads.map((l) => ({ ...l })),
    state: {},
  };
  if (process.env.DEMO_PERSIST === "1" && existsSync(DEMO_FILE)) {
    try {
      demo = JSON.parse(readFileSync(DEMO_FILE, "utf8"));
      return demo;
    } catch {}
  }
  demo = fresh;
  return demo;
}

function persistDemo() {
  // Demo edits live in memory by default; set DEMO_PERSIST=1 to keep them across restarts.
  if (process.env.DEMO_PERSIST !== "1") return;
  try {
    writeFileSync(DEMO_FILE, JSON.stringify(demo));
  } catch {}
}

export function resetDemo() {
  demo = null;
  try {
    writeFileSync(DEMO_FILE, "");
  } catch {}
}

// ---------- small TTL cache ----------

const cache = new Map();
async function cached(key, ttlMs, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await loader();
  cache.set(key, { at: Date.now(), value });
  return value;
}
function bust(...keys) {
  keys.forEach((k) => cache.delete(k));
}

// ---------- orders ----------

export async function getOrders() {
  if (mode() === "demo") return demoState().orders.map((o) => ({ ...o }));
  return cached("orders", 10_000, async () => {
    const t = await readTable(ORDERS_ID(), ORDERS_TAB(), ORDER_FIELDS, "ref");
    return t.items;
  });
}

const ORDER_WRITABLE = ["expected", "opsDate", "status"];

export async function updateOrder(ref, patch) {
  const fields = Object.keys(patch).filter((k) => ORDER_WRITABLE.includes(k));
  if (!fields.length) throw httpError(400, "Nothing to update.");

  if (mode() === "demo") {
    const o = demoState().orders.find((x) => sameKey(x.ref, ref));
    if (!o) throw httpError(404, `Order ${ref} not found.`);
    for (const f of fields) o[f] = patch[f];
    persistDemo();
    return;
  }

  // Re-read right before writing and match by Ref No, never by a cached row number.
  const t = await readTable(ORDERS_ID(), ORDERS_TAB(), ORDER_FIELDS, "ref");
  const row = t.items.find((x) => sameKey(x.ref, ref));
  if (!row) throw httpError(404, `Order ${ref} not found in the sheet.`);
  const data = [];
  for (const f of fields) {
    if (t.cols[f] == null) throw httpError(500, `The orders sheet has no column for "${f}".`);
    data.push({ range: `${ORDERS_TAB()}!${colLetter(t.cols[f])}${row.rowNumber}`, values: [[patch[f]]] });
  }
  await batchWrite(ORDERS_ID(), data);
  bust("orders");
}

async function appendOrder(order) {
  if (mode() === "demo") {
    demoState().orders.push({ opsDate: "", status: "", ...order });
    persistDemo();
    return;
  }
  const t = await readTable(ORDERS_ID(), ORDERS_TAB(), ORDER_FIELDS, "ref");
  if (t.items.some((x) => sameKey(x.ref, order.ref))) throw httpError(409, `Ref No ${order.ref} already exists.`);
  const width = Math.max(t.headers.length, ...Object.values(t.cols).map((c) => c + 1));
  const row = Array(width).fill("");
  for (const [field, idx] of Object.entries(t.cols)) row[idx] = order[field] ?? "";
  await appendRows(ORDERS_ID(), `${ORDERS_TAB()}!A1`, [row]);
  bust("orders");
}

// ---------- meta (urgent flag, ops note) and state ----------

let tabsReady = false;
async function ensureAppTabs() {
  if (tabsReady || mode() !== "sheets") return;
  await ensureTab(ORDERS_ID(), META_TAB, ["Ref No", "Urgent", "Urgent By", "Urgent At", "Ops Note"]);
  await ensureTab(ORDERS_ID(), STATE_TAB, ["key", "value"]);
  tabsReady = true;
}

export async function getMeta() {
  if (mode() === "demo") return JSON.parse(JSON.stringify(demoState().meta));
  return cached("meta", 10_000, async () => {
    await ensureAppTabs();
    const rows = await readRange(ORDERS_ID(), `${META_TAB}!A2:E`);
    const meta = {};
    for (const r of rows) {
      if (!r[0]) continue;
      meta[String(r[0]).trim()] = {
        urgent: /^(true|yes|1|y)$/i.test(String(r[1] || "").trim()),
        urgentBy: r[2] || "",
        urgentAt: r[3] || "",
        opsNote: r[4] || "",
      };
    }
    return meta;
  });
}

export async function setMeta(ref, patch, by = "") {
  if (mode() === "demo") {
    const m = demoState().meta;
    m[ref] = { ...(m[ref] || {}), ...patch };
    persistDemo();
    return;
  }
  await ensureAppTabs();
  const rows = await readRange(ORDERS_ID(), `${META_TAB}!A1:E`);
  const idx = rows.findIndex((r, i) => i > 0 && sameKey(r[0], ref));
  const current = idx > 0 ? rows[idx] : [ref, "", "", "", ""];
  const next = [ref, current[1] || "", current[2] || "", current[3] || "", current[4] || ""];
  if ("urgent" in patch) {
    next[1] = patch.urgent ? "TRUE" : "";
    next[2] = patch.urgent ? by : "";
    next[3] = patch.urgent ? new Date().toISOString() : "";
  }
  if ("opsNote" in patch) next[4] = patch.opsNote;
  if (idx > 0) await writeRange(ORDERS_ID(), `${META_TAB}!A${idx + 1}:E${idx + 1}`, [next]);
  else await appendRows(ORDERS_ID(), `${META_TAB}!A1`, [next]);
  bust("meta");
}

export async function getState(key) {
  if (mode() === "demo") return demoState().state[key] || "";
  await ensureAppTabs();
  const rows = await readRange(ORDERS_ID(), `${STATE_TAB}!A1:B`);
  const row = rows.find((r, i) => i > 0 && r[0] === key);
  return row ? row[1] || "" : "";
}

export async function setState(key, value) {
  if (mode() === "demo") {
    demoState().state[key] = value;
    persistDemo();
    return;
  }
  await ensureAppTabs();
  const rows = await readRange(ORDERS_ID(), `${STATE_TAB}!A1:B`);
  const idx = rows.findIndex((r, i) => i > 0 && r[0] === key);
  if (idx > 0) await writeRange(ORDERS_ID(), `${STATE_TAB}!A${idx + 1}:B${idx + 1}`, [[key, value]]);
  else await appendRows(ORDERS_ID(), `${STATE_TAB}!A1`, [[key, value]]);
}

// ---------- users ----------

/**
 * Local development only: real orders connected but no users sheet yet, so sign in with the
 * demo logins. Never on Vercel, where that would put real orders behind well-known passwords.
 */
export function usingDemoLogins() {
  return mode() === "demo" || (!USERS_ID() && !process.env.VERCEL);
}

/** "master-admin" signs in as a full admin; the original role is kept in rawRole so registration can find it. */
export function isMasterAdmin(u) {
  return /^master[\s_-]?admin$/i.test(String(u?.rawRole ?? u?.role ?? "").trim());
}
const normalizeUser = (u) => ({ ...u, rawRole: u.role, role: isMasterAdmin({ rawRole: u.role }) ? "admin" : u.role });

const demoUserEdits = {}; // username -> { email, contact }, memory only
const demoUserAdds = []; // users registered while running on demo logins, memory only

export async function getUsers() {
  if (usingDemoLogins()) return [...demoUsers, ...demoUserAdds].map((u) => normalizeUser({ ...u, ...(demoUserEdits[u.username] || {}) }));
  if (!USERS_ID()) throw httpError(500, "SHEET_ID_USERS is not set.");
  return cached("users", 60_000, async () => {
    const t = await readTable(USERS_ID(), USERS_TAB(), USER_FIELDS, "username");
    return t.items.map(normalizeUser);
  });
}

/** Register a new user. The password is stored the same way as every other row in the users sheet. */
export async function addUser(user) {
  if (usingDemoLogins()) {
    const all = await getUsers();
    if (all.some((u) => sameKey(u.username, user.username))) throw httpError(409, "That username is taken.");
    demoUserAdds.push({ account_id: "", ...user });
    return;
  }
  const t = await readTable(USERS_ID(), USERS_TAB(), USER_FIELDS, "username"); // fresh, not cached
  if (t.items.some((u) => sameKey(u.username, user.username))) throw httpError(409, "That username is taken.");
  for (const f of ["username", "password", "role", "display_name"]) {
    if (t.cols[f] == null) throw httpError(500, `The users sheet has no "${f}" column.`);
  }
  const width = Math.max(t.headers.length, ...Object.values(t.cols).map((c) => c + 1));
  const row = Array(width).fill("");
  for (const [field, idx] of Object.entries(t.cols)) row[idx] = user[field] ?? "";
  await appendRows(USERS_ID(), `${USERS_TAB()}!A1`, [row]);
  bust("users");
}

/** Save an email and/or WhatsApp number into the users sheet so it is remembered for next time. */
export async function updateUserContact(username, patch) {
  const fields = Object.keys(patch).filter((k) => ["email", "contact"].includes(k));
  if (!fields.length) throw httpError(400, "Nothing to save.");
  if (usingDemoLogins()) {
    if (!demoUsers.some((u) => u.username === username)) throw httpError(404, "User not found.");
    demoUserEdits[username] = { ...(demoUserEdits[username] || {}), ...Object.fromEntries(fields.map((f) => [f, patch[f]])) };
    return;
  }
  const t = await readTable(USERS_ID(), USERS_TAB(), USER_FIELDS, "username");
  const row = t.items.find((x) => sameKey(x.username, username));
  if (!row) throw httpError(404, "User not found in the users sheet.");
  const data = [];
  for (const f of fields) {
    if (t.cols[f] == null) throw httpError(500, `The users sheet has no "${f === "email" ? "Email" : "Contact"}" column. Add it in row 1 and try again.`);
    data.push({ range: `${USERS_TAB()}!${colLetter(t.cols[f])}${row.rowNumber}`, values: [[patch[f]]] });
  }
  await batchWrite(USERS_ID(), data);
  bust("users");
}

// ---------- leads (potential orders) ----------

async function ensureLeadHeaders() {
  const rows = await readRange(ORDERS_ID(), `${LEADS_TAB()}!A1:J1`);
  if (!rows.length || !rows[0].length) await writeRange(ORDERS_ID(), `${LEADS_TAB()}!A1`, [LEAD_HEADERS]);
}

export async function getLeads() {
  if (mode() === "demo") return demoState().leads.map((l) => ({ ...l }));
  await ensureLeadHeaders();
  const t = await readTable(ORDERS_ID(), LEADS_TAB(), LEAD_FIELDS, "leadRef");
  return t.items;
}

function nextLeadRef(existing) {
  const t = todayIST();
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][t.m - 1];
  const prefix = `Lead-${mon}${String(t.y).slice(2)}-`;
  const used = existing.filter((l) => l.leadRef.startsWith(prefix)).map((l) => Number(l.leadRef.slice(prefix.length)) || 0);
  return `${prefix}${String(Math.max(0, ...used) + 1).padStart(3, "0")}`;
}

export async function addLead(lead) {
  const existing = await getLeads();
  const full = {
    date: formatDMY(todayIST()),
    stage: "New",
    followUp: "",
    converted: "",
    expected: "",
    kind: "",
    products: "",
    ...lead,
    leadRef: nextLeadRef(existing),
  };
  if (mode() === "demo") {
    demoState().leads.push(full);
    persistDemo();
    return full;
  }
  const t = await readTable(ORDERS_ID(), LEADS_TAB(), LEAD_FIELDS, "leadRef");
  const width = Math.max(LEAD_HEADERS.length, t.headers.length);
  const row = Array(width).fill("");
  const cols = Object.keys(t.cols).length ? t.cols : Object.fromEntries(Object.keys(LEAD_FIELDS).map((f, i) => [f, i]));
  for (const [field, idx] of Object.entries(cols)) row[idx] = full[field] ?? "";
  await appendRows(ORDERS_ID(), `${LEADS_TAB()}!A1`, [row]);
  return full;
}

const LEAD_WRITABLE = ["stage", "followUp", "expected", "converted", "poc", "client", "kind", "products"];

export async function updateLead(leadRef, patch) {
  const fields = Object.keys(patch).filter((k) => LEAD_WRITABLE.includes(k));
  if (!fields.length) throw httpError(400, "Nothing to update.");
  if (mode() === "demo") {
    const l = demoState().leads.find((x) => sameKey(x.leadRef, leadRef));
    if (!l) throw httpError(404, `Lead ${leadRef} not found.`);
    for (const f of fields) l[f] = patch[f];
    persistDemo();
    return;
  }
  const t = await readTable(ORDERS_ID(), LEADS_TAB(), LEAD_FIELDS, "leadRef");
  const row = t.items.find((x) => sameKey(x.leadRef, leadRef));
  if (!row) throw httpError(404, `Lead ${leadRef} not found.`);
  const data = fields
    .filter((f) => t.cols[f] != null)
    .map((f) => ({ range: `${LEADS_TAB()}!${colLetter(t.cols[f])}${row.rowNumber}`, values: [[patch[f]]] }));
  await batchWrite(ORDERS_ID(), data);
}

export async function convertLead(leadRef, refNo) {
  const leads = await getLeads();
  const lead = leads.find((l) => sameKey(l.leadRef, leadRef));
  if (!lead) throw httpError(404, `Lead ${leadRef} not found.`);
  if (lead.converted) throw httpError(409, `${leadRef} was already converted to ${lead.converted}.`);
  await appendOrder({
    date: formatDMY(todayIST()),
    poc: lead.poc,
    ref: refNo,
    client: lead.client,
    kind: lead.kind,
    products: lead.products,
    expected: lead.expected,
    opsDate: "",
    status: "",
  });
  await updateLead(leadRef, { stage: "Won", converted: refNo });
}

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
