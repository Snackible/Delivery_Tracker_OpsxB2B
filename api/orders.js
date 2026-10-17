import { route } from "../lib/http.js";
import { loadComputed } from "../lib/reminders.js";
import { summarize } from "../lib/status.js";
import { mode, masterInfo } from "../lib/store.js";

export default route({ methods: ["GET"] }, async () => {
  const orders = await loadComputed();
  return { orders, summary: summarize(orders), mode: mode(), master: masterInfo() };
});
