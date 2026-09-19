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
const { seedDemo, transition, restoreDemo, createDemoStore } = loadModule("lib/demo/store.ts");
const { nairaToKobo, payableDues, resolveJoinCode, configuredSignatories, INVITE_TTL_MS, spacePermission } = loadModule("lib/demo/spaces.ts");
const { DUE_TYPES } = loadModule("lib/rep/models.ts");
let seq = 0;
const step = (state, action, now = 1000) => transition(state, action, now, `op-${++seq}`);
const select = (state, userId) => step(state, { type: "select", userId });
const due = { title: "Class levy", type: "exam_levy", amountKobo: 250050, deadline: "2026-12-01", allowInstalments: true };
function setup(owner = "zainab") { return step(select(seedDemo(), owner), { type: "create_space", name: "Computer Science" }); }
function invite(state, user = "ada", role = "treasurer") { return step(state, { type: "invite", spaceId: state.spaces[0].id, email: `${user}@demo.duelite.test`, role }); }
function accept(state, user = "ada") { return step(select(state, user), { type: "accept_invite", inviteId: state.invites.at(-1).id }); }

test("approved unverified owners draft all nine types; publish and student contract require verified owner", () => {
  assert.throws(() => step(seedDemo(), { type: "create_space", name: "Forbidden" }));
  let state = setup("tunde"); const spaceId = state.spaces[0].id;
  for (const type of DUE_TYPES) state = step(state, { type: "save_due", spaceId, due: { ...due, type } });
  assert.equal(state.dues.length, 9);
  assert.throws(() => step(state, { type: "publish_due", spaceId, dueId: state.dues[0].id }), /verified KYC/);
  assert.deepEqual(payableDues(state, "unilag", spaceId), []);
  state = step(state, { type: "start_kyc", outcome: "verified" });
  state = step(state, { type: "finish_kyc", requestId: state.kycRequests[0].id }, 5000);
  state = step(state, { type: "publish_due", spaceId, dueId: state.dues[0].id });
  assert.equal(payableDues(state, "unilag", spaceId).length, 1);
  assert.deepEqual(payableDues(state, "other-school", spaceId), []);
  state = step(state, { type: "save_due", spaceId, dueId: state.dues[0].id, due: { ...due, amountKobo: 100 } });
  assert.equal(state.dues[0].status, "draft"); assert.deepEqual(payableDues(state, "unilag", spaceId), []);
});

test("space and due isolation, unique normalized join codes, inactive-space blocking", () => {
  let state = setup(); const first = state.spaces[0];
  state = step(state, { type: "save_due", spaceId: first.id, due });
  state = step(select(state, "tunde"), { type: "create_space", name: "Engineering" }); const second = state.spaces[1];
  assert.notEqual(first.joinCode, second.joinCode);
  assert.equal(resolveJoinCode(state, "unilag", ` ${first.joinCode.toLowerCase()} `).id, first.id);
  assert.equal(resolveJoinCode(state, "other", first.joinCode), null);
  assert.throws(() => step(state, { type: "select_space", spaceId: first.id }));
  assert.throws(() => step(state, { type: "save_due", spaceId: first.id, due }));
  assert.throws(() => step(state, { type: "save_due", spaceId: second.id, dueId: state.dues[0].id, due }));
  state = select(state, "zainab");
  const foreign = { ...state, users: state.users.map(u => u.id === "zainab" ? { ...u, schoolId: "other" } : u) };
  assert.throws(() => step(foreign, { type: "save_due", spaceId: first.id, due }));
  state.spaces[0].status = "suspended";
  assert.throws(() => step(state, { type: "save_due", spaceId: first.id, due }));
  assert.equal(resolveJoinCode(state, "unilag", first.joinCode), null);
  assert.deepEqual(payableDues(state, "unilag", first.id), []);
});

test("invalid money, dates and inputs never mutate state or append audit entries", () => {
  const state = setup(); const spaceId = state.spaces[0].id; const before = JSON.stringify(state);
  for (const amountKobo of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => step(state, { type: "save_due", spaceId, due: { ...due, amountKobo } }));
  for (const deadline of ["2026-02-30", "no", "2026-2-1"]) assert.throws(() => step(state, { type: "save_due", spaceId, due: { ...due, deadline } }));
  for (const input of ["0", "-1", "1.234", "1e3", "Infinity", "9007199254740992"]) assert.throws(() => nairaToKobo(input));
  assert.equal(nairaToKobo("2500.50"), 250050); assert.equal(nairaToKobo("0.01"), 1);
  assert.equal(JSON.stringify(state), before);
});

test("invites require matching identity and school; duplicates, expiration, replay and revocation are denied", () => {
  let state = invite(setup()); const invitation = state.invites[0];
  assert.throws(() => invite(state), /already/);
  assert.throws(() => step(state, { type: "accept_invite", inviteId: invitation.id }));
  assert.throws(() => step(select(state, "ada"), { type: "accept_invite", inviteId: invitation.id }, 1000 + INVITE_TTL_MS));
  const foreign = select(state, "ada"); foreign.users = foreign.users.map(u => u.id === "ada" ? { ...u, schoolId: "other" } : u);
  assert.throws(() => step(foreign, { type: "accept_invite", inviteId: invitation.id }));
  const revoked = step(state, { type: "revoke_invite", spaceId: state.spaces[0].id, inviteId: invitation.id });
  assert.throws(() => accept(revoked));
  state = accept(state);
  assert.equal(state.users[0].isRep, false); // co-rep role is additive; no rep application/KYC needed
  assert.throws(() => step(state, { type: "accept_invite", inviteId: invitation.id }));
  assert.throws(() => invite(select(state, "zainab")));
  const expired = invite(setup());
  const renewed = step(expired, { type: "invite", spaceId: expired.spaces[0].id, email: "ada@demo.duelite.test", role: "secretary" }, 1000 + INVITE_TTL_MS);
  assert.equal(renewed.invites.length, 2);
});

test("role permissions are enforced in mutations, signatory pair is distinct and revoked access ends immediately", () => {
  for (const role of ["treasurer", "secretary", "pro", "adviser"]) {
    let state = accept(invite(setup(), "ada", role)); const spaceId = state.spaces[0].id;
    assert.throws(() => step(state, { type: "invite", spaceId, email: "tunde@demo.duelite.test", role: "treasurer" }));
    if (["treasurer", "secretary"].includes(role)) {
      state = step(state, { type: "save_due", spaceId, due });
      const publish = { type: "publish_due", spaceId, dueId: state.dues[0].id };
      if (role === "treasurer") state = step(state, publish); else assert.throws(() => step(state, publish));
    } else assert.throws(() => step(state, { type: "save_due", spaceId, due }));
    state = select(state, "zainab");
    assert.throws(() => step(state, { type: "set_signatories", spaceId, secondId: "zainab" }));
    if (["treasurer", "adviser"].includes(role)) {
      state = step(state, { type: "set_signatories", spaceId, secondId: "ada" });
      assert.equal(configuredSignatories(state, spaceId).length, 2);
    } else assert.throws(() => step(state, { type: "set_signatories", spaceId, secondId: "ada" }));
    state = step(state, { type: "revoke_member", spaceId, userId: "ada" });
    assert.equal(configuredSignatories(state, spaceId).length, 0);
    assert.equal(spacePermission(select(state, "ada"), spaceId, "view_reports"), false);
    assert.throws(() => step(select(state, "ada"), { type: "save_due", spaceId, due }));
    assert.throws(() => step(state, { type: "revoke_member", spaceId, userId: "zainab" }));
  }
});

test("strict persistence validates relations; store roundtrip/reset preserves and clears complete M3 state", () => {
  let state = select(accept(invite(setup())), "zainab"); const spaceId = state.spaces[0].id;
  state = step(state, { type: "set_signatories", spaceId, secondId: "ada" });
  state = step(state, { type: "save_due", spaceId, due });
  assert.deepEqual(restoreDemo(JSON.stringify(state)), state);
  for (const mutate of [s => s.members[1].userId = "unknown", s => s.members[1].isSignatory = false, s => s.dues[0].spaceId = "other", s => s.invites[0].bvn = "unexpected", s => s.spaces.push(s.spaces[0]), s => s.dues[0].amountKobo = 0]) {
    const invalid = structuredClone(state); mutate(invalid); assert.equal(restoreDemo(JSON.stringify(invalid)), null);
  }
  assert.throws(() => transition(state, { type: "save_due", spaceId, due }, 1000, state.audit.at(-1).id), /already/);
  let value = JSON.stringify(state); const storage = { getItem: () => value, setItem: (_key, data) => { value = data; } };
  const store = createDemoStore(); store.start(storage); assert.deepEqual(store.getSnapshot().state, state);
  store.dispatch({ type: "publish_due", spaceId, dueId: state.dues[0].id }); store.stop();
  const reloaded = createDemoStore(); reloaded.start(storage); assert.equal(reloaded.getSnapshot().state.dues[0].status, "published");
  reloaded.reset(); assert.deepEqual(JSON.parse(value), seedDemo()); reloaded.stop();
});

test("earlier versions upgrade explicitly and stay untouched; a damaged current envelope cannot restore", () => {
  const old = '{"version":1}'; const previous = '{"version":2,"spaces":[]}';
  const values = new Map([["duelite.demo.v1", old], ["duelite.demo.v2", previous], ["duelite.demo.v3", '{"version":3}'], ["duelite.demo.v4", '{"version":4}'], ["duelite.demo.v5", '{"version":5}']]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const store = createDemoStore(); store.start(storage);
  assert.match(store.getSnapshot().notice, /upgraded/);
  assert.equal(values.get("duelite.demo.v1"), old); assert.equal(values.get("duelite.demo.v2"), previous);
  assert.deepEqual(store.getSnapshot().state, seedDemo()); store.stop();
  values.set("duelite.demo.v6", '{"version":6,"spaces":[]}');
  const damaged = createDemoStore(); damaged.start(storage);
  assert.match(damaged.getSnapshot().notice, /incompatible or damaged/); assert.deepEqual(damaged.getSnapshot().state, seedDemo()); damaged.stop();
});
