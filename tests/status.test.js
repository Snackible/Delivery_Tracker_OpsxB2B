import test from "node:test";
import assert from "node:assert/strict";
import { parseDate, parseExpected, formatDMY, dayDiff } from "../lib/dates.js";
import { computeOrder, compareOrders, summarize } from "../lib/status.js";
import { demoOrders } from "../data/demo-orders.js";

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
