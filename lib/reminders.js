// Reminders: the manual "Remind ops" flow and the one automatic daily email to ops.
import { randomBytes } from "node:crypto";
import { getOrders, getMeta, getUsers, getState, setState, mode } from "./store.js";
import { computeOrder, compareOrders } from "./status.js";
import { todayIST, hourIST, toISO } from "./dates.js";
import { sendEmail, emailConfigured } from "./mailer.js";
import { parseEmailList, parsePhoneList } from "./contacts.js";
import { gmailComposeUrl } from "./compose.js";

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
  return `${mark(o)} ${o.urgent ? "URGENT · " : ""}${o.ref} · ${o.client}${owner}${due} · ${o.label}`;
}

/** One symbol per state so a message reads at a glance in WhatsApp and Gmail alike. */
const MARK = { overdue: "⚠️", today: "🕒", upcoming: "📅", needs_date: "❔" };
const mark = (o) => (o.urgent ? "🚨" : MARK[o.status] || "▪️");

/** Default text for a manual reminder about the given orders. Plain text, no markup. */
export function manualMessage(orders, senderName) {
  const detailed = orders.length <= 4;
  const blocks = detailed
    ? orders
        .map((o) =>
          [
            `${mark(o)} ${o.urgent ? "URGENT · " : ""}${o.ref}`,
            o.client,
            `Owner: ${o.poc || "not set"}`,
            `Due: ${o.dueLabel || "no date yet"} · ${o.label}`,
          ].join("\n")
        )
        .join("\n\n")
    : orders.map((o) => `${mark(o)} ${o.urgent ? "URGENT " : ""}${o.ref} · ${o.client} · ${o.label}`).join("\n");
  const head = orders.length === 1 ? "🔔 Delivery reminder" : `🔔 Delivery reminder (${orders.length} orders)`;
  return `${head}\n\n${blocks}\n\nPlease update the status or let me know the new date.\n\n— ${senderName}`;
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
 * Manual reminder. Nothing is sent by the server. Email returns a Gmail compose link and WhatsApp
 * returns wa.me links; the person opens each draft and presses Send themselves, so it comes from
 * their own account. One-off addresses and numbers are used once and not stored.
 */
export async function sendManual({ sender, recipients, extraEmails = "", extraNumbers = "", refs, channels, message }) {
  const fail = (msg) => Object.assign(new Error(msg), { status: 400 });
  const all = await loadComputed();
  const orders = refs.map((r) => all.find((o) => o.ref === r)).filter(Boolean);
  if (!orders.length) throw fail("Pick at least one order.");
  if (!channels.length) throw fail("Pick email, WhatsApp, or both.");

  const extraMail = parseEmailList(extraEmails);
  const extraWa = parsePhoneList(extraNumbers);
  if (extraMail.bad.length) throw fail(`This email address does not look right: ${extraMail.bad[0]}`);
  if (extraWa.bad.length) throw fail(`This WhatsApp number does not look right: ${extraWa.bad[0]}. Include the country code.`);
  if (!recipients.length && !extraMail.ok.length && !extraWa.ok.length) throw fail("Pick at least one recipient, or type an email or WhatsApp number.");

  const users = await getUsers();
  const chosen = recipients.map((u) => users.find((x) => x.username === u)).filter((u) => u && String(u.role).toLowerCase() === "ops");
  const text = message?.trim() || manualMessage(orders, sender.name);
  const result = { compose: null, skippedEmail: [], whatsapp: [], skippedWhatsapp: [] };

  if (channels.includes("email")) {
    const people = chosen.filter((u) => u.email);
    result.skippedEmail = chosen.filter((u) => !u.email).map((u) => u.display_name || u.username);
    const to = [...new Set([...people.map((u) => u.email), ...extraMail.ok])];
    if (to.length) {
      const subject = orders.length === 1 ? `Delivery reminder: ${orders[0].ref} ${orders[0].client}` : `Delivery reminder: ${orders.length} orders`;
      const { url, trimmed } = gmailComposeUrl({ to, subject, body: text, authuser: sender.email });
      result.compose = { url, trimmed, names: [...people.map((u) => u.display_name || u.username), ...extraMail.ok] };
    }
  }

  if (channels.includes("whatsapp")) {
    const link = (digits) => `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
    for (const u of chosen) {
      const digits = String(u.contact || "").replace(/D/g, "");
      if (!digits) result.skippedWhatsapp.push(u.display_name || u.username);
      else result.whatsapp.push({ name: u.display_name || u.username, url: link(digits) });
    }
    for (const digits of extraWa.ok) result.whatsapp.push({ name: `+${digits}`, url: link(digits) });
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
    later: open.filter((o) => !o.urgent && o.status === "upcoming" && o.daysToDue > 1),
    needsDate: open.filter((o) => !o.urgent && o.status === "needs_date"),
  };
}

export function buildDigest(orders, { full = false, sentBy = "" } = {}) {
  const s = digestSections(orders);
  const total = s.urgent.length + s.overdue.length + s.today.length + s.tomorrow.length + s.needsDate.length + (full ? s.later.length : 0);
  if (!total) return null;
  const parts = [];
  const add = (title, list, cap = full ? 500 : 40) => {
    if (!list.length) return;
    const shown = list.slice(0, cap);
    const more = list.length > cap ? `\n+ ${list.length - cap} more` : "";
    parts.push({ title: `${title} (${list.length})`, list: shown, text: `${title.toUpperCase()} (${list.length})\n${shown.map((o) => `- ${line(o)}`).join("\n")}${more}`, more: list.length - shown.length });
  };
  add("Urgent", s.urgent);
  add("Overdue", s.overdue);
  add("Due today", s.today);
  add("Due tomorrow", s.tomorrow);
  if (full) add("Due later", s.later);
  add("Needs a date", s.needsDate, full ? 500 : 15);
  const late = s.urgent.length + s.overdue.length;
  const subject = full ? `Delivery tracker: all ${total} open orders, ${late} late` : `Delivery tracker: ${late} late, ${s.today.length} due today`;
  const intro = full ? `Full reminder from ${sentBy || "the BD team"}: every open order, urgent and late first.` : "";
  const text = `${intro ? `${intro}\n\n` : ""}${parts.map((p) => p.text).join("\n\n")}${appUrl() ? `\n\nOpen the tracker: ${appUrl()}` : ""}`;
  const html = `<div style="font:14px system-ui,sans-serif;color:#17202B">${full ? `<p><b>${esc(intro.trim())}</b></p>` : ""}${parts
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

/** Who a "remind ops about everything" email would go to, and what it would list. Names only. */
export async function previewRemindAll() {
  const orders = await loadComputed();
  const digest = buildDigest(orders, { full: true });
  const ops = (await getUsers()).filter((u) => String(u.role).toLowerCase() === "ops");
  return {
    counts: digest?.counts || null,
    open: orders.filter((o) => OPEN.has(o.status)).length,
    recipients: ops.filter((u) => u.email).map((u) => u.display_name || u.username),
    missingEmail: ops.filter((u) => !u.email).map((u) => u.display_name || u.username),
  };
}

/** The master button: email every ops user a full list of open orders, now, as the signed-in sender. */
export async function sendRemindAll({ sender }) {
  const orders = await loadComputed();
  const digest = buildDigest(orders, { full: true, sentBy: sender.name });
  if (!digest) throw Object.assign(new Error("There are no open orders to remind about."), { status: 400 });
  const ops = (await getUsers()).filter((u) => String(u.role).toLowerCase() === "ops" && u.email);
  if (!ops.length) throw Object.assign(new Error("No ops user has an email address yet. Add one from Remind ops first."), { status: 400 });
  const r = await sendEmail({ sender, to: ops.map((u) => u.email), subject: digest.subject, text: digest.text, html: digest.html });
  return { sent: true, dryRun: Boolean(r.dryRun), recipients: ops.map((u) => u.display_name || u.username), counts: digest.counts };
}


/** Short version of the full list for a Gmail draft (a link only holds so much); the rest is counted. */
function condensedText(orders, sentBy) {
  const s = digestSections(orders);
  const parts = [];
  const section = (title, list, max) => {
    if (!list.length) return;
    const shown = list.slice(0, max).map((o) => `- ${line(o)}`).join("\n");
    const more = list.length > max ? `\n+ ${list.length - max} more` : "";
    parts.push(`${title.toUpperCase()} (${list.length})\n${shown}${more}`);
  };
  section("Urgent", s.urgent, 10);
  section("Overdue", s.overdue, 15);
  section("Due today", s.today, 10);
  section("Due tomorrow", s.tomorrow, 8);
  const rest = [
    s.later.length ? `${s.later.length} due later` : "",
    s.needsDate.length ? `${s.needsDate.length} still need a delivery date` : "",
  ].filter(Boolean);
  if (rest.length) parts.push(`ALSO OPEN: ${rest.join(", ")}`);
  const link = appUrl() ? `\n\nFull list: ${appUrl()}` : "";
  return `Reminder about all open orders:\n\n${parts.join("\n\n")}${link}\n\n${sentBy}`;
}

/** The master button as a Gmail draft to every ops user with an email; the person presses Send. */
export async function draftRemindAll({ sender }) {
  const orders = await loadComputed();
  const ops = (await getUsers()).filter((u) => String(u.role).toLowerCase() === "ops" && u.email);
  if (!ops.length) throw Object.assign(new Error("No ops user has an email address yet. Add one from Remind ops first."), { status: 400 });
  const open = orders.filter((o) => OPEN.has(o.status)).length;
  if (!open) throw Object.assign(new Error("There are no open orders to remind about."), { status: 400 });
  const { url, trimmed } = gmailComposeUrl({
    to: ops.map((u) => u.email),
    subject: `Delivery tracker: all ${open} open orders`,
    body: condensedText(orders, sender.name),
    authuser: sender.email,
  });
  return { url, trimmed, recipients: ops.map((u) => u.display_name || u.username) };
}

/**
 * Email ops the moment an order is flagged urgent. Never blocks the flag itself: any problem comes
 * back as a reason the dashboard can show.
 */
export async function notifyUrgent({ ref, sender }) {
  try {
    const orders = await loadComputed();
    const o = orders.find((x) => x.ref === ref);
    if (!o) return { sent: false, reason: "order not found" };
    const ops = (await getUsers()).filter((u) => String(u.role).toLowerCase() === "ops" && u.email);
    if (!ops.length) return { sent: false, reason: "No ops user has an email saved yet." };

    const lineText = line(o);
    const text = `${sender.name} marked this order urgent:\n\n${lineText}\n\nPlease prioritise it.${appUrl() ? `\n\nOpen the tracker: ${appUrl()}` : ""}`;
    const html = `<div style="font:14px system-ui,sans-serif;color:#17202B"><p><b style="color:#C62828">URGENT</b>: ${esc(sender.name)} marked this order urgent.</p>${htmlList([o])}<p>Please prioritise it.</p>${appUrl() ? `<p><a href="${esc(appUrl())}">Open Delivery Tracker</a></p>` : ""}</div>`;
    const r = await sendEmail({ sender, to: ops.map((u) => u.email), subject: `URGENT: ${o.ref} ${o.client}`, text, html });
    return r.dryRun
      ? { sent: false, reason: "Email sending is not set up yet, so nothing went out.", recipients: ops.length }
      : { sent: true, recipients: ops.length };
  } catch (err) {
    console.error("[notifyUrgent]", err.message);
    return { sent: false, reason: err.message };
  }
}
