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
const { createDemoStore, restoreDemo, stageDemo, STAGE_PAYMENTS } = loadModule("lib/demo/store.ts");
const { dueProgress, spaceTotals, LINK_DELAY_MS, TRICKLE_MS } = loadModule("lib/demo/collections.ts");
const { generateDrafts, nudgeTargets, GENERATION_DELAY_MS } = loadModule("lib/demo/nudges.ts");
const { advanceOffer } = loadModule("lib/demo/advance.ts");
const { balances, PAYOUT_DELAY_MS } = loadModule("lib/demo/withdrawals.ts");

// 2026-11-20 11:00 Lagos: daytime, so the odd-hour review rule stays quiet.
const T = Date.parse("2026-11-20T10:00:00Z");
const OPEN = ["pending_review", "awaiting_signatories", "processing"];

/** Recompute the space ledger from raw rows, independently of `balances`, and check every money row is audited. */
function reconcile(state, spaceId) {
  const sum = (rows, pick) => rows.reduce((total, row) => total + pick(row), 0);
  const events = state.collections.filter(event => event.spaceId === spaceId);
  const mine = state.withdrawals.filter(item => item.spaceId === spaceId);
  const collected = sum(events, event => event.faceAmountKobo);
  assert.equal(collected, sum(events.flatMap(event => event.lines), line => line.amountKobo), "payment lines add up to face value");
  assert.equal(spaceTotals(state, spaceId).collectedKobo, collected);
  assert.equal(sum(dueProgress(state, spaceId), due => due.collectedKobo), collected, "per-due breakdown matches the total");
  const b = balances(state, spaceId, T);
  const debit = statuses => sum(mine.filter(item => statuses.includes(item.status)), item => item.amountKobo + item.feeKobo);
  assert.equal(b.availableKobo, collected + b.advancedKobo - b.repaidKobo - debit(["succeeded"]) - debit(OPEN));
  assert.ok(b.availableKobo >= 0 && b.repaidKobo <= b.advancedKobo);
  const audited = new Set(state.audit.map(entry => entry.targetId));
  for (const id of [...events.map(event => event.eventId), ...mine.map(item => item.id), ...state.advances.map(item => item.id), ...state.orders.map(item => item.id)]) assert.ok(audited.has(id), `${id} is audited`);
  return b;
}

test("stage seed is deterministic, valid on restore and ready for the script", () => {
  const a = stageDemo(T), b = stageDemo(T);
  assert.deepEqual(a, b, "same clock, same world");
  assert.ok(restoreDemo(JSON.stringify(a)), "stage state passes the strict restore validator");
  const spaceId = a.spaces[0].id;
  assert.equal(a.selectedId, "zainab");
  assert.equal(a.collections.length, STAGE_PAYMENTS);
  assert.ok(a.collections.every(event => Date.parse(event.confirmedAt) < T), "history is in the past");
  assert.deepEqual(a.members.filter(member => member.isSignatory).map(member => member.userId).sort(), ["ada", "zainab"]);
  assert.ok(nudgeTargets(a, spaceId, T).length > 50, "defaulters remain to nudge");
  assert.ok(advanceOffer(a, spaceId, T).eligible);
  reconcile(a, spaceId);
});

test("rehearsal: levy → burst → Pidgin nudge → anomaly block → wrong code → safe payout → advance + vendor, then reset clears every timer", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: T });
  let saved = null;
  const store = createDemoStore();
  store.start({ getItem: () => saved, setItem: (_, value) => { saved = value; } });
  store.loadStage();
  const state = () => store.getSnapshot().state;
  const spaceId = state().selectedSpaceId;

  // 1. Create a levy with instalments.
  store.dispatch({ type: "save_due", spaceId, due: { title: "Exam levy", type: "exam_levy", amountKobo: 200_000, deadline: "2026-12-10", allowInstalments: true } });
  store.dispatch({ type: "publish_due", spaceId, dueId: state().dues.at(-1).id });

  // 2. Live payment burst.
  store.connectFeed();
  t.mock.timers.tick(LINK_DELAY_MS);
  assert.equal(store.getSnapshot().feed.status, "live");
  store.burst();
  assert.equal(state().collections.length, STAGE_PAYMENTS + 20);

  // 3. Pidgin nudge to two defaulters.
  const owing = nudgeTargets(state(), spaceId, T).slice(0, 2).map(target => target.student.id);
  const generating = generateDrafts(state(), spaceId, owing, "pcm", { now: T });
  t.mock.timers.tick(GENERATION_DELAY_MS);
  const drafts = await generating;
  assert.match(drafts[0].text, /How far/);
  store.dispatch({ type: "send_nudges", spaceId, messages: drafts.map(({ studentId, language, text, suggestedAt }) => ({ studentId, language, text, suggestedAt })) });
  assert.equal(state().nudges.length, 2);

  // 4. Suspicious request to a brand-new account is paused before any money moves.
  store.dispatch({ type: "add_destination", bank: "Opay", accountNumber: "8012345678" });
  const opay = state().destinations.at(-1).id;
  await store.requestWithdrawal({ spaceId, destinationId: opay, purpose: "Venue booking", amountKobo: 45_000_000 });
  const flagged = state().withdrawals.at(-1);
  assert.equal(flagged.status, "pending_review");
  assert.ok(flagged.flagReasons.some(reason => /large/i.test(reason)) && flagged.flagReasons.some(reason => /account/i.test(reason)));

  // 5. Safe payout to the established account; a wrong code moves nothing.
  await store.requestWithdrawal({ spaceId, destinationId: "seed-zainab-gtbank", purpose: "Handout printing", amountKobo: 2_000_000 });
  const safe = state().withdrawals.at(-1);
  assert.equal(safe.status, "awaiting_signatories");
  const before = balances(state(), spaceId, T);
  const code = (id, userId) => store.getSnapshot().inbox.find(item => item.withdrawalId === id && item.userId === userId).code;
  const wrong = code(safe.id, "zainab") === "00000" ? "11111" : "00000";
  await assert.rejects(store.signWithdrawal(safe.id, wrong), /2 attempts left/);
  assert.deepEqual(balances(state(), spaceId, T), before, "wrong code moved no money");
  for (const userId of ["zainab", "ada"]) {
    store.dispatch({ type: "select", userId });
    await store.signWithdrawal(safe.id, code(safe.id, userId));
    await store.signWithdrawal(flagged.id, code(flagged.id, userId));
  }
  t.mock.timers.tick(PAYOUT_DELAY_MS);
  assert.equal(state().withdrawals.find(item => item.id === safe.id).status, "succeeded");
  assert.equal(state().withdrawals.find(item => item.id === flagged.id).status, "pending_review", "valid codes never release a flagged request");

  // 6. Optional: advance, repaid by later collections, and a vendor paid through the same two-signatory path.
  store.dispatch({ type: "select", userId: "zainab" });
  store.dispatch({ type: "take_advance", spaceId, amountKobo: 5_000_000 });
  store.burst();
  store.dispatch({ type: "attach_vendor_item", spaceId, productId: "yph-lab-manual", quantity: 10, deadline: "2026-12-10" });
  const order = state().orders.at(-1);
  await store.requestWithdrawal({ spaceId, destinationId: "vendor-yaba-print", purpose: "Lab manuals", amountKobo: order.totalKobo, orderId: order.id });
  const settlement = state().withdrawals.at(-1);
  assert.equal(settlement.orderId, order.id);
  for (const userId of ["zainab", "ada"]) {
    store.dispatch({ type: "select", userId });
    await store.signWithdrawal(settlement.id, code(settlement.id, userId));
  }
  t.mock.timers.tick(PAYOUT_DELAY_MS);
  assert.equal(state().withdrawals.find(item => item.id === settlement.id).status, "succeeded");

  const b = reconcile(state(), spaceId);
  assert.ok(b.repaidKobo > 0, "later collections repaid part of the advance");
  assert.ok(restoreDemo(saved), "the saved envelope after the whole rehearsal restores");
  assert.equal(JSON.parse(saved).collections.length, state().collections.length);

  // Reset mid-trickle with a payout in flight: no timer may fire afterwards.
  store.dispatch({ type: "select", userId: "zainab" });
  await store.requestWithdrawal({ spaceId, destinationId: "seed-zainab-gtbank", purpose: "Transport", amountKobo: 500_000 });
  const inFlight = state().withdrawals.at(-1).id;
  for (const userId of ["zainab", "ada"]) {
    store.dispatch({ type: "select", userId });
    await store.signWithdrawal(inFlight, code(inFlight, userId));
  }
  assert.equal(state().withdrawals.at(-1).status, "processing");
  store.dispatch({ type: "select", userId: "zainab" });
  store.setTrickle(true);
  store.reset();
  t.mock.timers.tick(TRICKLE_MS * 10 + PAYOUT_DELAY_MS * 10);
  assert.equal(state().collections.length, 0);
  assert.equal(store.getSnapshot().feed.status, "offline");
  assert.equal(JSON.parse(saved).spaces.length, 0);
  store.stop();
});
