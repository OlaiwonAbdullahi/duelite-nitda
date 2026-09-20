/** All monetary fields use integer kobo; timestamps use ISO 8601 UTC. */
export const DUE_TYPES = [
  "handout", "departmental_due", "exam_levy", "lab_manual",
  "association_due", "departmental_wear", "trip_fee", "clearance", "other",
] as const;
export type DueType = (typeof DUE_TYPES)[number];
export type ApprovalStatus = "not_applied" | "pending" | "approved" | "rejected";
export type KycStatus = "not_started" | "pending" | "verified" | "failed";
export type SpaceRole = "owner" | "treasurer" | "secretary" | "pro" | "adviser" | "student";

export interface RepUser {
  id: string;
  schoolId: string;
  name: string;
  isRep: boolean;
  approvalStatus: ApprovalStatus;
  kycStatus: KycStatus;
}

export interface Space {
  id: string;
  schoolId: string;
  ownerId: string;
  name: string;
  joinCode: string;
  status: "active" | "suspended" | "archived";
}

export interface SpaceMember {
  spaceId: string;
  userId: string;
  role: SpaceRole;
  status: "invited" | "active" | "revoked";
  isSignatory: boolean;
}

export interface Due {
  id: string;
  spaceId: string;
  title: string;
  type: DueType;
  amountKobo: number;
  /** Calendar date YYYY-MM-DD interpreted in Africa/Lagos. */
  deadline: string;
  allowInstalments: boolean;
  status: "draft" | "published" | "closed";
}

export interface ConfirmedCollection {
  eventId: string;
  paymentId: string;
  reference: string;
  spaceId: string;
  studentId: string;
  confirmedAt: string;
  faceAmountKobo: number;
  studentFeeKobo: number;
  lines: { dueId: string; amountKobo: number }[];
}

export type WithdrawalStatus = "pending_review" | "awaiting_signatories" |
  "processing" | "succeeded" | "failed" | "rejected" | "expired";

export interface Withdrawal {
  id: string;
  spaceId: string;
  requestedBy: string;
  destinationId: string;
  purpose: string;
  amountKobo: number;
  feeKobo: number;
  reference: string;
  status: WithdrawalStatus;
  flagReasons: string[];
  createdAt: string;
}

/** Server-only persistence record; never return the hash to the browser. */
export interface SignatoryApproval {
  withdrawalId: string;
  userId: string;
  codeHash: string;
  expiresAt: string;
  usedAt: string | null;
  failedAttempts: number;
}
