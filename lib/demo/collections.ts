import { studentFeeKobo } from "../rep/money";
import type { ConfirmedCollection, Due } from "../rep/models";
import { canCollect } from "../rep/permissions";
import type { DemoState } from "./store";

export const COHORT_SIZE = 200;
export const TRICKLE_MS = 1500;
export const BURST_SIZE = 20;
export const LINK_DELAY_MS = 900;
export const RECONNECT_MS = 2500;
export type CohortStudent = { id: string; name: string; matric: string };
export type CollectCommand = { type: "collect"; event: ConfirmedCollection };
export type CollectionState = { collections: ConfirmedCollection[] };

const FIRST = ["Ada", "Tunde", "Zainab", "Chidi", "Amaka", "Bola", "Ifeanyi", "Ngozi", "Yusuf", "Funke", "Emeka", "Halima", "Segun", "Chioma", "Musa", "Temi", "Obinna", "Aisha", "Kelechi", "Damilola"];
const LAST = ["Okafor", "Bello", "Musa", "Adeyemi", "Eze", "Balogun", "Nwosu", "Ibrahim", "Olawale", "Chukwu", "Danjuma", "Akpan", "Oyelaran", "Uche", "Sani", "Adebayo"];

/** Deterministic 32-bit hash and mulberry32 stream: same seed always yields the same cohort and event order. */
function hash(value: string) {
  let h = 2166136261;
  for (let index = 0; index < value.length; index++) h = Math.imul(h ^ value.charCodeAt(index), 16777619);
  return h >>> 0;
}
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cohorts = new Map<string, CohortStudent[]>();
/** Synthetic class list derived from the space id; never persisted, so the envelope stays small. */
export function cohort(spaceId: string): CohortStudent[] {
  const cached = cohorts.get(spaceId);
  if (cached) return cached;
  const next = rng(hash(spaceId));
  const people = Array.from({ length: COHORT_SIZE }, (_, index) => ({
    id: `${spaceId}-s${String(index + 1).padStart(3, "0")}`,
    name: `${FIRST[Math.floor(next() * FIRST.length)]} ${LAST[Math.floor(next() * LAST.length)]}`,
    matric: `UL/${20 + Math.floor(next() * 5)}/${String(1000 + index).padStart(4, "0")}`,
  }));
  cohorts.set(spaceId, people);
  return people;
}
export function inCohort(spaceId: string, studentId: string) {
  return studentId.startsWith(`${spaceId}-s`) && cohort(spaceId).some(student => student.id === studentId);
}

/** One pass over confirmed events: `studentId/dueId` -> face kobo already credited. Pending/failed payments never reach here. */
export function paidMap(state: DemoState, spaceId: string) {
  const paid = new Map<string, number>();
  for (const event of state.collections) {
    if (event.spaceId !== spaceId) continue;
    for (const line of event.lines) {
      const key = `${event.studentId}/${line.dueId}`;
      paid.set(key, (paid.get(key) ?? 0) + line.amountKobo);
    }
  }
  return paid;
}
export function publishedDues(state: DemoState, spaceId: string) {
  return state.dues.filter(due => due.spaceId === spaceId && due.status === "published");
}
export function duePaidKobo(state: DemoState, dueId: string) {
  return state.collections.reduce((total, event) => total + event.lines.filter(line => line.dueId === dueId).reduce((sum, line) => sum + line.amountKobo, 0), 0);
}

export function spaceTotals(state: DemoState, spaceId: string) {
  const events = state.collections.filter(event => event.spaceId === spaceId);
  const dues = publishedDues(state, spaceId);
  const collectedKobo = events.reduce((total, event) => total + event.faceAmountKobo, 0);
  const expectedKobo = dues.reduce((total, due) => total + due.amountKobo, 0) * COHORT_SIZE;
  return {
    collectedKobo, expectedKobo,
    outstandingKobo: Math.max(0, expectedKobo - collectedKobo),
    studentFeesKobo: events.reduce((total, event) => total + event.studentFeeKobo, 0),
    paymentCount: events.length,
    payerCount: new Set(events.map(event => event.studentId)).size,
    lastAt: events.length ? events[events.length - 1].confirmedAt : null,
  };
}

export function dueProgress(state: DemoState, spaceId: string) {
  const paid = paidMap(state, spaceId);
  return publishedDues(state, spaceId).map(due => {
    const entries = [...paid].filter(([key]) => key.endsWith(`/${due.id}`)).map(([, amount]) => amount);
    const collectedKobo = entries.reduce((total, amount) => total + amount, 0);
    const expectedKobo = due.amountKobo * COHORT_SIZE;
    return {
      due, collectedKobo, expectedKobo,
      outstandingKobo: expectedKobo - collectedKobo,
      settled: entries.filter(amount => amount >= due.amountKobo).length,
      partial: entries.filter(amount => amount < due.amountKobo).length,
    };
  });
}

export function paymentRows(state: DemoState, spaceId: string, filter: { dueId?: string; query?: string } = {}) {
  const names = new Map(cohort(spaceId).map(student => [student.id, student]));
  const query = filter.query?.trim().toLowerCase() ?? "";
  return state.collections.filter(event => event.spaceId === spaceId).flatMap(event => event.lines.map(line => ({
    key: `${event.eventId}/${line.dueId}`,
    reference: event.reference, confirmedAt: event.confirmedAt,
    studentId: event.studentId, studentName: names.get(event.studentId)?.name ?? "Unknown student",
    matric: names.get(event.studentId)?.matric ?? "",
    dueId: line.dueId, dueTitle: state.dues.find(due => due.id === line.dueId)?.title ?? "Removed due",
    amountKobo: line.amountKobo, feeKobo: event.lines.length === 1 ? event.studentFeeKobo : 0,
  }))).filter(row => (!filter.dueId || row.dueId === filter.dueId) &&
    (!query || row.studentName.toLowerCase().includes(query) || row.matric.toLowerCase().includes(query))).reverse();
}

export function outstandingRows(state: DemoState, spaceId: string, filter: { dueId?: string; query?: string } = {}) {
  const paid = paidMap(state, spaceId);
  const query = filter.query?.trim().toLowerCase() ?? "";
  const dues = publishedDues(state, spaceId).filter(due => !filter.dueId || due.id === filter.dueId);
  return cohort(spaceId).filter(student => !query || student.name.toLowerCase().includes(query) || student.matric.toLowerCase().includes(query))
    .flatMap(student => dues.map(due => {
      const paidKobo = paid.get(`${student.id}/${due.id}`) ?? 0;
      return { student, due, paidKobo, remainingKobo: due.amountKobo - paidKobo };
    })).filter(row => row.remainingKobo > 0).sort((a, b) => Number(b.paidKobo > 0) - Number(a.paidKobo > 0));
}

function remaining(paid: Map<string, number>, due: Due, studentId: string) {
  return due.amountKobo - (paid.get(`${studentId}/${due.id}`) ?? 0);
}

/**
 * Next simulated confirmed payment for a space. Derived from the current event count,
 * so the same state always produces the same event and a replay carries the same ids.
 */
export function nextCollection(state: DemoState, spaceId: string, now: number): ConfirmedCollection | null {
  const dues = publishedDues(state, spaceId);
  if (!dues.length) return null;
  const paid = paidMap(state, spaceId);
  const people = cohort(spaceId);
  const index = state.collections.filter(event => event.spaceId === spaceId).length;
  const next = rng(hash(`${spaceId}:${index}`));
  const start = Math.floor(next() * people.length);
  for (let step = 0; step < people.length; step++) {
    const student = people[(start + step) % people.length];
    const owing = dues.filter(due => remaining(paid, due, student.id) > 0);
    if (!owing.length) continue;
    const due = owing[Math.floor(next() * owing.length)];
    const left = remaining(paid, due, student.id);
    const half = due.allowInstalments && left === due.amountKobo && next() < 0.4;
    const amountKobo = half ? Math.max(1, Math.round(left / 2)) : left;
    return {
      eventId: `evt-${spaceId}-${index}`, paymentId: `pay-${spaceId}-${index}`,
      reference: `DL${String(hash(`${spaceId}${index}`)).padStart(10, "0").slice(0, 10)}`,
      spaceId, studentId: student.id, confirmedAt: new Date(now).toISOString(),
      faceAmountKobo: amountKobo, studentFeeKobo: studentFeeKobo(amountKobo),
      lines: [{ dueId: due.id, amountKobo }],
    };
  }
  return null;
}

/** Append a confirmed collection. Replays of a known event or payment id are ignored, never counted twice. */
export function transitionCollect(state: DemoState, action: CollectCommand, now: number, id: string): DemoState {
  const event = action.event;
  if (state.collections.some(item => item.eventId === event.eventId || item.paymentId === event.paymentId)) return state;
  const space = state.spaces.find(item => item.id === event.spaceId);
  const owner = state.users.find(user => user.id === space?.ownerId);
  if (!space || space.status !== "active" || !owner || !canCollect(owner)) throw new Error("This space cannot receive collections yet.");
  if (!inCohort(space.id, event.studentId)) throw new Error("The payer is not part of this space cohort.");
  if (typeof event.reference !== "string" || !event.reference.trim() || !Number.isFinite(Date.parse(event.confirmedAt))) throw new Error("Confirmed payments need a reference and a real timestamp.");
  if (!Array.isArray(event.lines) || !event.lines.length || new Set(event.lines.map(line => line.dueId)).size !== event.lines.length) throw new Error("A payment needs at least one line, one per due.");
  const paid = paidMap(state, space.id);
  for (const line of event.lines) {
    const due = state.dues.find(item => item.id === line.dueId && item.spaceId === space.id && item.status === "published");
    if (!due) throw new Error("Payments only apply to published dues in this space.");
    if (!Number.isSafeInteger(line.amountKobo) || line.amountKobo < 1) throw new Error("Payment lines use positive kobo amounts.");
    if (line.amountKobo > remaining(paid, due, event.studentId)) throw new Error("A payment cannot exceed the outstanding balance for that due.");
    if (line.amountKobo < remaining(paid, due, event.studentId) && !due.allowInstalments) throw new Error("This due does not allow instalments.");
  }
  if (event.lines.reduce((total, line) => total + line.amountKobo, 0) !== event.faceAmountKobo) throw new Error("Payment lines must sum to the face amount.");
  if (event.studentFeeKobo !== studentFeeKobo(event.faceAmountKobo)) throw new Error("Student fee does not match the 2% capped fee.");
  return { ...state, collections: [...state.collections, event],
    audit: [...state.audit, { id, actorId: "demo-rail", action: "collect", targetId: event.eventId, at: new Date(now).toISOString() }] };
}

/** Strict restore validation for the version-3 collection ledger. */
export function validCollections(state: DemoState) {
  const keys = (value: object, expected: string[]) => value && Object.keys(value).sort().join() === expected.sort().join();
  if (!Array.isArray(state.collections)) return false;
  const ids = new Set<string>();
  const paid = new Map<string, number>();
  for (const event of state.collections) {
    if (!keys(event, ["eventId", "paymentId", "reference", "spaceId", "studentId", "confirmedAt", "faceAmountKobo", "studentFeeKobo", "lines"])) return false;
    if (ids.has(event.eventId) || ids.has(event.paymentId)) return false;
    ids.add(event.eventId); ids.add(event.paymentId);
    const space = state.spaces.find(item => item.id === event.spaceId);
    if (!space || !inCohort(space.id, event.studentId) || typeof event.reference !== "string" || !event.reference.trim() || !Number.isFinite(Date.parse(event.confirmedAt))) return false;
    if (!Array.isArray(event.lines) || !event.lines.length || new Set(event.lines.map(line => line.dueId)).size !== event.lines.length) return false;
    for (const line of event.lines) {
      const due = state.dues.find(item => item.id === line.dueId && item.spaceId === space.id);
      if (!keys(line, ["dueId", "amountKobo"]) || !due || !Number.isSafeInteger(line.amountKobo) || line.amountKobo < 1) return false;
      const key = `${event.studentId}/${line.dueId}`;
      const total = (paid.get(key) ?? 0) + line.amountKobo;
      if (total > due.amountKobo) return false;
      paid.set(key, total);
    }
    if (event.lines.reduce((total, line) => total + line.amountKobo, 0) !== event.faceAmountKobo || event.studentFeeKobo !== studentFeeKobo(event.faceAmountKobo)) return false;
  }
  return true;
}
