import { send, clientIp } from "../lib/http.js";
import { resetAdminMatches, isRateLimited, recordFail } from "../lib/auth.js";
import { getUsersFresh, resetEnabled, resettableAccounts, resetUserPassword, httpError } from "../lib/store.js";

// Reset a password. Authorised by the password of an admin marked with a * in their own Reset cell in the users
// sheet; that password can set a new password for any account that can sign in. Same rules as the CRM and the
// Ops x B2B dashboard, which share the sheet.
//   GET                                  -> { enabled }  (a yes/no for the sign-in screen, never a name)
//   POST { action: "list", admin }       -> { accounts } (only for a marked admin's password)
//   POST { admin, username, password }   -> sets the new password
export default async function handler(req, res) {
  try {
    if (req.method === "GET") return send(res, 200, { enabled: await resetEnabled() });
    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return send(res, 405, { error: "Method not allowed" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const key = `reset-password|${clientIp(req)}`;
    if (isRateLimited(key)) return send(res, 429, { error: "Too many attempts. Try again in a few minutes." });

    const ok = await resetAdminMatches(String(body.admin ?? ""));
    if (ok === null) return send(res, 403, { error: "Password reset is not switched on. Put a * in an admin's Reset cell in the users sheet." });
    if (!ok) {
      recordFail(key);
      return send(res, 401, { error: "That isn't the password of an admin marked for resets." });
    }

    if (body.action === "list") return send(res, 200, { accounts: resettableAccounts(await getUsersFresh()) });

    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    if (!username) throw httpError(400, "Pick which account to reset.");
    if (password.length < 6 || password.length > 100) throw httpError(400, "Password must be at least 6 characters.");

    await resetUserPassword(username, password);
    return send(res, 200, { ok: true, username });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[reset-password]", err);
    return send(res, status, { error: status >= 500 ? `Something went wrong: ${err.message}` : err.message });
  }
}
