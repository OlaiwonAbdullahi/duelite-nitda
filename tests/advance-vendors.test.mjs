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
const { cohort } = loadModule("lib/demo/collections.ts");
const { studentFeeKobo } = loadModule("lib/rep/money.ts");
const { advanceOffer, advanceStatus } = loadModule("lib/demo/advance.ts");
const { orderSettlement } = loadModule("lib/demo/vendors.ts");
const { balances, hashCode, CODE_TTL_MS } = loadModule("lib/demo/withdrawals.ts");

// 2026-11-20 11:00 Lagos: daytime, so the odd-hour review rule stays quiet.
const T = Date.parse("2026-11-20T10:00:00Z");
let seq = 0;
const step = (state, action, now = T, id = `op-${++seq}`) => transition(state, action, now, id);
const as = (state, userId) => step(state, { type: "select", userId });
const DUE = 250_000; // ₦2,500 × 200 students = ₦500,000 expected

/** Zainab's verified space with one published instalment due (and optionally an overdue one). */
function space({ overdue = false } = {}) {
  let state = step(as(seedDemo(), "zainab"), { type: "create_space", name: "Computer Science" });
  const spaceId = state.spaces[0].id;
  const dues = [{ title: "Departmental due", type: "departmental_due", amountKobo: DUE, deadline: "2026-12-15", allowInstalments: true }];
  if (overdue) dues.push({ title: "Old levy", type: "exam_levy", amountKobo: 1_000_000, deadline: "2026-11-01", allowInstalments: true });
  for (const due of dues) {
    state = step(state, { type: "save_due", spaceId, due });
    state = step(state, { type: "publish_due", spaceId, dueId: state.dues.at(-1).id });
  }
  return { state, spaceId, dueId: state.dues[0].id };
}
let student = 0;
const pay = (state, spaceId, dueId, amountKobo) => step(state, { type: "collect", event: {
  eventId: `e-${++seq}`, paymentId: `p-${seq}`, reference: `DL${seq}`, spaceId, studentId: cohort(spaceId)[student++ % 200].id, confirmedAt: new Date(T).toISOString(),
  faceAmountKobo: amountKobo, studentFeeKobo: studentFeeKobo(amountKobo), lines: [{ dueId, amountKobo }] } });
const payMany = (state, spaceId, dueId, count, amountKobo = DUE) => { for (let i = 0; i < count; i++) state = pay(state, spaceId, dueId, amountKobo); return state; };
const withKyc = (state, kycStatus) => ({ ...state, users: state.users.map(user => user.id === "zainab" ? { ...user, kycStatus } : user) });

test("advance eligibility needs payment history and collected share; the offer is 80% of eligible outstanding, floored to naira", () => {
  student = 0;
  let { state, spaceId, dueId } = space({ overdue: true });
  assert.throws(() => step(state, { type: "take_advance", spaceId, amountKobo: 10_000 }), /at least 20 confirmed payments; this space has 0/);
  state = payMany(state, spaceId, dueId, 19);
  assert.match(advanceOffer(state, spaceId, T).reasons.join(), /this space has 19/);
  // 20 payments of a fifth each: history is there but only 2% of the expected dues is collected.
  let thin = space();
  thin.state = payMany(thin.state, thin.spaceId, thin.dueId, 20, DUE / 5);
  assert.deepEqual(advanceOffer(thin.state, thin.spaceId, T).reasons, ["Needs at least 10% of expected dues collected; this space has 2%."]);
  // Exactly 10% with 20 payments is eligible.
  let edge = space();
  edge.state = payMany(edge.state, edge.spaceId, edge.dueId, 20);
  assert.equal(advanceOffer(edge.state, edge.spaceId, T).eligible, true);
  // Overdue dues are not eligible; odd kobo outstanding floors the cap to whole naira.
  edge.state = pay(edge.state, edge.spaceId, edge.dueId, 12_345);
  const offer = advanceOffer(edge.state, edge.spaceId, T);
  assert.equal(offer.expectedKobo, 50_000_000 - 20 * DUE - 12_345);
  assert.equal(offer.capKobo, 35_990_100, "80% of 44,987,655 kobo is 35,990,124; floored to ₦359,901");
  const withOverdue = space({ overdue: true });
  withOverdue.state = payMany(withOverdue.state, withOverdue.spaceId, withOverdue.dueId, 60);
  assert.equal(advanceOffer(withOverdue.state, withOverdue.spaceId, T).expectedKobo, 50_000_000 - 60 * DUE, "overdue levy excluded");
  assert.throws(() => step(edge.state, { type: "take_advance", spaceId: edge.spaceId, amountKobo: offer.capKobo + 1 }), /above this space's advance limit/);
  assert.throws(() => step(edge.state, { type: "take_advance", spaceId: edge.spaceId, amountKobo: 99 }), /at least ₦1/);
  assert.throws(() => step(edge.state, { type: "take_advance", spaceId: edge.spaceId, amountKobo: 1.5 }), /at least ₦1/);
  const taken = step(edge.state, { type: "take_advance", spaceId: edge.spaceId, amountKobo: offer.capKobo });
  assert.equal(taken.advances[0].principalKobo, 35_990_100);
  assert.equal(taken.audit.at(-1).action, "take_advance");
});

test("advances are KYC- and owner-gated", () => {
  student = 0;
  let { state, spaceId, dueId } = space();
  state = payMany(state, spaceId, dueId, 20);
  for (const kyc of ["pending", "failed", "not_started"]) assert.throws(() => step(withKyc(state, kyc), { type: "take_advance", spaceId, amountKobo: 100_000 }), /verified owner/);
  state = step(state, { type: "invite", spaceId, email: "ada@demo.duelite.test", role: "treasurer" });
  state = step(as(state, "ada"), { type: "accept_invite", inviteId: state.invites[0].id });
  assert.throws(() => step(state, { type: "take_advance", spaceId, amountKobo: 100_000 }), /verified owner/);
  assert.throws(() => step(as(state, "tunde"), { type: "take_advance", spaceId, amountKobo: 100_000 }), /verified owner/);
});

test("repayment comes only from later collections and never exceeds the debt or any collection", () => {
  student = 0;
  let { state, spaceId, dueId } = space();
  state = payMany(state, spaceId, dueId, 20);
  const before = balances(state, spaceId, T).availableKobo;
  state = step(state, { type: "take_advance", spaceId, amountKobo: 1_000_000 });
  assert.equal(balances(state, spaceId, T).availableKobo, before + 1_000_000, "advance is credited to the space balance");
  assert.equal(advanceStatus(state, state.advances[0]).repaidKobo, 0, "earlier collections do not repay");
  assert.throws(() => step(state, { type: "take_advance", spaceId, amountKobo: 100_000 }), /repaid first/);
  state = pay(state, spaceId, dueId, 12_345); // odd amount: 6,172 deducted
  state = payMany(state, spaceId, dueId, 8);
  const status = advanceStatus(state, state.advances[0]);
  assert.equal(status.repaid, true);
  assert.equal(status.repaidKobo, 1_000_000);
  assert.equal(status.owedKobo, 0);
  assert.equal(status.deductions[0].deductedKobo, 6_172);
  assert.equal(status.deductions.at(-1).deductedKobo, 1_000_000 - 6_172 - 7 * 125_000, "last deduction is capped by the remaining debt");
  assert.ok(status.deductions.every(item => item.deductedKobo > 0 && item.deductedKobo <= item.collectedKobo / 2));
  // Further collections are untouched once repaid; the ledger reconciles exactly.
  const collected = 20 * DUE + 12_345 + 8 * DUE;
  assert.equal(balances(state, spaceId, T).availableKobo, collected + 1_000_000 - 1_000_000);
  assert.equal(advanceOffer(state, spaceId, T).eligible, true, "a repaid advance allows a new one");
  const second = step(state, { type: "take_advance", spaceId, amountKobo: 100_000 });
  assert.equal(advanceStatus(second, second.advances[1]).repaidKobo, 0, "the second advance starts from its own later collections");
});

/** Space with lots collected, Ada as treasurer signatory. */
function ready() {
  student = 0;
  let { state, spaceId, dueId } = space();
  state = payMany(state, spaceId, dueId, 150);
  state = step(state, { type: "invite", spaceId, email: "ada@demo.duelite.test", role: "treasurer" });
  state = step(as(state, "ada"), { type: "accept_invite", inviteId: state.invites[0].id });
  state = step(as(state, "zainab"), { type: "set_signatories", spaceId, secondId: "ada" });
  return { state, spaceId };
}
async function settle(state, spaceId, order, { destinationId = order.vendorId, amountKobo = order.totalKobo } = {}) {
  const id = `wd-${++seq}`;
  const codeHashes = { zainab: await hashCode(id, "zainab", "11111"), ada: await hashCode(id, "ada", "22222") };
  return { id, state: step(as(state, "zainab"), { type: "request_withdrawal", spaceId, destinationId, purpose: "Vendor order", amountKobo, orderId: order.id, codeHashes, expiresAt: T + CODE_TTL_MS }, T, id) };
}
const signBoth = async (state, id) => {
  for (const [userId, code] of [["zainab", "11111"], ["ada", "22222"]]) state = step(as(state, userId), { type: "sign_withdrawal", withdrawalId: id, codeHash: await hashCode(id, userId, code) });
  return state;
};

test("attaching a vendor item creates a discounted draft due; unverified reps can attach but not publish or pay", () => {
  let state = step(as(seedDemo(), "tunde"), { type: "create_space", name: "Engineering" });
  const spaceId = state.spaces[0].id;
  state = step(state, { type: "attach_vendor_item", spaceId, productId: "yph-lab-manual", quantity: 200, deadline: "2026-12-01" });
  const [order] = state.orders;
  const due = state.dues.find(item => item.id === order.dueId);
  assert.deepEqual([due.status, due.amountKobo, due.type, due.allowInstalments, order.totalKobo, order.vendorId], ["draft", 200_000, "lab_manual", false, 40_000_000, "vendor-yaba-print"]);
  assert.throws(() => step(state, { type: "publish_due", spaceId, dueId: due.id }), /verified KYC/);
  assert.throws(() => step(state, { type: "save_due", spaceId, dueId: due.id, due: { ...due, amountKobo: 1 } }), /catalogue price/);
  for (const quantity of [0, 1001, 2.5]) assert.throws(() => step(state, { type: "attach_vendor_item", spaceId, productId: "ct-tee", quantity, deadline: "2026-12-01" }), /between 1 and 1000/);
  assert.throws(() => step(state, { type: "attach_vendor_item", spaceId, productId: "nope", quantity: 1, deadline: "2026-12-01" }), /approved vendor/);
  assert.throws(() => step(state, { type: "attach_vendor_item", spaceId, productId: "ct-tee", quantity: 1, deadline: "2026-02-30" }), /valid deadline/);
  assert.throws(() => step(as(state, "ada"), { type: "attach_vendor_item", spaceId, productId: "ct-tee", quantity: 1, deadline: "2026-12-01" }), /cannot add dues/);
  return settle(state, spaceId, order).then(() => assert.fail("unverified owner paid a vendor"), error => assert.match(error.message, /verified owner/));
});

test("vendor settlement uses withdrawal protections and pays each order exactly once", async () => {
  let { state, spaceId } = ready();
  state = step(state, { type: "attach_vendor_item", spaceId, productId: "yph-handout", quantity: 40, deadline: "2026-12-01" });
  const order = state.orders[0];
  await assert.rejects(settle(state, spaceId, order, { amountKobo: order.totalKobo - 1 }), /equal the order total/);
  await assert.rejects(settle(state, spaceId, order, { destinationId: "seed-zainab-gtbank" }), /only to that vendor/);
  await assert.rejects(settle(state, spaceId, order, { destinationId: "vendor-campus-threads" }), /only to that vendor/);
  let first = await settle(state, spaceId, order);
  state = first.state;
  const payout = state.withdrawals[0];
  assert.deepEqual([payout.status, payout.orderId, payout.destinationId, payout.feeKobo], ["awaiting_signatories", order.id, "vendor-yaba-print", 100_00]);
  assert.equal(balances(state, spaceId, T).reservedKobo, order.totalKobo + 100_00);
  await assert.rejects(settle(state, spaceId, order), /already paid or has a payment in progress/);
  // One signature never pays the vendor; the rail failing releases the order for a retry.
  state = await signBoth(state, first.id);
  assert.equal(state.withdrawals[0].status, "processing");
  await assert.rejects(settle(state, spaceId, order), /in progress/);
  state = step(state, { type: "settle_withdrawal", withdrawalId: first.id, outcome: "failed" });
  assert.equal(orderSettlement(state, order.id).status, "unpaid");
  const retry = await settle(state, spaceId, order);
  state = await signBoth(retry.state, retry.id);
  state = step(state, { type: "settle_withdrawal", withdrawalId: retry.id, outcome: "succeeded" });
  const replayed = step(state, { type: "settle_withdrawal", withdrawalId: retry.id, outcome: "succeeded" });
  assert.equal(replayed, state, "a repeated rail callback changes nothing");
  assert.equal(orderSettlement(state, order.id).status, "settled");
  assert.equal(balances(state, spaceId, T).withdrawnKobo, order.totalKobo + 100_00);
  await assert.rejects(settle(state, spaceId, order), /already paid/);
  // A large vendor order is still paused by anomaly review despite valid codes.
  state = step(state, { type: "attach_vendor_item", spaceId, productId: "ct-polo", quantity: 30, deadline: "2026-12-01" });
  const big = await settle(state, spaceId, state.orders[1]);
  state = await signBoth(big.state, big.id);
  assert.equal(state.withdrawals.at(-1).status, "pending_review");
  assert.match(state.withdrawals.at(-1).flagReasons.join(), /Unusually large/);
});

test("advances, orders and vendor settlements persist in v6; tampered records do not restore", async () => {
  let { state, spaceId } = ready();
  state = step(state, { type: "take_advance", spaceId, amountKobo: 500_000 });
  state = step(state, { type: "attach_vendor_item", spaceId, productId: "ct-tee", quantity: 10, deadline: "2026-12-01" });
  const { state: saved, id } = await settle(state, spaceId, state.orders[0]);
  assert.deepEqual(restoreDemo(JSON.stringify(saved)), saved);
  const tweak = (key, index, patch) => JSON.stringify({ ...saved, [key]: saved[key].map((item, at) => at === index ? { ...item, ...patch } : item) });
  for (const raw of [
    tweak("orders", 0, { unitKobo: 1, totalKobo: 10 }),
    tweak("orders", 0, { vendorId: "vendor-yaba-print" }),
    tweak("orders", 0, { quantity: 0, totalKobo: 0 }),
    tweak("advances", 0, { principalKobo: saved.advances[0].offerKobo + 100 }),
    tweak("advances", 0, { requestedBy: "ada" }),
    JSON.stringify({ ...saved, advances: [saved.advances[0], { ...saved.advances[0], id: "second" }] }),
    tweak("withdrawals", 0, { destinationId: "seed-zainab-gtbank" }),
    tweak("withdrawals", 0, { orderId: "missing" }),
    JSON.stringify({ ...saved, withdrawals: [...saved.withdrawals, { ...saved.withdrawals[0], id: "dup", reference: "WD-DUP" }], approvals: [...saved.approvals, ...saved.approvals.filter(a => a.withdrawalId === id).map(a => ({ ...a, withdrawalId: "dup" }))] }),
    JSON.stringify({ ...saved, version: 5 }),
  ]) assert.equal(restoreDemo(raw), null);
});
