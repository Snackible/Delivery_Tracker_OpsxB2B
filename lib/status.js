// Status is computed from dates, never typed. See PLAN.md section 5.
import { parseDate, parseExpected, dayDiff, formatDMY, formatShort, toISO, todayIST } from "./dates.js";

export const STATUS_RANK = {
  overdue: 1,
  today: 2,
  upcoming: 3,
  needs_date: 4,
  delivered: 5,
  cancelled: 6,
};

const DONE_WORDS = /(deliver|done|complete)/i;
const CANCEL_WORDS = /cancel/i;

/** Asap orders are due on the day they were placed, so they turn overdue the next day. */
export function computeOrder(order, meta = {}, today = todayIST()) {
  const orderDate = parseDate(order.date);
  const expected = parseExpected(order.expected, orderDate);
  const opsDate = parseDate(order.opsDate, orderDate);
  const statusText = String(order.status || "");

  let due = null;
  if (expected.kind === "date") due = expected.date;
  else if (expected.kind === "asap") due = orderDate;

  let status;
  if (CANCEL_WORDS.test(statusText)) status = "cancelled";
  else if (DONE_WORDS.test(statusText) || order.opsDate?.trim()) status = "delivered";
  else if (!due) status = "needs_date";
  else {
    const delta = dayDiff(due, today);
    status = delta < 0 ? "overdue" : delta === 0 ? "today" : "upcoming";
  }

  const daysToDue = due ? dayDiff(due, today) : null;
  const urgent = Boolean(meta.urgent) && status !== "delivered" && status !== "cancelled";

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
    deliveredOn: opsDate ? toISO(opsDate) : "",
    label: statusLabel(status, daysToDue),
  };
}

export function statusLabel(status, daysToDue) {
  switch (status) {
    case "overdue": {
      const n = Math.abs(daysToDue);
      return n === 1 ? "1 day late" : `${n} days late`;
    }
    case "today":
      return "Due today";
    case "upcoming":
      return daysToDue === 1 ? "Due tomorrow" : `${daysToDue} days to go`;
    case "needs_date":
      return "Needs date";
    case "delivered":
      return "Delivered";
    case "cancelled":
      return "Cancelled";
    default:
      return "";
  }
}

/** Urgent first, then lateness, then due date; finished orders sink. */
export function compareOrders(a, b) {
  if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
  const ra = STATUS_RANK[a.status];
  const rb = STATUS_RANK[b.status];
  if (ra !== rb) return ra - rb;
  if (a.status === "overdue") return a.daysToDue - b.daysToDue; // most late first
  if (a.status === "upcoming") return a.daysToDue - b.daysToDue;
  return String(b.date).localeCompare(String(a.date));
}

export function summarize(orders) {
  const open = orders.filter((o) => o.status !== "delivered" && o.status !== "cancelled");
  return {
    open: open.length,
    overdue: orders.filter((o) => o.status === "overdue").length,
    today: orders.filter((o) => o.status === "today").length,
    urgent: orders.filter((o) => o.urgent).length,
    needsDate: orders.filter((o) => o.status === "needs_date").length,
    total: orders.length,
  };
}
