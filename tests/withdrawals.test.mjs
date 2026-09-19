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
const { seedDemo, transition, restoreDemo, createDemoStore, STORAGE_KEY } = loadModule("lib/demo/store.ts");
const { nextCollection } = loadModule("lib/demo/collections.ts");
const { balances, hashCode, CODE_TTL_MS, WITHDRAWAL_TTL_MS, MAX_CODE_ATTEMPTS, PAYOUT_DELAY_MS, createPayoutRail } = loadModule("lib/demo/withdrawals.ts");

let seq = 0;
const T = Date.parse("2026-09-19T10:00:00Z");
const step = (state, action, now = T, id = `op-${++seq}`) => transition(state, action, now, id);
const as = (state, userId) => step(state, { type: "select", userId });

/** Zainab owns a verified space with `payments` confirmed full payments of `dueKobo`, Ada as treasurer signatory, and her seeded established account. */
function ready({ dueKobo = 1_000_000, payments = 10 } = {}) {
  let state = step(as(seedDemo(), "zainab"), { type: "create_space", name: "Computer Science" });
  const spaceId = state.spaces[0].id;
  state = step(state, { type: "save_due", spaceId, due: { title: "Due", type: "departmental_due", amountKobo: dueKobo, deadline: "2026-12-01", allowInstalments: false } });
  state = step(state, { type: "publish_due", spaceId, dueId: state.dues[0].id });
  for (let index = 0; index < payments; index++) state = step(state, { type: "collect", event: nextCollection(state, spaceId, T) });
  state = step(state, { type: "invite", spaceId, email: "ada@demo.duelite.test", role: "treasurer" });
  state = step(as(state, "ada"), { type: "accept_invite", inviteId: state.invites[0].id });
  state = step(as(state, "zainab"), { type: "set_signatories", spaceId, secondId: "ada" });
  return { state, spaceId, destinationId: "seed-zainab-gtbank" };
}
/** Request with known codes; returns the new state, id and plaintext codes (which the test, like the inbox, keeps outside state). */
async function request(state, spaceId, destinationId, amountKobo, now = T) {
  const id = `wd-${++seq}`;
  const codes = { zainab: "11111", ada: "22222" };
  const codeHashes = { zainab: await hashCode(id, "zainab", codes.zainab), ada: await hashCode(id, "ada", codes.ada) };
  return { state: step(state, { type: "request_withdrawal", spaceId, destinationId, purpose: "Printing handouts", amountKobo, codeHashes, expiresAt: now + CODE_TTL_MS }, now, id), id, codes };
}
const sign = async (state, userId, id, code, now = T) => step(as(state, userId), { type: "sign_withdrawal", withdrawalId: id, codeHash: await hashCode(id, userId, code) }, now);

test("amount plus fee must be covered; the reservation holds amount + fee until settlement", async () => {
  const { state, spaceId, destinationId } = ready();
  assert.equal(balances(state, spaceId).availableKobo, 10_000_000);
  await assert.rejects(request(state, spaceId, destinationId, 9_990_001), /amount plus the withdrawal fee/);
  const exact = await request(state, spaceId, destinationId, 9_980_000); // ₦200 fee above ₦50,000
  const funds = balances(exact.state, spaceId);
  assert.deepEqual([funds.reservedKobo, funds.availableKobo, funds.withdrawnKobo], [10_000_000, 0, 0]);
  const w = exact.state.withdrawals[0];
  assert.equal(w.feeKobo, 20_000); assert.match(w.reference, /^WD-/); assert.equal(w.status, "pending_review", "the whole balance is paused for M6 review");
  assert.equal((await request(state, spaceId, destinationId, 5_000_000)).state.withdrawals[0].feeKobo, 10_000, "₦50,000 exactly pays ₦100");
  assert.ok(!JSON.stringify(exact.state).includes("11111"), "plaintext codes never enter state");
  await assert.rejects(request(as(state, "ada"), spaceId, destinationId, 100_000), /verified owner/);
  const other = step(as(state, "ada"), { type: "add_destination", bank: "Opay", accountNumber: "9999999999" });
  await assert.rejects(request(as(other, "zainab"), spaceId, other.destinations[1].id, 100_000), /own saved bank accounts/);
});

test("simultaneous requests cannot both reserve the same balance", async () => {
  const { state, spaceId, destinationId } = ready();
  const first = await request(state, spaceId, destinationId, 6_000_000);
  await assert.rejects(request(first.state, spaceId, destinationId, 6_000_000), /amount plus the withdrawal fee/);
  let value = JSON.stringify(state);
  const live = createDemoStore(); live.start({ getItem: () => value, setItem: (_, data) => { value = data; } });
  const results = await Promise.allSettled([1, 2].map(() => live.requestWithdrawal({ spaceId, destinationId, purpose: "Lab manuals", amountKobo: 6_000_000 })));
  assert.deepEqual(results.map(result => result.status).sort(), ["fulfilled", "rejected"]);
  assert.equal(live.getSnapshot().state.withdrawals.length, 1);
  assert.equal(live.getSnapshot().inbox.length, 2, "only the accepted request sent codes, one per signatory");
  assert.notEqual(live.getSnapshot().inbox[0].userId, live.getSnapshot().inbox[1].userId);
  live.stop();
});

test("wrong, expired, locked, replayed and resent-over codes move no money; both signatures release atomically", async () => {
  const { state: base, spaceId, destinationId } = ready();
  let { state, id, codes } = await request(base, spaceId, destinationId, 1_000_000);
  state = await sign(state, "zainab", id, "00000");
  assert.equal(state.approvals.find(a => a.userId === "zainab").failedAttempts, 1);
  assert.equal(state.withdrawals[0].status, "awaiting_signatories");
  await assert.rejects(sign(state, "tunde", id, codes.ada), /not found in your spaces/);
  const afterWrongAda = await sign(state, "ada", id, codes.zainab);
  assert.equal(afterWrongAda.approvals.find(a => a.userId === "ada").usedAt, null);
  await assert.rejects(sign(state, "ada", id, codes.ada, T + CODE_TTL_MS), /expired/);
  let locked = state;
  for (let index = 1; index < MAX_CODE_ATTEMPTS; index++) locked = await sign(locked, "zainab", id, "00000");
  await assert.rejects(sign(locked, "zainab", id, codes.zainab), /Too many wrong attempts/);
  // Resend replaces the hash: the old code stops working and attempts reset.
  const resent = step(as(locked, "zainab"), { type: "resend_code", withdrawalId: id, codeHash: await hashCode(id, "zainab", "33333"), expiresAt: T + CODE_TTL_MS });
  const stale = await sign(resent, "zainab", id, codes.zainab);
  assert.equal(stale.approvals.find(a => a.userId === "zainab").usedAt, null);
  state = await sign(resent, "zainab", id, "33333");
  await assert.rejects(sign(state, "zainab", id, "33333"), /already used/);
  assert.equal(state.withdrawals[0].status, "awaiting_signatories", "one signature never releases");
  assert.equal(balances(state, spaceId).withdrawnKobo, 0);
  state = await sign(state, "ada", id, codes.ada);
  assert.equal(state.withdrawals[0].status, "processing");
  await assert.rejects(sign(state, "ada", id, codes.ada), /processing/);
  const settled = step(state, { type: "settle_withdrawal", withdrawalId: id, outcome: "succeeded" });
  assert.equal(step(settled, { type: "settle_withdrawal", withdrawalId: id, outcome: "failed" }), settled, "late or repeated callbacks are ignored");
  const funds = balances(settled, spaceId);
  assert.deepEqual([funds.withdrawnKobo, funds.reservedKobo, funds.availableKobo], [1_010_000, 0, 8_990_000]);
  assert.deepEqual(settled.withdrawals[0].history.map(h => h.status), ["awaiting_signatories", "awaiting_signatories", "awaiting_signatories", "awaiting_signatories", "processing", "succeeded"]);
  assert.equal(settled.audit.at(-1).actorId, "demo-payout");
});

test("failures, cancellations, expiry and a changed signatory pair release the reservation", async () => {
  const { state: base, spaceId, destinationId } = ready();
  let { state, id, codes } = await request(base, spaceId, destinationId, 1_000_000);
  state = await sign(await sign(state, "zainab", id, codes.zainab), "ada", id, codes.ada);
  const failed = step(state, { type: "settle_withdrawal", withdrawalId: id, outcome: "failed" });
  assert.deepEqual([failed.withdrawals[0].status, balances(failed, spaceId).availableKobo], ["failed", 10_000_000]);

  const pending = await request(base, spaceId, destinationId, 1_000_000);
  const expired = step(as(pending.state, "zainab"), { type: "expire_withdrawals" }, T + WITHDRAWAL_TTL_MS);
  assert.deepEqual([expired.withdrawals[0].status, balances(expired, spaceId).reservedKobo], ["expired", 0]);
  assert.equal(step(expired, { type: "expire_withdrawals" }, T + WITHDRAWAL_TTL_MS), expired, "nothing left to expire changes nothing");
  await assert.rejects(sign(pending.state, "ada", pending.id, pending.codes.ada, T + WITHDRAWAL_TTL_MS), /expired/);

  const revoked = step(as(pending.state, "zainab"), { type: "revoke_member", spaceId, userId: "ada" });
  await assert.rejects(sign(revoked, "zainab", pending.id, pending.codes.zainab), /pair changed/);
  await assert.rejects(Promise.resolve().then(() => step(as(revoked, "ada"), { type: "cancel_withdrawal", withdrawalId: pending.id })), /not found/);
  const cancelled = step(as(revoked, "zainab"), { type: "cancel_withdrawal", withdrawalId: pending.id });
  assert.deepEqual([cancelled.withdrawals[0].status, balances(cancelled, spaceId).reservedKobo], ["rejected", 0]);
});

test("single-transaction and daily rail limits apply to requested principal", async () => {
  const { state: base, spaceId, destinationId } = ready({ dueKobo: 15_000_000, payments: 80 }); // ₦12m collected
  await assert.rejects(request(base, spaceId, destinationId, 250_000_001), /single withdrawal/);
  let state = base;
  for (let index = 0; index < 4; index++) state = (await request(state, spaceId, destinationId, 250_000_000)).state;
  await assert.rejects(request(state, spaceId, destinationId, 1), /daily limit/);
  const tomorrow = await request(step(state, { type: "expire_withdrawals" }, T + WITHDRAWAL_TTL_MS, "sweep"), spaceId, destinationId, 1_000_000, T + WITHDRAWAL_TTL_MS);
  assert.equal(tomorrow.state.withdrawals.at(-1).status, "awaiting_signatories");
});

test("restore keeps hashes only and rejects tampered or over-debited withdrawal ledgers", async () => {
  const { state: base, spaceId, destinationId } = ready();
  const { state } = await request(base, spaceId, destinationId, 1_000_000);
  assert.deepEqual(restoreDemo(JSON.stringify(state)), state);
  const tamper = change => { const copy = structuredClone(state); change(copy); return JSON.stringify(copy); };
  assert.equal(restoreDemo(tamper(copy => { copy.approvals[0].code = "11111"; })), null);
  assert.equal(restoreDemo(tamper(copy => { copy.approvals[0].codeHash = "11111"; })), null);
  assert.equal(restoreDemo(tamper(copy => { copy.withdrawals[0].amountKobo = 100_000_000; })), null);
  assert.equal(restoreDemo(tamper(copy => { copy.withdrawals[0].status = "succeeded"; })), null);
  assert.equal(restoreDemo(tamper(copy => { copy.approvals.pop(); })), null);
  assert.equal(restoreDemo(tamper(copy => { copy.destinations[0].accountName = "Someone Else"; })), null);
  assert.equal(restoreDemo(JSON.stringify({ ...state, version: 3 })), null);
});

test("the store sends codes to the inbox, pays out once through the rail and resumes processing after reload", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: T }); // daytime in Lagos, so no odd-hour review
  const { state, spaceId, destinationId } = ready();
  let value = JSON.stringify(state);
  const storage = { getItem: key => (key === STORAGE_KEY ? value : null), setItem: (_, data) => { value = data; } };
  const store = createDemoStore(); store.start(storage);
  await store.requestWithdrawal({ spaceId, destinationId, purpose: "Printing", amountKobo: 1_000_000 });
  const { inbox } = store.getSnapshot();
  const id = inbox[0].withdrawalId;
  const code = userId => inbox.find(item => item.userId === userId).code;
  assert.match(code("zainab"), /^\d{5}$/);
  assert.ok(!value.includes(`"${code("zainab")}"`) && !value.includes(`"${code("ada")}"`), "codes are not persisted");
  await assert.rejects(store.signWithdrawal(id, "123"), /5-digit/);
  await store.signWithdrawal(id, code("zainab"));
  store.dispatch({ type: "select", userId: "ada" });
  await store.signWithdrawal(id, code("ada"));
  assert.equal(store.getSnapshot().state.withdrawals[0].status, "processing");
  store.stop();
  // Reload mid-payout: the new store resumes the processing request; the settle is still exactly once.
  const reloaded = createDemoStore(); reloaded.start(storage);
  assert.equal(reloaded.getSnapshot().inbox.length, 0, "the inbox is runtime only");
  t.mock.timers.tick(PAYOUT_DELAY_MS);
  assert.equal(reloaded.getSnapshot().state.withdrawals[0].status, "succeeded");
  assert.equal(balances(reloaded.getSnapshot().state, spaceId).withdrawnKobo, 1_010_000);
  t.mock.timers.tick(PAYOUT_DELAY_MS * 3);
  assert.equal(reloaded.getSnapshot().state.audit.filter(entry => entry.action === "settle_withdrawal").length, 1);

  reloaded.dispatch({ type: "select", userId: "zainab" });
  reloaded.setPayoutFailure(true);
  await reloaded.requestWithdrawal({ spaceId, destinationId, purpose: "Trip bus", amountKobo: 500_000 });
  const second = reloaded.getSnapshot().inbox.find(item => item.userId === "zainab").withdrawalId;
  await reloaded.resendCode(second);
  const fresh = reloaded.getSnapshot().inbox.filter(item => item.withdrawalId === second);
  assert.equal(fresh.length, 2, "resend replaces, never duplicates, the inbox message");
  await reloaded.signWithdrawal(second, fresh.find(item => item.userId === "zainab").code);
  reloaded.dispatch({ type: "select", userId: "ada" });
  await reloaded.signWithdrawal(second, fresh.find(item => item.userId === "ada").code);
  reloaded.reset();
  t.mock.timers.tick(PAYOUT_DELAY_MS);
  assert.equal(reloaded.getSnapshot().state.withdrawals.length, 0, "reset clears pending payout timers");
  reloaded.stop();

  const rail = createPayoutRail(); rail.failNext = true;
  assert.equal(rail.send("WD-1"), "failed"); assert.equal(rail.send("WD-1"), "failed"); assert.equal(rail.send("WD-2"), "succeeded");
  assert.equal(rail.count(), 2, "the rail pays each reference at most once");
});
