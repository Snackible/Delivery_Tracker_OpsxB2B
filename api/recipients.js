import { route } from "../lib/http.js";
import { getUsers } from "../lib/store.js";
import { manualMessage, loadComputed } from "../lib/reminders.js";

// Names, roles and which channels each person has. Never the addresses or numbers themselves.
export default route({ methods: ["GET", "POST"], roles: ["b2b", "admin"] }, async ({ req, body, me }) => {
  if (req.method === "POST") {
    // Preview text for the reminder dialog.
    const all = await loadComputed();
    const orders = (body.refs || []).map((r) => all.find((o) => o.ref === r)).filter(Boolean);
    return { message: manualMessage(orders, me.name) };
  }
  const users = await getUsers();
  return {
    recipients: users
      .filter((u) => u.username !== me.username)
      .map((u) => ({
        username: u.username,
        name: u.display_name || u.username,
        role: String(u.role).toLowerCase(),
        email: Boolean(u.email),
        whatsapp: Boolean(String(u.contact || "").replace(/\D/g, "")),
      })),
  };
});
