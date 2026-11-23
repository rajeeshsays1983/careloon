import { APPROVAL_STATUS_LABELS, type ApprovalStatus } from "@/lib/approvals";

const STATUS_STYLES: Record<ApprovalStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
};

export function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {APPROVAL_STATUS_LABELS[status]}
    </span>
  );
}
