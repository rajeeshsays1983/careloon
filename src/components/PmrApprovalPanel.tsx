"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { ApprovalBadge } from "@/components/ApprovalBadge";
import { getStoredUser } from "@/lib/auth";
import type { ApprovalDecision, ApprovalStatus } from "@/lib/approvals";
import type { TeamMember } from "@/lib/team";

function subscribe() {
  return () => {};
}

export type ApprovalQueueItem = {
  id: string;
  title: string;
  subtitle: string;
  meta?: string;
  approvalStatus: ApprovalStatus;
  reviewNote: string;
  reviewedByName: string | null;
  reviewedAt: string | null;
};

export function PmrApprovalPanel({
  title,
  description,
  emptyMessage,
  items,
  pmrDoctors,
  onReview,
  onRemove,
  className = "",
}: {
  title: string;
  description: string;
  emptyMessage: string;
  items: ApprovalQueueItem[];
  pmrDoctors: TeamMember[];
  onReview: (id: string, decision: ApprovalDecision, reviewer: TeamMember, note: string) => void;
  onRemove?: (id: string) => void;
  className?: string;
}) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const user = useMemo(() => (mounted ? getStoredUser() : null), [mounted]);

  const [selectedPmrId, setSelectedPmrId] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const defaultPmrId = useMemo(() => {
    if (pmrDoctors.length === 0) return "";
    const byEmail = user
      ? pmrDoctors.find((member) => member.email.toLowerCase() === user.email.toLowerCase())
      : undefined;
    return (byEmail ?? pmrDoctors[0]).id;
  }, [pmrDoctors, user]);

  const reviewer =
    pmrDoctors.find((member) => member.id === selectedPmrId) ??
    pmrDoctors.find((member) => member.id === defaultPmrId) ??
    null;

  const signedInMatches = Boolean(
    user && reviewer && reviewer.email.toLowerCase() === user.email.toLowerCase(),
  );
  const reviewerFieldId = `approval-reviewer-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;

  function approve(item: ApprovalQueueItem) {
    if (!reviewer) return;
    onReview(item.id, "approved", reviewer, notes[item.id] ?? "");
    setOpenId(null);
    setErrors((prev) => ({ ...prev, [item.id]: "" }));
  }

  function reject(item: ApprovalQueueItem) {
    if (!reviewer) return;
    const note = (notes[item.id] ?? "").trim();
    if (!note) {
      setErrors((prev) => ({
        ...prev,
        [item.id]: "Add a reason so the person knows what to correct.",
      }));
      return;
    }
    onReview(item.id, "rejected", reviewer, note);
    setOpenId(null);
    setErrors((prev) => ({ ...prev, [item.id]: "" }));
  }

  function openRejection(item: ApprovalQueueItem) {
    setNotes((prev) => ({
      ...prev,
      [item.id]: prev[item.id] ?? item.reviewNote,
    }));
    setErrors((prev) => ({ ...prev, [item.id]: "" }));
    setOpenId(item.id);
  }

  return (
    <section className={`rounded-2xl border border-border bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
        </div>
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium text-amber-800">
          {items.length} in queue
        </span>
      </div>

      {pmrDoctors.length === 0 ? (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Onboard the PMR doctor first. Only a PMR doctor can verify and approve these records.
        </p>
      ) : (
        <div className="mt-3">
          <label
            htmlFor={reviewerFieldId}
            className="mb-1.5 block text-xs font-medium text-slate-700"
          >
            Approving PMR doctor
          </label>
          <select
            id={reviewerFieldId}
            value={reviewer?.id ?? ""}
            onChange={(event) => setSelectedPmrId(event.target.value)}
            className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-brand/20 transition focus:border-brand focus:ring-4"
          >
            {pmrDoctors.map((member) => (
              <option key={member.id} value={member.id}>
                {member.fullName} ({member.email})
              </option>
            ))}
          </select>
          {!signedInMatches ? (
            <p className="mt-1.5 text-xs text-muted">
              Choose the PMR doctor approving for this demo session.
            </p>
          ) : null}
        </div>
      )}

      {items.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border px-3 py-5 text-center text-sm text-muted">
          {emptyMessage}
        </p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {items.map((item) => (
            <li key={item.id} className="rounded-xl border border-border bg-slate-50/60 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{item.title}</p>
                  <p className="mt-0.5 text-xs text-muted">{item.subtitle}</p>
                  {item.meta ? (
                    <p className="mt-0.5 text-[11px] leading-4 text-muted">{item.meta}</p>
                  ) : null}
                </div>
                <ApprovalBadge status={item.approvalStatus} />
              </div>

              {item.reviewedAt ? (
                <p className="mt-2 text-[11px] text-muted">
                  Reviewed by {item.reviewedByName || "PMR doctor"} ·{" "}
                  {new Date(item.reviewedAt).toLocaleString()}
                </p>
              ) : null}

              {item.reviewNote ? (
                <p
                  className={`mt-2 rounded-lg px-2.5 py-2 text-xs ${
                    item.approvalStatus === "rejected"
                      ? "bg-rose-50 text-rose-800"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  <span className="font-semibold">PMR note:</span> {item.reviewNote}
                </p>
              ) : null}

              {errors[item.id] ? (
                <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-2 text-xs text-danger" role="alert">
                  {errors[item.id]}
                </p>
              ) : null}

              {openId === item.id ? (
                <div className="mt-2.5 rounded-lg border border-border bg-white p-2.5">
                  <label
                    htmlFor={`reject-note-${item.id}`}
                    className="mb-1.5 block text-xs font-medium text-slate-700"
                  >
                    Reason for rejection
                  </label>
                  <textarea
                    id={`reject-note-${item.id}`}
                    value={notes[item.id] ?? ""}
                    onChange={(event) =>
                      setNotes((prev) => ({ ...prev, [item.id]: event.target.value }))
                    }
                    rows={2}
                    placeholder="Explain what needs to be corrected before approval."
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-brand/20 transition focus:border-brand focus:ring-4"
                  />
                  <div className="mt-2 flex flex-nowrap gap-1">
                    <button
                      type="button"
                      onClick={() => reject(item)}
                      disabled={!reviewer}
                      className="whitespace-nowrap rounded-lg bg-rose-600 px-1.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Confirm rejection
                    </button>
                    <button
                      type="button"
                      onClick={() => approve(item)}
                      disabled={!reviewer}
                      className="whitespace-nowrap rounded-lg border border-border bg-white px-1.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Approve instead
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenId(null);
                        setErrors((prev) => ({ ...prev, [item.id]: "" }));
                      }}
                      className="whitespace-nowrap rounded-lg px-1.5 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2.5 flex flex-nowrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => approve(item)}
                    disabled={!reviewer}
                    className="whitespace-nowrap rounded-lg bg-brand px-2 py-1 text-[11px] font-semibold text-white hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Approve
                  </button>
                  {item.approvalStatus === "pending" ? (
                    <button
                      type="button"
                      onClick={() => openRejection(item)}
                      disabled={!reviewer}
                      className="whitespace-nowrap rounded-lg border border-rose-200 bg-white px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Reject
                    </button>
                  ) : null}
                  {onRemove ? (
                    <button
                      type="button"
                      onClick={() => onRemove(item.id)}
                      className="whitespace-nowrap rounded-lg border border-border bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
