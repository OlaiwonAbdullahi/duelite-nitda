import type { RepUser, Space, SpaceMember, SpaceRole } from "./models";

export function canCreateSpace(user: RepUser): boolean {
  return user.isRep && user.approvalStatus === "approved";
}

export function canCollect(user: RepUser): boolean {
  return canCreateSpace(user) && user.kycStatus === "verified";
}

export type SpaceAction = "view_reports" | "manage_dues" | "manage_team" |
  "publish_dues" | "request_withdrawal" | "approve_withdrawal" | "post_announcement";

const roles: Record<SpaceAction, readonly SpaceRole[]> = {
  view_reports: ["owner", "treasurer", "secretary", "pro", "adviser"],
  manage_dues: ["owner", "treasurer", "secretary"],
  manage_team: ["owner"],
  publish_dues: ["owner", "treasurer"],
  request_withdrawal: ["owner"],
  approve_withdrawal: ["owner", "treasurer", "adviser"],
  post_announcement: ["owner", "secretary", "pro"],
};

/** Pure policy shared by demo-store actions. Browser records are not a security boundary. */
export function canActInSpace(
  actor: RepUser,
  owner: RepUser,
  space: Space,
  membership: SpaceMember,
  action: SpaceAction,
): boolean {
  if (owner.id !== space.ownerId || owner.schoolId !== space.schoolId ||
      actor.schoolId !== space.schoolId || membership.spaceId !== space.id ||
      membership.userId !== actor.id || membership.status !== "active") return false;
  if (membership.role === "owner" && actor.id !== space.ownerId) return false;
  if (!roles[action].includes(membership.role)) return false;
  if (action === "view_reports") return true;
  if (space.status !== "active" || !canCreateSpace(owner)) return false;
  if (action === "approve_withdrawal" && !membership.isSignatory) return false;
  if (["publish_dues", "request_withdrawal", "approve_withdrawal"].includes(action)) {
    return canCollect(owner);
  }
  return true;
}
