import { send, clientIp } from "../lib/http.js";
import { login, publicUser, sessionUser } from "../lib/auth.js";
import { createSessionCookie, clearSessionCookie } from "../lib/session.js";
import { mode, usingDemoLogins } from "../lib/store.js";

// GET = who am I, POST = sign in, DELETE = sign out.
export default async function handler(req, res) {
  try {
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const { username = "", password = "" } = body;
      if (!String(username).trim() || !password) return send(res, 400, { error: "Enter your username and password." });
      const result = await login(String(username), String(password), clientIp(req));
      if (!result.ok) return send(res, result.status, { error: result.error });
      res.setHeader("Set-Cookie", createSessionCookie(result.user.username));
      return send(res, 200, { user: publicUser(result.user), mode: mode() });
    }
    if (req.method === "DELETE") {
      res.setHeader("Set-Cookie", clearSessionCookie());
      return send(res, 200, { ok: true });
    }
    if (req.method === "GET") {
      const user = await sessionUser(req);
      if (!user) return send(res, 401, { error: "Please sign in.", mode: mode(), demoLogins: usingDemoLogins() });
      return send(res, 200, { user: publicUser(user), mode: mode() });
    }
    res.setHeader("Allow", "GET, POST, DELETE");
    return send(res, 405, { error: "Method not allowed" });
  } catch (err) {
    console.error("[session]", err);
    return send(res, 500, { error: `Something went wrong: ${err.message}` });
  }
}
