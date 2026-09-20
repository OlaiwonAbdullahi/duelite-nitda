import type { RepUser } from "../rep/models";
import { canCollect, canCreateSpace } from "../rep/permissions";

import { transitionAdvance, validAdvances, type AdvanceCommand, type AdvanceState } from "./advance";
import { BURST_SIZE, LINK_DELAY_MS, nextCollection, RECONNECT_MS, transitionCollect, TRICKLE_MS, validCollections, type CollectCommand, type CollectionState } from "./collections";
import { transitionNudges, validNudges, type NudgeCommand, type NudgeState } from "./nudges";
import { configuredSignatories, SPACE_ACTIONS, transitionSpace, validSpaceState, visibleSpaces, type SpaceState, type SpaceCommand } from "./spaces";
import { transitionVendor, validOrders, type VendorCommand, type VendorState } from "./vendors";
import { CODE_TTL_MS, createPayoutRail, hashCode, MAX_CODE_ATTEMPTS, PAYOUT_DELAY_MS, randomCode, transitionWithdrawal, validWithdrawals, WITHDRAWAL_ACTIONS, type WithdrawalCommand, type WithdrawalState } from "./withdrawals";

export const STORAGE_KEY = "duelite.demo.v6";
export const KYC_DELAY_MS = 3000;
export const DEPARTMENTS = ["Computer Science", "Engineering", "Business Administration"] as const;
export type DemoUser = RepUser & { isStudent: true; isAdmin: boolean };
type Application = { department: string; level: string; position: string; rejection: string | null };
type KycRequest = { id: string; userId: string; dueAt: number; outcome: "verified" | "failed"; completed: boolean };
type AuditEntry = { id: string; actorId: string; action: string; targetId: string; at: string };
export type DemoState = SpaceState & CollectionState & WithdrawalState & NudgeState & AdvanceState & VendorState & {
  version: 6;
  selectedId: string;
  users: DemoUser[];
  applications: Record<string, Application>;
  kycRequests: KycRequest[];
  audit: AuditEntry[];
};
export type DemoAction = SpaceCommand | CollectCommand | WithdrawalCommand | NudgeCommand | AdvanceCommand | VendorCommand
  | { type: "select"; userId: string }
  | { type: "apply"; department: string; level: string; position: string }
  | { type: "review"; userId: string; decision: "approved" | "rejected" }
  | { type: "start_kyc"; outcome: "verified" | "failed" }
  | { type: "finish_kyc"; requestId: string };

export function seedDemo(): DemoState {
  const user = (id: string, name: string, approvalStatus: RepUser["approvalStatus"], kycStatus: RepUser["kycStatus"], isAdmin = false): DemoUser =>
    ({ id, name, schoolId: "unilag", isStudent: true, isAdmin, isRep: approvalStatus !== "not_applied", approvalStatus, kycStatus });
  return {
    version: 6, spaces: [], members: [], dues: [], invites: [], collections: [], withdrawals: [], nudges: [], advances: [], orders: [],
    // Established account for the safe payout path: saved months ago, so the new-account review rule does not fire.
    destinations: [{ id: "seed-zainab-gtbank", userId: "zainab", bank: "GTBank", accountNumber: "0123456789", accountName: "Zainab Musa", createdAt: "2026-03-02T09:00:00.000Z" }], approvals: [], selectedSpaceId: null, selectedId: "ada",
    users: [user("ada", "Ada Okafor", "not_applied", "not_started"), user("tunde", "Tunde Bello", "approved", "not_started"), user("zainab", "Zainab Musa", "approved", "verified"), user("admin", "Demo administrator", "not_applied", "not_started", true)],
    applications: {}, kycRequests: [], audit: [],
  };
}
export const STAGE_PAYMENTS = 150;
/** Stage-script starting point (PDF p.19 demo mode): Zainab's verified space, a published ₦5,000 instalment due,
 *  Ada as treasurer signatory and a payment history with defaulters. Built through real transitions, so every rule
 *  and audit entry applies; fixed ids keep the cohort and payments identical on every load. */
export function stageDemo(now: number): DemoState {
  const DAY = 86_400_000;
  const start = now - 3 * DAY;
  let state = seedDemo();
  let seq = 0;
  const step = (action: DemoAction, at = start) => { state = transition(state, action, at, `stage-${++seq}`); };
  step({ type: "select", userId: "zainab" });
  step({ type: "create_space", name: "Computer Science 200L" });
  const spaceId = state.spaces[0].id;
  step({ type: "save_due", spaceId, due: { title: "Departmental due", type: "departmental_due", amountKobo: 500_000, deadline: new Date(now + 30 * DAY).toISOString().slice(0, 10), allowInstalments: true } });
  step({ type: "publish_due", spaceId, dueId: state.dues[0].id });
  step({ type: "invite", spaceId, email: "ada@demo.duelite.test", role: "treasurer" });
  step({ type: "select", userId: "ada" });
  step({ type: "accept_invite", inviteId: state.invites[0].id });
  step({ type: "select", userId: "zainab" });
  step({ type: "set_signatories", spaceId, secondId: "ada" });
  for (let index = 0; index < STAGE_PAYMENTS; index++) {
    const at = start + Math.round((index + 1) * (now - start - 60_000) / STAGE_PAYMENTS);
    step({ type: "collect", event: nextCollection(state, spaceId, at)! }, at);
  }
  return state;
}
export function selectedUser(state: DemoState) {
  return state.users.find(user => user.id === state.selectedId)!;
}
export function requireRepCapability(state: DemoState, action: "create_space" | "draft_due" | "publish_due" | "collect") {
  const actor = selectedUser(state);
  if (!(action === "create_space" || action === "draft_due" ? canCreateSpace(actor) : canCollect(actor))) {
    throw new Error(action === "create_space" || action === "draft_due" ? "Admin approval is required before preparing spaces and dues." : "Admin approval and verified KYC are required before publishing or collecting.");
  }
}

/** Atomic, framework-independent demo transition. No identity number is accepted. */
export function transition(state: DemoState, action: DemoAction, now: number, id: string): DemoState {
  if (action.type === "collect") return transitionCollect(state, action, now, id);
  if (action.type === "send_nudges") return transitionNudges(state, action, now, id);
  if (action.type === "take_advance") return transitionAdvance(state, action, now, id);
  if (action.type === "attach_vendor_item") return transitionVendor(state, action, now, id);
  if (WITHDRAWAL_ACTIONS.includes(action.type)) return transitionWithdrawal(state, action as WithdrawalCommand, now, id);
  if (SPACE_ACTIONS.includes(action.type)) return transitionSpace(state, action as SpaceCommand, now, id);
  const actor = selectedUser(state);
  if (action.type === "select") {
    if (!state.users.some(user => user.id === action.userId)) throw new Error("Unknown demo identity.");
    const next = { ...state, selectedId: action.userId };
    return { ...next, selectedSpaceId: visibleSpaces(next)[0]?.id ?? null };
  }
  let targetId = actor.id;
  let update: Partial<DemoUser> = {};
  let applications = state.applications;
  let requests = state.kycRequests;
  switch (action.type) {
    case "apply":
      if (!["not_applied", "rejected"].includes(actor.approvalStatus)) throw new Error("This application has already been submitted.");
      if (!DEPARTMENTS.some(value => value === action.department) || !["100", "200", "300", "400", "500"].includes(action.level) || !["Course representative", "Association representative"].includes(action.position)) throw new Error("Choose a department, level and representative role.");
      applications = { ...applications, [actor.id]: { department: action.department, level: action.level, position: action.position, rejection: null } };
      update = { isRep: true, approvalStatus: "pending" };
      break;
    case "review": {
      const target = state.users.find(user => user.id === action.userId);
      if (!actor.isAdmin || !target || target.schoolId !== actor.schoolId) throw new Error("Only the demo administrator can review this application.");
      if (target.approvalStatus !== "pending" || !applications[target.id]) throw new Error("Only pending applications can be reviewed.");
      if (!["approved", "rejected"].includes(action.decision)) throw new Error("Invalid review decision.");
      targetId = target.id;
      update = { approvalStatus: action.decision };
      applications = { ...applications, [targetId]: { ...applications[targetId], rejection: action.decision === "rejected" ? "Confirm your department and representative role, then apply again." : null } };
      break;
    }
    case "start_kyc":
      requireRepCapability(state, "create_space");
      if (!["not_started", "failed"].includes(actor.kycStatus)) throw new Error("Verification is already pending or complete.");
      if (!["verified", "failed"].includes(action.outcome)) throw new Error("Invalid simulated outcome.");
      update = { kycStatus: "pending" };
      requests = [...requests, { id, userId: actor.id, dueAt: now + KYC_DELAY_MS, outcome: action.outcome, completed: false }];
      break;
    case "finish_kyc": {
      const request = requests.find(item => item.id === action.requestId);
      if (!request || request.completed || request.dueAt > now) return state;
      const target = state.users.find(user => user.id === request.userId);
      if (!target || target.approvalStatus !== "approved" || target.kycStatus !== "pending") return state;
      targetId = target.id;
      update = { kycStatus: request.outcome };
      requests = requests.map(item => item.id === request.id ? { ...item, completed: true } : item);
      break;
    }
  }
  return { ...state, applications, kycRequests: requests,
    users: state.users.map(user => user.id === targetId ? { ...user, ...update } : user),
    audit: [...state.audit, { id, actorId: action.type === "finish_kyc" ? "demo-kyc" : actor.id, action: action.type, targetId, at: new Date(now).toISOString() }],
  };
}

// Validate the entire persisted envelope; unknown fields (including sensitive data)
// are rejected rather than copied into future saves. This is not tamper resistance.
export function restoreDemo(raw: string | null): DemoState | null {
  if (!raw) return null;
  try {
    const state: DemoState = JSON.parse(raw);
    const keys = (value: object, expected: string[]) => value && typeof value === "object" && Object.keys(value).sort().join() === expected.sort().join();
    const seeds = seedDemo();
    if (!keys(state, ["version", "selectedId", "users", "applications", "kycRequests", "audit", "spaces", "members", "dues", "invites", "collections", "destinations", "withdrawals", "approvals", "nudges", "advances", "orders", "selectedSpaceId"]) || state.version !== 6 || !Array.isArray(state.users) || state.users.length !== seeds.users.length) return null;
    for (const seed of seeds.users) {
      const user = state.users.find(item => item.id === seed.id);
      if (!user || !keys(user, Object.keys(seed)) || user.name !== seed.name || user.schoolId !== seed.schoolId || user.isStudent !== true || user.isAdmin !== seed.isAdmin || typeof user.isRep !== "boolean" || !["not_applied", "pending", "approved", "rejected"].includes(user.approvalStatus) || !["not_started", "pending", "verified", "failed"].includes(user.kycStatus) || user.isRep !== (user.approvalStatus !== "not_applied") || (user.approvalStatus !== "approved" && user.kycStatus !== "not_started")) return null;
    }
    if (!state.users.some(user => user.id === state.selectedId) || !state.applications || Array.isArray(state.applications) || typeof state.applications !== "object") return null;
    for (const [userId, app] of Object.entries(state.applications)) {
      if (!state.users.some(user => user.id === userId) || !keys(app, ["department", "level", "position", "rejection"]) || !DEPARTMENTS.some(value => value === app.department) || !["100", "200", "300", "400", "500"].includes(app.level) || !["Course representative", "Association representative"].includes(app.position) || ![null, "Confirm your department and representative role, then apply again."].includes(app.rejection)) return null;
    }
    if (!Array.isArray(state.kycRequests) || !Array.isArray(state.audit)) return null;
    const ids = new Set<string>();
    for (const request of state.kycRequests) {
      if (!keys(request, ["id", "userId", "dueAt", "outcome", "completed"]) || typeof request.id !== "string" || ids.has(request.id) || !state.users.some(user => user.id === request.userId) || !Number.isSafeInteger(request.dueAt) || !["verified", "failed"].includes(request.outcome) || typeof request.completed !== "boolean") return null;
      ids.add(request.id);
    }
    for (const user of state.users) {
      const pending = state.kycRequests.filter(request => request.userId === user.id && !request.completed);
      if (pending.length !== (user.kycStatus === "pending" ? 1 : 0) || (["pending", "rejected"].includes(user.approvalStatus) && !state.applications[user.id])) return null;
    }
    if (!validSpaceState(state) || !validCollections(state) || !validAdvances(state) || !validOrders(state) || !validWithdrawals(state) || !validNudges(state)) return null;
    const targets = [...state.users.map(u => u.id), ...state.spaces.map(s => s.id), ...state.dues.map(d => d.id), ...state.invites.map(i => i.id), ...state.collections.map(c => c.eventId), ...state.withdrawals.map(w => w.id), ...state.destinations.map(d => d.id), ...state.advances.map(a => a.id), ...state.orders.map(o => o.id)];
    for (const entry of state.audit) {
      if (!keys(entry, ["id", "actorId", "action", "targetId", "at"]) || typeof entry.id !== "string" || ![...state.users.map(user => user.id), "demo-kyc", "demo-rail", "demo-payout"].includes(entry.actorId) || !targets.includes(entry.targetId) || !["apply", "review", "start_kyc", "finish_kyc", "collect", "send_nudges", "take_advance", "attach_vendor_item", ...SPACE_ACTIONS, ...WITHDRAWAL_ACTIONS].includes(entry.action) || typeof entry.at !== "string" || !Number.isFinite(Date.parse(entry.at))) return null;
    }
    return state;
  } catch { return null; }
}

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
export type FeedStatus = "offline" | "connecting" | "live" | "reconnecting" | "error";
export type Feed = { status: FeedStatus; trickle: boolean; message: string };
const OFFLINE: Feed = { status: "offline", trickle: false, message: "" };
/** Demo inbox message. Runtime only: plaintext codes are never persisted, so after a reload a signatory requests a new code. */
export type InboxMessage = { userId: string; withdrawalId: string; reference: string; code: string; sentAt: number };

export function createDemoStore() {
  let state = seedDemo();
  let feed: Feed = OFFLINE;
  let inbox: InboxMessage[] = [];
  let rail = createPayoutRail();
  let snapshot = { state, feed, inbox, failNextPayout: false, ready: false, notice: "" };
  let storage: Storage | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let feedTimer: ReturnType<typeof setTimeout> | undefined;
  let linkTimer: ReturnType<typeof setTimeout> | undefined;
  const payoutTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const listeners = new Set<() => void>();
  const serverSnapshot = snapshot;
  function emit(notice = snapshot.notice) {
    snapshot = { state, feed, inbox, failNextPayout: rail.failNext, ready: true, notice };
    listeners.forEach(listener => listener());
  }
  function save() {
    try { storage?.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch { emit("Browser storage is unavailable. Changes last only for this visit."); }
  }
  function schedule() {
    clearTimeout(timer);
    const pending = state.kycRequests.filter(request => !request.completed);
    if (!pending.length) return;
    timer = setTimeout(() => {
      for (const request of pending) state = transition(state, { type: "finish_kyc", requestId: request.id }, Date.now(), crypto.randomUUID());
      emit(); save(); schedule();
    }, Math.max(0, Math.min(...pending.map(request => request.dueAt)) - Date.now()));
  }
  /** Emit up to `count` simulated confirmed payments into the selected space; stops early when the cohort has settled. */
  function emitCollections(count: number) {
    const spaceId = state.selectedSpaceId;
    if (!spaceId) return 0;
    let sent = 0;
    for (let index = 0; index < count; index++) {
      const event = nextCollection(state, spaceId, Date.now());
      if (!event) break;
      const before = state.collections.length;
      try { state = transition(state, { type: "collect", event }, Date.now(), crypto.randomUUID()); }
      catch { break; }
      if (state.collections.length === before) break;
      sent++;
    }
    return sent;
  }
  function setFeed(update: Partial<Feed>) {
    feed = { ...feed, ...update };
    emit();
  }
  function tick() {
    clearTimeout(feedTimer);
    if (feed.status !== "live" || !feed.trickle) return;
    feedTimer = setTimeout(() => {
      if (feed.status !== "live" || !feed.trickle) return;
      if (emitCollections(1)) { emit(); save(); }
      else setFeed({ trickle: false, message: "Every student in this cohort has settled every published due." });
      tick();
    }, TRICKLE_MS);
  }
  function stopFeed() { clearTimeout(feedTimer); clearTimeout(linkTimer); }
  function stopPayouts() { payoutTimers.forEach(clearTimeout); payoutTimers.clear(); }
  /** Released requests go to the simulated Track 3 rail once; the rail and the settle transition are both idempotent. */
  function runPayouts() {
    for (const item of state.withdrawals.filter(entry => entry.status === "processing" && !payoutTimers.has(entry.id))) {
      payoutTimers.set(item.id, setTimeout(() => {
        payoutTimers.delete(item.id);
        state = transition(state, { type: "settle_withdrawal", withdrawalId: item.id, outcome: rail.send(item.reference) }, Date.now(), crypto.randomUUID());
        emit(); save();
      }, PAYOUT_DELAY_MS));
    }
  }
  function replace(next: DemoState) {
    clearTimeout(timer); stopFeed(); stopPayouts();
    state = next; feed = OFFLINE; inbox = []; rail = createPayoutRail();
    emit(""); save();
  }
  function dispatch(action: DemoAction, id: string = crypto.randomUUID()) {
    state = transition(state, action, Date.now(), id);
    emit(); save(); schedule(); runPayouts();
  }
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => serverSnapshot,
    start(browserStorage?: Storage) {
      storage = browserStorage;
      let notice = browserStorage ? "" : "Browser storage is unavailable. Changes last only for this visit.";
      try {
        const raw = storage?.getItem(STORAGE_KEY) ?? null;
        const restored = restoreDemo(raw);
        state = restored ?? seedDemo();
        if (!raw && (storage?.getItem("duelite.demo.v5") || storage?.getItem("duelite.demo.v4") || storage?.getItem("duelite.demo.v3") || storage?.getItem("duelite.demo.v2") || storage?.getItem("duelite.demo.v1"))) notice = "The demo has been upgraded for dues advances and vendor orders. Earlier saved versions remain untouched; this version starts fresh.";
        if (raw && !restored) notice = "Saved demo data was incompatible or damaged. A fresh demo has been loaded.";
      } catch { notice = "Browser storage is unavailable. Changes last only for this visit."; }
      state = transition(state, { type: "expire_withdrawals" }, Date.now(), crypto.randomUUID());
      emit(notice); save(); schedule(); runPayouts();
    },
    stop() { clearTimeout(timer); stopFeed(); stopPayouts(); },
    dispatch(action: DemoAction) { dispatch(action); },
    /** Issue separate random codes to the two configured signatories; only their hashes enter state. */
    async requestWithdrawal(input: { spaceId: string; destinationId: string; purpose: string; amountKobo: number; orderId?: string }) {
      const id = crypto.randomUUID();
      const codes = configuredSignatories(state, input.spaceId).map(member => ({ userId: member.userId, code: randomCode() }));
      const codeHashes = Object.fromEntries(await Promise.all(codes.map(async item => [item.userId, await hashCode(id, item.userId, item.code)])));
      dispatch({ type: "request_withdrawal", ...input, codeHashes, expiresAt: Date.now() + CODE_TTL_MS }, id);
      const reference = state.withdrawals.find(item => item.id === id)!.reference;
      inbox = [...inbox, ...codes.map(item => ({ ...item, withdrawalId: id, reference, sentAt: Date.now() }))];
      emit();
    },
    async signWithdrawal(withdrawalId: string, code: string) {
      const userId = state.selectedId;
      if (!/^\d{5}$/.test(code.trim())) throw new Error("Enter the 5-digit code from your demo inbox.");
      const codeHash = await hashCode(withdrawalId, userId, code.trim());
      if (state.selectedId !== userId) throw new Error("The demo identity changed. Enter the code again.");
      dispatch({ type: "sign_withdrawal", withdrawalId, codeHash });
      const approval = state.approvals.find(item => item.withdrawalId === withdrawalId && item.userId === userId)!;
      if (!approval.usedAt) throw new Error(`That code is not correct. ${MAX_CODE_ATTEMPTS - approval.failedAttempts} ${MAX_CODE_ATTEMPTS - approval.failedAttempts === 1 ? "attempt" : "attempts"} left before a new code is needed.`);
    },
    /** A resend replaces the stored hash, so the previous code stops working immediately. */
    async resendCode(withdrawalId: string) {
      const userId = state.selectedId;
      const code = randomCode();
      const codeHash = await hashCode(withdrawalId, userId, code);
      if (state.selectedId !== userId) throw new Error("The demo identity changed. Request the code again.");
      dispatch({ type: "resend_code", withdrawalId, codeHash, expiresAt: Date.now() + CODE_TTL_MS });
      const reference = state.withdrawals.find(item => item.id === withdrawalId)!.reference;
      inbox = [...inbox.filter(item => !(item.withdrawalId === withdrawalId && item.userId === userId)), { userId, withdrawalId, reference, code, sentAt: Date.now() }];
      emit();
    },
    /** Presenter control: the simulated rail fails the next new payout. */
    setPayoutFailure(on: boolean) { rail.failNext = on; emit(); },
    /** Simulated payment-rail link. Track 3 may replace these with its own demo rail. */
    connectFeed() {
      stopFeed();
      setFeed({ status: "connecting", message: "Connecting to the simulated payment rail…" });
      linkTimer = setTimeout(() => { setFeed({ status: "live", message: "Live. Confirmed payments appear as they arrive." }); tick(); }, LINK_DELAY_MS);
    },
    disconnectFeed() { stopFeed(); setFeed({ ...OFFLINE, message: "Disconnected. Totals below stay as they were." }); },
    setTrickle(on: boolean) {
      if (feed.status !== "live") return;
      setFeed({ trickle: on, message: on ? "Trickle on: one confirmed payment at a time." : "Trickle paused." });
      tick();
    },
    burst(count = BURST_SIZE) {
      if (feed.status !== "live") return;
      const sent = emitCollections(count);
      save();
      setFeed({ message: sent ? `Burst delivered ${sent} confirmed ${sent === 1 ? "payment" : "payments"}.` : "Nothing left to collect in this space." });
    },
    /** Re-deliver the newest event exactly as the rail sent it, proving replays never double-count. */
    replayLast() {
      const last = state.collections.filter(event => event.spaceId === state.selectedSpaceId).at(-1);
      if (!last) return setFeed({ message: "No confirmed payment to replay yet." });
      const before = state.collections.length;
      state = transition(state, { type: "collect", event: last }, Date.now(), crypto.randomUUID());
      setFeed({ message: state.collections.length === before ? `Replayed ${last.reference}. It was already recorded, so no total changed.` : "Replay recorded a new payment." });
    },
    simulateDrop() {
      if (feed.status !== "live") return;
      clearTimeout(feedTimer); clearTimeout(linkTimer);
      setFeed({ status: "reconnecting", message: "Connection lost. Reconnecting…" });
      linkTimer = setTimeout(() => { setFeed({ status: "live", message: "Reconnected. Any payments confirmed while offline are already counted." }); tick(); }, RECONNECT_MS);
    },
    simulateError() {
      stopFeed();
      setFeed({ status: "error", trickle: false, message: "The simulated rail rejected the connection. Recorded totals are unchanged." });
    },
    reset() { replace(seedDemo()); },
    /** Presenter shortcut: replace everything with the stage-script starting point. */
    loadStage() { replace(stageDemo(Date.now())); },
  };
}
