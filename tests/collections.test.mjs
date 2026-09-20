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
const { cohort, COHORT_SIZE, nextCollection, spaceTotals, dueProgress, paymentRows, outstandingRows, BURST_SIZE, TRICKLE_MS, LINK_DELAY_MS, RECONNECT_MS } = loadModule("lib/demo/collections.ts");
const { studentFeeKobo } = loadModule("lib/rep/money.ts");

let seq = 0;
const step = (state, action, now = 1000) => transition(state, action, now, `op-${++seq}`);
const select = (state, userId) => step(state, { type: "select", userId });
const instalment = { title: "Departmental due", type: "departmental_due", amountKobo: 250000, deadline: "2026-12-01", allowInstalments: true };
const single = { title: "Exam levy", type: "exam_levy", amountKobo: 100000, deadline: "2026-12-01", allowInstalments: false };

/** Verified owner with one published instalment due (and optionally a published single-payment due). */
function collecting(dues = [instalment], name = "Computer Science") {
  let state = step(select(seedDemo(), "zainab"), { type: "create_space", name });
  const spaceId = state.spaces.at(-1).id;
  for (const due of dues) {
    state = step(state, { type: "save_due", spaceId, due });
    state = step(state, { type: "publish_due", spaceId, dueId: state.dues.at(-1).id });
  }
  return { state, spaceId };
}
const event = (spaceId, over = {}) => {
  const base = { eventId: `e-${++seq}`, paymentId: `p-${seq}`, reference: `DL${seq}`, spaceId, studentId: cohort(spaceId)[0].id, confirmedAt: new Date(1000).toISOString(), faceAmountKobo: 250000, studentFeeKobo: 5000, lines: [] };
  const merged = { ...base, ...over };
  if (!merged.lines.length) merged.lines = [{ dueId: over.dueId, amountKobo: merged.faceAmountKobo }];
  delete merged.dueId;
  return merged;
};

test("the space is credited the face amount only; the student fee and expected/outstanding stay separate", () => {
  const { state, spaceId } = collecting();
  const dueId = state.dues[0].id;
  assert.equal(cohort(spaceId).length, COHORT_SIZE);
  assert.equal(new Set(cohort(spaceId).map(student => student.id)).size, COHORT_SIZE);
  assert.deepEqual(cohort(spaceId), cohort(spaceId));
  const next = step(state, { type: "collect", event: event(spaceId, { dueId }) });
  const totals = spaceTotals(next, spaceId);
  assert.equal(totals.collectedKobo, 250000);
  assert.equal(totals.studentFeesKobo, studentFeeKobo(250000));
  assert.equal(totals.expectedKobo, 250000 * COHORT_SIZE);
  assert.equal(totals.outstandingKobo, 250000 * COHORT_SIZE - 250000);
  assert.equal(totals.payerCount, 1);
  assert.equal(dueProgress(next, spaceId)[0].settled, 1);
  assert.equal(next.audit.at(-1).actorId, "demo-rail");
  const capped = collecting([{ ...instalment, amountKobo: 5_000_000 }]);
  const big = step(capped.state, { type: "collect", event: event(capped.spaceId, { dueId: capped.state.dues[0].id, faceAmountKobo: 5_000_000, studentFeeKobo: 25_000 }) });
  assert.equal(spaceTotals(big, capped.spaceId).collectedKobo, 5_000_000);
  assert.throws(() => step(capped.state, { type: "collect", event: event(capped.spaceId, { dueId: capped.state.dues[0].id, faceAmountKobo: 5_000_000, studentFeeKobo: 100_000 }) }), /Student fee/);
});

test("replayed events and reused payment ids never double-count", () => {
  const { state, spaceId } = collecting();
  const first = event(spaceId, { dueId: state.dues[0].id, faceAmountKobo: 100000, studentFeeKobo: 2000 });
  const once = step(state, { type: "collect", event: first });
  assert.equal(step(once, { type: "collect", event: first }), once);
  assert.equal(step(once, { type: "collect", event: { ...first, eventId: "fresh" } }), once);
  assert.equal(step(once, { type: "collect", event: { ...first, paymentId: "fresh" } }), once);
  assert.equal(once.collections.length, 1);
  assert.equal(once.audit.filter(entry => entry.action === "collect").length, 1);
  assert.equal(spaceTotals(once, spaceId).collectedKobo, 100000);
  const twice = step(once, { type: "collect", event: event(spaceId, { dueId: state.dues[0].id, faceAmountKobo: 150000, studentFeeKobo: 3000 }) });
  assert.equal(spaceTotals(twice, spaceId).collectedKobo, 250000);
  assert.equal(spaceTotals(twice, spaceId).paymentCount, 2);
  assert.equal(spaceTotals(twice, spaceId).payerCount, 1);
});

test("partial payments settle progressively; overpayment, non-instalment parts and invalid lines are rejected", () => {
  const { state, spaceId } = collecting([instalment, single]);
  const [part, full] = state.dues;
  const student = cohort(spaceId)[0].id;
  let next = step(state, { type: "collect", event: event(spaceId, { dueId: part.id, faceAmountKobo: 100000, studentFeeKobo: 2000 }) });
  let rows = outstandingRows(next, spaceId, { dueId: part.id });
  assert.equal(rows.find(row => row.student.id === student).remainingKobo, 150000);
  assert.equal(dueProgress(next, spaceId)[0].partial, 1);
  assert.throws(() => step(next, { type: "collect", event: event(spaceId, { dueId: part.id, faceAmountKobo: 150001, studentFeeKobo: studentFeeKobo(150001) }) }), /outstanding balance/);
  next = step(next, { type: "collect", event: event(spaceId, { dueId: part.id, faceAmountKobo: 150000, studentFeeKobo: 3000 }) });
  assert.equal(outstandingRows(next, spaceId, { dueId: part.id }).some(row => row.student.id === student), false);
  assert.throws(() => step(next, { type: "collect", event: event(spaceId, { dueId: full.id, faceAmountKobo: 50000, studentFeeKobo: 1000 }) }), /instalments/);
  next = step(next, { type: "collect", event: event(spaceId, { dueId: full.id, faceAmountKobo: 100000, studentFeeKobo: 2000 }) });
  assert.equal(spaceTotals(next, spaceId).collectedKobo, 350000);
  assert.throws(() => step(state, { type: "collect", event: event(spaceId, { dueId: part.id, faceAmountKobo: 0, studentFeeKobo: 0 }) }));
  assert.throws(() => step(state, { type: "collect", event: event(spaceId, { dueId: part.id, lines: [{ dueId: part.id, amountKobo: 1000 }], faceAmountKobo: 2000, studentFeeKobo: 40 }) }), /sum/);
  assert.throws(() => step(state, { type: "collect", event: event(spaceId, { dueId: part.id, studentId: "stranger" }) }), /cohort/);
  assert.throws(() => step(state, { type: "collect", event: event(spaceId, { dueId: part.id, reference: " " }) }), /reference/);
  assert.throws(() => step(state, { type: "collect", event: event(spaceId, { dueId: part.id, lines: [{ dueId: part.id, amountKobo: 125000 }, { dueId: part.id, amountKobo: 125000 }] }) }), /one per due/);
  const draft = step(state, { type: "save_due", spaceId, due: { ...single, title: "Draft levy" } });
  assert.throws(() => step(draft, { type: "collect", event: event(spaceId, { dueId: draft.dues.at(-1).id, faceAmountKobo: 100000, studentFeeKobo: 2000 }) }), /published dues/);
});

test("collections stay inside their own space and are hidden from unverified or inactive owners", () => {
  const first = collecting();
  let state = step(first.state, { type: "create_space", name: "Engineering" });
  const other = state.spaces.at(-1).id;
  state = step(state, { type: "save_due", spaceId: other, due: single });
  state = step(state, { type: "publish_due", spaceId: other, dueId: state.dues.at(-1).id });
  state = step(state, { type: "collect", event: event(first.spaceId, { dueId: state.dues[0].id, faceAmountKobo: 250000, studentFeeKobo: 5000 }) });
  assert.equal(spaceTotals(state, first.spaceId).collectedKobo, 250000);
  assert.equal(spaceTotals(state, other).collectedKobo, 0);
  assert.equal(spaceTotals(state, other).paymentCount, 0);
  assert.equal(paymentRows(state, other).length, 0);
  assert.equal(outstandingRows(state, other).length, COHORT_SIZE);
  assert.throws(() => step(state, { type: "collect", event: event(other, { dueId: state.dues[0].id, studentId: cohort(first.spaceId)[0].id, faceAmountKobo: 250000, studentFeeKobo: 5000 }) }), /cohort/);
  assert.throws(() => step(state, { type: "collect", event: event(other, { dueId: state.dues[0].id, studentId: cohort(other)[0].id, faceAmountKobo: 250000, studentFeeKobo: 5000 }) }), /published dues/);
  const unverified = step(select(seedDemo(), "tunde"), { type: "create_space", name: "Business" });
  assert.throws(() => step(unverified, { type: "collect", event: event(unverified.spaces[0].id, { dueId: "none" }) }), /cannot receive collections/);
});

test("payer and outstanding views filter by due and student, and paid dues can no longer be edited", () => {
  const { state, spaceId } = collecting([instalment, single]);
  const [part, full] = state.dues;
  const payer = cohort(spaceId)[0];
  let next = step(state, { type: "collect", event: event(spaceId, { dueId: part.id, studentId: payer.id, faceAmountKobo: 250000, studentFeeKobo: 5000 }) });
  next = step(next, { type: "collect", event: event(spaceId, { dueId: full.id, studentId: cohort(spaceId)[1].id, faceAmountKobo: 100000, studentFeeKobo: 2000 }) });
  assert.equal(paymentRows(next, spaceId).length, 2);
  assert.equal(paymentRows(next, spaceId)[0].dueId, full.id);
  assert.equal(paymentRows(next, spaceId, { dueId: part.id }).length, 1);
  assert.equal(paymentRows(next, spaceId, { query: payer.name }).every(row => row.studentName === payer.name), true);
  assert.equal(paymentRows(next, spaceId, { query: "no-such-student" }).length, 0);
  assert.equal(outstandingRows(next, spaceId).length, COHORT_SIZE * 2 - 2);
  assert.equal(outstandingRows(next, spaceId, { dueId: part.id, query: payer.matric }).length, 0);
  assert.throws(() => step(next, { type: "save_due", spaceId, dueId: part.id, due: { ...instalment, amountKobo: 1 } }), /confirmed payments/);
  step(next, { type: "save_due", spaceId, due: { ...single, title: "A new draft" } });
});

test("refreshing keeps confirmed totals; tampered or duplicated ledgers are rejected on restore", () => {
  const { state, spaceId } = collecting();
  const saved = step(state, { type: "collect", event: event(spaceId, { dueId: state.dues[0].id, faceAmountKobo: 250000, studentFeeKobo: 5000 }) });
  assert.deepEqual(restoreDemo(JSON.stringify(saved)), saved);
  const tamper = changes => { const copy = structuredClone(saved); changes(copy); return JSON.stringify(copy); };
  assert.equal(restoreDemo(tamper(copy => { copy.collections[0].lines[0].amountKobo = 250001; })), null);
  assert.equal(restoreDemo(tamper(copy => { copy.collections[0].studentFeeKobo = 1; })), null);
  assert.equal(restoreDemo(tamper(copy => { copy.collections.push(copy.collections[0]); })), null);
  assert.equal(restoreDemo(tamper(copy => { copy.collections[0].studentId = "outsider"; })), null);
  assert.equal(restoreDemo(tamper(copy => { copy.collections[0].spaceId = "missing"; })), null);
  assert.equal(restoreDemo(tamper(copy => { copy.collections[0].note = "extra"; })), null);
  assert.equal(restoreDemo(JSON.stringify({ ...saved, version: 2 })), null);
  let value = null;
  const storage = { getItem: key => (key === STORAGE_KEY ? value : null), setItem: (key, data) => { value = data; } };
  const store = createDemoStore();
  store.start(storage);
  store.dispatch({ type: "select", userId: "zainab" });
  store.dispatch({ type: "create_space", name: "Computer Science" });
  const liveSpace = store.getSnapshot().state.spaces[0].id;
  store.dispatch({ type: "save_due", spaceId: liveSpace, due: instalment });
  store.dispatch({ type: "publish_due", spaceId: liveSpace, dueId: store.getSnapshot().state.dues[0].id });
  store.dispatch({ type: "collect", event: nextCollection(store.getSnapshot().state, liveSpace, Date.now()) });
  const before = spaceTotals(store.getSnapshot().state, liveSpace).collectedKobo;
  store.stop();
  const reloaded = createDemoStore();
  reloaded.start(storage);
  assert.equal(spaceTotals(reloaded.getSnapshot().state, liveSpace).collectedKobo, before);
  reloaded.reset();
  assert.deepEqual(reloaded.getSnapshot().state.collections, []);
  reloaded.stop();
});

test("the simulated rail connects, trickles, bursts, drops, errors and cleans up its timers", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const store = createDemoStore();
  store.start();
  store.dispatch({ type: "select", userId: "zainab" });
  store.dispatch({ type: "create_space", name: "Computer Science" });
  const spaceId = store.getSnapshot().state.spaces[0].id;
  store.dispatch({ type: "save_due", spaceId, due: instalment });
  store.dispatch({ type: "publish_due", spaceId, dueId: store.getSnapshot().state.dues[0].id });
  const count = () => store.getSnapshot().state.collections.length;

  assert.equal(store.getSnapshot().feed.status, "offline");
  store.setTrickle(true);
  assert.equal(store.getSnapshot().feed.trickle, false, "trickle needs a live connection");
  store.connectFeed();
  assert.equal(store.getSnapshot().feed.status, "connecting");
  t.mock.timers.tick(LINK_DELAY_MS);
  assert.equal(store.getSnapshot().feed.status, "live");
  assert.equal(count(), 0);

  store.setTrickle(true);
  for (let index = 0; index < 3; index++) t.mock.timers.tick(TRICKLE_MS);
  assert.equal(count(), 3);
  store.simulateDrop();
  assert.equal(store.getSnapshot().feed.status, "reconnecting");
  t.mock.timers.tick(TRICKLE_MS);
  assert.equal(count(), 3, "a dropped connection delivers nothing");
  t.mock.timers.tick(RECONNECT_MS);
  assert.equal(store.getSnapshot().feed.status, "live");
  t.mock.timers.tick(TRICKLE_MS);
  assert.equal(count(), 4, "reconnecting resumes the trickle");

  store.setTrickle(false);
  t.mock.timers.tick(TRICKLE_MS * 5);
  assert.equal(count(), 4);
  store.burst();
  assert.equal(count(), 4 + BURST_SIZE);
  const totalBefore = spaceTotals(store.getSnapshot().state, spaceId).collectedKobo;
  store.replayLast();
  assert.equal(count(), 4 + BURST_SIZE);
  assert.equal(spaceTotals(store.getSnapshot().state, spaceId).collectedKobo, totalBefore);
  assert.match(store.getSnapshot().feed.message, /no total changed/);

  store.simulateError();
  assert.equal(store.getSnapshot().feed.status, "error");
  store.burst();
  t.mock.timers.tick(TRICKLE_MS * 5);
  assert.equal(count(), 4 + BURST_SIZE, "an errored rail delivers nothing");
  store.connectFeed();
  t.mock.timers.tick(LINK_DELAY_MS);
  store.setTrickle(true);
  store.disconnectFeed();
  t.mock.timers.tick(TRICKLE_MS * 5);
  assert.equal(count(), 4 + BURST_SIZE, "disconnecting stops the trickle");
  store.connectFeed();
  t.mock.timers.tick(LINK_DELAY_MS);
  store.setTrickle(true);
  store.stop();
  t.mock.timers.tick(TRICKLE_MS * 5);
  assert.equal(count(), 4 + BURST_SIZE, "stop clears every feed timer");
});
