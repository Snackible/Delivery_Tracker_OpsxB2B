// Reminders: the manual "Remind ops" flow and the one automatic daily email to ops.
import { randomBytes } from "node:crypto";
import { getOrders, getMeta, getUsers, getState, setState, mode } from "./store.js";
import { computeOrder, compareOrders } from "./status.js";
import { todayIST, hourIST, toISO } from "./dates.js";
import { sendEmail, emailConfigured } from "./mailer.js";

const env = (k, d = "") => (process.env[k] || d).trim();
const appUrl = () => env("APP_URL");

export async function loadComputed() {
  const [orders, meta] = await Promise.all([getOrders(), getMeta()]);
  const today = todayIST();
  return orders.map((o) => computeOrder(o, meta[o.ref], today)).sort(compareOrders);
}

const OPEN = new Set(["overdue", "today", "upcoming", "needs_date"]);

function line(o) {
  const owner = o.poc ? ` · ${o.poc}` : "";
  const due = o.dueLabel ? ` · due ${o.dueLabel}` : "";
  return `${o.urgent ? "[URGENT] " : ""}${o.ref} · ${o.client}${owner}${due} · ${o.label}`;
}

/** Default text for a manual reminder about the given orders. */
export function manualMessage(orders, senderName) {
  const lines = orders.map((o) => `- ${line(o)}`).join("\n");
  const head = orders.length === 1 ? "Reminder about this order:" : `Reminder about ${orders.length} orders:`;
  return `${head}\n\n${lines}\n\nPlease update the status or let me know the new date.\n\n${senderName}`;
}

function htmlList(orders) {
  const colour = (o) => (o.urgent ? "#C62828" : o.status === "overdue" ? "#C2410C" : "#17202B");
  return `<table cellpadding="6" style="border-collapse:collapse;font:14px system-ui,sans-serif">${orders
    .map(
      (o) =>
        `<tr style="border-bottom:1px solid #D8DEE6"><td style="color:${colour(o)};font-weight:700">${o.urgent ? "URGENT · " : ""}${esc(o.ref)}</td><td>${esc(o.client)}</td><td>${esc(o.poc)}</td><td style="color:${colour(o)}">${esc(o.label)}</td></tr>`
    )
    .join("")}</table>`;
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/**
 * Manual reminder. Email goes out now, as the logged-in user, to each chosen recipient.
 * WhatsApp returns wa.me links for the browser to open; a person taps Send in WhatsApp.
 */
export async function sendManual({ sender, recipients, refs, channels, message }) {
  const all = await loadComputed();
  const orders = refs.map((r) => all.find((o) => o.ref === r)).filter(Boolean);
  if (!orders.length) throw Object.assign(new Error("Pick at least one order."), { status: 400 });
  if (!recipients.length) throw Object.assign(new Error("Pick at least one recipient."), { status: 400 });
  if (!channels.length) throw Object.assign(new Error("Pick email, WhatsApp, or both."), { status: 400 });

  const users = await getUsers();
  const chosen = recipients.map((u) => users.find((x) => x.username === u)).filter(Boolean);
  const text = message?.trim() || manualMessage(orders, sender.name);
  const result = { emailed: [], skippedEmail: [], whatsapp: [], skippedWhatsapp: [], dryRun: false };

  if (channels.includes("email")) {
    const to = chosen.filter((u) => u.email);
    result.skippedEmail = chosen.filter((u) => !u.email).map((u) => u.display_name || u.username);
    if (to.length) {
      const subject = orders.length === 1 ? `Delivery reminder: ${orders[0].ref} ${orders[0].client}` : `Delivery reminder: ${orders.length} orders`;
      const html = `<div style="font:14px system-ui,sans-serif;color:#17202B"><p style="white-space:pre-line">${esc(text.split("\n\n")[0])}</p>${htmlList(orders)}<p>${esc(sender.name)}${appUrl() ? ` · <a href="${esc(appUrl())}">Open Delivery Tracker</a>` : ""}</p></div>`;
      const r = await sendEmail({ sender, to: to.map((u) => u.email), subject, text, html });
      result.dryRun = Boolean(r.dryRun);
      result.emailed = to.map((u) => u.display_name || u.username);
    }
  }

  if (channels.includes("whatsapp")) {
    for (const u of chosen) {
      const digits = String(u.contact || "").replace(/\D/g, "");
      if (!digits) result.skippedWhatsapp.push(u.display_name || u.username);
      else result.whatsapp.push({ name: u.display_name || u.username, url: `https://wa.me/${digits}?text=${encodeURIComponent(text)}` });
    }
  }
  return result;
}

// ---------- the one automatic daily email to ops ----------

function digestSections(orders) {
  const open = orders.filter((o) => OPEN.has(o.status));
  return {
    urgent: open.filter((o) => o.urgent),
    overdue: open.filter((o) => !o.urgent && o.status === "overdue"),
    today: open.filter((o) => !o.urgent && o.status === "today"),
    tomorrow: open.filter((o) => !o.urgent && o.status === "upcoming" && o.daysToDue === 1),
    needsDate: open.filter((o) => !o.urgent && o.status === "needs_date"),
  };
}

export function buildDigest(orders) {
  const s = digestSections(orders);
  const total = s.urgent.length + s.overdue.length + s.today.length + s.tomorrow.length + s.needsDate.length;
  if (!total) return null;
  const parts = [];
  const add = (title, list, cap = 40) => {
    if (!list.length) return;
    const shown = list.slice(0, cap);
    const more = list.length > cap ? `\n+ ${list.length - cap} more` : "";
    parts.push({ title: `${title} (${list.length})`, list: shown, text: `${title.toUpperCase()} (${list.length})\n${shown.map((o) => `- ${line(o)}`).join("\n")}${more}`, more: list.length - shown.length });
  };
  add("Urgent", s.urgent);
  add("Overdue", s.overdue);
  add("Due today", s.today);
  add("Due tomorrow", s.tomorrow);
  add("Needs a date", s.needsDate, 15);
  const subject = `Delivery tracker: ${s.urgent.length + s.overdue.length} late, ${s.today.length} due today`;
  const text = `${parts.map((p) => p.text).join("\n\n")}${appUrl() ? `\n\nOpen the tracker: ${appUrl()}` : ""}`;
  const html = `<div style="font:14px system-ui,sans-serif;color:#17202B">${parts
    .map((p) => `<h3 style="margin:18px 0 6px;font-size:15px">${esc(p.title)}</h3>${htmlList(p.list)}${p.more ? `<p>+ ${p.more} more</p>` : ""}`)
    .join("")}${appUrl() ? `<p><a href="${esc(appUrl())}">Open Delivery Tracker</a></p>` : ""}</div>`;
  return { subject, text, html, counts: Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.length])) };
}

/** Sends at most one automatic email per day, after DIGEST_HOUR_IST (default 9am). */
export async function runDailyDigest({ force = false } = {}) {
  const today = toISO(todayIST());
  if (!force && hourIST() < Number(env("DIGEST_HOUR_IST", "9"))) return { sent: false, reason: "before send time" };
  // Against the real sheets, do not burn today's one email on a dry run.
  if (mode() === "sheets" && !emailConfigured()) return { sent: false, reason: "email provider not configured" };

  const last = (await getState("lastDailyEmail")).split("|")[0];
  if (!force && last === today) return { sent: false, reason: "already sent today" };

  // Claim the day: write our id, read it back, and only send if it is still ours. Not atomic
  // like a database, so in a rare race ops could get two emails.
  const claim = `${today}|${randomBytes(6).toString("hex")}`;
  await setState("lastDailyEmail", claim);
  if ((await getState("lastDailyEmail")) !== claim) return { sent: false, reason: "another run claimed today" };

  const digest = buildDigest(await loadComputed());
  const ops = (await getUsers()).filter((u) => String(u.role).toLowerCase() === "ops" && u.email);
  if (!digest) return { sent: false, reason: "nothing open" };
  if (!ops.length) return { sent: false, reason: "no ops user has an email" };

  const r = await sendEmail({ sender: null, to: ops.map((u) => u.email), subject: digest.subject, text: digest.text, html: digest.html });
  return { sent: true, dryRun: Boolean(r.dryRun), recipients: ops.length, counts: digest.counts };
}
