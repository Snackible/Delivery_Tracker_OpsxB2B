import { route } from "../lib/http.js";
import { isMasterSender } from "../lib/auth.js";
import { previewRemindAll, sendRemindAll } from "../lib/reminders.js";
import { httpError } from "../lib/store.js";

// The master button. GET = what it would send and to whom; POST = send it now.
// Only admins and the usernames in MASTER_SENDERS (default Dhyana) may use it. Manual sends never
// count toward, or block, the one automatic daily email.
globalThis.__remindAllLast ??= 0; // survives the dev server re-importing this file

export default route({ methods: ["GET", "POST"], roles: ["b2b", "admin"] }, async ({ req, user, me }) => {
  if (!isMasterSender(user)) throw httpError(403, "This button is only for the people set up to send full reminders.");
  if (req.method === "GET") return previewRemindAll();

  if (Date.now() - globalThis.__remindAllLast < 5000) throw httpError(429, "That was just sent. Give it a few seconds.");
  globalThis.__remindAllLast = Date.now();
  return sendRemindAll({ sender: { name: me.name, email: user.email || "" } });
});
