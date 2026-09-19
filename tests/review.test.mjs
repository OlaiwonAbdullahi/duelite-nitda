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
const { seedDemo, transition, restoreDemo } = loadModule("lib/demo/store.ts");
const { nextCollection } = loadModule("lib/demo/collections.ts");
const { balances, hashCode, CODE_TTL_MS, REVIEW_RULES, trustScore } = loadModule("lib/demo/withdrawals.ts");

let seq = 0;
const T = Date.parse("2026-09-19T10:00:00Z"); // 11:00 in Lagos
const step = (state, action, now = T, id = `op-${++seq}`) => transition(state, action, now, id);
const as = (state, userId) => step(state, { type: "select", userId });
const SEED = "seed-zainab-gtbank";

/** ₦1,000,000 collected in Zainab's verified space, Ada as treasurer signatory. */
function ready() {
  let state = step(as(seedDemo(), "zainab"), { type: "create_space", name: "Computer Science" });
  const spaceId = state.spaces[0].id;
  state = step(state, { type: "save_due", spaceId, due: { title: "Due", type: "departmental_due", amountKobo: 1_000_000, deadline: "2026-12-01", allowInstalments: false } });
  state = step(state, { type: "publish_due", spaceId, dueId: state.dues[0].id });
  for (let index = 0; index < 100; index++) state = step(state, { type: "collect", event: nextCollection(state, spaceId, T) });
  state = step(state, { type: "invite", spaceId, email: "ada@demo.duelite.test", role: "treasurer" });
  state = step(as(state, "ada"), { type: "accept_invite", inviteId: state.invites[0].id });
  return { state: step(as(state, "zainab"), { type: "set_signatories", spaceId, secondId: "ada" }), spaceId };
}
async function request(state, spaceId, amountKobo, { now = T, destinationId = SEED } = {}) {
  const id = `wd-${++seq}`;
  const codeHashes = { zainab: await hashCode(id, "zainab", "11111"), ada: await hashCode(id, "ada", "22222") };
  const next = step(as(state, "zainab"), { type: "request_withdrawal", spaceId, destinationId, purpose: "Printing handouts", amountKobo, codeHashes, expiresAt: now + CODE_TTL_MS }, now, id);
  return { state: next, id, item: next.withdrawals.find(item => item.id === id) };
}
const signBoth = async (state, id, now = T) => {
  for (const [userId, code] of [["zainab", "11111"], ["ada", "22222"]]) state = step(as(state, userId), { type: "sign_withdrawal", withdrawalId: id, codeHash: await hashCode(id, userId, code) }, now);
  return state;
};
const flags = async (...args) => (await request(...args)).item.flagReasons;

test("the safe path: established account, daytime, modest amount, is never paused", async () => {
  const { state, spaceId } = ready();
  const { state: next, id, item } = await request(state, spaceId, 5_000_000);
  assert.deepEqual([item.flagReasons, item.status], [[], "awaiting_signatories"]);
  assert.equal((await signBoth(next, id)).withdrawals[0].status, "processing");
});

test("large-request rule: ₦200,000 floor, then 3× the largest earlier payout, both exclusive", async () => {
  const { state, spaceId } = ready();
  assert.deepEqual(await flags(state, spaceId, REVIEW_RULES.largeFloorKobo), []);
  assert.match((await flags(state, spaceId, REVIEW_RULES.largeFloorKobo + 1))[0], /Unusually large: ₦200,000\.01 is above the ₦200,000\.00 review threshold/);
  // A settled ₦100,000 payout lifts the threshold to ₦300,000.
  let { state: paid, id } = await request(state, spaceId, 10_000_000);
  paid = step(await signBoth(paid, id), { type: "settle_withdrawal", withdrawalId: id, outcome: "succeeded" });
  assert.deepEqual(await flags(paid, spaceId, 30_000_000), []);
  assert.match((await flags(paid, spaceId, 30_000_001))[0], /more than 3× this space's largest earlier payout \(₦100,000\.00\)/);
});

test("odd-hours rule uses Africa/Lagos 00:00–04:59 regardless of UTC", async () => {
  const { state, spaceId } = ready();
  const at = iso => ({ now: Date.parse(iso) });
  assert.match((await flags(state, spaceId, 100_000, at("2026-09-19T23:00:00Z")))[0], /Odd hour: requested at 00:00 Lagos time/);
  assert.match((await flags(state, spaceId, 100_000, at("2026-09-19T03:59:59Z")))[0], /04:59/);
  assert.deepEqual(await flags(state, spaceId, 100_000, at("2026-09-19T04:00:00Z")), [], "05:00 Lagos is normal");
  assert.deepEqual(await flags(state, spaceId, 100_000, at("2026-09-19T22:59:59Z")), [], "23:59 Lagos is normal");
});

test("new-destination rule: an account saved under 24 hours ago is flagged", async () => {
  const { state: base, spaceId } = ready();
  const state = step(as(base, "zainab"), { type: "add_destination", bank: "Opay", accountNumber: "8888888888" });
  const destinationId = state.destinations.at(-1).id;
  assert.match((await flags(state, spaceId, 100_000, { destinationId }))[0], /New account/);
  assert.match((await flags(state, spaceId, 100_000, { destinationId, now: T + REVIEW_RULES.newDestinationMs - 1 })).join(), /New account/);
  assert.doesNotMatch((await flags(state, spaceId, 100_000, { destinationId, now: T + REVIEW_RULES.newDestinationMs })).join(), /New account/);
});

test("nearly-all rule: amount + fee at or above 90% of available; all four reasons stack", async () => {
  const { state, spaceId } = ready(); // ₦1,000,000 available
  const first = await request(state, spaceId, 90_000_000 - 20_000); // ₦899,800 + ₦200 fee = 90%
  assert.equal(first.item.flagReasons.length, 2);
  assert.match(first.item.flagReasons[1], /Nearly all funds: amount plus fee is 90% of the ₦1,000,000\.00 available/);
  const tight = first.state; // the paused request still reserves: ₦100,000 left
  assert.equal(balances(tight, spaceId).availableKobo, 10_000_000);
  assert.match((await flags(tight, spaceId, 9_000_000 - 20_000)).join(), /Nearly all funds/, "₦89,800 + ₦200 fee is exactly 90%");
  assert.deepEqual(await flags(tight, spaceId, 9_000_000 - 20_001), []);
  const night = Date.parse("2026-09-19T01:00:00Z");
  const fresh = step(as(state, "zainab"), { type: "add_destination", bank: "Opay", accountNumber: "8888888888" }, night);
  const all = await flags(fresh, spaceId, 90_000_000 - 20_000, { now: night, destinationId: fresh.destinations.at(-1).id });
  assert.deepEqual(all.map(reason => reason.split(":")[0]), ["Unusually large", "Odd hour", "New account", "Nearly all funds"]);
});

test("flagged requests stay paused despite valid codes until the Track 3 demo reviewer resolves them", async () => {
  const { state: base, spaceId } = ready();
  let { state, id, item } = await request(base, spaceId, 30_000_000); // large
  assert.equal(item.status, "pending_review");
  assert.match(item.history.at(-1).note, /Paused for anomaly review: Unusually large/);
  state = await signBoth(state, id);
  assert.equal(state.withdrawals[0].status, "pending_review", "two valid signatures do not release a flagged request");
  assert.match(state.withdrawals[0].history.at(-1).note, /stays paused/);
  assert.equal(step(state, { type: "settle_withdrawal", withdrawalId: id, outcome: "succeeded" }), state, "the rail cannot settle a paused request");
  for (const userId of ["zainab", "ada", "tunde"]) assert.throws(() => step(as(state, userId), { type: "resolve_review", withdrawalId: id, decision: "approve" }), /Track 3 demo reviewer/);
  assert.throws(() => step(as(state, "admin"), { type: "resolve_review", withdrawalId: id, decision: "maybe" }), /Invalid review decision/);
  const approved = step(as(state, "admin"), { type: "resolve_review", withdrawalId: id, decision: "approve" });
  assert.deepEqual([approved.withdrawals[0].status, approved.withdrawals[0].flagReasons], ["processing", []]);
  assert.equal(approved.audit.at(-1).actorId, "admin");
  assert.ok(approved.withdrawals[0].history.some(entry => /Unusually large/.test(entry.note)), "reasons stay in the history after review");
  assert.throws(() => step(approved, { type: "resolve_review", withdrawalId: id, decision: "reject" }), /paused for review/);

  // Approved before anyone signed: back to awaiting signatures, and signing then releases normally.
  const early = await request(base, spaceId, 30_000_000);
  const cleared = step(as(early.state, "admin"), { type: "resolve_review", withdrawalId: early.id, decision: "approve" });
  assert.equal(cleared.withdrawals[0].status, "awaiting_signatories");
  assert.equal((await signBoth(cleared, early.id)).withdrawals[0].status, "processing");

  const rejected = step(as(early.state, "admin"), { type: "resolve_review", withdrawalId: early.id, decision: "reject" });
  assert.deepEqual([rejected.withdrawals[0].status, balances(rejected, spaceId).reservedKobo], ["rejected", 0]);
  await assert.rejects(signBoth(rejected, early.id), /rejected/);

  // A pair changed after both signed cannot be released by review.
  const revoked = step(as(state, "zainab"), { type: "revoke_member", spaceId, userId: "ada" });
  assert.throws(() => step(as(revoked, "admin"), { type: "resolve_review", withdrawalId: id, decision: "approve" }), /pair changed/);
});

test("trust score is transparent, never invents a perfect score, and never bypasses review", async () => {
  const { state: base, spaceId } = ready();
  const empty = trustScore(base, spaceId);
  assert.deepEqual([empty.score, empty.known, empty.level], [null, 0, "Not enough data"]);
  assert.ok(empty.inputs.every(input => input.value === null && /No/.test(input.detail)));
  let { state, id } = await request(base, spaceId, 1_000_000);
  state = step(await signBoth(state, id), { type: "settle_withdrawal", withdrawalId: id, outcome: "succeeded" });
  const one = trustScore(state, spaceId);
  assert.deepEqual([one.score, one.known, one.inputs[0].value], [null, 1, 1], "a single known input is not enough for a score");
  const bogus = trustScore(state, spaceId, { disputeRate: 1.5, averageRating: 7, transparencyShare: -1 });
  assert.equal(bogus.known, 1, "out-of-range signals count as unknown");
  const rated = trustScore(state, spaceId, { averageRating: 3 });
  assert.deepEqual([rated.score, rated.level], [75, "Moderate trust"]); // (100 + 50) / 2
  const high = trustScore(state, spaceId, { transparencyShare: 1, disputeRate: 0, averageRating: 5 });
  assert.deepEqual([high.score, high.known, high.level], [100, 4, "High trust"]);
  assert.equal((await request(state, spaceId, 30_000_000)).item.status, "pending_review", "high trust does not skip review");
  let failed = await request(state, spaceId, 1_000_000);
  const low = step(await signBoth(failed.state, failed.id), { type: "settle_withdrawal", withdrawalId: failed.id, outcome: "failed" });
  assert.equal(trustScore(low, spaceId).inputs[0].value, 0.5);
  assert.equal(trustScore(low, "other-space").known, 0, "scores are per space");
});

test("restore accepts paused requests and rejects flags that disagree with status", async () => {
  const { state: base, spaceId } = ready();
  const { state } = await request(base, spaceId, 30_000_000);
  assert.deepEqual(restoreDemo(JSON.stringify(state)), state);
  const tamper = change => { const copy = structuredClone(state); change(copy); return JSON.stringify(copy); };
  assert.equal(restoreDemo(tamper(copy => { copy.withdrawals[0].flagReasons = []; })), null, "paused without a reason");
  assert.equal(restoreDemo(tamper(copy => { copy.withdrawals[0].status = "awaiting_signatories"; copy.withdrawals[0].history.at(-1).status = "awaiting_signatories"; })), null, "flags left on a releasable request");
});
