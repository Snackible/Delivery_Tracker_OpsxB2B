import test from "node:test";
import assert from "node:assert/strict";
import { parseDate, parseExpected, formatDMY, dayDiff } from "../lib/dates.js";
import { computeOrder, compareOrders, summarize, OPEN_STATES } from "../lib/status.js";
import { buildDigest } from "../lib/reminders.js";
import { demoOrders } from "../data/demo-orders.js";
import { masterStatusOf, masterDetail, toSheetSerial } from "../lib/store.js";

const TODAY = { y: 2026, m: 10, d: 16 };

test("parses the date shapes found in the sheet", () => {
  assert.deepEqual(parseDate("20/10/26"), { y: 2026, m: 10, d: 20 });
  assert.deepEqual(parseDate("4/10/26"), { y: 2026, m: 10, d: 4 });
  assert.deepEqual(parseDate("08/09/2026"), { y: 2026, m: 9, d: 8 });
  assert.deepEqual(parseDate("17th October", { y: 2026, m: 10, d: 14 }), { y: 2026, m: 10, d: 17 });
  assert.deepEqual(parseDate("Oct 17"), parseDate("17 Oct"));
  assert.equal(parseDate("31/02/2026"), null);
  assert.equal(parseDate("No clue as Aditi's investor order"), null);
  assert.equal(parseDate(""), null);
});

test("year rolls forward for a month already well in the past", () => {
  assert.deepEqual(parseDate("5 January", { y: 2026, m: 12, d: 20 }), { y: 2027, m: 1, d: 5 });
});

test("expected cell kinds", () => {
  assert.equal(parseExpected("Asap").kind, "asap");
  assert.equal(parseExpected("").kind, "none");
  assert.equal(parseExpected("No clue").kind, "none");
  assert.equal(parseExpected("20/10/26").kind, "date");
});

const order = (o) => ({ date: "14/10/2026", expected: "", opsDate: "", status: "", ref: "X", ...o });

test("status rules", () => {
  const s = (o, meta) => computeOrder(order(o), meta, TODAY).status;
  assert.equal(s({ expected: "10/10/2026" }), "overdue");
  assert.equal(s({ expected: "16/10/2026" }), "today");
  assert.equal(s({ expected: "20/10/2026" }), "upcoming");
  assert.equal(s({}), "needs_date");
  assert.equal(s({ expected: "10/10/2026", status: "Delivered" }), "delivered");
  assert.equal(s({ expected: "10/10/2026", opsDate: "15/10/2026" }), "delivered");
  assert.equal(s({ expected: "10/10/2026", status: "Cancelled" }), "cancelled");
});

test("Asap is due on the order date, so it is late the next day", () => {
  const o = computeOrder(order({ date: "15/10/2026", expected: "Asap" }), {}, TODAY);
  assert.equal(o.status, "overdue");
  assert.equal(o.daysToDue, -1);
  assert.equal(o.label, "1 day late");
  const same = computeOrder(order({ date: "16/10/2026", expected: "Asap" }), {}, TODAY);
  assert.equal(same.status, "today");
});

test("urgent only counts on open orders and sorts first", () => {
  const meta = { A: { urgent: true } };
  const urgentOpen = computeOrder(order({ ref: "A", expected: "20/10/2026" }), meta.A, TODAY);
  const late = computeOrder(order({ ref: "B", expected: "01/10/2026" }), {}, TODAY);
  const done = computeOrder(order({ ref: "A", status: "Delivered" }), meta.A, TODAY);
  assert.equal(urgentOpen.urgent, true);
  assert.equal(done.urgent, false);
  assert.deepEqual([late, urgentOpen].sort(compareOrders).map((o) => o.ref), ["A", "B"]);
});

test("demo sheet summarises without throwing", () => {
  const all = demoOrders.map((o) => computeOrder(o, {}, TODAY));
  const sum = summarize(all);
  assert.equal(sum.total, demoOrders.length);
  assert.ok(sum.needsDate > 40);
  assert.equal(formatDMY({ y: 2026, m: 3, d: 5 }), "05/03/2026");
  assert.equal(dayDiff({ y: 2026, m: 10, d: 20 }, TODAY), 4);
});

test("in transit: its own status, still late when past due, delivered wins over it", () => {
  const s = (o) => computeOrder(order(o), {}, TODAY);
  assert.equal(s({ status: "In transit", expected: "20/10/2026" }).status, "in_transit");
  assert.equal(s({ status: "In transit", expected: "20/10/2026" }).late, false);
  assert.equal(s({ status: "Dispatched" }).status, "in_transit");
  assert.equal(s({ status: "Out for delivery" }).status, "in_transit"); // not mistaken for "delivered"
  const late = s({ status: "In transit", expected: "12/10/2026" });
  assert.equal(late.late, true);
  assert.equal(late.label, "In transit · 4 days late");
  assert.equal(s({ status: "In transit", expected: "12/10/2026", opsDate: "16/10/2026" }).status, "delivered");
  assert.equal(s({ status: "Cancelled" }).status, "cancelled");
});

test("a late in-transit order sorts with the overdue ones", () => {
  const overdue = computeOrder(order({ ref: "O", expected: "10/10/2026" }), {}, TODAY);
  const lateTransit = computeOrder(order({ ref: "T", status: "In transit", expected: "12/10/2026" }), {}, TODAY);
  const upcoming = computeOrder(order({ ref: "U", expected: "25/10/2026" }), {}, TODAY);
  const onTimeTransit = computeOrder(order({ ref: "X", status: "In transit", expected: "20/10/2026" }), {}, TODAY);
  assert.deepEqual([upcoming, onTimeTransit, lateTransit, overdue].sort(compareOrders).map((o) => o.ref), ["O", "T", "X", "U"]);
});

test("every master STATUS maps to a tracker status", () => {
  const is = (raw, status) => assert.equal(masterStatusOf(raw), status, raw);
  is("Delivered", "delivered");
  is("DElivered", "delivered");
  is("Deliveed", "delivered");
  is("In-transit ", "in_transit");
  is("In-Transit", "in_transit");
  is("Cancelled", "cancelled");
  is("Cancelled PC", "cancelled");
  is("Hold", "hold");
  is("RTO", "rto");
  is("RTO - Delivered", "rto");
  is("RTO-Delivered", "rto");
  is("RTO - Intransit", "rto");
  is("RTO T", "rto");
  is("Expired", "expired");
  is("Internal PO", "internal_po");
  // Pending, duplicates, blanks and junk leave the BD sheet's own logic in charge
  for (const other of ["Pending", "pending", "Duplicate", "", "Tuesday"]) is(other, null);
  assert.equal(masterDetail("RTO").rtoLabel, "RTO");
  assert.equal(masterDetail("RTO - Delivered").rtoLabel, "RTO delivered");
  assert.equal(masterDetail("RTO - Intransit").rtoLabel, "RTO in transit");
  assert.equal(masterDetail("RTO T").rtoLabel, "RTO in transit");
});

test("hold, returned, expired and internal PO are shown as their own statuses and are not reminded", () => {
  const base = { expected: "10/10/2026" }; // would be overdue on the BD sheet alone
  const hold = computeOrder(order(base), {}, TODAY, { status: "hold" });
  assert.equal(hold.status, "hold");
  assert.equal(hold.label, "On hold");
  assert.equal(hold.late, false);
  assert.equal(hold.fromMaster, true);
  const rto = computeOrder(order(base), {}, TODAY, { status: "rto", rtoLabel: "RTO delivered" });
  assert.equal(rto.status, "rto");
  assert.equal(rto.label, "RTO delivered");
  assert.equal(computeOrder(order(base), {}, TODAY, { status: "expired" }).label, "Expired");
  assert.equal(computeOrder(order(base), {}, TODAY, { status: "internal_po" }).label, "Internal PO");
  // finished or parked orders are never "open" or urgent
  const meta = { urgent: true };
  for (const status of ["hold", "rto", "expired", "internal_po"]) {
    const o = computeOrder(order(base), meta, TODAY, { status });
    assert.equal(OPEN_STATES.has(o.status), false, status);
    assert.equal(o.urgent, false, status);
  }
  // delivered still beats a returned/hold master status only when ops marked it delivered themselves
  assert.equal(computeOrder(order({ ...base, opsDate: "15/10/2026" }), {}, TODAY, { status: "rto" }).status, "delivered");
});

test("the master outranks the BD sheet for delivered, in transit and cancelled", () => {
  const base = { expected: "10/10/2026" }; // would be overdue on the BD sheet alone
  const alone = computeOrder(order(base), {}, TODAY);
  assert.equal(alone.status, "overdue");

  const delivered = computeOrder(order(base), {}, TODAY, { status: "delivered", deliveredOn: "06-10-2026" });
  assert.equal(delivered.status, "delivered");
  assert.equal(delivered.label, "Delivered · 6 Oct");
  assert.equal(delivered.fromMaster, true);

  const transit = computeOrder(order(base), {}, TODAY, { status: "in_transit", courier: "Pickrr", awb: "P2008337" });
  assert.equal(transit.status, "in_transit");
  assert.equal(transit.late, true);
  assert.equal(transit.shipment, "Pickrr · P2008337");

  assert.equal(computeOrder(order(base), {}, TODAY, { status: "cancelled" }).status, "cancelled");
  // Pending (null) and no match leave the BD sheet's own logic alone
  assert.equal(computeOrder(order(base), {}, TODAY, { status: null }).status, "overdue");
  assert.equal(computeOrder(order(base), {}, TODAY, undefined).status, "overdue");
  // An order the BD sheet already calls delivered stays delivered whatever the master says
  assert.equal(computeOrder(order({ ...base, opsDate: "15/10/2026" }), {}, TODAY, { status: "in_transit" }).status, "delivered");
});

test("every date the sheets hold is listed, in the order things happen", () => {
  const o = computeOrder(order({ date: "02/10/2026", expected: "08/10/2026" }), {}, TODAY, {
    status: "delivered",
    estDispatch: "04-10-2026",
    dispatchedOn: "05-10-2026",
    deliveredOn: "07-10-2026",
  });
  assert.equal(o.estDispatchLabel, "4 Oct");
  assert.equal(o.estDispatchISO, "2026-10-04");
  assert.equal(o.inMaster, true);
  assert.deepEqual(o.dates, [
    { label: "Ordered", value: "2 Oct" },
    { label: "Dispatched", value: "5 Oct" },
    { label: "Delivered", value: "7 Oct" },
  ]);
  // only the dates that exist are listed
  const bare = computeOrder(order({ date: "02/10/2026" }), {}, TODAY);
  assert.deepEqual(bare.dates, [{ label: "Ordered", value: "2 Oct" }]);
  // the BD sheet's own ops delivery date wins over the master's
  const both = computeOrder(order({ date: "02/10/2026", opsDate: "06/10/2026" }), {}, TODAY, { deliveredOn: "07-10-2026" });
  assert.equal(both.dates.at(-1).value, "6 Oct");
});

test("no delivery date: an extra line when the estimated dispatch is close or passed, and only then can it be reminded", () => {
  const noDeadline = order({ date: "02/10/2026", expected: "" });
  const passed = computeOrder(noDeadline, {}, TODAY, { estDispatch: "04-10-2026" });
  assert.equal(passed.dispatchNote, "Est. dispatch 4 Oct has passed (12 days ago) and no delivery date is written");
  assert.equal(passed.remindable, true);
  assert.equal(passed.estDelta, -12);

  const soon = computeOrder(noDeadline, {}, TODAY, { estDispatch: "18-10-2026" });
  assert.equal(soon.dispatchNote, "Est. dispatch 18 Oct is in 2 days and no delivery date is written");
  assert.equal(soon.remindable, true);
  assert.equal(computeOrder(noDeadline, {}, TODAY, { estDispatch: "16-10-2026" }).dispatchNote, "Est. dispatch is today and no delivery date is written");

  // not close, not known, or not in the master: left alone
  for (const master of [{ estDispatch: "19-10-2026" }, { estDispatch: "30-10-2026" }, { estDispatch: "" }, undefined]) {
    const o = computeOrder(noDeadline, {}, TODAY, master);
    assert.equal(o.remindable, false, JSON.stringify(master));
    assert.equal(o.dispatchNote, "");
  }
  // BD flagging it urgent is a deliberate ask, so it can be reminded
  assert.equal(computeOrder(noDeadline, { urgent: true }, TODAY).remindable, true);
  // a written delivery date makes it a normal order
  const dated = computeOrder(order({ date: "02/10/2026", expected: "30/10/2026" }), {}, TODAY, { estDispatch: "04-10-2026" });
  assert.equal(dated.remindable, true);
  assert.equal(dated.dispatchNote, "");
  // finished or parked orders are never remindable
  assert.equal(computeOrder(noDeadline, {}, TODAY, { status: "delivered", estDispatch: "04-10-2026" }).remindable, false);
  assert.equal(computeOrder(noDeadline, {}, TODAY, { status: "in_transit", estDispatch: "04-10-2026" }).dispatchNote, "");
});

test("the daily email leaves out no-date orders with no close estimate, and lists the rest most overdue first", () => {
  const mk = (ref, est) => computeOrder(order({ ref, date: "02/10/2026" }), {}, TODAY, est ? { estDispatch: est } : undefined);
  const b = mk("REF-B", "04-10-2026"); // 12 days past
  const a = mk("REF-A", "10-10-2026"); // 6 days past
  const soon = mk("REF-SOON", "17-10-2026"); // tomorrow
  const far = mk("REF-FAR", "30-10-2026");
  const none = mk("REF-NONE", "");
  const d = buildDigest([none, far, soon, a, b]);
  assert.ok(d.text.includes("Est. dispatch 4 Oct has passed (12 days ago)"));
  assert.ok(d.html.includes("Est. dispatch 4 Oct has passed"));
  assert.ok(!d.text.includes("REF-FAR") && !d.text.includes("REF-NONE"), "far and unknown estimates are not in the email");
  const at = (ref) => d.text.indexOf(ref);
  assert.ok(at("REF-B") > -1 && at("REF-B") < at("REF-A") && at("REF-A") < at("REF-SOON"));
  // with only far or unknown estimates there is nothing to send
  assert.equal(buildDigest([far, none]), null);
});

test("dates are written to the master as the sheet's own date serial numbers", () => {
  assert.equal(toSheetSerial({ y: 2026, m: 1, d: 1 }), 46023); // matches the serials already in the sheet
  assert.equal(toSheetSerial({ y: 2026, m: 10, d: 17 }), 46312);
  assert.equal(toSheetSerial({ y: 2026, m: 10, d: 16 }) + 1, toSheetSerial({ y: 2026, m: 10, d: 17 }));
});
