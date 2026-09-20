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
const { nudgeTargets, generateDrafts, suggestSendTime, NUDGE_COOLDOWN_MS } = loadModule("lib/demo/nudges.ts");

// 2026-11-20 10:00 Lagos
const NOW = Date.parse("2026-11-20T09:00:00Z");
let seq = 0;
const step = (state, action, now = NOW) => transition(state, action, now, `op-${++seq}`);
const due = (title, amountKobo, deadline, allowInstalments = true) => ({ title, type: "departmental_due", amountKobo, deadline, allowInstalments });

function space(dues = [due("Departmental due", 250000, "2026-12-01"), due("Lab manual", 100000, "2026-11-21", false)], name = "Computer Science") {
  let state = step(step(seedDemo(), { type: "select", userId: "zainab" }), { type: "create_space", name });
  const spaceId = state.spaces.at(-1).id;
  for (const item of dues) {
    state = step(state, { type: "save_due", spaceId, due: item });
    state = step(state, { type: "publish_due", spaceId, dueId: state.dues.at(-1).id });
  }
  return { state, spaceId, dueIds: state.dues.filter(item => item.spaceId === spaceId).map(item => item.id) };
}
const pay = (state, spaceId, studentId, dueId, amountKobo) => step(state, { type: "collect", event: {
  eventId: `e-${++seq}`, paymentId: `p-${seq}`, reference: `DL${seq}`, spaceId, studentId, confirmedAt: new Date(NOW).toISOString(),
  faceAmountKobo: amountKobo, studentFeeKobo: studentFeeKobo(amountKobo), lines: [{ dueId, amountKobo }] } });
const send = (state, spaceId, drafts, now = NOW) => step(state, { type: "send_nudges", spaceId, messages: drafts.map(({ studentId, language, text, suggestedAt }) => ({ studentId, language, text, suggestedAt })) }, now);

test("fully paid students are excluded; partial balances and prior behaviour shape the draft", async () => {
  let { state, spaceId, dueIds } = space();
  const [paidAll, partial, paidOne, none] = cohort(spaceId);
  state = pay(state, spaceId, paidAll.id, dueIds[0], 250000);
  state = pay(state, spaceId, paidAll.id, dueIds[1], 100000);
  state = pay(state, spaceId, partial.id, dueIds[0], 100000);
  state = pay(state, spaceId, partial.id, dueIds[1], 100000);
  state = pay(state, spaceId, paidOne.id, dueIds[1], 100000);
  const targets = new Map(nudgeTargets(state, spaceId, NOW).map(target => [target.student.id, target]));
  assert.equal(targets.size, 199);
  assert.equal(targets.has(paidAll.id), false);
  assert.deepEqual([targets.get(partial.id).behaviour, targets.get(partial.id).paidKobo, targets.get(partial.id).remainingKobo], ["part_paid", 100000, 150000]);
  assert.deepEqual([targets.get(paidOne.id).behaviour, targets.get(paidOne.id).remainingKobo, targets.get(paidOne.id).dueTitles], ["paid_other", 250000, ["Departmental due"]]);
  assert.deepEqual([targets.get(none.id).behaviour, targets.get(none.id).remainingKobo, targets.get(none.id).deadline, targets.get(none.id).daysLeft], ["not_paid", 350000, "2026-11-21", 1]);
  await assert.rejects(generateDrafts(state, spaceId, [paidAll.id], "en", { now: NOW, delayMs: 0 }), /still owe/);
  const [en] = await generateDrafts(state, spaceId, [partial.id], "en", { now: NOW, delayMs: 0 });
  assert.match(en.text, new RegExp(`^Hi ${partial.name.split(" ")[0]}, thanks for the ₦1,000.00 you've already paid`));
  assert.match(en.text, /paid towards Departmental due\. ₦1,500\.00 is left for Departmental due, due by 1 December \(11 days left\).*DU\d{6}.*– Zainab, Computer Science$/);
  assert.equal(en.suggestedAt, "2026-11-20T17:00:00.000Z");
  const [pcm] = await generateDrafts(state, spaceId, [none.id], "pcm", { now: NOW, delayMs: 0 });
  assert.match(pcm.text, /^How far .*abeg no forget say ₦3,500\.00 still dey for Departmental due plus Lab manual, before 21 November \(1 day remain\)/);
  assert.equal(pcm.suggestedAt, "2026-11-21T08:00:00.000Z");
  assert.deepEqual(await generateDrafts(state, spaceId, [none.id], "pcm", { now: NOW, delayMs: 0 }), [pcm]);
});

test("send time follows deadline and behaviour in Lagos time", () => {
  assert.deepEqual(suggestSendTime({ daysLeft: -3, behaviour: "not_paid" }, NOW), { at: "2026-11-21T08:00:00.000Z", timing: "Overdue: next morning at 09:00" });
  assert.equal(suggestSendTime({ daysLeft: 10, behaviour: "not_paid" }, NOW).at, "2026-11-20T11:30:00.000Z");
  assert.equal(suggestSendTime({ daysLeft: 10, behaviour: "not_paid" }, Date.parse("2026-11-20T12:00:00Z")).at, "2026-11-21T11:30:00.000Z");
});

test("targets, drafts and sends are scoped to one space and to roles that may message", async () => {
  let { state, spaceId } = space();
  state = step(state, { type: "create_space", name: "Engineering" });
  const other = state.spaces.at(-1).id;
  const outsider = cohort(other)[0].id;
  assert.equal(nudgeTargets(state, other, NOW).length, 0);
  await assert.rejects(generateDrafts(state, spaceId, [outsider], "en", { now: NOW, delayMs: 0 }), /still owe/);
  assert.throws(() => send(state, spaceId, [{ studentId: outsider, language: "en", text: "Hi", suggestedAt: new Date(NOW).toISOString() }]), /no outstanding balance/);
  const ada = step(state, { type: "select", userId: "ada" });
  const mine = cohort(spaceId)[0].id;
  await assert.rejects(generateDrafts(ada, spaceId, [mine], "en", { now: NOW, delayMs: 0 }), /cannot message/);
  assert.throws(() => send(ada, spaceId, [{ studentId: mine, language: "en", text: "Hi", suggestedAt: new Date(NOW).toISOString() }]), /cannot message/);
});

test("generation failure creates no drafts and changes no state", async () => {
  const { state, spaceId } = space();
  const before = JSON.stringify(state);
  await assert.rejects(generateDrafts(state, spaceId, [cohort(spaceId)[0].id], "en", { now: NOW, delayMs: 0, fail: true }), /did not respond\. No drafts were created/);
  await assert.rejects(generateDrafts(state, spaceId, [], "en", { now: NOW, delayMs: 0 }), /still owe/);
  await assert.rejects(generateDrafts(state, spaceId, [cohort(spaceId)[0].id], "fr", { now: NOW, delayMs: 0 }), /English or Pidgin/);
  assert.equal(JSON.stringify(state), before);
});

test("edited drafts send once; duplicates, replays, paid students and bad text are refused", async () => {
  let { state, spaceId, dueIds } = space();
  const [first, second] = cohort(spaceId);
  const drafts = await generateDrafts(state, spaceId, [first.id, second.id], "en", { now: NOW, delayMs: 0 });
  drafts[0].text = "  Edited by the rep.  ";
  const sent = send(state, spaceId, drafts);
  assert.deepEqual(sent.nudges.map(item => [item.studentId, item.text, item.balanceKobo, item.sentBy]), [[first.id, "Edited by the rep.", 350000, "zainab"], [second.id, drafts[1].text, 350000, "zainab"]]);
  assert.equal(sent.audit.at(-1).action, "send_nudges");
  assert.throws(() => send(sent, spaceId, [drafts[0]]), /already nudged in the last 24 hours/);
  assert.equal(nudgeTargets(sent, spaceId, NOW).find(item => item.student.id === first.id).coolingDown, true);
  assert.equal(send(sent, spaceId, [drafts[0]], NOW + NUDGE_COOLDOWN_MS).nudges.length, 3);
  const id = `op-${seq + 1}`;
  const once = transition(state, { type: "send_nudges", spaceId, messages: [drafts[1]] }, NOW, id);
  assert.throws(() => transition(once, { type: "send_nudges", spaceId, messages: [drafts[1]] }, NOW, id), /already been used/);
  assert.throws(() => send(state, spaceId, [drafts[0], drafts[0]]), /one nudge per send/);
  assert.throws(() => send(state, spaceId, [{ ...drafts[0], text: "   " }]), /1–480/);
  assert.throws(() => send(state, spaceId, [{ ...drafts[0], text: "x".repeat(481) }]), /1–480/);
  assert.throws(() => send(state, spaceId, []), /at least one/);
  // Student settles between generation and send: the balance is re-checked.
  state = pay(pay(state, spaceId, first.id, dueIds[0], 250000), spaceId, first.id, dueIds[1], 100000);
  assert.throws(() => send(state, spaceId, [drafts[0]]), /no outstanding balance/);
});

test("sent nudges persist in the v5 envelope; tampered entries do not restore", async () => {
  const { state, spaceId } = space();
  const drafts = await generateDrafts(state, spaceId, [cohort(spaceId)[0].id], "pcm", { now: NOW, delayMs: 0 });
  const sent = send(state, spaceId, drafts);
  assert.deepEqual(restoreDemo(JSON.stringify(sent)), sent);
  const bad = nudge => JSON.stringify({ ...sent, nudges: [{ ...sent.nudges[0], ...nudge }] });
  for (const raw of [bad({ language: "toString" }), bad({ text: "" }), bad({ studentId: "nobody" }), bad({ balanceKobo: 0 }), bad({ phone: "08000000000" }), JSON.stringify({ ...sent, nudges: [sent.nudges[0], sent.nudges[0]] }), JSON.stringify({ ...sent, version: 4 })]) assert.equal(restoreDemo(raw), null);
});
