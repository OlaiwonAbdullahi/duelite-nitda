import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const cache = new Map();
function loadModule(filename) {
  filename = path.resolve(filename);
  if (cache.has(filename)) return cache.get(filename);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  const compiled = { exports: {} };
  new Function("module", "exports", "require", outputText)(compiled, compiled.exports, name => loadModule(path.resolve(path.dirname(filename), `${name}.ts`)));
  cache.set(filename, compiled.exports);
  return compiled.exports;
}
const { seedDemo, transition, requireRepCapability, restoreDemo, createDemoStore, STORAGE_KEY } = loadModule("lib/demo/store.ts");
const apply = { type: "apply", department: "Computer Science", level: "200", position: "Course representative" };
const step = (state, action, now = 1000, id = "operation") => transition(state, action, now, id);
const select = (state, userId) => step(state, { type: "select", userId });

test("application cannot self-approve, replay or bypass required fields; rejection can be resubmitted", () => {
  const seed = seedDemo();
  assert.throws(() => step(seed, { ...apply, department: "" }));
  let state = step(seed, apply);
  assert.throws(() => step(state, apply));
  assert.throws(() => step(state, { type: "review", userId: "ada", decision: "approved" }));
  for (const action of ["create_space", "draft_due", "publish_due", "collect"]) assert.throws(() => requireRepCapability(state, action));
  state = step(select(state, "admin"), { type: "review", userId: "ada", decision: "rejected" });
  assert.throws(() => step(state, { type: "review", userId: "ada", decision: "approved" }));
  state = select(state, "ada");
  assert.equal(state.users[0].isStudent, true);
  assert.match(state.applications.ada.rejection, /Confirm/);
  state = step(state, apply);
  state = step(select(state, "admin"), { type: "review", userId: "ada", decision: "approved" });
  state = select(state, "ada");
  requireRepCapability(state, "create_space"); requireRepCapability(state, "draft_due");
  assert.throws(() => requireRepCapability(state, "publish_due"));
  assert.throws(() => requireRepCapability(state, "collect"));
});

test("failed KYC, early/duplicate/stale results and identity switching cannot unlock another rep", () => {
  assert.throws(() => step(seedDemo(), { type: "start_kyc", outcome: "verified" }));
  let state = select(seedDemo(), "tunde");
  state = step(state, { type: "start_kyc", outcome: "failed" }, 1000, "first");
  assert.throws(() => step(state, { type: "start_kyc", outcome: "verified" }));
  assert.equal(step(state, { type: "finish_kyc", requestId: "first" }, 3999), state);
  state = select(state, "ada");
  state = step(state, { type: "finish_kyc", requestId: "first" }, 4000);
  assert.equal(state.users.find(user => user.id === "tunde").kycStatus, "failed");
  assert.equal(state.users[0].kycStatus, "not_started");
  state = select(state, "tunde");
  assert.throws(() => requireRepCapability(state, "collect"));
  state = step(state, { type: "start_kyc", outcome: "verified" }, 5000, "retry");
  assert.equal(step(state, { type: "finish_kyc", requestId: "first" }, 8000), state);
  state = step(state, { type: "finish_kyc", requestId: "retry" }, 8000);
  requireRepCapability(state, "collect");
  assert.equal(step(state, { type: "finish_kyc", requestId: "retry" }, 9000), state);
  assert.equal(step(seedDemo(), { type: "finish_kyc", requestId: "retry" }, 9000).audit.length, 0);
});

test("versioned reload preserves applications, selected identity and verification; malformed envelopes reset", () => {
  let state = step(seedDemo(), apply);
  state = step(select(state, "tunde"), { type: "start_kyc", outcome: "verified" });
  assert.deepEqual(restoreDemo(JSON.stringify(state)), state);
  for (const raw of ["bad json", "null", "{}", JSON.stringify({ ...state, version: 99 }), JSON.stringify({ ...state, selectedId: "unknown" }), JSON.stringify({ ...state, bvn: "never-store" }), JSON.stringify({ ...state, kycRequests: [] })]) assert.equal(restoreDemo(raw), null);
  const altered = structuredClone(state); altered.users[0].schoolId = "another";
  assert.equal(restoreDemo(JSON.stringify(altered)), null);
});

test("actual store persists/reloads, resumes overdue checks, cleans timers on reset/stop and reports storage failure", async () => {
  let value = null;
  const storage = { getItem: key => { assert.equal(key, STORAGE_KEY); return value; }, setItem: (key, data) => { assert.equal(key, STORAGE_KEY); value = data; } };
  const first = createDemoStore(); first.start(storage); first.dispatch(apply); first.dispatch({ type: "select", userId: "tunde" }); first.dispatch({ type: "start_kyc", outcome: "verified" }); first.stop();
  const stored = JSON.parse(value); stored.kycRequests[0].dueAt = Date.now() - 1; value = JSON.stringify(stored);
  const second = createDemoStore(); second.start(storage);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(second.getSnapshot().state.users[1].kycStatus, "verified");
  assert.equal(second.getSnapshot().state.users[0].approvalStatus, "pending");
  second.reset(); assert.deepEqual(JSON.parse(value), seedDemo());
  second.dispatch({ type: "select", userId: "tunde" }); second.dispatch({ type: "start_kyc", outcome: "failed" }); second.reset();
  await new Promise(resolve => setTimeout(resolve, 3100));
  assert.deepEqual(second.getSnapshot().state, seedDemo()); second.stop();
  const broken = createDemoStore(); broken.start({ getItem() { throw new Error("blocked"); }, setItem() { throw new Error("quota"); } });
  assert.match(broken.getSnapshot().notice, /unavailable/); broken.dispatch(apply); assert.equal(broken.getSnapshot().state.users[0].approvalStatus, "pending"); broken.stop();
});
