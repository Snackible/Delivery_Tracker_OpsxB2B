// Shared wrapper for API routes: method check, session check, role check, JSON errors.
import { sessionUser, publicUser } from "./auth.js";

/**
 * route({ methods: ["GET"], roles: ["ops","b2b","admin"] | null }, async (ctx) => result)
 * ctx = { req, res, body, user (full row), me (public user) }. The return value is sent as JSON.
 */
export function route({ methods = ["GET"], roles = ["ops", "b2b", "admin"] }, fn) {
  return async function handler(req, res) {
    try {
      if (!methods.includes(req.method)) {
        res.setHeader("Allow", methods.join(", "));
        return send(res, 405, { error: "Method not allowed" });
      }
      let user = null;
      if (roles) {
        user = await sessionUser(req);
        if (!user) return send(res, 401, { error: "Please sign in." });
        const role = String(user.role).toLowerCase();
        if (!roles.includes(role) && role !== "admin") {
          return send(res, 403, { error: "Your role cannot do this." });
        }
      }
      const body = typeof req.body === "string" ? safeJson(req.body) : req.body || {};
      const result = await fn({ req, res, body, user, me: user ? publicUser(user) : null });
      if (result !== undefined && !res.writableEnded) send(res, 200, result);
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error("[api]", err);
      send(res, status, { error: status >= 500 ? `Something went wrong: ${err.message}` : err.message });
    }
  };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export function send(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

export function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
}
