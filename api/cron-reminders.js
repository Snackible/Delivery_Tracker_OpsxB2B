import { runDailyDigest } from "../lib/reminders.js";
import { send } from "../lib/http.js";

// Called once a day by the Apps Script trigger (appscript/Code.gs) with
// Authorization: Bearer <CRON_SECRET>. Safe to call more often: it sends at most one email a day.
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return send(res, 401, { error: "Unauthorized" });
  try {
    return send(res, 200, await runDailyDigest());
  } catch (err) {
    console.error("[cron-reminders]", err);
    return send(res, 500, { error: err.message });
  }
}
