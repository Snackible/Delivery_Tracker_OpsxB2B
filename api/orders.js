import { route } from "../lib/http.js";
import { loadComputed, runDailyDigest } from "../lib/reminders.js";
import { summarize } from "../lib/status.js";
import { mode } from "../lib/store.js";

// Every orders load also runs the daily check, so the digest still goes out on the first
// visit of the day if the Apps Script timer missed it. The check itself is idempotent.
export default route({ methods: ["GET"] }, async () => {
  const orders = await loadComputed();
  let digest = null;
  try {
    digest = await runDailyDigest();
  } catch (err) {
    console.error("[daily digest]", err.message);
  }
  return {
    orders,
    summary: summarize(orders),
    mode: mode(),
    digest: digest?.sent ? { sent: true, dryRun: digest.dryRun } : null,
  };
});
