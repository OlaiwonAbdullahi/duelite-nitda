import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import ts from "typescript";

// Compile pure TS modules in memory: no test framework or generated repository files.
function loadModule(path) {
  const source = fs.readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
  });
  const compiled = { exports: {} };
  new Function("module", "exports", outputText)(compiled, compiled.exports);
  return compiled.exports;
}
const money = loadModule("../lib/rep/money.ts");
const policy = loadModule("../lib/rep/permissions.ts");
const owner = { id: "rep", schoolId: "school", isRep: true, approvalStatus: "approved", kycStatus: "verified" };
const space = { id: "space", schoolId: "school", ownerId: "rep", status: "active" };
const member = { userId: "rep", spaceId: "space", role: "owner", status: "active", isSignatory: true };
const can = (action, actor = owner, membership = member, currentSpace = space, currentOwner = owner) =>
  policy.canActInSpace(actor, currentOwner, currentSpace, membership, action);

test("PDF fee examples and exact threshold/cap boundaries", () => {
  assert.equal(money.studentFeeKobo(500_000), 10_000);
  assert.equal(money.studentFeeKobo(1_250_000), 25_000);
  assert.equal(money.studentFeeKobo(2_000_000), 25_000);
  assert.equal(money.studentFeeKobo(24), 0);
  assert.equal(money.studentFeeKobo(25), 1);
  assert.equal(money.withdrawalFeeKobo(5_000_000), 10_000);
  assert.equal(money.withdrawalFeeKobo(5_000_001), 20_000);
});
test("invalid or overflowing money cannot produce a quote", () => {
  for (const value of [0, -1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => money.withdrawalQuote(value), RangeError);
    assert.throws(() => money.studentFeeKobo(value), RangeError);
  }
  assert.throws(() => money.withdrawalQuote(Number.MAX_SAFE_INTEGER), RangeError);
});
test("fees, reserved daily principal and rail limits block overspending", () => {
  assert.equal(money.checkWithdrawalFunds(500_000, 500_000, 0), "insufficient_balance");
  assert.equal(money.checkWithdrawalFunds(500_000, 510_000, 0), null);
  assert.equal(money.checkWithdrawalFunds(250_000_001, 300_000_000, 0), "single_limit");
  assert.equal(money.checkWithdrawalFunds(250_000_000, 300_000_000, 750_000_000), null);
  assert.equal(money.checkWithdrawalFunds(250_000_000, 300_000_000, 750_000_001), "daily_limit");
});
test("approval and KYC are independent gates; unverified approved reps can draft", () => {
  for (const approvalStatus of ["not_applied", "pending", "rejected"]) {
    assert.equal(policy.canCreateSpace({ ...owner, approvalStatus }), false);
  }
  assert.equal(policy.canCreateSpace({ ...owner, isRep: false }), false);
  for (const kycStatus of ["not_started", "pending", "failed"]) {
    const unverified = { ...owner, kycStatus };
    assert.equal(policy.canCreateSpace(unverified), true);
    assert.equal(can("manage_dues", unverified, member, space, unverified), true);
    assert.equal(can("publish_dues", unverified, member, space, unverified), false);
    assert.equal(can("request_withdrawal", unverified, member, space, unverified), false);
  }
});
test("cross-space, cross-school, revoked and forged owner access fail closed", () => {
  assert.equal(can("view_reports", owner, { ...member, spaceId: "another" }), false);
  assert.equal(can("view_reports", { ...owner, schoolId: "another" }), false);
  assert.equal(can("view_reports", owner, { ...member, status: "revoked" }), false);
  assert.equal(can("view_reports", owner, { ...member, userId: "another" }), false);
  assert.equal(can("manage_team", { ...owner, id: "impostor" }, { ...member, userId: "impostor" }), false);
});
test("co-rep roles restrict money actions and require signatory designation", () => {
  const actor = { ...owner, id: "co-rep", isRep: false, kycStatus: "not_started" };
  const treasurer = { ...member, userId: actor.id, role: "treasurer" };
  assert.equal(can("approve_withdrawal", actor, treasurer), true);
  assert.equal(can("approve_withdrawal", actor, { ...treasurer, isSignatory: false }), false);
  assert.equal(can("request_withdrawal", actor, treasurer), false);
  assert.equal(can("approve_withdrawal", actor, { ...treasurer, role: "pro" }), false);
  assert.equal(can("post_announcement", actor, { ...treasurer, role: "pro" }), true);
  assert.equal(can("manage_dues", actor, { ...treasurer, role: "student" }), false);
});
test("inactive spaces retain reports but block mutations", () => {
  for (const status of ["suspended", "archived"]) {
    assert.equal(can("view_reports", owner, member, { ...space, status }), true);
    assert.equal(can("request_withdrawal", owner, member, { ...space, status }), false);
    assert.equal(can("manage_dues", owner, member, { ...space, status }), false);
  }
});
