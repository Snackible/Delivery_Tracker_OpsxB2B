// Delivery Tracker front end. Plain modules, no build step.

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const icon = (n, cls = "i") => `<svg class="${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;

const OPEN = new Set(["overdue", "today", "upcoming", "needs_date", "in_transit"]);
const CLOSED = new Set(["delivered", "cancelled", "rto", "expired", "internal_po"]);
const STATUS_ICON = { overdue: "alert", today: "clock", upcoming: "next", needs_date: "dash", delivered: "check", cancelled: "x", in_transit: "truck", hold: "pause", rto: "undo", expired: "clock", internal_po: "note" };

const S = {
  me: null,
  mode: "",
  orders: [],
  leads: [],
  stages: [],
  recipients: null,
  view: "orders",
  filter: "open",
  owner: "",
  q: "",
  mine: false,
  animate: true,
  loaded: false,
};

const first = (v) => String(v || "").trim().toLowerCase().split(/s+/)[0];
const isMine = (o) => Boolean(S.me?.poc) && (o.poc.toLowerCase() === S.me.poc.toLowerCase() || first(o.poc) === first(S.me.poc));
const isBD = () => S.me && ["b2b", "admin"].includes(S.me.role);
const isOps = () => S.me && ["ops", "admin"].includes(S.me.role);

// ---------- api ----------

class SignedOut extends Error {}

async function api(path, { method = "GET", body, quiet401 = false } = {}) {
  const res = await fetch(`/api/${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (res.status === 401 && !quiet401) {
    showLogin();
    throw new SignedOut("signed out");
  }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.data = data;
    throw err;
  }
  return data;
}

function toast(message, bad = false, long = false) {
  const el = document.createElement("div");
  el.className = `toast${bad ? " err" : ""}${long ? " alert" : ""}`;
  el.textContent = message;
  $("#toasts").append(el);
  setTimeout(() => el.remove(), long ? 15000 : bad ? 6000 : 3500);
}

async function guard(fn) {
  try {
    return await fn();
  } catch (err) {
    if (!(err instanceof SignedOut)) toast(err.message, true);
    return undefined;
  }
}

// ---------- theme ----------

function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
function paintThemeButtons() {
  const dark = currentTheme() === "dark";
  const label = dark ? "Light mode" : "Dark mode";
  $("#themeBtn").innerHTML = `${icon(dark ? "sun" : "moon")}${label}`;
  $("#themeBtnM").innerHTML = icon(dark ? "sun" : "moon");
  $("#themeBtnM").setAttribute("aria-label", `Switch to ${label.toLowerCase()}`);
}
function toggleTheme() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("dt-theme", next);
  } catch {}
  paintThemeButtons();
}

// ---------- sound alerts ----------
// Always on, no setting. Short tones made with the Web Audio API (no files). Browsers only allow sound after the person
// has clicked something on the page, so the audio is unlocked on the first click or key press.

const Sound = { ctx: null };

function unlockAudio() {
  try {
    Sound.ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (Sound.ctx.state === "suspended") Sound.ctx.resume();
  } catch {}
}
document.addEventListener("pointerdown", unlockAudio, { passive: true });
document.addEventListener("keydown", unlockAudio);

function tone(freq, start, length, volume = 0.7, type = "sawtooth") {
  const c = Sound.ctx;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  // Near-instant attack and a held level, then a short release: loud and blunt, not a soft chime.
  gain.gain.setValueAtTime(0.0001, c.currentTime + start);
  gain.gain.linearRampToValueAtTime(volume, c.currentTime + start + 0.005);
  gain.gain.setValueAtTime(volume, c.currentTime + start + length - 0.03);
  gain.gain.linearRampToValueAtTime(0.0001, c.currentTime + start + length);
  osc.connect(gain).connect(c.destination);
  osc.start(c.currentTime + start);
  osc.stop(c.currentTime + start + length + 0.05);
}

/**
 * Alarms. "urgent" is a two-tone siren, about three seconds. "late" is a three-blast klaxon.
 * Both are at near full volume on purpose.
 */
function chime(kind) {
  unlockAudio();
  if (!Sound.ctx || Sound.ctx.state !== "running") return;
  if (kind === "urgent") {
    for (let i = 0; i < 8; i++) tone(i % 2 ? 740 : 988, i * 0.38, 0.36, 0.8);
  } else if (kind === "late") {
    for (let i = 0; i < 3; i++) tone(i === 2 ? 330 : 440, i * 0.5, 0.42, 0.7, "square");
  } else if (kind === "update") {
    // Rising three-note chime, one beat louder than a notification: "something moved".
    [523, 659, 784].forEach((f, i) => tone(f, i * 0.16, 0.2, 0.65, "triangle"));
    tone(1047, 0.5, 0.45, 0.65, "triangle");
  } else {
    tone(784, 0, 0.18, 0.4, "triangle");
  }
}

/** Flash the tab title (and buzz a phone) so an alert is noticed even when the tab is in the background. */
let titleTimer = null;
const baseTitle = document.title;
function flashTitle(text) {
  clearInterval(titleTimer);
  let on = false;
  let n = 0;
  titleTimer = setInterval(() => {
    on = !on;
    document.title = on ? text : baseTitle;
    if (++n > 40 || (!document.hidden && n > 6)) {
      clearInterval(titleTimer);
      document.title = baseTitle;
    }
  }, 700);
  try {
    navigator.vibrate?.([300, 120, 300, 120, 300]);
  } catch {}
}

// ---------- login / shell ----------

async function probeRegister() {
  try {
    const r = await fetch("/api/register");
    $("#showRegister").hidden = !(await r.json()).enabled;
  } catch {
    $("#showRegister").hidden = true;
  }
}

function paintVersion(v) {
  if (!v) return;
  S.version = v;
  document.querySelectorAll("[data-version]").forEach((el) => {
    el.textContent = v.label + (v.env && v.env !== "production" ? ` · ${v.env}` : "");
    el.title = `Release ${v.version}, commit ${v.commit}`;
  });
}

function showLogin() {
  S.me = null;
  $("#registerForm").hidden = true;
  $("#loginForm").hidden = false;
  probeRegister();
  $("#shell").hidden = true;
  $("#login").hidden = false;
  $("#lp").value = "";
  $("#lu").focus();
}

function showShell() {
  $("#login").hidden = true;
  $("#shell").hidden = false;
  $("#whoName").textContent = S.me.name;
  $("#whoRole").textContent = { b2b: "BD team", ops: "Ops", admin: "Admin" }[S.me.role] || S.me.role;
  S.view = isOps() && !isBD() ? "queue" : "orders";
  S.filter = "open";
  S.seen = null;
  S.animate = true;
  paintThemeButtons();
  buildNav();
  refresh();
}

function navItems() {
  const items = [
    { id: "orders", label: "Orders", icon: "orders" },
    { id: "queue", label: "Ops queue", icon: "queue" },
  ];
  if (isBD()) items.push({ id: "pipeline", label: "Pipeline", icon: "pipeline" });
  return items;
}

function buildNav() {
  const html = navItems()
    .map((n) => `<button type="button" data-view="${n.id}" ${S.view === n.id ? 'aria-current="page"' : ""}>${icon(n.icon)}<span>${n.label}</span><span class="count" data-count="${n.id}"></span></button>`)
    .join("");
  $("#nav").innerHTML = html;
  $("#tabbar").innerHTML = navItems()
    .map((n) => `<button type="button" data-view="${n.id}" ${S.view === n.id ? 'aria-current="page"' : ""}>${icon(n.icon)}<span>${n.label}</span></button>`)
    .join("");
  paintCounts();
}

function paintCounts() {
  const open = S.orders.filter((o) => OPEN.has(o.status)).length;
  const set = (id, n) => {
    const el = $(`[data-count="${id}"]`);
    if (el) el.textContent = n || "";
  };
  set("orders", open);
  set("queue", queueOrders().length);
  set("pipeline", S.leads.filter((l) => !l.converted && l.stage !== "Lost").length);
}

function go(view) {
  S.view = view;
  document.querySelectorAll("[data-view]").forEach((b) => (b.getAttribute("data-view") === view ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
  if (view === "pipeline" && !S.leads.length) loadLeads();
  render();
  $("#view").focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

// ---------- data ----------

/** Orders that are newly urgent or newly overdue since the last load (never on the first load). */
// A status someone (or the master sheet) set, as opposed to Overdue / Due today / Upcoming, which just follow the date.
const SET_BY_SOMEONE = new Set(["in_transit", "delivered", "cancelled", "hold", "rto", "expired", "internal_po"]);

function alertOnChanges(orders, announce) {
  const statusOf = new Map(orders.map((o) => [o.ref, o.status]));
  const urgent = new Set(orders.filter((o) => o.urgent).map((o) => o.ref));
  const late = new Set(orders.filter((o) => o.late).map((o) => o.ref));
  if (S.seen && announce) {
    const newUrgent = [...urgent].filter((r) => !S.seen.urgent.has(r));
    const newLate = [...late].filter((r) => !S.seen.late.has(r));
    // BD side: hear it when an order's status is updated (ops marks it, or the master sheet changes).
    const changed = isBD()
      ? orders.filter((o) => S.seen.status.has(o.ref) && S.seen.status.get(o.ref) !== o.status && (SET_BY_SOMEONE.has(o.status) || SET_BY_SOMEONE.has(S.seen.status.get(o.ref))))
      : [];
    const say = (list) =>
      list.length <= 3
        ? list.map((o) => `${o.ref} is now: ${o.label}`).join(" · ")
        : `${list.length} orders had their status updated`;
    if (newUrgent.length) {
      S.flash = new Set(newUrgent);
      setTimeout(() => (S.flash = null), 4000);
      chime("urgent");
      flashTitle("🚨 URGENT order");
      toast(newUrgent.length === 1 ? `${newUrgent[0]} was just marked urgent` : `${newUrgent.length} orders were just marked urgent`, false, true);
    } else if (newLate.length) {
      chime("late");
      flashTitle("⚠️ Order overdue");
      toast(newLate.length === 1 ? `${newLate[0]} is now overdue` : `${newLate.length} orders are now overdue`, false, true);
    } else if (changed.length) {
      chime("update");
    }
    if (changed.length) toast(say(changed), false, true); // the notice is shown even when a louder alert played
  }
  S.seen = { urgent, late, status: statusOf };
}

async function loadOrders(silent = false, announce = false) {
  const data = await api("orders");
  alertOnChanges(data.orders, announce);
  S.orders = data.orders;
  S.mode = data.mode;
  S.master = data.master || null;
  S.loaded = true;
  paintCounts();
}

async function loadLeads() {
  if (!isBD()) return;
  const data = await api("leads");
  S.leads = data.leads;
  S.stages = data.stages;
  paintCounts();
  if (S.view === "pipeline") render();
}

async function refresh() {
  await guard(async () => {
    await loadOrders();
    if (isBD()) loadLeads().catch(() => {});
    render();
  });
}

// ---------- due rail (the signature mark) ----------

const RW = 184;
const MID = 92;
const STEP = 80 / 14;
const clampDays = (d) => Math.max(-14, Math.min(14, d));
const rx = (d) => MID + clampDays(d) * STEP;

function railHead() {
  const ticks = [-14, -7, 0, 7, 14].map((d) => `<line class="tick" x1="${rx(d)}" x2="${rx(d)}" y1="5" y2="13"/>`).join("");
  return `<svg class="rail-svg" viewBox="0 0 ${RW} 30" role="img" aria-label="Due rail: 14 days late on the left, today in the middle, 14 days ahead on the right">
    <line class="axis" x1="${rx(-14)}" x2="${rx(14)}" y1="9" y2="9"/>${ticks}<line class="today-line" x1="${MID}" x2="${MID}" y1="3" y2="15"/>
    <text x="${rx(-14)}" y="27" text-anchor="start">−14d</text><text x="${MID}" y="27" text-anchor="middle">today</text><text x="${rx(14)}" y="27" text-anchor="end">+14d</text></svg>`;
}

function railSvg(o, i) {
  const ticks = [-14, -7, 0, 7, 14].map((d) => `<line class="tick" x1="${rx(d)}" x2="${rx(d)}" y1="12" y2="18"/>`).join("");
  const urgent = o.urgent ? " urgent" : "";
  const cls = `mk s-${o.status}${o.late ? " late" : ""}${urgent}`;
  let mark = "";
  const d = o.daysToDue;
  if (o.status === "needs_date") {
    mark = `<line class="${cls}" x1="${RW - 10}" x2="${RW - 10}" y1="6" y2="24"/>`;
  } else if (d != null && CLOSED.has(o.status)) {
    const x = rx(d);
    mark = o.status === "cancelled"
      ? `<path class="${cls}" d="M${x - 4} 11l8 8M${x + 4} 11l-8 8"/>`
      : `<circle class="${cls}" cx="${x}" cy="15" r="4"/>`;
  } else if (d != null) {
    const x = rx(d);
    const clipped = Math.abs(d) > 14;
    if (o.late) mark = `<line class="${cls}" x1="${x}" x2="${x}" y1="6" y2="24"/><line class="${cls}" x1="${x + 4}" x2="${x + 4}" y1="6" y2="24"/>`;
    else mark = `<line class="${cls}" x1="${x}" x2="${x}" y1="6" y2="24"/>`;
    if (clipped) mark += `<path class="${cls}" d="M${d < 0 ? x + 12 : x - 12} 11l${d < 0 ? -4 : 4} 4-${d < 0 ? 4 : -4} 4" transform="translate(${d < 0 ? -2 : 2} 0)"/>`;
  }
  const from = d != null && d < 0 ? "-36px" : "36px";
  const anim = S.animate && i < 30 ? `style="--from:${from};animation-delay:${i * 14}ms"` : 'style="animation:none"';
  const label = o.status === "needs_date" ? "No due date" : o.dueLabel ? `Due ${o.dueLabel}, ${o.label}` : o.label;
  return `<svg class="rail-svg" viewBox="0 0 ${RW} 30" role="img" aria-label="${esc(label)}"><line class="axis" x1="${rx(-14)}" x2="${rx(14)}" y1="15" y2="15"/>${ticks}<line class="today-line" x1="${MID}" x2="${MID}" y1="4" y2="26"/><g class="mk-wrap" ${anim}>${mark}</g></svg>`;
}

// ---------- order rows ----------

const productLine = (o) => [o.kind, o.products].filter((v) => v && v !== "Mentioned in mail").join(" · ") || o.products || "";

function chip(o) {
  return `<span class="chip s-${o.status}${o.late ? " late" : ""}"${o.fromMaster ? ' title="From the operations master sheet"' : ""}>${icon(STATUS_ICON[o.status])}${esc(o.label)}</span>`;
}

function actionsFor(o) {
  const done = CLOSED.has(o.status);
  const bd = isBD();
  const ops = isOps();
  let h = '<div class="group">';
  // Anything the master sheet decided cannot be undone from here (the master is read only), so no Reopen.
  if (done && o.fromMaster) return h + "</div>";
  if (o.status === "hold" && o.fromMaster) return h + "</div>";
  if (done) {
    if (bd || ops) h += `<button class="btn small" type="button" data-act="reopen">${icon("undo")}Reopen</button>`;
    return h + "</div>";
  }
  if (bd) {
    // Every row has the same three controls in the same places so the column scans straight down.
    // A row that needs a date gets its calendar button highlighted instead of a different label.
    const needsDate = o.status === "needs_date";
    const dateLabel = needsDate ? "Set expected date" : "Change expected date";
    h += `<button class="btn small${needsDate ? " attn" : ""}" type="button" data-act="date" title="${dateLabel}" aria-label="${dateLabel} for ${esc(o.ref)}"><span class="lbl">${needsDate ? "Set date" : "Date"}</span></button>`;
    h += `<button class="icon-btn" type="button" data-act="urgent" aria-pressed="${o.urgent}" aria-label="${o.urgent ? "Remove urgent flag" : "Mark urgent"}" title="${o.urgent ? "Remove urgent flag" : "Mark urgent"}">${icon("flag")}</button>`;
    const why = "Can't remind yet: no delivery date is written and the estimated dispatch is not within 2 days";
    h += `<button class="btn small" type="button" data-act="remind" ${o.remindable ? `title="Remind ops" aria-label="Remind ops about ${esc(o.ref)}"` : `disabled title="${why}" aria-label="${why}"`}>${icon("bell")}<span class="lbl">Remind</span></button>`;
    h += `<details class="menu"><summary class="icon-btn" aria-label="More actions" title="More actions">${icon("more")}</summary><div class="menu-list">
      ${o.status !== "in_transit" ? `<button type="button" data-act="transit">${icon("truck")}Mark in transit</button>` : ""}
      <button type="button" data-act="delivered">${icon("check")}Mark delivered</button>
      ${ops ? `<button type="button" data-act="note">${icon("note")}Ops note</button>` : ""}
      <button type="button" class="danger" data-act="cancel">${icon("x")}Cancel order</button></div></details>`;
  } else if (ops) {
    if (o.status !== "in_transit") h += `<button class="btn small" type="button" data-act="transit">${icon("truck")}In transit</button>`;
    h += `<button class="btn small primary" type="button" data-act="delivered">${icon("check")}Mark delivered</button>`;
    h += `<button class="icon-btn" type="button" data-act="note" aria-label="Add a note" title="Add a note">${icon("note")}</button>`;
  }
  return h + "</div>";
}

/** The dates the sheets hold for an order: ordered, estimated dispatch, dispatched, delivered. */
function datesHtml(o) {
  if (!o.dates?.length) return "";
  return `<ul class="dates">${o.dates.map((d) => `<li><span>${esc(d.label)}</span>${esc(d.value)}</li>`).join("")}</ul>`;
}

function rowHtml(o, i) {
  const done = CLOSED.has(o.status);
  const cls = [o.urgent ? "is-urgent" : "", done ? "is-done" : "", S.flash?.has(o.ref) ? "flash" : ""].filter(Boolean).join(" ");
  const sub = esc([o.poc, o.status === "in_transit" && o.shipment ? o.shipment : productLine(o)].filter(Boolean).join(" · "));
  return `<tr class="${cls}" data-ref="${esc(o.ref)}">
    <td class="c-ref"><span class="ref">${esc(o.ref)}</span>${o.urgent ? `<span class="tag-urgent">${icon("flag")}Urgent</span>` : ""}</td>
    <td class="c-client client"><b title="${esc(o.client)}">${esc(o.client)}</b>${sub ? `<small title="${sub}">${sub}</small>` : ""}${o.opsNote ? `<small>Ops note: ${esc(o.opsNote)}</small>` : ""}</td>
    <td class="c-due due"><span class="due-main">${o.dueLabel ? esc(o.dueLabel) : "—"}</span>${o.dueFromAsap ? "<small>Asap</small>" : ""}${datesHtml(o)}</td>
    <td class="c-rail rail-cell">${railSvg(o, i)}</td>
    <td class="c-status">${chip(o)}</td>
    <td class="actions">${actionsFor(o)}</td>
  </tr>`;
}

function ordersTable(list, emptyTitle, emptyText) {
  if (!list.length) return `<div class="table-wrap"><div class="empty">${icon("check", "i big")}<strong>${esc(emptyTitle)}</strong>${esc(emptyText)}</div></div>`;
  return `<div class="table-wrap"><table>
    <thead><tr><th scope="col">Order</th><th scope="col">Client and owner</th><th scope="col">Due and dates</th><th scope="col" class="rail-cell rail-head">${railHead()}</th><th scope="col">Status</th><th scope="col"><span class="sr">Actions</span></th></tr></thead>
    <tbody>${list.map(rowHtml).join("")}</tbody></table></div>`;
}

// ---------- views ----------

const PENDING = new Set(["overdue", "today", "upcoming", "needs_date"]);
// Every status the master sheet can have gets its own filter, even when it is empty today.
const FILTERS = [
  { id: "open", label: "Open", test: (o) => OPEN.has(o.status), cls: "" },
  { id: "pending", label: "Pending", test: (o) => PENDING.has(o.status), cls: "" },
  { id: "overdue", label: "Overdue", test: (o) => o.late, cls: "s-overdue" },
  { id: "today", label: "Due today", test: (o) => o.status === "today", cls: "s-today" },
  { id: "urgent", label: "Urgent", test: (o) => o.urgent, cls: "s-urgent" },
  { id: "in_transit", label: "In transit", test: (o) => o.status === "in_transit", cls: "s-in_transit" },
  { id: "needs_date", label: "Needs date", test: (o) => o.status === "needs_date", cls: "s-needs_date" },
  { id: "upcoming", label: "Upcoming", test: (o) => o.status === "upcoming", cls: "s-upcoming" },
  { id: "hold", label: "On hold", test: (o) => o.status === "hold", cls: "s-hold" },
  { id: "delivered", label: "Delivered", test: (o) => o.status === "delivered", cls: "" },
  { id: "rto", label: "Returned (RTO)", test: (o) => o.status === "rto", cls: "s-rto" },
  { id: "cancelled", label: "Cancelled", test: (o) => o.status === "cancelled", cls: "" },
  { id: "expired", label: "Expired", test: (o) => o.status === "expired", cls: "" },
  { id: "internal_po", label: "Internal PO", test: (o) => o.status === "internal_po", cls: "" },
  { id: "all", label: "All", test: () => true, cls: "" },
];

function queueOrders() {
  return S.orders.filter((o) => OPEN.has(o.status) && o.status !== "needs_date" && (o.urgent || o.late || o.status === "today" || o.status === "in_transit" || (o.status === "upcoming" && o.daysToDue <= 3)));
}

function matchesSearch(o) {
  if (!S.q) return true;
  const hay = `${o.ref} ${o.client} ${o.poc} ${o.products} ${o.kind}`.toLowerCase();
  return S.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

function renderOrders() {
  const f = FILTERS.find((x) => x.id === S.filter) || FILTERS[0];
  const owners = [...new Set(S.orders.map((o) => o.poc).filter(Boolean))].sort();
  const hasMine = S.orders.some(isMine);
  const list = S.orders.filter((o) => f.test(o) && matchesSearch(o) && (!S.owner || o.poc === S.owner) && (!S.mine || isMine(o)));
  const chips = FILTERS.map((x) => {
    const n = S.orders.filter(x.test).length;
    return `<button type="button" class="fchip" data-filter="${x.id}" aria-pressed="${S.filter === x.id}">${x.label}<span class="n ${x.cls}${n === 0 ? " zero" : ""}">${n}</span></button>`;
  }).join("");
  const toolbar = `<div class="toolbar">
    <div class="search">${icon("search")}<input id="q" type="search" placeholder="Search ref, client, owner" value="${esc(S.q)}" aria-label="Search orders"></div>
    <select id="owner" aria-label="Owner"><option value="">All owners</option>${owners.map((p) => `<option ${S.owner === p ? "selected" : ""}>${esc(p)}</option>`).join("")}</select>
    ${hasMine ? `<label class="inline"><input type="checkbox" id="mine" ${S.mine ? "checked" : ""}> My orders</label>` : ""}</div>`;
  $("#view").innerHTML = `${head("Orders", greeting())}${demoBanner()}${statusStrip()}<div class="filters" role="group" aria-label="Filter by status">${chips}</div>${toolbar}${ordersTable(list, "Nothing here", "No orders match these filters.")}`;
  S.animate = false;
}

function renderQueue() {
  const list = queueOrders();
  $("#view").innerHTML = `${head("Ops queue", greeting() + ". Urgent, late, due today and due in 3 days")}${demoBanner()}${ordersTable(list, "All clear", "Nothing is late or due in the next 3 days.")}`;
  S.animate = false;
}

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(new Date())) % 24;
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return `${part}, ${String(S.me?.name || "").split(" ")[0]}`;
}

/** The whole open list as one bar. Each segment is a filter, and the legend spells out the counts. */
function statusStrip() {
  const open = S.orders.filter((o) => OPEN.has(o.status));
  if (!open.length) return "";
  const parts = [
    ["overdue", "Overdue", open.filter((o) => o.status === "overdue").length],
    ["today", "Due today", open.filter((o) => o.status === "today").length],
    ["in_transit", "In transit", open.filter((o) => o.status === "in_transit").length],
    ["hold", "On hold", S.orders.filter((o) => o.status === "hold").length],
    ["upcoming", "Upcoming", open.filter((o) => o.status === "upcoming").length],
    ["needs_date", "Needs date", open.filter((o) => o.status === "needs_date").length],
  ].filter(([, , n]) => n);
  const segs = parts.map(([id, label, n]) => `<button type="button" class="seg s-${id}" style="flex:${n} 1 0" data-filter="${id}" aria-label="Show ${label}: ${n}" title="${label}: ${n}"></button>`).join("");
  const legend = parts.map(([id, label, n]) => `<span><i class="dot s-${id}" style="background:var(--${id === "needs_date" ? "needs" : id})"></i><b>${n}</b> ${label.toLowerCase()}</span>`).join("");
  return `<div class="strip" role="group" aria-label="Open orders by status">${segs}</div><div class="strip-legend">${legend}</div>`;
}

function head(title, sub) {
  return `<div class="page-head"><h1>${esc(title)}</h1><span class="sub">${esc(sub)}</span>
    <button class="btn ghost" type="button" data-act="refresh" aria-label="Refresh">${icon("refresh")}Refresh</button>
    ${S.me.master ? `<button class="btn" type="button" data-act="resend-daily" title="Send today's email to ops again">${icon("mail")}Resend daily email</button>` : ""}
    ${S.me.master ? `<button class="btn primary" type="button" data-act="remind-top" title="Pick several orders and remind ops about them">${icon("bell")}Remind ops about several orders</button>` : ""}</div>`;
}

function demoBanner() {
  if (S.master?.configured && !S.master.connected) {
    return `<div class="banner">${icon("alert")}<span>The operations master sheet could not be read, so delivery status is coming from the BD sheet only. ${esc(S.master.error)}</span></div>`;
  }
  if (S.mode !== "demo") return "";
  return `<div class="banner">${icon("alert")}<span>Demo data. Edits are kept in memory only. Add Google credentials in <b>.env</b> to use the real sheet.</span></div>`;
}

function renderPipeline() {
  const rows = S.leads.map((l) => {
    const done = Boolean(l.converted);
    const stage = done
      ? `<span class="chip s-delivered">${icon("check")}Won · ${esc(l.converted)}</span>`
      : `<select class="stage-sel" data-lead="${esc(l.leadRef)}" aria-label="Stage for ${esc(l.leadRef)}">${S.stages.map((s) => `<option ${l.stage === s ? "selected" : ""}>${s}</option>`).join("")}</select>`;
    return `<tr data-lead-row="${esc(l.leadRef)}" class="${done ? "is-done" : ""}">
      <td class="c-ref"><span class="ref">${esc(l.leadRef)}</span></td>
      <td class="c-client client"><b>${esc(l.client)}</b><small>${esc([l.kind, l.products].filter(Boolean).join(" · "))}</small></td>
      <td class="c-owner">${esc(l.poc)}</td>
      <td class="c-due due">${l.followUp ? `Follow up ${esc(l.followUp)}` : "No follow-up"}<small>${l.expected ? `Delivery ${esc(l.expected)}` : ""}</small></td>
      <td class="c-status">${stage}</td>
      <td class="actions"><div class="group">${done || l.stage === "Lost" ? "" : `<button class="btn small" type="button" data-act="followup">${icon("calendar")}Follow-up</button><button class="btn small primary" type="button" data-act="convert">${icon("check")}Convert to order</button>`}</div></td></tr>`;
  }).join("");
  $("#view").innerHTML = `<div class="page-head"><h1>Pipeline</h1><span class="sub">${S.leads.length} potential orders</span>
    <button class="btn primary" type="button" data-act="add-lead">${icon("plus")}Add lead</button></div>${demoBanner()}
    ${S.leads.length ? `<div class="table-wrap"><table class="leads"><thead><tr><th>Lead</th><th>Client</th><th>Owner</th><th>Follow-up</th><th>Stage</th><th><span class="sr">Actions</span></th></tr></thead><tbody>${rows}</tbody></table></div>`
      : `<div class="table-wrap"><div class="empty"><strong>No leads yet</strong>Add a potential order to start tracking it.</div></div>`}`;
}

function render() {
  if (!S.me) return;
  if (S.view === "pipeline" && isBD()) renderPipeline();
  else if (S.view === "queue") renderQueue();
  else renderOrders();
}

// ---------- dialogs ----------

const dlg = () => $("#dlg");

function openDialog({ title, body, buttons }) {
  const d = dlg();
  d.innerHTML = `<form method="dialog" class="dlg-form"><div class="dlg-head"><h2>${esc(title)}</h2><button class="icon-btn" type="button" data-close aria-label="Close">${icon("x")}</button></div>
    <div class="dlg-body">${body}</div><div class="dlg-foot"></div></form>`;
  const foot = $(".dlg-foot", d);
  for (const b of buttons) {
    const el = document.createElement(b.href ? "a" : "button");
    if (b.href) Object.assign(el, { href: b.href, target: "_blank", rel: "noopener" });
    else el.type = "button";
    el.className = `btn ${b.kind || ""}`;
    el.textContent = b.label;
    el.addEventListener("click", async () => {
      if (b.href) return setTimeout(() => d.close(), 150);
      if (!b.run) return d.close();
      el.disabled = true;
      try {
        const keep = await b.run(d);
        if (keep !== false) d.close();
      } catch (err) {
        if (!(err instanceof SignedOut)) toast(err.message, true);
      } finally {
        el.disabled = false;
      }
    });
    foot.append(el);
  }
  $("[data-close]", d).addEventListener("click", () => d.close());
  if (!d.open) d.showModal();
  const first = $("input:not([type=checkbox]), textarea, select", d);
  first?.focus();
}

dlg().addEventListener("click", (e) => {
  if (e.target === dlg()) dlg().close();
});

const orderByRef = (ref) => S.orders.find((o) => o.ref === ref);

function dateDialog({ title, label, value, onSave, allowClear = false }) {
  openDialog({
    title,
    body: `<label for="dd">${esc(label)}</label><input id="dd" type="date" value="${esc(value || "")}">`,
    buttons: [
      { label: "Cancel" },
      { label: "Save", kind: "primary", run: async (d) => {
        const v = $("#dd", d).value;
        if (!v && !allowClear) throw new Error("Pick a date.");
        await onSave(v);
      } },
    ],
  });
}

async function afterEdit(message) {
  await loadOrders(true);
  render();
  if (message) toast(message);
}

// ---------- actions ----------

async function orderAction(ref, action, extra = {}) {
  return api("order-update", { method: "POST", body: { ref, action, ...extra } });
}

const todayISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

const handlers = {
  refresh: () => guard(async () => { await loadOrders(true); if (isBD()) await loadLeads(); render(); toast("Up to date"); }),
  date: (ref) => {
    const o = orderByRef(ref);
    dateDialog({
      title: `Expected delivery for ${ref}`,
      label: "Expected delivery date",
      value: o?.due || "",
      onSave: async (v) => { await orderAction(ref, "set-expected", { date: v }); await afterEdit("Date saved"); },
    });
  },
  urgent: (ref) => guard(async () => {
    const o = orderByRef(ref);
    const next = !o.urgent;
    o.urgent = next; // optimistic
    render();
    try {
      const res = await orderAction(ref, "urgent", { urgent: next });
      const n = res.notify;
      const note = !next ? "" : n?.sent ? " Ops were emailed." : n ? ` ${n.reason}` : "";
      await afterEdit(next ? `${ref} marked urgent.${note}` : "Urgent flag removed");
    } catch (err) {
      o.urgent = !next;
      render();
      throw err;
    }
  }),
  delivered: (ref) => {
    dateDialog({
      title: `Mark ${ref} delivered`,
      label: "Delivery date",
      value: todayISO(),
      onSave: async (v) => { await orderAction(ref, "delivered", { date: v }); await afterEdit(`${ref} marked delivered`); },
    });
  },
  cancel: (ref) => openDialog({
    title: `Cancel ${ref}?`,
    body: `<p>${esc(orderByRef(ref)?.client || "")}</p><p class="muted" style="margin-top:8px">Cancelled orders stop all reminders. You can reopen it later.</p>`,
    buttons: [{ label: "Keep order" }, { label: "Cancel order", kind: "danger", run: async () => { await orderAction(ref, "cancel"); await afterEdit(`${ref} cancelled`); } }],
  }),
  transit: (ref) => guard(async () => { await orderAction(ref, "transit"); await afterEdit(`${ref} marked in transit`); }),
  reopen: (ref) => guard(async () => { await orderAction(ref, "reopen"); await afterEdit(`${ref} reopened`); }),
  note: (ref) => {
    const o = orderByRef(ref);
    openDialog({
      title: `Ops note for ${ref}`,
      body: `<label for="nt">Note</label><textarea id="nt" maxlength="500" placeholder="For example: out for delivery, new date agreed">${esc(o?.opsNote || "")}</textarea>`,
      buttons: [{ label: "Cancel" }, { label: "Save note", kind: "primary", run: async (d) => { await orderAction(ref, "note", { note: $("#nt", d).value }); await afterEdit("Note saved"); } }],
    });
  },
  remind: (ref) => openRemind([ref]),
  "remind-top": () => openRemind(null),
  "resend-daily": () => openResendDaily(),
  "add-lead": () => openLeadDialog(),
  followup: (_ref, row) => {
    const lead = S.leads.find((l) => l.leadRef === row);
    dateDialog({
      title: `Follow-up for ${row}`,
      label: "Follow-up date",
      value: toIso(lead?.followUp),
      allowClear: true,
      onSave: async (v) => { await api("leads", { method: "POST", body: { action: "update", leadRef: row, followUp: v } }); await loadLeads(); toast("Follow-up saved"); },
    });
  },
  convert: (_ref, row) => {
    const lead = S.leads.find((l) => l.leadRef === row);
    openDialog({
      title: `Convert ${row} to an order`,
      body: `<p>${esc(lead?.client || "")}</p><label for="rn">Ref No for the new order</label><input id="rn" placeholder="For example Oct26-612" autocomplete="off"><p class="hint">The order is added to the orders sheet and this lead is marked Won.</p>`,
      buttons: [{ label: "Cancel" }, { label: "Create order", kind: "primary", run: async (d) => {
        await api("leads", { method: "POST", body: { action: "convert", leadRef: row, refNo: $("#rn", d).value } });
        await Promise.all([loadLeads(), loadOrders(true)]);
        render();
        toast(`${row} converted`);
      } }],
    });
  },
};

function toIso(dmy) {
  const m = String(dmy || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
}

function openLeadDialog() {
  openDialog({
    title: "Add a potential order",
    body: `<label for="lc">Client name</label><input id="lc" required>
      <label for="lk">Hampers or loose products</label><input id="lk" placeholder="For example 50 festive hampers">
      <label for="lpr">Products</label><input id="lpr">
      <div class="row2"><div style="flex:1;min-width:150px"><label for="le">Expected delivery</label><input id="le" type="date"></div><div style="flex:1;min-width:150px"><label for="lf">Follow-up date</label><input id="lf" type="date"></div></div>`,
    buttons: [{ label: "Cancel" }, { label: "Add lead", kind: "primary", run: async (d) => {
      await api("leads", { method: "POST", body: { action: "add", client: $("#lc", d).value, kind: $("#lk", d).value, products: $("#lpr", d).value, expected: $("#le", d).value, followUp: $("#lf", d).value } });
      await loadLeads();
      toast("Lead added");
    } }],
  });
}

// ---------- send the daily email to ops again ----------

async function openResendDaily() {
  await guard(async () => {
    const p = await api("remind-all?kind=daily");
    const c = p.counts || {};
    const rows = [["Urgent", c.urgent], ["Overdue", c.overdue], ["Due today", c.today], ["Due tomorrow", c.tomorrow], ["Needs a date", c.needsDate]]
      .filter(([, n]) => n)
      .map(([label, n]) => `<li><b>${n}</b> ${label}</li>`)
      .join("");
    const none = !p.counts;
    const buttons = [{ label: "Cancel" }];
    if (!none && p.recipients.length && p.canSendNow) {
      buttons.push({
        label: "Send again now",
        kind: "primary",
        run: async () => {
          const r = await api("remind-all", { method: "POST", body: { kind: "daily" } });
          toast(r.dryRun ? `Prepared for ${r.names.join(", ")} (not sent)` : `Daily email sent again to ${r.names.join(", ")}`);
        },
      });
    }
    openDialog({
      title: "Send the daily email again",
      body: none
        ? "<p>There is nothing open to email about right now.</p>"
        : `<p>This sends today's email to ops once more. It lists:</p><ul class="count-list">${rows}</ul>
          <p><b>To:</b> ${p.recipients.length ? esc(p.recipients.join(", ")) : "nobody yet"}</p>
          ${p.missingEmail.length ? `<p class="hint">No email address saved for ${esc(p.missingEmail.join(", "))}. Add one from Remind ops.</p>` : ""}
          ${p.canSendNow ? "" : '<p class="hint">Sending from the tracker is not set up yet, so nothing can be sent.</p>'}
          <p class="hint">The automatic daily email is not affected.</p>`,
      buttons,
    });
  });
}

// ---------- reminders (BD reminds ops) ----------
// A row's Remind button takes that one order. The order checkboxes exist only in the master flow
// (the top button, for master senders). Recipients are always ops people.

function opsHtml(checked, adding) {
  return S.recipients
    .map((r) => {
      const have = [r.email ? "email" : "", r.whatsapp ? "WhatsApp" : ""].filter(Boolean).join(", ") || "no contact details";
      const missing = [!r.email ? "email" : "", !r.whatsapp ? "number" : ""].filter(Boolean);
      const open = adding.has(r.username);
      const add = open
        ? `<div class="inline-add" data-for="${esc(r.username)}">
            ${!r.email ? `<input type="email" data-field="email" placeholder="Email address" aria-label="Email for ${esc(r.name)}" autocomplete="off">` : ""}
            ${!r.whatsapp ? `<input type="tel" data-field="contact" placeholder="WhatsApp, e.g. 919812345678" aria-label="WhatsApp number for ${esc(r.name)}" autocomplete="off">` : ""}
            <button class="btn small primary" type="button" data-save-contact="${esc(r.username)}">Save</button>
            <button class="btn small ghost" type="button" data-cancel-add="${esc(r.username)}">Cancel</button>
          </div>`
        : missing.length
          ? `<button class="link-btn" type="button" data-add-contact="${esc(r.username)}">Add ${missing.join(" and ")}</button>`
          : "";
      return `<div class="prow"><label class="inline"><input type="checkbox" name="rcpt" value="${esc(r.username)}" ${checked.has(r.username) ? "checked" : ""}><span class="grow">${esc(r.name)}</span><small>${have}</small></label>${add}</div>`;
    })
    .join("");
}

/** preRefs = [ref] for one order (row button); null = the master flow with the order checkboxes. */
async function openRemind(preRefs) {
  await guard(async () => {
    S.recipients = (await api("recipients")).recipients;
    const multi = !preRefs;
    const open = S.orders.filter((o) => OPEN.has(o.status) && o.remindable);
    const one = multi ? null : orderByRef(preRefs[0]);
    if (!multi && !one) throw new Error("That order is not in the list any more. Refresh and try again.");
    const canSendNow = multi ? (await api("remind-all").catch(() => ({ canSendNow: false }))).canSendNow : false;

    const picked = new Set(multi ? open.filter((o) => o.urgent || o.status === "overdue").slice(0, 15).map((o) => o.ref) : [one.ref]);
    const orderList = open
      .map((o) => `<label class="inline"><input type="checkbox" name="ref" value="${esc(o.ref)}" ${picked.has(o.ref) ? "checked" : ""}><span class="grow"><b>${esc(o.ref)}</b> ${esc(o.client)}</span><small>${esc(o.label)}</small></label>`)
      .join("");
    const ordersHtml = multi
      ? `<label>Orders</label>
         <div class="quick"><button type="button" class="link-btn" data-pick="late">Urgent and late</button><button type="button" class="link-btn" data-pick="open">All ${open.length} open</button><button type="button" class="link-btn" data-pick="none">None</button></div>
         <div class="pick" id="pickOrders">${orderList || '<p class="muted" style="padding:8px">No open orders.</p>'}</div>`
      : `<div class="one-order"><b>${esc(one.ref)}</b> ${esc(one.client)}<span class="muted"> · ${esc(one.label)}</span></div>`;

    const checked = new Set(S.recipients.map((r) => r.username));
    const adding = new Set();

    openDialog({
      title: multi ? "Remind ops about several orders" : `Remind ops about ${one.ref}`,
      body: `${ordersHtml}
        <label>Send to</label><div class="pick" id="pickPeople"></div>
        <details class="else"><summary>Send to someone else</summary>
          <p class="hint" style="margin-top:6px">One-off. Used for this reminder only and not saved.</p>
          <label for="xEmail">Email address</label><input id="xEmail" type="text" inputmode="email" placeholder="name@company.com" autocomplete="off">
          <label for="xWa">WhatsApp number</label><input id="xWa" type="tel" placeholder="With country code, for example 919812345678" autocomplete="off">
        </details>
        <div class="row2"><label class="inline"><input type="checkbox" id="chEmail" checked>${icon("mail")}Email</label><label class="inline"><input type="checkbox" id="chWa" checked>${icon("chat")}WhatsApp</label></div>
        <label for="msg">Message</label><textarea id="msg"></textarea>
        <p class="hint">The buttons below open a ready-made Gmail draft or WhatsApp chat. You press Send there, so it comes from you.</p>`,
      buttons: [{ label: "Close" }],
    });

    const d = dlg();
    const foot = $(".dlg-foot", d);
    const live = document.createElement("div");
    live.className = "live-links";
    live.setAttribute("aria-live", "polite");
    foot.prepend(live);
    if (canSendNow) {
      const send = document.createElement("button");
      send.type = "button";
      send.className = "btn";
      send.textContent = "Send full list now";
      send.title = "Emails every open order to ops from the tracker's mailbox";
      send.addEventListener("click", () =>
        guard(async () => {
          send.disabled = true;
          const r = await api("remind-all", { method: "POST", body: {} });
          toast(r.dryRun ? `Prepared for ${r.recipients.join(", ")} (not sent)` : `Emailed ${r.recipients.join(", ")}`);
          send.disabled = false;
        })
      );
      foot.append(send);
    }

    const paintPeople = () => {
      $("#pickPeople", d).innerHTML = opsHtml(checked, adding) || '<p class="muted" style="padding:8px">No ops users found in the users sheet.</p>';
    };
    paintPeople();

    const state = () => ({
      refs: multi ? [...d.querySelectorAll('input[name="ref"]:checked')].map((i) => i.value) : [one.ref],
      recipients: [...d.querySelectorAll('input[name="rcpt"]:checked')].map((i) => i.value),
      channels: [$("#chEmail", d).checked ? "email" : "", $("#chWa", d).checked ? "whatsapp" : ""].filter(Boolean),
      message: $("#msg", d).value,
      extraEmails: $("#xEmail", d).value,
      extraNumbers: $("#xWa", d).value,
    });

    // Links are rebuilt whenever anything changes, so each is a plain link that opens straight away.
    let seq = 0;
    const refreshLinks = async () => {
      const mine = ++seq;
      const s = state();
      const note = (t) => (live.innerHTML = `<span class="muted live-note">${esc(t)}</span>`);
      if (!s.refs.length) return note("Pick at least one order.");
      if (!s.recipients.length && !s.extraEmails.trim() && !s.extraNumbers.trim()) return note("Pick someone to send to.");
      if (!s.channels.length) return note("Pick email, WhatsApp, or both.");
      try {
        const r = await api("remind", { method: "POST", body: s });
        if (mine !== seq) return;
        const links = [];
        if (r.compose) links.push(`<a class="btn primary" target="_blank" rel="noopener" href="${esc(r.compose.url)}">${icon("mail")}Open Gmail draft</a>`);
        for (const w of r.whatsapp) links.push(`<a class="btn ${r.compose ? "" : "primary"}" target="_blank" rel="noopener" href="${esc(w.url)}">${icon("chat")}WhatsApp ${esc(w.name)}</a>`);
        const notes = [];
        if (r.skippedEmail.length) notes.push(`No email saved for ${r.skippedEmail.join(", ")}.`);
        if (r.skippedWhatsapp.length) notes.push(`No WhatsApp number saved for ${r.skippedWhatsapp.join(", ")}.`);
        if (r.compose?.trimmed) notes.push("The list was long, so the Gmail draft is shortened and points to the tracker.");
        live.innerHTML = (links.length ? links.join("") : `<span class="muted live-note">Nobody to reach yet. Add an email or number.</span>`) + (notes.length ? `<span class="muted live-note">${esc(notes.join(" "))}</span>` : "");
      } catch (err) {
        if (mine === seq && !(err instanceof SignedOut)) note(err.message);
      }
    };
    let timer;
    const queue = () => {
      clearTimeout(timer);
      timer = setTimeout(refreshLinks, 300);
    };

    let dirty = false;
    const refreshMessage = async () => {
      if (dirty) return queue();
      const r = await api("recipients", { method: "POST", body: { action: "preview", refs: state().refs } }).catch(() => null);
      if (r && !dirty) $("#msg", d).value = r.message;
      queue();
    };
    $("#msg", d).addEventListener("input", () => (dirty = true));
    d.addEventListener("input", queue);
    d.addEventListener("change", queue);
    refreshMessage();

    if (multi) {
      $("#pickOrders", d).addEventListener("change", refreshMessage);
      d.querySelector(".quick").addEventListener("click", (e) => {
        const how = e.target.closest("[data-pick]")?.dataset.pick;
        if (!how) return;
        for (const box of d.querySelectorAll('input[name="ref"]')) {
          const o = orderByRef(box.value);
          box.checked = how === "open" || (how === "late" && (o.urgent || o.status === "overdue"));
        }
        refreshMessage();
      });
    }

    const people = $("#pickPeople", d);
    people.addEventListener("change", (e) => {
      if (e.target.name !== "rcpt") return;
      e.target.checked ? checked.add(e.target.value) : checked.delete(e.target.value);
    });
    people.addEventListener("click", async (e) => {
      const add = e.target.closest("[data-add-contact]");
      const cancel = e.target.closest("[data-cancel-add]");
      const save = e.target.closest("[data-save-contact]");
      if (add) {
        adding.add(add.dataset.addContact);
        paintPeople();
        $(`[data-for="${CSS.escape(add.dataset.addContact)}"] input`, d)?.focus();
      } else if (cancel) {
        adding.delete(cancel.dataset.cancelAdd);
        paintPeople();
      } else if (save) {
        const user = save.dataset.saveContact;
        const box = $(`[data-for="${CSS.escape(user)}"]`, d);
        const email = $('[data-field="email"]', box)?.value || "";
        const contact = $('[data-field="contact"]', box)?.value || "";
        save.disabled = true;
        try {
          const res = await api("recipients", { method: "POST", body: { action: "save-contact", username: user, email, contact } });
          S.recipients = res.recipients;
          adding.delete(user);
          checked.add(user);
          paintPeople();
          toast("Saved. It will be there next time.");
          queue();
        } catch (err) {
          if (!(err instanceof SignedOut)) toast(err.message, true);
          save.disabled = false;
        }
      }
    });
  });
}

// ---------- events ----------

document.addEventListener("click", (e) => {
  document.querySelectorAll("details.menu[open]").forEach((m) => {
    if (!m.contains(e.target)) m.removeAttribute("open");
  });
  const nav = e.target.closest("[data-view]");
  if (nav) return go(nav.dataset.view);
  const f = e.target.closest("[data-filter]");
  if (f) {
    S.filter = f.dataset.filter;
    return render();
  }
  const btn = e.target.closest("[data-act]");
  if (!btn || !handlers[btn.dataset.act]) return;
  btn.closest("details.menu")?.removeAttribute("open");
  const ref = btn.closest("tr")?.dataset.ref;
  const row = btn.closest("tr")?.dataset.leadRow;
  handlers[btn.dataset.act](ref, row);
});

document.addEventListener("input", (e) => {
  if (e.target.id === "q") {
    S.q = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const q = $("#q");
    q?.focus();
    q?.setSelectionRange(pos, pos);
  }
});

document.addEventListener("change", (e) => {
  if (e.target.id === "owner") {
    S.owner = e.target.value;
    render();
  } else if (e.target.id === "mine") {
    S.mine = e.target.checked;
    render();
  } else if (e.target.matches(".stage-sel")) {
    const leadRef = e.target.dataset.lead;
    guard(async () => {
      await api("leads", { method: "POST", body: { action: "update", leadRef, stage: e.target.value } });
      await loadLeads();
      toast("Stage updated");
    });
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") document.querySelectorAll("details.menu[open]").forEach((m) => m.removeAttribute("open"));
});

$("#themeBtn").addEventListener("click", toggleTheme);
$("#themeBtnM").addEventListener("click", toggleTheme);
for (const id of ["logoutBtn", "logoutBtnM"]) {
  $(`#${id}`).addEventListener("click", async () => {
    await api("session", { method: "DELETE", quiet401: true }).catch(() => {});
    S.orders = [];
    S.leads = [];
    S.recipients = null;
    showLogin();
  });
}

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#loginErr");
  err.hidden = true;
  const btn = $("button[type=submit]", e.target);
  btn.disabled = true;
  try {
    const data = await api("session", { method: "POST", body: { username: $("#lu").value, password: $("#lp").value }, quiet401: true });
    S.me = data.user;
    S.mode = data.mode;
    paintVersion(data.version);
    showShell();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
  }
});

$("#showRegister").addEventListener("click", () => {
  $("#loginForm").hidden = true;
  $("#registerForm").hidden = false;
  $("#registerErr").hidden = true;
  $("#rm").focus();
});
$("#backToLogin").addEventListener("click", () => {
  $("#registerForm").hidden = true;
  $("#loginForm").hidden = false;
  $("#lu").focus();
});
$("#registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#registerErr");
  err.hidden = true;
  const btn = $("button[type=submit]", e.target);
  btn.disabled = true;
  try {
    const f = new FormData(e.target);
    const res = await api("register", { method: "POST", body: Object.fromEntries(f), quiet401: true });
    e.target.reset();
    $("#registerForm").hidden = true;
    $("#loginForm").hidden = false;
    $("#lu").value = res.username;
    $("#lp").focus();
    toast(`Account created. Sign in as ${res.username}.`);
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
  }
});

// Keep the list fresh while the tab is visible and nothing is being edited.
setInterval(() => {
  if (!S.me) return;
  loadOrders(true, true)
    .then(() => (S.view === "pipeline" || dlg().open ? null : render()))
    .catch(() => {});
}, 30_000);

// ---------- boot ----------

(async function boot() {
  paintThemeButtons();
  try {
    const data = await api("session", { quiet401: true });
    S.me = data.user;
    S.mode = data.mode;
    paintVersion(data.version);
    showShell();
  } catch (ex) {
    paintVersion(ex.data?.version);
    showLogin();
    // Local demo mode only: tell the developer which test logins exist.
    if (ex.data?.demoLogins && ["localhost", "127.0.0.1"].includes(location.hostname)) {
      const hint = $("#demoHint");
      hint.hidden = false;
      hint.textContent = `${ex.data.mode === "demo" ? "Demo mode." : "Users sheet not connected yet: local test logins only."} BD: demo-bd / demo-bd-pass. Ops: demo-ops / demo-ops-pass. Admin: demo-admin / demo-admin-pass.`;
    }
  }
})();
