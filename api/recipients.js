import { route } from "../lib/http.js";
import { getUsers, updateUserContact, httpError } from "../lib/store.js";
import { manualMessage, loadComputed } from "../lib/reminders.js";
import { cleanEmail, cleanPhone } from "../lib/contacts.js";

async function list(me) {
  const users = await getUsers();
  // Names, roles and which channels each person has. Never the addresses or numbers themselves.
  return users
    .filter((u) => u.username !== me.username)
    .map((u) => ({
      username: u.username,
      name: u.display_name || u.username,
      role: String(u.role).toLowerCase(),
      email: Boolean(u.email),
      whatsapp: Boolean(String(u.contact || "").replace(/\D/g, "")),
    }));
}

// GET: who can be reminded. POST: { action: "preview", refs } for the message text, or
// { action: "save-contact", username, email?, contact? } to remember a missing address or number.
export default route({ methods: ["GET", "POST"], roles: ["b2b", "admin"] }, async ({ req, body, me }) => {
  if (req.method === "GET") return { recipients: await list(me) };

  if (body.action === "save-contact") {
    const patch = {};
    if (String(body.email ?? "").trim()) {
      const email = cleanEmail(body.email);
      if (!email) throw httpError(400, "That email address does not look right.");
      patch.email = email;
    }
    if (String(body.contact ?? "").trim()) {
      const phone = cleanPhone(body.contact);
      if (!phone) throw httpError(400, "Enter the WhatsApp number with country code, for example 919812345678.");
      patch.contact = phone;
    }
    if (!Object.keys(patch).length) throw httpError(400, "Enter an email or a WhatsApp number to save.");
    const user = (await getUsers()).find((u) => u.username === body.username);
    if (!user) throw httpError(404, "User not found.");
    // Fill gaps only: changing an existing address or number is done in the users sheet.
    if (patch.email && user.email) throw httpError(409, "This person already has an email. Change it in the users sheet.");
    if (patch.contact && String(user.contact || "").trim()) throw httpError(409, "This person already has a WhatsApp number. Change it in the users sheet.");
    await updateUserContact(body.username, patch);
    return { recipients: await list(me) };
  }

  const all = await loadComputed();
  const orders = (body.refs || []).map((r) => all.find((o) => o.ref === r)).filter(Boolean);
  return { message: manualMessage(orders, me.name) };
});
