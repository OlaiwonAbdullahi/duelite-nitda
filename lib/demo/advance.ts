import { dueProgress, spaceTotals } from "./collections";
import { spacePermission } from "./spaces";
import type { DemoState } from "./store";

/**
 * Dues advance: a LENDING CONCEPT shown as an idea, not a live lending product.
 * The advance is credited to the space balance, so spending it still goes through
 * withdrawal signatures, review and limits. It is repaid automatically from a share
 * of every later confirmed collection; there is no separate schedule and no fee.
 */
export const ADVANCE_RULES = {
  /** Offer at most 80% of what students still owe on eligible dues, floored to whole naira. */
  capShare: 0.8,
  /** Share of each later collection's face value deducted towards repayment. */
  repaymentShare: 0.5,
  /** History needed before any offer: confirmed payments and share of expected dues collected. */
  minPayments: 20,
  minCollectedShare: 0.1,
};
export type Advance = { id: string; spaceId: string; requestedBy: string; principalKobo: number; offerKobo: number; startIndex: number; createdAt: string };
export type AdvanceState = { advances: Advance[] };
export type AdvanceCommand = { type: "take_advance"; spaceId: string; amountKobo: number };

/** Africa/Lagos is UTC+1 all year. */
const lagosDate = (ms: number) => new Date(ms + 3600_000).toISOString().slice(0, 10);

/** History-based offer. Eligible dues are published dues whose deadline has not passed. */
export function advanceOffer(state: DemoState, spaceId: string, now = Date.now()) {
  const totals = spaceTotals(state, spaceId);
  const today = lagosDate(now);
  const expectedKobo = dueProgress(state, spaceId).filter(item => item.due.deadline >= today).reduce((total, item) => total + item.outstandingKobo, 0);
  const capKobo = Math.floor(expectedKobo * ADVANCE_RULES.capShare / 100) * 100;
  const collectedShare = totals.expectedKobo ? totals.collectedKobo / totals.expectedKobo : 0;
  const reasons: string[] = [];
  if (totals.paymentCount < ADVANCE_RULES.minPayments) reasons.push(`Needs at least ${ADVANCE_RULES.minPayments} confirmed payments; this space has ${totals.paymentCount}.`);
  if (collectedShare < ADVANCE_RULES.minCollectedShare) reasons.push(`Needs at least ${ADVANCE_RULES.minCollectedShare * 100}% of expected dues collected; this space has ${Math.floor(collectedShare * 100)}%.`);
  if (capKobo < 100) reasons.push("No upcoming dues are left to advance against.");
  if (state.advances.some(item => item.spaceId === spaceId && !advanceStatus(state, item).repaid)) reasons.push("The current advance must be repaid first.");
  return { eligible: !reasons.length, reasons, expectedKobo, capKobo, paymentCount: totals.paymentCount, collectedShare };
}

/** Simulated repayment: a share of each collection after the advance, never more than the debt or the collection. */
export function advanceStatus(state: DemoState, advance: Advance) {
  const later = state.collections.filter(event => event.spaceId === advance.spaceId).slice(advance.startIndex);
  let repaidKobo = 0;
  const deductions: { eventId: string; reference: string; collectedKobo: number; deductedKobo: number }[] = [];
  for (const event of later) {
    if (repaidKobo >= advance.principalKobo) break;
    const deductedKobo = Math.min(Math.floor(event.faceAmountKobo * ADVANCE_RULES.repaymentShare), advance.principalKobo - repaidKobo);
    if (deductedKobo <= 0) continue;
    repaidKobo += deductedKobo;
    deductions.push({ eventId: event.eventId, reference: event.reference, collectedKobo: event.faceAmountKobo, deductedKobo });
  }
  return { repaidKobo, owedKobo: advance.principalKobo - repaidKobo, repaid: repaidKobo >= advance.principalKobo, deductions };
}

/** Totals for the space ledger: money advanced in, and money already deducted back out. */
export function advanceTotals(state: DemoState, spaceId: string) {
  const mine = state.advances.filter(item => item.spaceId === spaceId);
  return { advancedKobo: mine.reduce((total, item) => total + item.principalKobo, 0), repaidKobo: mine.reduce((total, item) => total + advanceStatus(state, item).repaidKobo, 0) };
}

export function transitionAdvance(state: DemoState, action: AdvanceCommand, now: number, id: string): DemoState {
  if (state.audit.some(entry => entry.id === id)) throw new Error("This operation has already been used.");
  // Same gate as withdrawals: verified-KYC owner of an active space.
  if (!spacePermission(state, action.spaceId, "request_withdrawal")) throw new Error("Only the verified owner of an active space can take an advance.");
  const offer = advanceOffer(state, action.spaceId, now);
  if (!offer.eligible) throw new Error(offer.reasons[0]);
  if (!Number.isSafeInteger(action.amountKobo) || action.amountKobo < 100) throw new Error("Enter an advance of at least ₦1.");
  if (action.amountKobo > offer.capKobo) throw new Error("That is above this space's advance limit.");
  const advance: Advance = { id, spaceId: action.spaceId, requestedBy: state.selectedId, principalKobo: action.amountKobo, offerKobo: offer.capKobo, startIndex: offer.paymentCount, createdAt: new Date(now).toISOString() };
  return { ...state, advances: [...state.advances, advance], audit: [...state.audit, { id, actorId: state.selectedId, action: action.type, targetId: id, at: advance.createdAt }] };
}

/** Strict restore validation for the version-6 advances. */
export function validAdvances(state: DemoState) {
  const keys = ["createdAt", "id", "offerKobo", "principalKobo", "requestedBy", "spaceId", "startIndex"].join();
  if (!Array.isArray(state.advances)) return false;
  const ids = new Set<string>();
  const open = new Set<string>();
  return state.advances.every(item => {
    const space = state.spaces.find(entry => entry.id === item?.spaceId);
    const ok = item && typeof item === "object" && Object.keys(item).sort().join() === keys && typeof item.id === "string" && !ids.has(item.id)
      && !!space && item.requestedBy === space.ownerId && Number.isSafeInteger(item.principalKobo) && item.principalKobo >= 100
      && Number.isSafeInteger(item.offerKobo) && item.principalKobo <= item.offerKobo && Number.isSafeInteger(item.startIndex) && item.startIndex >= 0
      && item.startIndex <= state.collections.filter(event => event.spaceId === item.spaceId).length && Number.isFinite(Date.parse(item.createdAt))
      && !open.has(item.spaceId);
    ids.add(item.id);
    if (ok && !advanceStatus(state, item).repaid) open.add(item.spaceId);
    return ok;
  });
}
