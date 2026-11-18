import test from "node:test";
import assert from "node:assert/strict";
import { getUsers, addUser, getResetRequests, resetUserPassword } from "../lib/store.js";
import { isEncrypted } from "../lib/pinVault.js";
import { login, masterMatches } from "../lib/auth.js";
import { versionInfo } from "../lib/version.js";

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

test("only an account marked in the Reset column shows up as wanting a password reset", async () => {
  const requests = await getResetRequests();
  assert.deepEqual(requests.map((r) => r.username), ["demo-forgot"]);
});

test("resetting a password needs the account to be marked, then clears the mark and signs in with the new password", async () => {
  await assert.rejects(() => resetUserPassword("demo-ops", "new-pass-1"), /has not asked for a reset/);

  await resetUserPassword("demo-forgot", "new-pass-1");
  assert.equal((await login("demo-forgot", "old-forgotten-pass", "r1")).ok, false, "the old password stops working");
  assert.equal((await login("demo-forgot", "new-pass-1", "r2")).ok, true, "the new password works");
  assert.deepEqual((await getResetRequests()).map((r) => r.username), [], "the mark is cleared after a reset");
});

test("the version label is the release number and a short commit", () => {
  const v = versionInfo();
  assert.match(v.version, /^\d+\.\d+\.\d+$/);
  assert.match(v.commit, /^([0-9a-f]{7}|local|unknown)$/);
  assert.equal(v.label, `v${v.version} · ${v.commit}`);
});
