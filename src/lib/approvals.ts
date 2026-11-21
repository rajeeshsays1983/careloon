export type ApprovalStatus = "pending" | "approved" | "rejected";

export type ApprovalDecision = Exclude<ApprovalStatus, "pending">;

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: "Awaiting PMR approval",
  approved: "Approved",
  rejected: "Rejected",
};

export function parseApprovalStatus(value: unknown): ApprovalStatus {
  if (value === "pending" || value === "approved" || value === "rejected") {
    return value;
  }
  // Records created before the approval workflow existed are treated as approved.
  return "approved";
}
