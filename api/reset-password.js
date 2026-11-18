import { send, clientIp } from "../lib/http.js";
import { masterMatches, registrationEnabled, isRateLimited, recordFail } from "../lib/auth.js";
import { getResetRequests, resetUserPassword, httpError } from "../lib/store.js";

// Reset a forgotten password. Allowed only with the master password (the password of the user whose role is
// master-admin in the users sheet), and only for an account someone has already marked with a * in its Reset
// column - so knowing the master password alone is not enough to reach into any account.
export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      // The sign-in screen asks this to decide whether to show "Reset a password", and who it's for.
      const [enabled, requests] = await Promise.all([registrationEnabled(), getResetRequests()]);
      return send(res, 200, { enabled, requests });
    }
    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return send(res, 405, { error: "Method not allowed" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const key = `reset-password|${clientIp(req)}`;
    if (isRateLimited(key)) return send(res, 429, { error: "Too many attempts. Try again in a few minutes." });

    const ok = await masterMatches(String(body.master ?? ""));
    if (ok === null) return send(res, 403, { error: "Password reset is not switched on. The users sheet needs a user with the role master-admin." });
    if (!ok) {
      recordFail(key);
      return send(res, 401, { error: "That is not the master admin password." });
    }

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
