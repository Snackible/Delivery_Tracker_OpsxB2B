import { route } from "../lib/http.js";
import { isMasterSender } from "../lib/auth.js";
import { previewRemindAll, sendRemindAll, previewDaily, runDailyDigest } from "../lib/reminders.js";
import { emailConfigured } from "../lib/mailer.js";
import { httpError } from "../lib/store.js";

// The master button. GET = what it would send, to whom, and a Gmail draft link the person sends
// themselves. POST = the mail script sends the full list now (only when sending is set up).
// Only admins and the usernames in MASTER_SENDERS (default Dhyana) may use it. Manual sends never
// count toward, or block, the one automatic daily email.
globalThis.__remindAllLast ??= 0; // survives the dev server re-importing this file

export default route({ methods: ["GET", "POST"], roles: ["b2b", "admin"] }, async ({ req, body, user, me }) => {
  if (!isMasterSender(user)) throw httpError(403, "This button is only for the people set up to send full reminders.");
  const daily = (req.method === "GET" ? new URL(req.url, "http://x").searchParams.get("kind") : body.kind) === "daily";
  if (req.method === "GET") return daily ? { ...(await previewDaily()), canSendNow: emailConfigured() } : { ...(await previewRemindAll()), canSendNow: emailConfigured() };

  // Send the daily email to ops again, whenever asked.
  if (daily) {
    if (!emailConfigured()) throw httpError(400, "Sending from the tracker is not set up yet.");
    if (Date.now() - globalThis.__remindAllLast < 5000) throw httpError(429, "That was just sent. Give it a few seconds.");
    globalThis.__remindAllLast = Date.now();
    const r = await runDailyDigest();
    if (!r.sent) throw httpError(400, r.reason === "nothing open" ? "There are no open orders to email about." : `Nothing was sent: ${r.reason}.`);
    return r;
  }

  // POST: the mail script sends the full list from the tracker's mailbox.
  if (!emailConfigured()) throw httpError(400, "Sending from the tracker is not set up yet. Use the Gmail draft instead.");

  if (Date.now() - globalThis.__remindAllLast < 5000) throw httpError(429, "That was just sent. Give it a few seconds.");
  globalThis.__remindAllLast = Date.now();
  return sendRemindAll({ sender: { name: me.name, email: user.email || "" } });
});
