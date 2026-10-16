import { route } from "../lib/http.js";
import { sendManual } from "../lib/reminders.js";

// Manual reminder, sent as the logged-in user. Not logged, and it never blocks the daily email.
// Besides chosen users it accepts one-off emails and WhatsApp numbers that are not saved anywhere.
const lastSend = new Map(); // short per-user cooldown against double clicks (per instance)

export default route({ methods: ["POST"], roles: ["b2b", "admin"] }, async ({ body, user, me }) => {
  const key = me.username;
  if (Date.now() - (lastSend.get(key) || 0) < 3000) {
    throw Object.assign(new Error("That was just sent. Give it a few seconds."), { status: 429 });
  }
  lastSend.set(key, Date.now());
  return sendManual({
    sender: { name: me.name, email: user.email || "" },
    recipients: body.recipients || [],
    extraEmails: body.extraEmails || "",
    extraNumbers: body.extraNumbers || "",
    refs: body.refs || [],
    channels: body.channels || [],
    message: body.message,
  });
});
