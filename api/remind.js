import { route } from "../lib/http.js";
import { sendManual } from "../lib/reminders.js";

// Manual reminder links. Nothing is sent by the server: it builds a Gmail draft link and WhatsApp
// links for the chosen recipients, which the person opens and sends themselves. Not logged.
export default route({ methods: ["POST"], roles: ["b2b", "admin"] }, async ({ body, user, me }) =>
  sendManual({
    sender: { name: me.name, email: user.email || "" },
    recipients: body.recipients || [],
    extraEmails: body.extraEmails || "",
    extraNumbers: body.extraNumbers || "",
    refs: body.refs || [],
    channels: body.channels || [],
    message: body.message,
  })
);
