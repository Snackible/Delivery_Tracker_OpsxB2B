import { route } from "../lib/http.js";
import { getLeads, addLead, updateLead, convertLead, httpError } from "../lib/store.js";
import { parseDate, formatDMY } from "../lib/dates.js";

const STAGES = ["New", "Quoted", "Negotiating", "Won", "Lost"];
const clean = (v, n = 200) => String(v ?? "").trim().slice(0, n);
const dateOrBlank = (v) => {
  if (!String(v || "").trim()) return "";
  const d = parseDate(v);
  if (!d) throw httpError(400, "Enter a valid date.");
  return formatDMY(d);
};

// GET list; POST { action: add | update | convert }. BD and admin only.
export default route({ methods: ["GET", "POST"], roles: ["b2b", "admin"] }, async ({ req, body, me }) => {
  if (req.method === "GET") return { leads: await getLeads(), stages: STAGES };

  switch (body.action) {
    case "add": {
      if (!clean(body.client)) throw httpError(400, "Enter the client name.");
      const lead = await addLead({
        poc: clean(body.poc) || me.poc,
        client: clean(body.client),
        kind: clean(body.kind),
        products: clean(body.products, 500),
        expected: dateOrBlank(body.expected),
        followUp: dateOrBlank(body.followUp),
      });
      return { lead };
    }
    case "update": {
      const patch = {};
      if ("stage" in body) {
        if (!STAGES.includes(body.stage)) throw httpError(400, "Unknown stage.");
        patch.stage = body.stage;
      }
      if ("followUp" in body) patch.followUp = dateOrBlank(body.followUp);
      await updateLead(body.leadRef, patch);
      return { ok: true };
    }
    case "convert": {
      const ref = clean(body.refNo, 40);
      if (!ref) throw httpError(400, "Enter the new Ref No for this order.");
      await convertLead(body.leadRef, ref);
      return { ok: true };
    }
    default:
      throw httpError(400, "Unknown action.");
  }
});
