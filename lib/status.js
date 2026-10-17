// Status is computed from dates, never typed. See PLAN.md section 5.
import { parseDate, parseExpected, dayDiff, formatDMY, formatShort, toISO, todayIST } from "./dates.js";

export const STATUS_RANK = {
  overdue: 1,
  today: 2,
  in_transit: 3,
  upcoming: 3,
  hold: 4,
  needs_date: 4,
  delivered: 5,
  cancelled: 6,
  rto: 6,
  expired: 6,
  internal_po: 6,
};

const DONE_WORDS = /(deliver|done|complete)/i;
const CANCEL_WORDS = /cancel/i;
// "Out for delivery" contains "deliver", so these are checked before the delivered words.
const TRANSIT_WORDS = /(transit|dispatch|shipped|out for delivery|on the way)/i;

// Orders still being worked on. On hold, returned, expired and internal POs are parked or finished, so no reminders.
export const OPEN_STATES = new Set(["overdue", "today", "upcoming", "needs_date", "in_transit"]);

/** Asap orders are due on the day they were placed, so they turn overdue the next day. */
export function computeOrder(order, meta = {}, today = todayIST(), master = null) {
  const orderDate = parseDate(order.date);
  const expected = parseExpected(order.expected, orderDate);
  const opsDate = parseDate(order.opsDate, orderDate);
  const statusText = String(order.status || "");

  let due = null;
  if (expected.kind === "date") due = expected.date;
  else if (expected.kind === "asap") due = orderDate;

  let status;
  // The master sheet (read only) outranks the BD sheet's own status text for these three states.
  const m = master || {};
  if (CANCEL_WORDS.test(statusText) || m.status === "cancelled") status = "cancelled";
  else if (order.opsDate?.trim() || m.status === "delivered") status = "delivered";
  else if (["rto", "expired", "internal_po", "hold"].includes(m.status)) status = m.status;
  else if (TRANSIT_WORDS.test(statusText) || m.status === "in_transit") status = "in_transit";
  else if (DONE_WORDS.test(statusText)) status = "delivered";
  else if (!due) status = "needs_date";
  else {
    const delta = dayDiff(due, today);
    status = delta < 0 ? "overdue" : delta === 0 ? "today" : "upcoming";
  }

  const daysToDue = due ? dayDiff(due, today) : null;
  // Actual delivery date: ops' date on the BD sheet, else the master's Act Del.
  const deliveredDate = opsDate || parseDate(m.deliveredOn, orderDate);
  const urgent = Boolean(meta.urgent) && OPEN_STATES.has(status);

  return {
    ...order,
    status,
    urgent,
    opsNote: meta.opsNote || "",
    due: due ? toISO(due) : "",
    dueLabel: due ? formatShort(due) : "",
    dueDMY: due ? formatDMY(due) : "",
    dueFromAsap: expected.kind === "asap",
    daysToDue,
    // Past its due date and not delivered: an in-transit order can still be late.
    late: daysToDue != null && daysToDue < 0 && (status === "overdue" || status === "in_transit"),
    deliveredOn: deliveredDate ? toISO(deliveredDate) : "",
    // Every date we have for the order, in the order things happen. Expected is shown separately as the due date.
    dates: [
      ["Ordered", orderDate],
      ["Est. dispatch", parseDate(m.estDispatch, orderDate)],
      ["Dispatched", parseDate(m.dispatchedOn, orderDate)],
      ["Delivered", deliveredDate],
    ]
      .filter(([, d]) => d)
      .map(([label, d]) => ({ label, value: formatShort(d) })),
    fromMaster: ["delivered", "cancelled", "in_transit", "hold", "rto", "expired", "internal_po"].includes(status) && m.status === status,
    shipment: status === "in_transit" ? [m.courier, m.awb].filter(Boolean).join(" · ") : "",
    label: status === "rto" ? m.rtoLabel || "RTO" : statusLabel(status, daysToDue, deliveredDate ? formatShort(deliveredDate) : ""),
  };
}

export function statusLabel(status, daysToDue, deliveredShort = "") {
  switch (status) {
    case "overdue": {
      const n = Math.abs(daysToDue);
      return n === 1 ? "1 day late" : `${n} days late`;
    }
    case "today":
      return "Due today";
    case "in_transit": {
      if (daysToDue != null && daysToDue < 0) {
        const n = Math.abs(daysToDue);
        return n === 1 ? "In transit · 1 day late" : `In transit · ${n} days late`;
      }
      return "In transit";
    }
    case "upcoming":
      return daysToDue === 1 ? "Due tomorrow" : `${daysToDue} days to go`;
    case "needs_date":
      return "Needs date";
    case "delivered":
      return deliveredShort ? `Delivered · ${deliveredShort}` : "Delivered";
    case "cancelled":
      return "Cancelled";
    case "hold":
      return "On hold";
    case "expired":
      return "Expired";
    case "internal_po":
      return "Internal PO";
    case "rto":
      return "RTO";
    default:
      return "";
  }
}

/** Urgent first, then lateness, then due date; finished orders sink. */
export function compareOrders(a, b) {
  if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
  // A late in-transit order sorts with the overdue ones, not with the other in-transit ones.
  const ra = a.late ? 1 : STATUS_RANK[a.status];
  const rb = b.late ? 1 : STATUS_RANK[b.status];
  if (ra !== rb) return ra - rb;
  if (a.late !== b.late) return a.late ? -1 : 1; // anything late, in transit or not, comes first
  if (a.late) return a.daysToDue - b.daysToDue; // most late first
  if (a.status === "upcoming" || a.status === "in_transit") return (a.daysToDue ?? 999) - (b.daysToDue ?? 999);
  return String(b.date).localeCompare(String(a.date));
}

export function summarize(orders) {
  const open = orders.filter((o) => OPEN_STATES.has(o.status));
  return {
    open: open.length,
    overdue: orders.filter((o) => o.status === "overdue").length,
    today: orders.filter((o) => o.status === "today").length,
    urgent: orders.filter((o) => o.urgent).length,
    needsDate: orders.filter((o) => o.status === "needs_date").length,
    inTransit: orders.filter((o) => o.status === "in_transit").length,
    hold: orders.filter((o) => o.status === "hold").length,
    returned: orders.filter((o) => o.status === "rto").length,
    total: orders.length,
  };
}
