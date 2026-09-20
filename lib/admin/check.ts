/* Self-check for the demo's money math. Run: npm run check:demo
 *
 * The seed is the only source of numbers in this build, so if the totals here
 * stop reconciling, every screen in Track 3 is quietly lying. */

import {
  buildSeed,
  dueBreakdown,
  spaceTotals,
  studentFee,
  withdrawalFee,
} from "./seed.ts";

import assert from "node:assert/strict";

const s = buildSeed();

// Fee model, straight from the docs.
assert.equal(studentFee(5000), 100, "2% of ₦5,000");
assert.equal(studentFee(50_000), 250, "2% capped at ₦250");
assert.equal(withdrawalFee(50_000), 100, "₦100 up to ₦50,000");
assert.equal(withdrawalFee(50_001), 200, "₦200 above ₦50,000");

// The seeded world is the size the docs promise.
assert.equal(s.schools.length, 3);
assert.equal(s.spaces.length, 3);
assert.equal(s.dues.length, 10);
assert.equal(s.withdrawals.length, 5);
assert.equal(s.refunds.length, 4);
assert.ok(s.payments.length > 300, `payments: ${s.payments.length}`);
assert.equal(
  s.users.filter((u) => u.matric.startsWith("2021/CSC")).length,
  204,
);
assert.equal(s.withdrawals.filter((w) => w.flagged).length, 1, "one suspicious request");
assert.equal(s.users.filter((u) => u.repStatus === "pending").length, 3);

for (const space of s.spaces) {
  const t = spaceTotals(s, space.id);

  // Balance is collected minus everything that actually left.
  assert.equal(t.balance, t.collected - t.withdrawn, `${space.id} balance`);

  // Only confirmed payments count, and the per-due breakdown must add up to
  // the same total the dashboard and the transparency page show.
  const byDue = dueBreakdown(s, space.id).reduce((sum, r) => sum + r.collected, 0);
  assert.equal(byDue, t.collected, `${space.id} breakdown vs total`);

  // Fees are the student's, never the space's: a due always arrives whole.
  const paid = s.payments.filter((p) => p.spaceId === space.id && p.status === "paid");
  assert.equal(
    t.fees,
    paid.reduce((sum, p) => sum + studentFee(p.total), 0),
    `${space.id} fees`,
  );
  for (const p of paid)
    assert.equal(
      p.total,
      p.lines.reduce((sum, l) => sum + l.amount, 0),
      `${p.id} lines vs total`,
    );

  assert.ok(t.payers <= space.memberIds.length, `${space.id} payers`);
  assert.ok(t.balance >= 0, `${space.id} went negative`);
}

// A refund always points at a real payment in the same space.
for (const r of s.refunds) {
  const p = s.payments.find((x) => x.id === r.paymentId);
  assert.ok(p, `${r.id} has no payment`);
  assert.equal(p.spaceId, r.spaceId, `${r.id} space mismatch`);
}

console.log(
  `ok — ${s.payments.length} payments across ${s.spaces.length} spaces reconcile`,
);
