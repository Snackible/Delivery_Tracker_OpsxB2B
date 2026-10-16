import { route } from "../lib/http.js";
import { updateOrder, setMeta, getOrders, httpError } from "../lib/store.js";
import { parseDate, formatDMY, todayIST } from "../lib/dates.js";

// One route for every order edit. Role rules (PLAN.md section 7):
//   b2b: expectedDate, urgent, cancel, reopen     ops: delivered, note     admin: everything
const BD = ["b2b", "admin"];
const OPS = ["ops", "admin"];

export default route({ methods: ["POST"] }, async ({ body, me }) => {
  const { ref, action } = body;
  if (!ref || !action) throw httpError(400, "Missing order or action.");
  const orders = await getOrders();
  if (!orders.some((o) => o.ref.toLowerCase() === String(ref).toLowerCase())) throw httpError(404, `Order ${ref} not found.`);

  const need = (roles) => {
    if (!roles.includes(me.role)) throw httpError(403, "Your role cannot do this.");
  };

  switch (action) {
    case "set-expected": {
      need(BD);
      const date = parseDate(body.date);
      if (!date) throw httpError(400, "Enter a valid date.");
      await updateOrder(ref, { expected: formatDMY(date) });
      return { ok: true };
    }
    case "urgent": {
      need(BD);
      await setMeta(ref, { urgent: Boolean(body.urgent) }, me.name);
      return { ok: true };
    }
    case "delivered": {
      need(OPS.concat(BD));
      const date = body.date ? parseDate(body.date) : todayIST();
      if (!date) throw httpError(400, "Enter a valid delivery date.");
      await updateOrder(ref, { opsDate: formatDMY(date), status: "Delivered" });
      return { ok: true };
    }
    case "cancel": {
      need(BD);
      await updateOrder(ref, { status: "Cancelled" });
      return { ok: true };
    }
    case "reopen": {
      need(BD.concat(OPS));
      await updateOrder(ref, { status: "", opsDate: "" });
      return { ok: true };
    }
    case "note": {
      need(OPS);
      await setMeta(ref, { opsNote: String(body.note || "").slice(0, 500) }, me.name);
      return { ok: true };
    }
    default:
      throw httpError(400, "Unknown action.");
  }
});
