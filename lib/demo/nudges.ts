import { cohort, inCohort, paidMap, publishedDues } from "./collections";
import { spacePermission } from "./spaces";
import type { DemoState } from "./store";
import { naira } from "./withdrawals";

export const GENERATION_DELAY_MS = 1200;
export const NUDGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const MAX_NUDGE_LENGTH = 480;
export const LANGUAGES = { en: "English", pcm: "Pidgin" } as const;
export type Language = keyof typeof LANGUAGES;
export type Behaviour = "part_paid" | "paid_other" | "not_paid";
/** Sent nudge. Lands only in the local demo inbox; nothing is emailed, texted or sent to WhatsApp. */
export type SentNudge = { id: string; spaceId: string; studentId: string; language: Language; text: string; balanceKobo: number; suggestedAt: string; sentAt: string; sentBy: string };
export type NudgeState = { nudges: SentNudge[] };
export type NudgeCommand = { type: "send_nudges"; spaceId: string; messages: { studentId: string; language: Language; text: string; suggestedAt: string }[] };
export type NudgeTarget = ReturnType<typeof nudgeTargets>[number];
export type Draft = { studentId: string; language: Language; text: string; suggestedAt: string; timing: string };

const DAY = 86_400_000;
/** Africa/Lagos is UTC+1 all year. */
const lagosDate = (ms: number) => new Date(ms + 3600_000).toISOString().slice(0, 10);
const daysUntil = (deadline: string, now: number) => Math.round((Date.parse(deadline) - Date.parse(lagosDate(now))) / DAY);
const lastNudge = (state: DemoState, spaceId: string, studentId: string) =>
  state.nudges.filter(item => item.spaceId === spaceId && item.studentId === studentId).at(-1);

/** Students in one space who still owe something, with their balance, nearest deadline and payment behaviour. Fully paid students never appear. */
export function nudgeTargets(state: DemoState, spaceId: string, now = Date.now()) {
  const paid = paidMap(state, spaceId);
  const dues = publishedDues(state, spaceId);
  return cohort(spaceId).flatMap(student => {
    const lines = dues.map(due => ({ due, paidKobo: paid.get(`${student.id}/${due.id}`) ?? 0 }))
      .map(line => ({ ...line, remainingKobo: line.due.amountKobo - line.paidKobo }));
    const owing = lines.filter(line => line.remainingKobo > 0);
    if (!owing.length) return [];
    const deadline = owing.map(line => line.due.deadline).sort()[0];
    const behaviour: Behaviour = owing.some(line => line.paidKobo > 0) ? "part_paid" : lines.some(line => line.remainingKobo <= 0) ? "paid_other" : "not_paid";
    const last = lastNudge(state, spaceId, student.id);
    return [{
      student, behaviour, deadline, daysLeft: daysUntil(deadline, now),
      dueTitles: owing.map(line => line.due.title),
      paidTitles: owing.filter(line => line.paidKobo > 0).map(line => line.due.title),
      paidKobo: owing.reduce((total, line) => total + line.paidKobo, 0),
      remainingKobo: owing.reduce((total, line) => total + line.remainingKobo, 0),
      lastNudgedAt: last?.sentAt ?? null,
      coolingDown: !!last && now - Date.parse(last.sentAt) < NUDGE_COOLDOWN_MS,
    }];
  }).sort((a, b) => a.daysLeft - b.daysLeft || Number(b.behaviour === "part_paid") - Number(a.behaviour === "part_paid"));
}

/** Next Lagos wall-clock slot after `now`, as ISO UTC. */
function nextSlot(now: number, hour: number, minute: number) {
  const lagos = new Date(now + 3600_000);
  let slot = Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate(), hour, minute) - 3600_000;
  if (slot <= now) slot += DAY;
  return new Date(slot).toISOString();
}
/** Deterministic send-time rule: urgent balances go in the morning, instalment payers after lectures, everyone else at lunch. */
export function suggestSendTime(target: Pick<NudgeTarget, "daysLeft" | "behaviour">, now: number) {
  if (target.daysLeft <= 2) return { at: nextSlot(now, 9, 0), timing: target.daysLeft < 0 ? "Overdue: next morning at 09:00" : "Deadline close: next morning at 09:00" };
  if (target.behaviour === "part_paid") return { at: nextSlot(now, 18, 0), timing: "Paying in instalments: after lectures at 18:00" };
  return { at: nextSlot(now, 12, 30), timing: "Lunch break at 12:30" };
}

const list = (items: string[], and: string) => items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} ${and} ${items.at(-1)}`;
const longDate = (deadline: string) => new Date(`${deadline}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

/** Personalised template. Same inputs always give the same words. */
export function draftText(target: NudgeTarget, language: Language, space: { name: string; joinCode: string }, repName: string) {
  const first = target.student.name.split(" ")[0];
  const rep = repName.split(" ")[0];
  const dues = list(target.dueTitles, language === "en" ? "and" : "plus");
  const paidDues = list(target.paidTitles, language === "en" ? "and" : "plus");
  const paid = naira(target.paidKobo);
  const left = naira(target.remainingKobo);
  const date = longDate(target.deadline);
  const days = target.daysLeft;
  if (language === "pcm") {
    const body = target.behaviour === "part_paid" ? `thank you for the ${paid} wey you don pay for ${paidDues}. Na ${left} remain for ${dues}`
      : target.behaviour === "paid_other" ? `you dey always pay sharp sharp. Na only ${left} remain for ${dues}`
      : `abeg no forget say ${left} still dey for ${dues}`;
    const when = days < 0 ? `. The deadline (${date}) don pass, abeg settle am quick.` : days === 0 ? `, and e due today o.` : `, before ${date} (${days} ${days === 1 ? "day" : "days"} remain).`;
    return `How far ${first}, ${body}${when} Use join code ${space.joinCode} pay am. – ${rep}, ${space.name}`;
  }
  const body = target.behaviour === "part_paid" ? `thanks for the ${paid} you've already paid towards ${paidDues}. ${left} is left for ${dues}`
    : target.behaviour === "paid_other" ? `thanks for staying on top of your dues. Just ${left} is left for ${dues}`
    : `a quick reminder that ${left} is outstanding for ${dues}`;
  const when = days < 0 ? `. It was due on ${date}, so please settle it as soon as you can.` : days === 0 ? `, due today.` : `, due by ${date} (${days} ${days === 1 ? "day" : "days"} left).`;
  return `Hi ${first}, ${body}${when} Pay with join code ${space.joinCode}. – ${rep}, ${space.name}`;
}

/**
 * Simulated AI generation: a delay, then deterministic templates. No model or network call.
 * `fail` lets the presenter show the error path; failure creates no drafts.
 */
export async function generateDrafts(state: DemoState, spaceId: string, studentIds: string[], language: Language, options: { now?: number; delayMs?: number; fail?: boolean } = {}): Promise<Draft[]> {
  const now = options.now ?? Date.now();
  const space = state.spaces.find(item => item.id === spaceId);
  if (!space || !spacePermission(state, spaceId, "post_announcement")) throw new Error("Your role cannot message students in this space.");
  if (!Object.hasOwn(LANGUAGES, language)) throw new Error("Choose English or Pidgin.");
  const targets = new Map(nudgeTargets(state, spaceId, now).map(target => [target.student.id, target]));
  const chosen = studentIds.map(id => targets.get(id));
  if (!chosen.length || chosen.some(target => !target)) throw new Error("Choose students who still owe in this space.");
  const repName = state.users.find(user => user.id === state.selectedId)!.name;
  await new Promise(resolve => setTimeout(resolve, options.delayMs ?? GENERATION_DELAY_MS));
  if (options.fail) throw new Error("The simulated AI writer did not respond. No drafts were created. Try again.");
  return (chosen as NudgeTarget[]).map(target => {
    const time = suggestSendTime(target, now);
    return { studentId: target.student.id, language, text: draftText(target, language, space, repName), suggestedAt: time.at, timing: time.timing };
  });
}

/** Record reviewed nudges in the demo inbox. Paid and recently nudged students are refused; the balance is re-checked at send time. */
export function transitionNudges(state: DemoState, action: NudgeCommand, now: number, id: string): DemoState {
  if (state.audit.some(entry => entry.id === id)) throw new Error("This operation has already been used.");
  if (!spacePermission(state, action.spaceId, "post_announcement")) throw new Error("Your role cannot message students in this space.");
  if (!Array.isArray(action.messages) || !action.messages.length) throw new Error("Select at least one draft to send.");
  if (new Set(action.messages.map(message => message.studentId)).size !== action.messages.length) throw new Error("Each student can receive one nudge per send.");
  const targets = new Map(nudgeTargets(state, action.spaceId, now).map(target => [target.student.id, target]));
  const sent = action.messages.map((message, index) => {
    const target = targets.get(message.studentId);
    if (!target) throw new Error("A selected student has no outstanding balance in this space.");
    if (target.coolingDown) throw new Error(`${target.student.name} was already nudged in the last 24 hours.`);
    const text = typeof message.text === "string" ? message.text.trim() : "";
    if (!text || text.length > MAX_NUDGE_LENGTH) throw new Error(`Each message needs 1–${MAX_NUDGE_LENGTH} characters.`);
    if (!Object.hasOwn(LANGUAGES, message.language) || !Number.isFinite(Date.parse(message.suggestedAt))) throw new Error("Invalid draft.");
    return { id: `${id}-${index}`, spaceId: action.spaceId, studentId: target.student.id, language: message.language, text, balanceKobo: target.remainingKobo, suggestedAt: message.suggestedAt, sentAt: new Date(now).toISOString(), sentBy: state.selectedId };
  });
  return { ...state, nudges: [...state.nudges, ...sent],
    audit: [...state.audit, { id, actorId: state.selectedId, action: "send_nudges", targetId: action.spaceId, at: new Date(now).toISOString() }] };
}

/** Strict restore validation for the version-5 nudge log. */
export function validNudges(state: DemoState) {
  const keys = ["balanceKobo", "id", "language", "sentAt", "sentBy", "spaceId", "studentId", "suggestedAt", "text"].join();
  if (!Array.isArray(state.nudges)) return false;
  const ids = new Set<string>();
  return state.nudges.every(item => {
    const ok = item && typeof item === "object" && Object.keys(item).sort().join() === keys && typeof item.id === "string" && !ids.has(item.id)
      && state.spaces.some(space => space.id === item.spaceId) && inCohort(item.spaceId, item.studentId) && Object.hasOwn(LANGUAGES, item.language)
      && typeof item.text === "string" && item.text.trim().length > 0 && item.text.length <= MAX_NUDGE_LENGTH
      && Number.isSafeInteger(item.balanceKobo) && item.balanceKobo > 0 && state.users.some(user => user.id === item.sentBy)
      && Number.isFinite(Date.parse(item.sentAt)) && Number.isFinite(Date.parse(item.suggestedAt));
    ids.add(item.id);
    return ok;
  });
}
