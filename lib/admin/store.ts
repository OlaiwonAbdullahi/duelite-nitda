"use client";

/* In-memory demo store.
 *
 * useSyncExternalStore over a module-level object: no provider, no reducer,
 * no dependency. Nothing is persisted — a refresh or the reset button puts the
 * seeded world back exactly as it was. */

import { useSyncExternalStore } from "react";

import {
  buildSeed,
  studentFee,
  type Activity,
  type ActivityKind,
  type DemoState,
  type Payment,
  type Refund,
} from "./seed";

export * from "./seed";

let state: DemoState = buildSeed();
const listeners = new Set<() => void>();

const emit = () => {
  state = { ...state };
  listeners.forEach((l) => l());
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const snapshot = () => state;

/** Server render always sees the pristine seed, which is what the client
 *  starts from too, so markup matches on hydration. */
const serverSnapshot = () => state;

export function useDemo(): DemoState {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/* ----------------------------------------------------------------- actions */

let seq = 0;
const nextId = (prefix: string) => `${prefix}_new_${++seq}`;

/** Actions append here rather than to a side channel, so the audit log is
 *  written by the same code path that changes the money. */
function log(actorId: string, action: string, target: string, kind: ActivityKind) {
  const entry: Activity = {
    id: nextId("act"),
    actorId,
    action,
    target,
    kind,
    at: Date.now(),
  };
  state.activity = [entry, ...state.activity];
}

export const ADMIN_ID = "usr_admin";

export function approveRep(userId: string) {
  const user = state.users.find((u) => u.id === userId);
  if (!user || user.repStatus !== "pending") return;
  user.isRep = true;
  user.repStatus = "approved";
  user.kyc = "verified";
  log(ADMIN_ID, "Approved rep", user.name, "approval");
  emit();
}

export function rejectRep(userId: string) {
  const user = state.users.find((u) => u.id === userId);
  if (!user || user.repStatus !== "pending") return;
  user.isRep = false;
  user.repStatus = "rejected";
  log(ADMIN_ID, "Rejected rep", user.name, "approval");
  emit();
}

export function setSpaceStatus(spaceId: string, status: "active" | "paused") {
  const space = state.spaces.find((s) => s.id === spaceId);
  if (!space || space.status === status) return;
  space.status = status;
  log(ADMIN_ID, status === "paused" ? "Paused space" : "Reactivated space", space.name, "approval");
  emit();
}

export function resolveRefund(
  refundId: string,
  status: Refund["status"],
  note: string,
) {
  const refund = state.refunds.find((r) => r.id === refundId);
  if (!refund) return;
  refund.status = status;
  refund.note = note;
  log(ADMIN_ID, `Refund ${status}`, `₦${refund.amount.toLocaleString()} — ${note || "no note"}`, "dispute");
  emit();
}

/** Demo panel: drop a burst of fresh payments into a space so the numbers
 *  visibly move on stage. */
export function simulatePayments(spaceId: string, count = 6) {
  const space = state.spaces.find((s) => s.id === spaceId);
  if (!space) return;
  const dues = state.dues.filter((d) => d.spaceId === spaceId);
  if (!dues.length) return;

  const paidBefore = new Set(
    state.payments.filter((p) => p.spaceId === spaceId).map((p) => p.userId),
  );
  const candidates = space.memberIds.filter((id) => !paidBefore.has(id));
  const fresh: Payment[] = [];

  for (let i = 0; i < count; i++) {
    const userId = candidates[i] ?? space.memberIds[(i * 7) % space.memberIds.length];
    const lines = [dues[i % dues.length], dues[(i + 1) % dues.length]]
      .filter((d, idx, arr) => arr.indexOf(d) === idx)
      .map((d) => ({ dueId: d.id, amount: d.amount }));
    const total = lines.reduce((s, l) => s + l.amount, 0);
    const payment: Payment = {
      id: nextId("pay"),
      userId,
      spaceId,
      total,
      fee: studentFee(total),
      status: "paid",
      reference: `DLT-LIVE${String(++seq).padStart(3, "0")}`,
      at: Date.now(),
      lines,
    };
    fresh.push(payment);
    log(userId, "Paid dues", `${payment.reference} — ₦${total.toLocaleString()}`, "money");
  }

  state.payments = [...state.payments, ...fresh];
  emit();
}

export function issueApiKey(schoolId: string) {
  const school = state.schools.find((s) => s.id === schoolId);
  if (!school) return;
  const random = Array.from({ length: 16 }, () =>
    "0123456789abcdef"[Math.floor(Math.random() * 16)],
  ).join("");
  state.apiKeys = [
    ...state.apiKeys,
    {
      id: nextId("key"),
      schoolId,
      key: `dlt_live_${school.short.toLowerCase()}_${random}`,
      createdAt: Date.now(),
      revoked: false,
    },
  ];
  log(ADMIN_ID, "Issued API key", school.short, "api");
  emit();
}

export function revokeApiKey(keyId: string) {
  const key = state.apiKeys.find((k) => k.id === keyId);
  if (!key || key.revoked) return;
  key.revoked = true;
  log(ADMIN_ID, "Revoked API key", key.key, "api");
  emit();
}

export function touchApiKey(keyId: string, endpoint: string) {
  const key = state.apiKeys.find((k) => k.id === keyId);
  if (!key) return;
  key.lastUsedAt = Date.now();
  log(key.schoolId, "API request", endpoint, "api");
  emit();
}

export function resetDemo() {
  state = buildSeed();
  seq = 0;
  listeners.forEach((l) => l());
}

/* --------------------------------------------------------------- selectors */

export const userById = (s: DemoState, id: string) =>
  s.users.find((u) => u.id === id);

export const spaceById = (s: DemoState, id: string) =>
  s.spaces.find((sp) => sp.id === id);

export const spaceByCode = (s: DemoState, code: string) =>
  s.spaces.find((sp) => sp.joinCode.toLowerCase() === code.toLowerCase());

/* ------------------------------------------------------------- formatting */

export const naira = (n: number) =>
  "₦" + Math.round(n).toLocaleString("en-NG");

export const shortDate = (at: number) =>
  new Date(at).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export const dateTime = (at: number) =>
  new Date(at).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
