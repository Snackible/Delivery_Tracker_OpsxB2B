import { runDailyDigest } from "../lib/reminders.js";
import { send } from "../lib/http.js";

// Called once a day (around 9am) by the Apps Script timer with Authorization: Bearer <CRON_SECRET>.
// Every call sends the daily email to ops; there is no once-a-day marker.
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
