import { checkWithdrawalFunds, withdrawalQuote } from "../rep/money";
import type { SignatoryApproval, Withdrawal, WithdrawalStatus } from "../rep/models";
import { advanceTotals } from "./advance";
import { configuredSignatories, spacePermission } from "./spaces";
import type { DemoState } from "./store";
import { VENDORS } from "./vendors";

export const CODE_TTL_MS = 10 * 60 * 1000;
export const WITHDRAWAL_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_CODE_ATTEMPTS = 3;
export const PAYOUT_DELAY_MS = 2000;
export const BANKS = ["Access Bank", "First Bank", "GTBank", "Opay", "Zenith Bank"] as const;
export type Destination = { id: string; userId: string; bank: string; accountNumber: string; accountName: string; createdAt: string };
/** `orderId` links a vendor settlement to its order; the destination is then that vendor's account. */
export type WithdrawalRecord = Withdrawal & { orderId: string | null; history: { status: WithdrawalStatus; at: string; note: string }[] };
export type WithdrawalState = { destinations: Destination[]; withdrawals: WithdrawalRecord[]; approvals: SignatoryApproval[] };
/** Hashes are computed by the caller (the store) so no plaintext code ever reaches persisted state. */
export type WithdrawalCommand =
  | { type: "add_destination"; bank: string; accountNumber: string }
  | { type: "request_withdrawal"; spaceId: string; destinationId: string; purpose: string; amountKobo: number; codeHashes: Record<string, string>; expiresAt: number; orderId?: string | null }
  | { type: "sign_withdrawal"; withdrawalId: string; codeHash: string }
  | { type: "resend_code"; withdrawalId: string; codeHash: string; expiresAt: number }
  | { type: "cancel_withdrawal"; withdrawalId: string }
  | { type: "settle_withdrawal"; withdrawalId: string; outcome: "succeeded" | "failed" }
  | { type: "expire_withdrawals" }
  | { type: "resolve_review"; withdrawalId: string; decision: "approve" | "reject" };
export const WITHDRAWAL_ACTIONS = ["add_destination", "request_withdrawal", "sign_withdrawal", "resend_code", "cancel_withdrawal", "settle_withdrawal", "expire_withdrawals", "resolve_review"];
const OPEN: WithdrawalStatus[] = ["pending_review", "awaiting_signatories", "processing"];
const HASH = /^[0-9a-f]{64}$/;

/** SHA-256 of a 5-digit code bound to its withdrawal and signatory. */
export async function hashCode(withdrawalId: string, userId: string, code: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${withdrawalId}:${userId}:${code}`));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
export function randomCode() {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] % 100000).padStart(5, "0");
}
export const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
/** Africa/Lagos is UTC+1 all year. */
const lagosDay = (iso: string) => new Date(Date.parse(iso) + 3600_000).toISOString().slice(0, 10);

/** Ledger view: collected face value plus any advance, minus advance repayments and settled debits, with open requests reserving amount + fee. */
export function balances(state: DemoState, spaceId: string, now = Date.now()) {
  const { advancedKobo, repaidKobo } = advanceTotals(state, spaceId);
  const collectedKobo = state.collections.filter(event => event.spaceId === spaceId).reduce((total, event) => total + event.faceAmountKobo, 0);
  const mine = state.withdrawals.filter(item => item.spaceId === spaceId);
  const debit = (items: WithdrawalRecord[]) => items.reduce((total, item) => total + item.amountKobo + item.feeKobo, 0);
  const withdrawnKobo = debit(mine.filter(item => item.status === "succeeded"));
  const reservedKobo = debit(mine.filter(item => OPEN.includes(item.status)));
  const today = lagosDay(new Date(now).toISOString());
  const dailyCommittedKobo = mine.filter(item => (item.status === "succeeded" || OPEN.includes(item.status)) && lagosDay(item.createdAt) === today).reduce((total, item) => total + item.amountKobo, 0);
  return { collectedKobo, advancedKobo, repaidKobo, withdrawnKobo, reservedKobo, availableKobo: collectedKobo + advancedKobo - repaidKobo - withdrawnKobo - reservedKobo, dailyCommittedKobo };
}

/** Anomaly review thresholds. Change them here; every rule runs when the request is created, before any payout. */
export const REVIEW_RULES = {
  /** Flag above ₦200,000, or above 3× the space's largest earlier successful payout once that is higher. */
  largeFloorKobo: 20_000_000,
  largeMultiple: 3,
  /** Africa/Lagos hours [start, end): 00:00–04:59. */
  oddHours: [0, 5] as const,
  /** An account saved less than 24 hours before the request is new. */
  newDestinationMs: 24 * 60 * 60 * 1000,
  /** Amount + fee at or above 90% of the available balance. */
  nearlyAllShare: 0.9,
};

/** Deterministic anomaly rules. Each reason is a plain sentence a rep and reviewer can read as-is. */
export function reviewFlags(state: DemoState, item: WithdrawalRecord): string[] {
  const at = Date.parse(item.createdAt);
  const reasons: string[] = [];
  const largest = Math.max(0, ...state.withdrawals.filter(entry => entry.spaceId === item.spaceId && entry.status === "succeeded").map(entry => entry.amountKobo));
  const threshold = Math.max(REVIEW_RULES.largeFloorKobo, REVIEW_RULES.largeMultiple * largest);
  if (item.amountKobo > threshold) reasons.push(threshold === REVIEW_RULES.largeFloorKobo
    ? `Unusually large: ${naira(item.amountKobo)} is above the ${naira(threshold)} review threshold.`
    : `Unusually large: ${naira(item.amountKobo)} is more than ${REVIEW_RULES.largeMultiple}× this space's largest earlier payout (${naira(largest)}).`);
  const lagos = new Date(at + 3600_000);
  const [start, end] = REVIEW_RULES.oddHours;
  if (lagos.getUTCHours() >= start && lagos.getUTCHours() < end) reasons.push(`Odd hour: requested at ${lagos.toISOString().slice(11, 16)} Lagos time, between ${String(start).padStart(2, "0")}:00 and ${String(end).padStart(2, "0")}:00.`);
  const destination = state.destinations.find(entry => entry.id === item.destinationId);
  if (destination && at - Date.parse(destination.createdAt) < REVIEW_RULES.newDestinationMs) reasons.push("New account: the destination bank account was saved less than 24 hours ago.");
  const available = balances(state, item.spaceId, at).availableKobo;
  if (item.amountKobo + item.feeKobo >= REVIEW_RULES.nearlyAllShare * available) reasons.push(`Nearly all funds: amount plus fee is ${Math.floor((item.amountKobo + item.feeKobo) * 100 / available)}% of the ${naira(available)} available.`);
  return reasons;
}

export type TrustInput = { label: string; value: number | null; detail: string };
/**
 * Transparent trust score for a space. Timely payouts come from this ledger; transparency usage,
 * dispute rate and ratings belong to Tracks 1/3 and stay unknown until they supply `signals`.
 * Unknown inputs are excluded, never assumed perfect, and no score shows until two inputs are known.
 * Trust is display only: nothing in KYC, signing or review reads it.
 */
export function trustScore(state: DemoState, spaceId: string, signals: { transparencyShare?: number; disputeRate?: number; averageRating?: number } = {}) {
  const settled = state.withdrawals.filter(item => item.spaceId === spaceId && (item.status === "succeeded" || item.status === "failed"));
  const timely = settled.filter(item => item.status === "succeeded" && Date.parse(item.history.at(-1)!.at) - Date.parse(item.createdAt) < WITHDRAWAL_TTL_MS).length;
  const share = (value: number | undefined) => typeof value === "number" && value >= 0 && value <= 1 ? value : null;
  const rating = typeof signals.averageRating === "number" && signals.averageRating >= 1 && signals.averageRating <= 5 ? signals.averageRating : null;
  const dispute = share(signals.disputeRate);
  const inputs: TrustInput[] = [
    { label: "Timely payouts", value: settled.length ? timely / settled.length : null, detail: settled.length ? `${timely} of ${settled.length} payouts settled within 24 hours` : "No payouts settled yet" },
    { label: "Transparency usage", value: share(signals.transparencyShare), detail: share(signals.transparencyShare) === null ? "No data yet · Track 3 transparency page" : `${Math.round(signals.transparencyShare! * 100)}% of payouts published` },
    { label: "Dispute rate", value: dispute === null ? null : 1 - dispute, detail: dispute === null ? "No data yet · Track 3 disputes" : `${Math.round(dispute * 100)}% of payments disputed` },
    { label: "Student ratings", value: rating === null ? null : (rating - 1) / 4, detail: rating === null ? "No ratings yet · Track 1" : `${rating.toFixed(1)} of 5 average` },
  ];
  const known = inputs.filter(input => input.value !== null);
  const score = known.length >= 2 ? Math.round(known.reduce((total, input) => total + input.value!, 0) * 100 / known.length) : null;
  return { score, known: known.length, level: score === null ? "Not enough data" : score >= 80 ? "High trust" : score >= 50 ? "Moderate trust" : "Low trust", inputs };
}

function setStatus(item: WithdrawalRecord, status: WithdrawalStatus, now: number, note: string): WithdrawalRecord {
  return { ...item, status, history: [...item.history, { status, at: new Date(now).toISOString(), note }] };
}
function expired(item: WithdrawalRecord, now: number) {
  return (item.status === "awaiting_signatories" || item.status === "pending_review") && Date.parse(item.createdAt) + WITHDRAWAL_TTL_MS <= now;
}

export function transitionWithdrawal(state: DemoState, action: WithdrawalCommand, now: number, id: string): DemoState {
  if (state.audit.some(entry => entry.id === id)) throw new Error("This operation has already been used.");
  const actor = state.users.find(user => user.id === state.selectedId)!;
  // Every withdrawal action first expires stale requests, releasing their reservations.
  // ponytail: lazy sweep, so a stale reservation shows until the next action; add a store timer if that matters.
  let withdrawals = state.withdrawals.map(item => expired(item, now) ? setStatus(item, "expired", now, "Not fully signed within 24 hours. Reservation released.") : item);
  let approvals = state.approvals;
  let destinations = state.destinations;
  let actorId = actor.id;
  let targetId = id;
  const find = (withdrawalId: string) => {
    const item = withdrawals.find(entry => entry.id === withdrawalId);
    if (!item || !spacePermission(state, item.spaceId, "view_reports")) throw new Error("Withdrawal not found in your spaces.");
    return item;
  };
  const pairUnchanged = (item: WithdrawalRecord) => configuredSignatories(state, item.spaceId).map(member => member.userId).sort().join() === approvals.filter(entry => entry.withdrawalId === item.id).map(entry => entry.userId).sort().join();
  const replace = (next: WithdrawalRecord) => { withdrawals = withdrawals.map(item => item.id === next.id ? next : item); targetId = next.id; };
  switch (action.type) {
    case "expire_withdrawals":
      if (withdrawals.every((item, index) => item === state.withdrawals[index])) return state;
      actorId = "demo-payout"; targetId = actor.id;
      break;
    case "add_destination": {
      if (!BANKS.includes(action.bank as typeof BANKS[number]) || !/^\d{10}$/.test(action.accountNumber)) throw new Error("Choose a bank and enter a 10-digit account number.");
      if (destinations.some(item => item.userId === actor.id && item.bank === action.bank && item.accountNumber === action.accountNumber)) throw new Error("This account is already saved.");
      // Simulated name enquiry: only accounts in the rep's own name are accepted.
      destinations = [...destinations, { id, userId: actor.id, bank: action.bank, accountNumber: action.accountNumber, accountName: actor.name, createdAt: new Date(now).toISOString() }];
      break;
    }
    case "request_withdrawal": {
      if (!spacePermission(state, action.spaceId, "request_withdrawal")) throw new Error("Only the verified owner of an active space can request a withdrawal.");
      const pair = configuredSignatories(state, action.spaceId);
      if (!pair.length) throw new Error("Configure two distinct signatories before withdrawing.");
      // Vendor settlement: same signatures, review, fee and limits, paid to the order's approved vendor exactly once.
      const order = action.orderId ? state.orders.find(item => item.id === action.orderId && item.spaceId === action.spaceId) : null;
      if (action.orderId && !order) throw new Error("Vendor order not found in this space.");
      if (order && withdrawals.some(item => item.orderId === order.id && (item.status === "succeeded" || OPEN.includes(item.status)))) throw new Error("This vendor order is already paid or has a payment in progress.");
      if (order && action.amountKobo !== order.totalKobo) throw new Error("A vendor payment must equal the order total.");
      const destination = order ? VENDORS.find(item => item.id === order.vendorId && item.id === action.destinationId) : destinations.find(item => item.id === action.destinationId && item.userId === actor.id);
      if (!destination) throw new Error(order ? "Vendor payments go only to that vendor's account." : "Choose one of your own saved bank accounts.");
      const purpose = typeof action.purpose === "string" ? action.purpose.trim() : "";
      if (purpose.length < 3 || purpose.length > 140) throw new Error("Describe the purpose in 3–140 characters.");
      if (!Number.isSafeInteger(action.amountKobo) || action.amountKobo < 1) throw new Error("Enter a positive amount.");
      const funds = balances({ ...state, withdrawals }, action.spaceId, now);
      const problem = checkWithdrawalFunds(action.amountKobo, Math.max(0, funds.availableKobo), funds.dailyCommittedKobo);
      if (problem) throw new Error({ single_limit: "A single withdrawal cannot exceed ₦2,500,000.", daily_limit: "This would pass the ₦10,000,000 daily limit.", insufficient_balance: "Available balance does not cover the amount plus the withdrawal fee." }[problem]);
      const hashes = pair.map(member => action.codeHashes?.[member.userId]);
      if (Object.keys(action.codeHashes ?? {}).length !== 2 || !hashes.every(hash => typeof hash === "string" && HASH.test(hash)) || !(action.expiresAt > now && action.expiresAt <= now + CODE_TTL_MS)) throw new Error("Signatory codes could not be issued.");
      const { feeKobo } = withdrawalQuote(action.amountKobo);
      let item: WithdrawalRecord = { id, spaceId: action.spaceId, requestedBy: actor.id, destinationId: destination.id, purpose, amountKobo: action.amountKobo, feeKobo, orderId: order?.id ?? null, reference: `WD-${id.replaceAll("-", "").slice(0, 10).toUpperCase()}`, status: "awaiting_signatories", flagReasons: [], createdAt: new Date(now).toISOString(), history: [] };
      item = setStatus(item, "awaiting_signatories", now, `Reserved ${naira(action.amountKobo + feeKobo)} (amount + fee). Codes sent to both signatories.`);
      item = { ...item, flagReasons: reviewFlags({ ...state, destinations, withdrawals }, item) };
      if (item.flagReasons.length) item = setStatus(item, "pending_review", now, `Paused for anomaly review: ${item.flagReasons.join(" ")}`);
      withdrawals = [...withdrawals, item];
      approvals = [...approvals, ...pair.map((member, index) => ({ withdrawalId: id, userId: member.userId, codeHash: hashes[index]!, expiresAt: new Date(action.expiresAt).toISOString(), usedAt: null, failedAttempts: 0 }))];
      break;
    }
    case "sign_withdrawal": {
      const item = find(action.withdrawalId);
      const approval = approvals.find(entry => entry.withdrawalId === item.id && entry.userId === actor.id);
      if (!approval) throw new Error("You are not a signatory for this withdrawal.");
      if (!["awaiting_signatories", "pending_review"].includes(item.status)) throw new Error(`This withdrawal is ${item.status.replace("_", " ")}; no code can move money now.`);
      // Revalidate the pair at signing: a revoked or replaced signatory voids the request.
      if (!pairUnchanged(item)) throw new Error("The signatory pair changed after this request. Cancel it and request again.");
      if (!spacePermission(state, item.spaceId, "approve_withdrawal")) throw new Error("You are not a signatory for this withdrawal.");
      if (approval.usedAt) throw new Error("Your code was already used for this withdrawal.");
      if (approval.failedAttempts >= MAX_CODE_ATTEMPTS) throw new Error("Too many wrong attempts. Request a new code.");
      if (Date.parse(approval.expiresAt) <= now) throw new Error("This code has expired. Request a new code.");
      targetId = item.id;
      if (approval.codeHash !== action.codeHash) {
        approvals = approvals.map(entry => entry === approval ? { ...entry, failedAttempts: entry.failedAttempts + 1 } : entry);
        break;
      }
      approvals = approvals.map(entry => entry === approval ? { ...entry, usedAt: new Date(now).toISOString() } : entry);
      const both = approvals.filter(entry => entry.withdrawalId === item.id).every(entry => entry.usedAt);
      let next = setStatus(item, item.status, now, `${actor.name} signed.`);
      // Atomic release: both signatures and a clear review move the request to payout in this one transition.
      if (both && !item.flagReasons.length) next = setStatus(next, "processing", now, "Both signatures verified. Sent to the payout rail.");
      else if (both) next = setStatus(next, item.status, now, "Both signatures verified. Payout stays paused until anomaly review clears it.");
      replace(next);
      break;
    }
    case "resend_code": {
      const item = find(action.withdrawalId);
      const approval = approvals.find(entry => entry.withdrawalId === item.id && entry.userId === actor.id);
      if (!approval || !["awaiting_signatories", "pending_review"].includes(item.status)) throw new Error("No code can be resent for this withdrawal.");
      if (approval.usedAt) throw new Error("You already signed this withdrawal.");
      if (!HASH.test(action.codeHash) || !(action.expiresAt > now && action.expiresAt <= now + CODE_TTL_MS)) throw new Error("A new code could not be issued.");
      approvals = approvals.map(entry => entry === approval ? { ...entry, codeHash: action.codeHash, expiresAt: new Date(action.expiresAt).toISOString(), failedAttempts: 0 } : entry);
      replace(setStatus(item, item.status, now, `New code sent to ${actor.name}; the previous code no longer works.`));
      break;
    }
    case "cancel_withdrawal": {
      const item = find(action.withdrawalId);
      if (item.requestedBy !== actor.id || !["awaiting_signatories", "pending_review"].includes(item.status)) throw new Error("Only the requester can cancel an unsigned request.");
      replace(setStatus(item, "rejected", now, "Cancelled by the requester. Reservation released."));
      break;
    }
    case "resolve_review": {
      // Labelled Track 3 demo reviewer. Owners, treasurers and signatories can never clear their own flags.
      const item = withdrawals.find(entry => entry.id === action.withdrawalId);
      if (!actor.isAdmin || !item || state.spaces.find(space => space.id === item.spaceId)?.schoolId !== actor.schoolId) throw new Error("Only the Track 3 demo reviewer can resolve anomaly reviews.");
      if (item.status !== "pending_review") throw new Error("Only a request paused for review can be resolved.");
      if (action.decision === "reject") { replace(setStatus(item, "rejected", now, "Rejected in anomaly review. Reservation released; no money left the space.")); break; }
      if (action.decision !== "approve") throw new Error("Invalid review decision.");
      const both = approvals.filter(entry => entry.withdrawalId === item.id).every(entry => entry.usedAt);
      if (both && !pairUnchanged(item)) throw new Error("The signatory pair changed after this request. Reject it so the owner can request again.");
      // Flags are cleared so release can happen; the reasons remain in the status history.
      replace({ ...setStatus(item, both ? "processing" : "awaiting_signatories", now, `Cleared in anomaly review. ${both ? "Both signatures already verified. Sent to the payout rail." : "Waiting for both signatures."}`), flagReasons: [] });
      break;
    }
    case "settle_withdrawal": {
      const item = withdrawals.find(entry => entry.id === action.withdrawalId);
      // Idempotent: a repeated or late rail callback changes nothing.
      if (!item || item.status !== "processing") return state;
      actorId = "demo-payout";
      replace(setStatus(item, action.outcome === "succeeded" ? "succeeded" : "failed", now, action.outcome === "succeeded" ? "Payout confirmed by the rail. Amount and fee debited." : "Payout failed at the rail. Reservation released; no money left the space."));
      break;
    }
  }
  return { ...state, destinations, withdrawals, approvals, audit: [...state.audit, { id, actorId, action: action.type, targetId, at: new Date(now).toISOString() }] };
}

/** Simulated Track 3 payout rail. Keyed by reference, so a retry never pays twice. */
export function createPayoutRail() {
  const sent = new Map<string, "succeeded" | "failed">();
  return {
    failNext: false,
    send(reference: string): "succeeded" | "failed" {
      if (!sent.has(reference)) { sent.set(reference, this.failNext ? "failed" : "succeeded"); this.failNext = false; }
      return sent.get(reference)!;
    },
    count: () => sent.size,
  };
}

/** Strict restore validation for the withdrawal ledger (v6 adds `orderId`). */
export function validWithdrawals(state: DemoState) {
  const keys = (value: object, expected: string[]) => value && typeof value === "object" && Object.keys(value).sort().join() === expected.sort().join();
  const iso = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
  if (![state.destinations, state.withdrawals, state.approvals].every(Array.isArray)) return false;
  const ids = new Set<string>();
  for (const item of state.destinations) {
    const owner = state.users.find(user => user.id === item.userId);
    if (!keys(item, ["id", "userId", "bank", "accountNumber", "accountName", "createdAt"]) || typeof item.id !== "string" || ids.has(item.id) || !owner || item.accountName !== owner.name || !BANKS.includes(item.bank as typeof BANKS[number]) || !/^\d{10}$/.test(item.accountNumber) || !iso(item.createdAt)) return false;
    ids.add(item.id);
  }
  const statuses: WithdrawalStatus[] = ["pending_review", "awaiting_signatories", "processing", "succeeded", "failed", "rejected", "expired"];
  for (const item of state.withdrawals) {
    if (!keys(item, ["id", "spaceId", "requestedBy", "destinationId", "purpose", "amountKobo", "feeKobo", "orderId", "reference", "status", "flagReasons", "createdAt", "history"]) || typeof item.id !== "string" || ids.has(item.id)) return false;
    ids.add(item.id);
    const space = state.spaces.find(entry => entry.id === item.spaceId);
    const order = item.orderId === null ? null : state.orders.find(entry => entry.id === item.orderId && entry.spaceId === item.spaceId);
    if (!space || item.requestedBy !== space.ownerId || (item.orderId === null ? !state.destinations.some(entry => entry.id === item.destinationId && entry.userId === item.requestedBy) : !order || order.vendorId !== item.destinationId || order.totalKobo !== item.amountKobo)) return false;
    if (typeof item.purpose !== "string" || !Number.isSafeInteger(item.amountKobo) || item.amountKobo < 1 || item.feeKobo !== withdrawalQuote(item.amountKobo).feeKobo || typeof item.reference !== "string" || !/^WD-/.test(item.reference) || !statuses.includes(item.status) || !Array.isArray(item.flagReasons) || !item.flagReasons.every(reason => typeof reason === "string") || !iso(item.createdAt)) return false;
    if (!Array.isArray(item.history) || !item.history.length || item.history.at(-1)!.status !== item.status || !item.history.every(entry => keys(entry, ["status", "at", "note"]) && statuses.includes(entry.status) && iso(entry.at) && typeof entry.note === "string")) return false;
    const signed = state.approvals.filter(entry => entry.withdrawalId === item.id);
    if (signed.length !== 2 || signed[0].userId === signed[1].userId) return false;
    if (["processing", "succeeded", "failed"].includes(item.status) && !signed.every(entry => entry.usedAt)) return false;
    // Only a paused request carries flags; release requires review to have cleared them.
    if ((item.status === "pending_review") !== (item.flagReasons.length > 0) && !["rejected", "expired"].includes(item.status)) return false;
  }
  if (new Set(state.withdrawals.map(item => item.reference)).size !== state.withdrawals.length) return false;
  for (const entry of state.approvals) {
    if (!keys(entry, ["withdrawalId", "userId", "codeHash", "expiresAt", "usedAt", "failedAttempts"]) || !state.withdrawals.some(item => item.id === entry.withdrawalId) || !state.users.some(user => user.id === entry.userId) || typeof entry.codeHash !== "string" || !HASH.test(entry.codeHash) || !iso(entry.expiresAt) || !(entry.usedAt === null || iso(entry.usedAt)) || !Number.isSafeInteger(entry.failedAttempts) || entry.failedAttempts < 0 || entry.failedAttempts > MAX_CODE_ATTEMPTS) return false;
  }
  // A vendor order is paid at most once: one succeeded or open settlement.
  if (state.orders.some(order => state.withdrawals.filter(item => item.orderId === order.id && (item.status === "succeeded" || OPEN.includes(item.status))).length > 1)) return false;
  // The ledger must reconcile: no space may have debited or reserved more than it collected.
  return state.spaces.every(space => balances(state, space.id).availableKobo >= 0);
}
