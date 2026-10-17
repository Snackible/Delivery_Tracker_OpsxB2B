import test from "node:test";
import assert from "node:assert/strict";
import { getUsers } from "../lib/store.js";
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

test("the version label is the release number and a short commit", () => {
  const v = versionInfo();
  assert.match(v.version, /^\d+\.\d+\.\d+$/);
  assert.match(v.commit, /^([0-9a-f]{7}|local|unknown)$/);
  assert.equal(v.label, `v${v.version} · ${v.commit}`);
});
