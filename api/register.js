import { send, clientIp } from "../lib/http.js";
import { masterMatches, isRateLimited, recordFail } from "../lib/auth.js";
import { addUser, httpError } from "../lib/store.js";
import { cleanEmail, cleanPhone } from "../lib/contacts.js";

// Register a new user. Allowed only with the master password (MASTER_PASSWORD). With no master
// password set, registration is off. New users can be BD or Ops; admins are added in the sheet.
const ROLES = ["b2b", "ops"];

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      // The sign-in screen asks this to decide whether to show the register link.
      return send(res, 200, { enabled: Boolean(process.env.MASTER_PASSWORD) });
    }
    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return send(res, 405, { error: "Method not allowed" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const key = `register|${clientIp(req)}`;
    if (isRateLimited(key)) return send(res, 429, { error: "Too many attempts. Try again in a few minutes." });

    const ok = masterMatches(String(body.master ?? ""));
    if (ok === null) return send(res, 403, { error: "Registration is not switched on. Ask an admin to set a master password." });
    if (!ok) {
      recordFail(key);
      return send(res, 401, { error: "That master password is not right." });
    }

    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    const role = String(body.role ?? "").toLowerCase();
    const display = String(body.display_name ?? "").trim();
    if (!/^[A-Za-z0-9._ -]{3,40}$/.test(username)) throw httpError(400, "Username must be 3 to 40 letters, numbers, spaces, dots, dashes or underscores.");
    if (password.length < 6 || password.length > 100) throw httpError(400, "Password must be at least 6 characters.");
    if (!ROLES.includes(role)) throw httpError(400, "Pick BD or Ops.");
    if (!display || display.length > 60) throw httpError(400, "Enter the name that appears on orders, up to 60 characters.");

    const email = String(body.email ?? "").trim() ? cleanEmail(body.email) : "";
    if (email === null) throw httpError(400, "That email address does not look right.");
    const contact = String(body.contact ?? "").trim() ? cleanPhone(body.contact) : "";
    if (contact === null) throw httpError(400, "Enter the WhatsApp number with country code, for example 919812345678.");

    await addUser({ username, password, role, display_name: display, email, contact });
    return send(res, 200, { ok: true, username });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[register]", err);
    return send(res, status, { error: status >= 500 ? `Something went wrong: ${err.message}` : err.message });
  }
}
