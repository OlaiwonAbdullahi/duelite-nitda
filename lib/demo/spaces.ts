import { DUE_TYPES, type Due, type Space, type SpaceMember, type SpaceRole } from "../rep/models";
import { canActInSpace, canCollect, canCreateSpace, type SpaceAction } from "../rep/permissions";
import type { DemoState } from "./store";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const TEAM_ROLES = ["treasurer", "secretary", "pro", "adviser"] as const;
export type TeamRole = typeof TEAM_ROLES[number];
export type Invite = { id: string; spaceId: string; email: string; role: TeamRole; expiresAt: number; status: "pending" | "accepted" | "revoked" };
export type SpaceState = { spaces: Space[]; members: SpaceMember[]; dues: Due[]; invites: Invite[]; selectedSpaceId: string | null };
export type DueInput = Pick<Due, "title" | "type" | "amountKobo" | "deadline" | "allowInstalments">;
export type SpaceCommand =
  | { type: "create_space"; name: string }
  | { type: "select_space"; spaceId: string }
  | { type: "save_due"; spaceId: string; dueId?: string; due: DueInput }
  | { type: "publish_due"; spaceId: string; dueId: string }
  | { type: "invite"; spaceId: string; email: string; role: TeamRole }
  | { type: "accept_invite"; inviteId: string }
  | { type: "revoke_invite"; spaceId: string; inviteId: string }
  | { type: "revoke_member"; spaceId: string; userId: string }
  | { type: "set_signatories"; spaceId: string; secondId: string };
export const SPACE_ACTIONS = ["create_space", "select_space", "save_due", "publish_due", "invite", "accept_invite", "revoke_invite", "revoke_member", "set_signatories"];
export function demoEmail(userId: string) { return `${userId}@demo.duelite.test`; }
export function spacePermission(state: DemoState, spaceId: string, action: SpaceAction) {
  const space = state.spaces.find(item => item.id === spaceId);
  const actor = state.users.find(item => item.id === state.selectedId);
  const owner = state.users.find(item => item.id === space?.ownerId);
  const member = state.members.find(item => item.spaceId === spaceId && item.userId === actor?.id);
  return !!(space && actor && owner && member && canActInSpace(actor, owner, space, member, action));
}
export function visibleSpaces(state: DemoState) { return state.spaces.filter(space => spacePermission(state, space.id, "view_reports")); }
export function nairaToKobo(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) throw new Error("Enter a positive naira amount with at most two decimal places.");
  const [whole, fraction = ""] = value.trim().split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Enter a valid positive amount.");
  return amount;
}
export function validDue(due: DueInput) {
  return typeof due.title === "string" && due.title.trim().length > 0 && due.title.length <= 100 && DUE_TYPES.includes(due.type) && Number.isSafeInteger(due.amountKobo) && due.amountKobo > 0 && typeof due.allowInstalments === "boolean" && /^\d{4}-\d{2}-\d{2}$/.test(due.deadline) && Number.isFinite(Date.parse(due.deadline)) && new Date(due.deadline).toISOString().slice(0, 10) === due.deadline;
}
export function resolveJoinCode(state: DemoState, schoolId: string, code: string) {
  return state.spaces.find(space => space.schoolId === schoolId && space.joinCode === code.trim().toUpperCase() && space.status === "active") ?? null;
}
export function payableDues(state: DemoState, schoolId: string, spaceId: string) {
  const space = state.spaces.find(item => item.id === spaceId && item.schoolId === schoolId && item.status === "active");
  const owner = state.users.find(user => user.id === space?.ownerId);
  return space && owner && canCollect(owner) ? state.dues.filter(due => due.spaceId === spaceId && due.status === "published") : [];
}
/** Why a due can no longer be edited, or "" when it can. */
export function dueLock(state: DemoState, dueId: string) {
  if (state.collections.some(event => event.lines.some(line => line.dueId === dueId))) return "This due has confirmed payments and can no longer be edited.";
  if (state.orders.some(order => order.dueId === dueId)) return "Vendor items keep the catalogue price. Attach a new item instead of editing this due.";
  return "";
}
export function configuredSignatories(state: SpaceState, spaceId: string) {
  const space = state.spaces.find(item => item.id === spaceId);
  const members = state.members.filter(item => item.spaceId === spaceId && item.status === "active" && item.isSignatory);
  return space && members.length === 2 && members.some(item => item.userId === space.ownerId && item.role === "owner") && members.some(item => item.userId !== space.ownerId && ["treasurer", "adviser"].includes(item.role)) ? members : [];
}
export function transitionSpace(state: DemoState, action: SpaceCommand, now: number, id: string): DemoState {
  const actor = state.users.find(user => user.id === state.selectedId)!;
  if (state.audit.some(entry => entry.id === id)) throw new Error("This operation has already been used.");
  const requirePermission = (spaceId: string, permission: SpaceAction) => {
    if (!spacePermission(state, spaceId, permission)) throw new Error(permission === "publish_dues" ? "Publishing requires owner approval, verified KYC and an owner or treasurer role." : "Your role cannot perform this action in this space.");
  };
  let next = { ...state };
  let targetId = "spaceId" in action ? action.spaceId : actor.id;
  switch (action.type) {
    case "create_space": {
      if (!canCreateSpace(actor)) throw new Error("Rep approval is required to create a space.");
      const name = action.name.trim();
      if (!name || name.length > 80) throw new Error("Enter a space name of 1–80 characters.");
      let sequence = state.spaces.length + 1;
      while (state.spaces.some(space => space.joinCode === `DU${String(sequence).padStart(6, "0")}`)) sequence++;
      targetId = id;
      next = { ...state, spaces: [...state.spaces, { id, schoolId: actor.schoolId, ownerId: actor.id, name, joinCode: `DU${String(sequence).padStart(6, "0")}`, status: "active" }], members: [...state.members, { spaceId: id, userId: actor.id, role: "owner", status: "active", isSignatory: false }], selectedSpaceId: id };
      break;
    }
    case "select_space": requirePermission(action.spaceId, "view_reports"); return { ...state, selectedSpaceId: action.spaceId };
    case "save_due": {
      requirePermission(action.spaceId, "manage_dues");
      if (!validDue(action.due)) throw new Error("Use a title, a valid positive kobo amount, due type and calendar deadline.");
      const existing = state.dues.find(due => due.id === action.dueId && due.spaceId === action.spaceId);
      if (action.dueId && (!existing || existing.status === "closed")) throw new Error("This due cannot be edited in this space.");
      const locked = existing && dueLock(state, existing.id);
      if (locked) throw new Error(locked);
      const due: Due = { id: existing?.id ?? id, spaceId: action.spaceId, title: action.due.title.trim(), type: action.due.type, amountKobo: action.due.amountKobo, deadline: action.due.deadline, allowInstalments: action.due.allowInstalments, status: "draft" };
      targetId = due.id;
      next.dues = existing ? state.dues.map(item => item.id === due.id ? due : item) : [...state.dues, due];
      break;
    }
    case "publish_due": {
      requirePermission(action.spaceId, "publish_dues");
      const due = state.dues.find(item => item.id === action.dueId && item.spaceId === action.spaceId);
      if (!due || due.status !== "draft") throw new Error("Only a draft in this space can be published.");
      next.dues = state.dues.map(item => item.id === due.id ? { ...item, status: "published" } : item); targetId = due.id;
      break;
    }
    case "invite": {
      requirePermission(action.spaceId, "manage_team");
      const email = action.email.trim().toLowerCase();
      const recipient = state.users.find(user => demoEmail(user.id) === email && user.schoolId === actor.schoolId && !user.isAdmin);
      if (!recipient || recipient.id === actor.id || !TEAM_ROLES.includes(action.role)) throw new Error("Choose another same-school demo student and a team role.");
      if (state.members.some(member => member.spaceId === action.spaceId && member.userId === recipient.id && member.status === "active") || state.invites.some(invite => invite.spaceId === action.spaceId && invite.email === email && invite.status === "pending" && invite.expiresAt > now)) throw new Error("This person is already a member or has a pending invitation.");
      next.invites = [...state.invites, { id, spaceId: action.spaceId, email, role: action.role, expiresAt: now + INVITE_TTL_MS, status: "pending" }]; targetId = id;
      break;
    }
    case "accept_invite": {
      const invite = state.invites.find(item => item.id === action.inviteId);
      const space = state.spaces.find(item => item.id === invite?.spaceId);
      const owner = state.users.find(user => user.id === space?.ownerId);
      if (!invite || invite.status !== "pending" || invite.expiresAt <= now || invite.email !== demoEmail(actor.id) || !space || space.schoolId !== actor.schoolId || space.status !== "active" || !owner || !canCreateSpace(owner)) throw new Error("Invitation is expired, unavailable or belongs to another identity.");
      if (state.members.some(member => member.spaceId === space.id && member.userId === actor.id && member.status === "active")) throw new Error("You already belong to this space.");
      next.members = [...state.members.filter(member => !(member.spaceId === space.id && member.userId === actor.id)), { spaceId: space.id, userId: actor.id, role: invite.role, status: "active", isSignatory: false }];
      next.invites = state.invites.map(item => item.id === invite.id ? { ...item, status: "accepted" } : item);
      next.selectedSpaceId = space.id; targetId = invite.id;
      break;
    }
    case "revoke_invite":
      requirePermission(action.spaceId, "manage_team");
      if (!state.invites.some(item => item.id === action.inviteId && item.spaceId === action.spaceId && item.status === "pending")) throw new Error("Pending invitation not found.");
      next.invites = state.invites.map(item => item.id === action.inviteId ? { ...item, status: "revoked" } : item); targetId = action.inviteId;
      break;
    case "revoke_member": {
      requirePermission(action.spaceId, "manage_team");
      const member = state.members.find(item => item.spaceId === action.spaceId && item.userId === action.userId && item.status === "active" && item.role !== "owner");
      if (!member) throw new Error("Active co-rep not found.");
      next.members = state.members.map(item => item.spaceId !== action.spaceId ? item : { ...item, status: item.userId === action.userId ? "revoked" : item.status, isSignatory: member.isSignatory ? false : item.isSignatory }); targetId = action.userId;
      break;
    }
    case "set_signatories": {
      requirePermission(action.spaceId, "manage_team");
      if (!state.members.some(item => item.spaceId === action.spaceId && item.userId === action.secondId && item.userId !== actor.id && item.status === "active" && ["treasurer", "adviser"].includes(item.role))) throw new Error("Select one accepted treasurer or adviser, distinct from the owner.");
      next.members = state.members.map(item => item.spaceId === action.spaceId ? { ...item, isSignatory: item.status === "active" && [actor.id, action.secondId].includes(item.userId) } : item);
      break;
    }
  }
  return { ...next, audit: [...state.audit, { id, actorId: actor.id, action: action.type, targetId, at: new Date(now).toISOString() }] };
}

/** Strict shape and relational validation for the version-2 extension. */
export function validSpaceState(state: DemoState) {
  const keys = (value: object, expected: string[]) => value && Object.keys(value).sort().join() === expected.sort().join();
  const unique = (values: string[]) => new Set(values).size === values.length;
  if (![state.spaces, state.members, state.dues, state.invites].every(Array.isArray)) return false;
  if (!unique(state.spaces.map(s => s.id)) || !unique(state.spaces.map(s => s.joinCode)) || !unique(state.dues.map(d => d.id)) || !unique(state.invites.map(i => i.id)) || !unique(state.members.map(m => `${m.spaceId}/${m.userId}`))) return false;
  for (const space of state.spaces) {
    if (!keys(space, ["id", "schoolId", "ownerId", "name", "joinCode", "status"]) || typeof space.id !== "string" || !space.id || typeof space.name !== "string" || !space.name.trim() || space.name.length > 80 || !/^DU\d{6,}$/.test(space.joinCode) || !["active", "suspended", "archived"].includes(space.status) || !state.users.some(u => u.id === space.ownerId && u.schoolId === space.schoolId) || state.members.filter(m => m.spaceId === space.id && m.role === "owner" && m.status === "active" && m.userId === space.ownerId).length !== 1) return false;
    const signed = state.members.filter(m => m.spaceId === space.id && m.isSignatory);
    if (signed.length && !configuredSignatories(state, space.id).length) return false;
  }
  for (const member of state.members) {
    const space = state.spaces.find(s => s.id === member.spaceId);
    if (!keys(member, ["spaceId", "userId", "role", "status", "isSignatory"]) || !space || !state.users.some(u => u.id === member.userId && u.schoolId === space.schoolId) || !(["owner", ...TEAM_ROLES] as SpaceRole[]).includes(member.role) || !["active", "revoked"].includes(member.status) || typeof member.isSignatory !== "boolean" || (member.isSignatory && member.status !== "active") || (member.role === "owner" && member.userId !== space.ownerId)) return false;
  }
  for (const due of state.dues) if (!keys(due, ["id", "spaceId", "title", "type", "amountKobo", "deadline", "allowInstalments", "status"]) || typeof due.id !== "string" || !due.id || !validDue(due) || !state.spaces.some(s => s.id === due.spaceId) || !["draft", "published", "closed"].includes(due.status)) return false;
  for (const invite of state.invites) {
    const space = state.spaces.find(s => s.id === invite.spaceId);
    if (!keys(invite, ["id", "spaceId", "email", "role", "expiresAt", "status"]) || typeof invite.id !== "string" || !invite.id || !space || !state.users.some(u => demoEmail(u.id) === invite.email && u.schoolId === space.schoolId && u.id !== space.ownerId && !u.isAdmin) || !TEAM_ROLES.includes(invite.role) || !Number.isSafeInteger(invite.expiresAt) || !["pending", "accepted", "revoked"].includes(invite.status)) return false;
  }
  return state.selectedSpaceId === null || visibleSpaces(state).some(s => s.id === state.selectedSpaceId);
}
