"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { SignOutButton } from "@/components/SignOutButton";
import { getPatients, getStoredUser, type Patient } from "@/lib/auth";
import {
  getStaffReports,
  REVIEW_STATUS_LABELS,
  reviewStaffReport,
  type ReviewStatus,
  type StaffReport,
} from "@/lib/reports";
import { getTeamMembers, ROLE_LABELS, type TeamMember } from "@/lib/team";

function subscribe() {
  return () => {};
}

type Filter = "pending" | "approved" | "changes_requested" | "all";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "pending", label: "Awaiting review" },
  { id: "approved", label: "Approved" },
  { id: "changes_requested", label: "Changes requested" },
  { id: "all", label: "All reports" },
];

const STATUS_STYLES: Record<ReviewStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  changes_requested: "bg-rose-100 text-rose-800",
};

type PatientCounts = {
  pending: number;
  approved: number;
  changes: number;
  total: number;
};

type PatientGroup = {
  key: string;
  patientId: string | null;
  patient: Patient | null;
  name: string;
  reports: StaffReport[];
  latest: string;
};

function emptyCounts(): PatientCounts {
  return { pending: 0, approved: 0, changes: 0, total: 0 };
}

function addToCounts(counts: PatientCounts, report: StaffReport) {
  counts.total += 1;
  if (report.reviewStatus === "approved") counts.approved += 1;
  else if (report.reviewStatus === "changes_requested") counts.changes += 1;
  else counts.pending += 1;
}

export default function DashboardPage() {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const user = useMemo(() => (mounted ? getStoredUser() : null), [mounted]);
  const members = useMemo(() => (mounted ? getTeamMembers() : []), [mounted]);
  const patients = useMemo(() => (mounted ? getPatients() : []), [mounted]);
  const storedReports = useMemo(() => (mounted ? getStaffReports() : []), [mounted]);

  const [overrides, setOverrides] = useState<Record<string, StaffReport>>({});
  const [selectedReviewerId, setSelectedReviewerId] = useState("");
  const [filter, setFilter] = useState<Filter>("pending");
  const [query, setQuery] = useState("");

  const reviewers = useMemo(
    () =>
      members.filter(
        (member) =>
          (member.role === "pmr" || member.role === "duty_doctor") &&
          member.approvalStatus === "approved",
      ),
    [members],
  );

  const defaultReviewerId = useMemo(() => {
    if (reviewers.length === 0) return "";
    const byEmail = user
      ? reviewers.find((member) => member.email.toLowerCase() === user.email.toLowerCase())
      : undefined;
    return (byEmail ?? reviewers.find((member) => member.role === "pmr") ?? reviewers[0]).id;
  }, [reviewers, user]);

  const reviewer =
    reviewers.find((member) => member.id === selectedReviewerId) ??
    reviewers.find((member) => member.id === defaultReviewerId) ??
    null;

  const reports = useMemo(() => {
    const byId = new Map<string, StaffReport>();
    for (const report of storedReports) byId.set(report.id, report);
    for (const report of Object.values(overrides)) byId.set(report.id, report);
    return [...byId.values()].filter((report) => report.status === "submitted");
  }, [storedReports, overrides]);

  const scopedReports = useMemo(() => {
    if (!reviewer) return [];
    if (reviewer.role === "pmr") return reports;
    return reports.filter((report) => {
      const staff = members.find((member) => member.id === report.staffId);
      return staff?.approvalStatus === "approved" && staff.reportsTo === reviewer.id;
    });
  }, [members, reports, reviewer]);

  const patientCounts = useMemo(() => {
    const counts = new Map<string, PatientCounts>();
    for (const report of scopedReports) {
      const key = report.patientId ?? "__unassigned__";
      const current = counts.get(key) ?? emptyCounts();
      addToCounts(current, report);
      counts.set(key, current);
    }
    return counts;
  }, [scopedReports]);

  const stats = useMemo(() => {
    const result = { patients: 0, pending: 0, approved: 0, changes: 0 };
    for (const [key, counts] of patientCounts) {
      if (key !== "__unassigned__") result.patients += 1;
      result.pending += counts.pending;
      result.approved += counts.approved;
      result.changes += counts.changes;
    }
    return result;
  }, [patientCounts]);

  const visibleReports = useMemo(() => {
    const term = query.trim().toLowerCase();
    return scopedReports.filter((report) => {
      if (filter !== "all" && report.reviewStatus !== filter) return false;
      if (!term) return true;
      const patientName =
        report.patientName ||
        patients.find((patient) => patient.id === report.patientId)?.fullName ||
        "";
      return (
        patientName.toLowerCase().includes(term) ||
        report.staffName.toLowerCase().includes(term)
      );
    });
  }, [filter, patients, query, scopedReports]);

  const groups = useMemo(() => {
    const map = new Map<string, PatientGroup>();
    for (const report of visibleReports) {
      const key = report.patientId ?? "__unassigned__";
      let group = map.get(key);
      if (!group) {
        const patient = report.patientId
          ? patients.find((item) => item.id === report.patientId) ?? null
          : null;
        group = {
          key,
          patientId: report.patientId,
          patient,
          name: patient?.fullName || report.patientName || "Unassigned patient",
          reports: [],
          latest: "",
        };
        map.set(key, group);
      }
      group.reports.push(report);
      const stamp = report.submittedAt ?? report.updatedAt;
      if (stamp > group.latest) group.latest = stamp;
    }

    return [...map.values()].sort((a, b) => {
      const aCounts = patientCounts.get(a.key) ?? emptyCounts();
      const bCounts = patientCounts.get(b.key) ?? emptyCounts();
      return (
        bCounts.pending - aCounts.pending ||
        b.latest.localeCompare(a.latest) ||
        a.name.localeCompare(b.name)
      );
    });
  }, [patientCounts, patients, visibleReports]);

  const signedInEmailMatches = Boolean(
    user && reviewer && reviewer.email.toLowerCase() === user.email.toLowerCase(),
  );

  function handleReviewed(updated: StaffReport) {
    setOverrides((prev) => ({ ...prev, [updated.id]: updated }));
  }

  return (
    <AuthGuard>
      <main className="min-h-screen w-full bg-slate-50 px-4 pb-10 pt-5 sm:px-6">
        <div className="w-full">
          <header className="mb-5 grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-[0.16em] text-brand">CARELOON</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                Patient review dashboard
              </h1>
              <p className="mt-1 text-sm text-muted">
                {user ? `Signed in as ${user.name}` : "Patient-wise reports for doctor review."}
              </p>
            </div>
            <SignOutButton className="justify-self-end sm:col-start-3 sm:row-start-1" />
            <nav className="col-span-2 row-start-2 flex w-full flex-nowrap items-center gap-1.5 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:w-auto sm:gap-2">
              <Link
                href="/onboarding"
                className="whitespace-nowrap rounded-lg border border-border bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 sm:px-3 sm:py-2 sm:text-sm"
              >
                Patient onboarding
              </Link>
              <Link
                href="/team-onboarding"
                className="whitespace-nowrap rounded-lg border border-border bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 sm:px-3 sm:py-2 sm:text-sm"
              >
                Team onboarding
              </Link>
            </nav>
          </header>

          <section className="mb-5 rounded-2xl border border-border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-56 flex-1">
                <label
                  htmlFor="reviewer"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  Reviewing as
                </label>
                {reviewers.length === 0 ? (
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    Add a PMR doctor or duty doctor in{" "}
                    <Link href="/team-onboarding" className="font-medium underline">
                      Team onboarding
                    </Link>{" "}
                    to review reports.
                  </p>
                ) : (
                  <select
                    id="reviewer"
                    value={reviewer?.id ?? ""}
                    onChange={(event) => setSelectedReviewerId(event.target.value)}
                    className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-brand/20 transition focus:border-brand focus:ring-4"
                  >
                    {reviewers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.fullName} · {ROLE_LABELS[member.role]}
                      </option>
                    ))}
                  </select>
                )}
                {reviewer ? (
                  <p className="mt-1.5 text-xs leading-5 text-muted">
                    {reviewer.role === "pmr"
                      ? "As PMR admin you can review every submitted report in the care team."
                      : "You can review reports from health care staff who report to you."}
                    {!signedInEmailMatches ? " Reviewer is chosen for this demo session." : ""}
                  </p>
                ) : null}
              </div>

              <div className="w-full sm:w-64">
                <label
                  htmlFor="patient-search"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  Find patient or staff
                </label>
                <input
                  id="patient-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by name"
                  className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-brand/20 transition focus:border-brand focus:ring-4"
                />
              </div>
            </div>
          </section>

          <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Patients" value={stats.patients} />
            <StatCard label="Awaiting review" value={stats.pending} tone="amber" />
            <StatCard label="Approved" value={stats.approved} tone="emerald" />
            <StatCard label="Changes requested" value={stats.changes} tone="rose" />
          </section>

          <section className="mb-4 flex flex-wrap gap-2">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                aria-pressed={filter === item.id}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                  filter === item.id
                    ? "bg-brand text-white shadow-sm"
                    : "border border-border bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                {item.label}
                {item.id === "pending" && stats.pending > 0 ? (
                  <span
                    className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] ${
                      filter === item.id ? "bg-white/20" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {stats.pending}
                  </span>
                ) : null}
              </button>
            ))}
          </section>

          {!reviewer ? (
            <EmptyState
              title="No reviewer available"
              body="Onboard a PMR doctor or duty doctor first. Submitted staff reports will then appear here, grouped by patient."
            />
          ) : scopedReports.length === 0 ? (
            <EmptyState
              title="No submitted reports yet"
              body={
                reviewer.role === "pmr"
                  ? "Health care staff reports will appear here, grouped by patient, once they are submitted."
                  : `No reports from staff who report to ${reviewer.fullName} yet.`
              }
            />
          ) : groups.length === 0 ? (
            <EmptyState
              title="Nothing in this view"
              body="No patient reports match the selected status or search."
            />
          ) : (
            <div className="space-y-4">
              {groups.map((group) => {
                const counts = patientCounts.get(group.key) ?? emptyCounts();
                return (
                  <section
                    key={group.key}
                    className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-slate-50/80 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-slate-900">
                          {group.name}
                        </p>
                        {group.patient ? (
                          <p className="mt-0.5 text-xs text-muted">
                            {[
                              group.patient.diagnosis,
                              group.patient.dateOfBirth ? `DOB ${group.patient.dateOfBirth}` : "",
                              group.patient.phone,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-xs text-amber-700">
                            Report not linked to an onboarded patient.
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <CountBadge label="Awaiting" value={counts.pending} tone="amber" />
                        <CountBadge label="Approved" value={counts.approved} tone="emerald" />
                        <CountBadge label="Changes" value={counts.changes} tone="rose" />
                      </div>
                    </div>

                    <ul className="divide-y divide-border">
                      {group.reports.map((report) => (
                        <li key={report.id}>
                          <ReportReviewCard
                            report={report}
                            reviewer={reviewer}
                            onReviewed={handleReviewed}
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </AuthGuard>
  );
}

function StatCard({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: number;
  tone?: "slate" | "amber" | "emerald" | "rose";
}) {
  const toneClass = {
    slate: "text-slate-900",
    amber: "text-amber-700",
    emerald: "text-emerald-700",
    rose: "text-rose-700",
  }[tone];

  return (
    <div className="rounded-2xl border border-border bg-white px-4 py-3 shadow-sm">
      <p className={`text-2xl font-semibold ${toneClass}`}>{value}</p>
      <p className="mt-0.5 text-xs font-medium text-muted">{label}</p>
    </div>
  );
}

function CountBadge({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "emerald" | "rose";
}) {
  if (value === 0) return null;
  const toneClass = {
    amber: "bg-amber-100 text-amber-800",
    emerald: "bg-emerald-100 text-emerald-800",
    rose: "bg-rose-100 text-rose-800",
  }[tone];

  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${toneClass}`}>
      {value} {label.toLowerCase()}
    </span>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-white px-4 py-10 text-center">
      <p className="text-sm font-medium text-slate-800">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{body}</p>
    </div>
  );
}

function ReportReviewCard({
  report,
  reviewer,
  onReviewed,
}: {
  report: StaffReport;
  reviewer: TeamMember;
  onReviewed: (report: StaffReport) => void;
}) {
  const [reviewing, setReviewing] = useState(false);
  const [note, setNote] = useState(report.reviewNote);
  const [error, setError] = useState("");

  const pending = report.reviewStatus === "pending";

  function openReview() {
    setNote(report.reviewNote);
    setError("");
    setReviewing(true);
  }

  function cancelReview() {
    setNote(report.reviewNote);
    setError("");
    setReviewing(false);
  }

  function decide(status: "approved" | "changes_requested") {
    const trimmed = note.trim();
    if (status === "changes_requested" && !trimmed) {
      setError("Add a note explaining what the staff member needs to change.");
      return;
    }

    const updated = reviewStaffReport(report.id, {
      reviewStatus: status,
      reviewerId: reviewer.id,
      reviewerName: reviewer.fullName,
      note: trimmed,
    });
    if (!updated) {
      setError("Could not save the review. Please try again.");
      return;
    }

    setNote(trimmed);
    setError("");
    setReviewing(false);
    onReviewed(updated);
  }

  return (
    <div className="px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">{report.staffName}</p>
          <p className="mt-0.5 text-xs text-muted">
            Report date {report.date} · Submitted{" "}
            {new Date(report.submittedAt || report.updatedAt).toLocaleString()}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_STYLES[report.reviewStatus]}`}
        >
          {REVIEW_STATUS_LABELS[report.reviewStatus]}
        </span>
      </div>

      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
        {report.correctedText}
      </p>

      {report.reviewedAt ? (
        <p className="mt-2 text-xs text-muted">
          Reviewed by {report.reviewedByName || "doctor"} ·{" "}
          {new Date(report.reviewedAt).toLocaleString()}
        </p>
      ) : null}

      {report.reviewNote ? (
        <p
          className={`mt-2 rounded-lg px-2.5 py-2 text-xs ${
            report.reviewStatus === "changes_requested"
              ? "bg-rose-50 text-rose-800"
              : "bg-slate-50 text-slate-700"
          }`}
        >
          <span className="font-semibold">Review note:</span> {report.reviewNote}
        </p>
      ) : null}

      {error ? (
        <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-2 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {reviewing ? (
        <div className="mt-3 rounded-xl border border-border bg-slate-50 p-3">
          <label
            htmlFor={`review-note-${report.id}`}
            className="mb-1.5 block text-xs font-medium text-slate-700"
          >
            Review note (required when requesting changes)
          </label>
          <textarea
            id={`review-note-${report.id}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            placeholder="e.g. Please add the patient's pain score after the session."
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-brand/20 transition focus:border-brand focus:ring-4"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => decide("approved")}
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-strong"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => decide("changes_requested")}
              className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
            >
              Request changes
            </button>
            <button
              type="button"
              onClick={cancelReview}
              className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {pending ? (
            <>
              <button
                type="button"
                onClick={() => decide("approved")}
                className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-strong"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={openReview}
                className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
              >
                Request changes
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={openReview}
              className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Review again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
