import test from "node:test";
import assert from "node:assert/strict";
import { getUsers, getUsersFresh, addUser, resetEnabled, resettableAccounts, resetUserPassword } from "../lib/store.js";
import { isEncrypted } from "../lib/pinVault.js";
import { login, masterMatches, resetAdminMatches } from "../lib/auth.js";
import { versionInfo } from "../lib/version.js";
import resetApi from "../api/reset-password.js";

// These run in demo mode (no Google credentials), against data/demo-users.js.

test("a row with no password is a contact: its email and number are kept, but it can never sign in", async () => {
  const users = await getUsers();
  const noc = users.find((u) => u.username === "demo-noc");
  assert.ok(noc, "demo contact row is present");
  assert.equal(noc.role, "ops");
  assert.equal(noc.email, "night.ops@example.com");
  assert.equal(noc.contact, "919800000004");
  assert.equal(noc.noLogin, true);

  for (const guess of ["", "anything", "demo-noc"]) {
    const r = await login("demo-noc", guess, "test");
    assert.equal(r.ok, false, `guess ${JSON.stringify(guess)}`);
  }
});

test("users with a password still sign in; wrong passwords do not", async () => {
  assert.equal((await login("demo-ops", "demo-ops-pass", "t1")).ok, true);
  assert.equal((await login("demo-ops", "wrong", "t2")).ok, false);
});

test("an empty guess never matches the master password", async () => {
  assert.equal(await masterMatches(""), false);
  assert.equal(await masterMatches("demo-master-pass"), true);
});

test("a newly registered password is stored as a hash, and still signs in", async () => {
  await addUser({ username: "hash-test", password: "secret-1", role: "b2b", display_name: "Hash Test", email: "", contact: "" });
  const stored = (await getUsers()).find((u) => u.username === "hash-test");
  assert.equal(isEncrypted(stored.password), true, "never stored as typed");
  assert.equal(JSON.stringify(stored).includes("secret-1"), false);
  assert.equal((await login("hash-test", "secret-1", "h1")).ok, true);
  assert.equal((await login("hash-test", "secret-2", "h2")).ok, false);
});

test("only an admin with a mark in their own Reset cell is a reset admin; a mark on a non-admin row does nothing", async () => {
  assert.equal(await resetEnabled(), true);
  assert.deepEqual((await getUsers()).filter((u) => u.resetAdmin).map((u) => u.username), ["demo-admin"]);
});

test("the reset key is a marked admin's password - not the unmarked master's, nor a marked non-admin's", async () => {
  assert.equal(await resetAdminMatches("demo-admin-pass"), true);
  assert.equal(await resetAdminMatches("demo-master-pass"), false);
  assert.equal(await resetAdminMatches("old-bulk-pass"), false);
  assert.equal(await resetAdminMatches(""), false);
});

test("every account that can sign in can be picked; contact-only rows can't", async () => {
  const list = resettableAccounts(await getUsersFresh()).map((a) => a.username);
  assert.ok(list.includes("demo-forgot") && list.includes("demo-ops") && list.includes("demo-admin"));
  assert.equal(list.includes("demo-noc"), false);
});

test("a reset sets a new password for any account, even one nobody marked; the old one stops working", async () => {
  await assert.rejects(() => resetUserPassword("demo-noc", "new-pass-1"), /contact only/);
  await assert.rejects(() => resetUserPassword("nobody", "new-pass-1"), (e) => e.status === 404);
  await resetUserPassword("demo-forgot", "new-pass-1");
  assert.equal((await login("demo-forgot", "old-forgotten-pass", "r1")).ok, false, "the old password stops working");
  assert.equal((await login("demo-forgot", "new-pass-1", "r2")).ok, true, "the new password works");
});

/** Calls the API handler the way Vercel does, with a minimal req/res. */
async function callReset(method, body) {
  const res = {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(k, v) { this.headers[k] = v; },
    end(text) { this.body = text; this.writableEnded = true; },
  };
  await resetApi({ method, body, headers: { "x-forwarded-for": "9.9.9.9" }, socket: {} }, res);
  return { status: res.statusCode, data: res.body ? JSON.parse(res.body) : null };
}

test("the API hands out the account list only for a marked admin's password, and never a name on GET", async () => {
  const get = await callReset("GET");
  assert.deepEqual(get.data, { enabled: true }, "GET is a yes/no only");

  const denied = await callReset("POST", { action: "list", admin: "demo-master-pass" });
  assert.equal(denied.status, 401);
  assert.equal(denied.data.accounts, undefined);

  const listed = await callReset("POST", { action: "list", admin: "demo-admin-pass" });
  assert.equal(listed.status, 200);
  assert.ok(listed.data.accounts.some((a) => a.username === "demo-ops"));

  const reset = await callReset("POST", { admin: "demo-admin-pass", username: "demo-ops", password: "ops-new-pass" });
  assert.equal(reset.status, 200);
  assert.equal((await login("demo-ops", "ops-new-pass", "r3")).ok, true);
});

test("the version label is the release number and a short commit", () => {
  const v = versionInfo();
  assert.match(v.version, /^\d+\.\d+\.\d+$/);
  assert.match(v.commit, /^([0-9a-f]{7}|local|unknown)$/);
  assert.equal(v.label, `v${v.version} · ${v.commit}`);
});
