// Delivery Tracker front end. Plain modules, no build step.

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const icon = (n, cls = "i") => `<svg class="${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;

const OPEN = new Set(["overdue", "today", "upcoming", "needs_date"]);
const STATUS_ICON = { overdue: "alert", today: "clock", upcoming: "calendar", needs_date: "dash", delivered: "check", cancelled: "x" };

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

function toast(message, bad = false) {
  const el = document.createElement("div");
  el.className = `toast${bad ? " err" : ""}`;
  el.textContent = message;
  $("#toasts").append(el);
  setTimeout(() => el.remove(), bad ? 6000 : 3500);
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

// ---------- login / shell ----------

function showLogin() {
  S.me = null;
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

async function loadOrders(silent = false) {
  const data = await api("orders");
  S.orders = data.orders;
  S.mode = data.mode;
  S.loaded = true;
  if (data.digest?.sent && !silent) toast(data.digest.dryRun ? "Daily email to ops prepared (demo: not sent)" : "Daily email sent to ops");
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
  const cls = `mk s-${o.status}${urgent}`;
  let mark = "";
  const d = o.daysToDue;
  if (o.status === "needs_date") {
    mark = `<line class="${cls}" x1="${RW - 10}" x2="${RW - 10}" y1="6" y2="24"/>`;
  } else if (d != null && (o.status === "delivered" || o.status === "cancelled")) {
    const x = rx(d);
    mark = o.status === "cancelled"
      ? `<path class="${cls}" d="M${x - 4} 11l8 8M${x + 4} 11l-8 8"/>`
      : `<circle class="${cls}" cx="${x}" cy="15" r="4"/>`;
  } else if (d != null) {
    const x = rx(d);
    const clipped = Math.abs(d) > 14;
    if (o.status === "overdue") mark = `<line class="${cls}" x1="${x}" x2="${x}" y1="6" y2="24"/><line class="${cls}" x1="${x + 4}" x2="${x + 4}" y1="6" y2="24"/>`;
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
  return `<span class="chip s-${o.status}">${icon(STATUS_ICON[o.status])}${esc(o.label)}</span>`;
}

function actionsFor(o) {
  const done = o.status === "delivered" || o.status === "cancelled";
  const bd = isBD();
  const ops = isOps();
  let h = '<div class="group">';
  if (done) {
    if (bd || ops) h += `<button class="btn small" type="button" data-act="reopen">${icon("undo")}Reopen</button>`;
    return h + "</div>";
  }
  if (bd) {
    // Every row has the same three controls in the same places so the column scans straight down.
    // A row that needs a date gets its calendar button highlighted instead of a different label.
    const needsDate = o.status === "needs_date";
    const dateLabel = needsDate ? "Set expected date" : "Change expected date";
    h += `<button class="btn small${needsDate ? " attn" : ""}" type="button" data-act="date" title="${dateLabel}" aria-label="${dateLabel} for ${esc(o.ref)}">${icon("calendar")}<span class="lbl opt">${needsDate ? "Set date" : "Date"}</span></button>`;
    h += `<button class="icon-btn" type="button" data-act="urgent" aria-pressed="${o.urgent}" aria-label="${o.urgent ? "Remove urgent flag" : "Mark urgent"}" title="${o.urgent ? "Remove urgent flag" : "Mark urgent"}">${icon("flag")}</button>`;
    h += `<button class="btn small" type="button" data-act="remind" title="Remind ops" aria-label="Remind ops about ${esc(o.ref)}">${icon("bell")}<span class="lbl">Remind</span></button>`;
    h += `<details class="menu"><summary class="icon-btn" aria-label="More actions" title="More actions">${icon("more")}</summary><div class="menu-list">
      <button type="button" data-act="delivered">${icon("check")}Mark delivered</button>
      ${ops ? `<button type="button" data-act="note">${icon("note")}Ops note</button>` : ""}
      <button type="button" class="danger" data-act="cancel">${icon("x")}Cancel order</button></div></details>`;
  } else if (ops) {
    h += `<button class="btn small primary" type="button" data-act="delivered">${icon("check")}Mark delivered</button>`;
    h += `<button class="icon-btn" type="button" data-act="note" aria-label="Add a note" title="Add a note">${icon("note")}</button>`;
  }
  return h + "</div>";
}

function rowHtml(o, i) {
  const done = o.status === "delivered" || o.status === "cancelled";
  const cls = [o.urgent ? "is-urgent" : "", done ? "is-done" : ""].filter(Boolean).join(" ");
  const sub = esc([o.poc, productLine(o)].filter(Boolean).join(" · "));
  return `<tr class="${cls}" data-ref="${esc(o.ref)}">
    <td class="c-ref"><span class="ref">${esc(o.ref)}</span>${o.urgent ? `<span class="tag-urgent">${icon("flag")}Urgent</span>` : ""}</td>
    <td class="c-client client"><b title="${esc(o.client)}">${esc(o.client)}</b>${sub ? `<small title="${sub}">${sub}</small>` : ""}${o.opsNote ? `<small>Ops note: ${esc(o.opsNote)}</small>` : ""}</td>
    <td class="c-due due">${o.dueLabel ? esc(o.dueLabel) : "—"}${o.dueFromAsap ? "<small>Asap</small>" : ""}</td>
    <td class="c-rail rail-cell">${railSvg(o, i)}</td>
    <td class="c-status">${chip(o)}</td>
    <td class="actions">${actionsFor(o)}</td>
  </tr>`;
}

function ordersTable(list, emptyTitle, emptyText) {
  if (!list.length) return `<div class="table-wrap"><div class="empty"><strong>${esc(emptyTitle)}</strong>${esc(emptyText)}</div></div>`;
  return `<div class="table-wrap"><table>
    <thead><tr><th scope="col">Order</th><th scope="col">Client and owner</th><th scope="col">Due</th><th scope="col" class="rail-cell rail-head">${railHead()}</th><th scope="col">Status</th><th scope="col"><span class="sr">Actions</span></th></tr></thead>
    <tbody>${list.map(rowHtml).join("")}</tbody></table></div>`;
}

// ---------- views ----------

const FILTERS = [
  { id: "open", label: "Open", test: (o) => OPEN.has(o.status), cls: "" },
  { id: "overdue", label: "Overdue", test: (o) => o.status === "overdue", cls: "s-overdue" },
  { id: "today", label: "Due today", test: (o) => o.status === "today", cls: "s-today" },
  { id: "urgent", label: "Urgent", test: (o) => o.urgent, cls: "s-urgent" },
  { id: "needs_date", label: "Needs date", test: (o) => o.status === "needs_date", cls: "s-needs_date" },
  { id: "upcoming", label: "Upcoming", test: (o) => o.status === "upcoming", cls: "s-upcoming" },
  { id: "delivered", label: "Delivered", test: (o) => o.status === "delivered", cls: "" },
  { id: "all", label: "All", test: () => true, cls: "" },
];

function queueOrders() {
  return S.orders.filter((o) => OPEN.has(o.status) && o.status !== "needs_date" && (o.urgent || o.status === "overdue" || o.status === "today" || (o.status === "upcoming" && o.daysToDue <= 3)));
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
  $("#view").innerHTML = `${head("Orders", `${list.length} shown of ${S.orders.length}`)}${demoBanner()}<div class="filters" role="group" aria-label="Filter by status">${chips}</div>${toolbar}${ordersTable(list, "Nothing here", "No orders match these filters.")}`;
  S.animate = false;
}

function renderQueue() {
  const list = queueOrders();
  $("#view").innerHTML = `${head("Ops queue", "Urgent, overdue, due today and due in the next 3 days")}${demoBanner()}${ordersTable(list, "All clear", "Nothing is late or due in the next 3 days.")}`;
  S.animate = false;
}

function head(title, sub) {
  return `<div class="page-head"><h1>${esc(title)}</h1><span class="sub">${esc(sub)}</span>
    <button class="btn ghost" type="button" data-act="refresh" aria-label="Refresh">${icon("refresh")}Refresh</button>
    ${isBD() ? `<button class="btn primary" type="button" data-act="remind-top">${icon("bell")}Remind ops</button>` : ""}</div>`;
}

function demoBanner() {
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
    const el = document.createElement("button");
    el.type = "button";
    el.className = `btn ${b.kind || ""}`;
    el.textContent = b.label;
    el.addEventListener("click", async () => {
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
  await api("order-update", { method: "POST", body: { ref, action, ...extra } });
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
      await orderAction(ref, "urgent", { urgent: next });
      await afterEdit(next ? `${ref} marked urgent` : "Urgent flag removed");
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

// ---------- reminder dialog ----------

const roleLabel = (r) => (r === "ops" ? "Ops" : r === "admin" ? "Admin" : "BD");

function peopleHtml(checked, adding) {
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
      return `<div class="prow"><label class="inline"><input type="checkbox" name="rcpt" value="${esc(r.username)}" ${checked.has(r.username) ? "checked" : ""}><span class="grow">${esc(r.name)} <small>${roleLabel(r.role)}</small></span><small>${have}</small></label>${add}</div>`;
    })
    .join("");
}

async function openRemind(preRefs) {
  await guard(async () => {
    S.recipients = (await api("recipients")).recipients;
    const open = S.orders.filter((o) => OPEN.has(o.status));
    const picked = new Set(preRefs || open.filter((o) => o.urgent || o.status === "overdue").slice(0, 15).map((o) => o.ref));
    const orderList = open
      .map((o) => `<label class="inline"><input type="checkbox" name="ref" value="${esc(o.ref)}" ${picked.has(o.ref) ? "checked" : ""}><span class="grow"><b>${esc(o.ref)}</b> ${esc(o.client)}</span><small>${esc(o.label)}</small></label>`)
      .join("");
    const checked = new Set(S.recipients.filter((r) => r.role === "ops").map((r) => r.username));
    const adding = new Set();

    openDialog({
      title: "Remind ops",
      body: `<label>Orders</label><div class="pick" id="pickOrders">${orderList || '<p class="muted" style="padding:8px">No open orders.</p>'}</div>
        <label>Send to</label><div class="pick" id="pickPeople"></div>
        <details class="else"><summary>Send to someone else</summary>
          <p class="hint" style="margin-top:6px">One-off. These are used for this reminder only and are not saved.</p>
          <label for="xEmail">Email address</label><input id="xEmail" type="text" inputmode="email" placeholder="name@company.com, another@company.com" autocomplete="off">
          <label for="xWa">WhatsApp number</label><input id="xWa" type="tel" placeholder="With country code, for example 919812345678" autocomplete="off">
        </details>
        <div class="row2"><label class="inline"><input type="checkbox" id="chEmail" checked>${icon("mail")}Email</label><label class="inline"><input type="checkbox" id="chWa">${icon("chat")}WhatsApp</label></div>
        <label for="msg">Message</label><textarea id="msg"></textarea>
        <p class="hint">Email is sent from your address. WhatsApp opens a chat for you to press Send.</p>`,
      buttons: [{ label: "Cancel" }, { label: "Send reminder", kind: "primary", run: (d) => sendReminder(d) }],
    });

    const d = dlg();
    const paint = () => {
      $("#pickPeople", d).innerHTML = peopleHtml(checked, adding) || '<p class="muted" style="padding:8px">No other users found.</p>';
    };
    paint();

    let dirty = false;
    const refsNow = () => [...d.querySelectorAll('input[name="ref"]:checked')].map((i) => i.value);
    const preview = async () => {
      if (dirty) return;
      const r = await api("recipients", { method: "POST", body: { action: "preview", refs: refsNow() } }).catch(() => null);
      if (r && !dirty) $("#msg", d).value = r.message;
    };
    $("#msg", d).addEventListener("input", () => (dirty = true));
    $("#pickOrders", d).addEventListener("change", preview);
    preview();

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
        paint();
        $(`[data-for="${CSS.escape(add.dataset.addContact)}"] input`, d)?.focus();
      } else if (cancel) {
        adding.delete(cancel.dataset.cancelAdd);
        paint();
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
          paint();
          toast("Saved. It will be there next time.");
        } catch (err) {
          if (!(err instanceof SignedOut)) toast(err.message, true);
          save.disabled = false;
        }
      }
    });
  });
}

async function sendReminder(d) {
  const refs = [...d.querySelectorAll('input[name="ref"]:checked')].map((i) => i.value);
  const recipients = [...d.querySelectorAll('input[name="rcpt"]:checked')].map((i) => i.value);
  const channels = [$("#chEmail", d).checked ? "email" : "", $("#chWa", d).checked ? "whatsapp" : ""].filter(Boolean);
  const r = await api("remind", {
    method: "POST",
    body: { refs, recipients, channels, message: $("#msg", d).value, extraEmails: $("#xEmail", d).value, extraNumbers: $("#xWa", d).value },
  });
  const lines = [];
  if (r.emailed.length) lines.push(`<p>${icon("mail")} Emailed ${esc(r.emailed.join(", "))}.${r.dryRun ? " <span class='muted'>Demo mode: nothing was actually sent.</span>" : ""}</p>`);
  if (r.skippedEmail.length) lines.push(`<p class="muted">No email address for ${esc(r.skippedEmail.join(", "))}.</p>`);
  if (r.skippedWhatsapp.length) lines.push(`<p class="muted">No WhatsApp number for ${esc(r.skippedWhatsapp.join(", "))}.</p>`);
  const links = r.whatsapp.map((w) => `<a class="btn" target="_blank" rel="noopener" href="${esc(w.url)}">${icon("chat")}Open WhatsApp for ${esc(w.name)}</a>`).join("");
  if (!r.whatsapp.length) {
    toast(r.emailed.length ? "Reminder sent" : "Nothing was sent");
    return true;
  }
  openDialog({ title: "Reminder ready", body: `${lines.join("")}<p style="margin-top:10px">Open each chat and press Send.</p><div class="links">${links}</div>`, buttons: [{ label: "Done", kind: "primary" }] });
  return false;
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
    showShell();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
  }
});

// Keep the list fresh while the tab is visible and nothing is being edited.
setInterval(() => {
  if (!S.me || document.hidden || dlg().open) return;
  loadOrders(true).then(() => (S.view === "pipeline" ? null : render())).catch(() => {});
}, 60_000);

// ---------- boot ----------

(async function boot() {
  paintThemeButtons();
  try {
    const data = await api("session", { quiet401: true });
    S.me = data.user;
    S.mode = data.mode;
    showShell();
  } catch (ex) {
    showLogin();
    // Local demo mode only: tell the developer which test logins exist.
    if (ex.data?.demoLogins && ["localhost", "127.0.0.1"].includes(location.hostname)) {
      const hint = $("#demoHint");
      hint.hidden = false;
      hint.textContent = `${ex.data.mode === "demo" ? "Demo mode." : "Users sheet not connected yet: local test logins only."} BD: demo-bd / demo-bd-pass. Ops: demo-ops / demo-ops-pass. Admin: demo-admin / demo-admin-pass.`;
    }
  }
})();
