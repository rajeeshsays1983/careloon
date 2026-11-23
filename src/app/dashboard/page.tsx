"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { MediaAttachmentEditor } from "@/components/MediaAttachmentEditor";
import { SignOutButton } from "@/components/SignOutButton";
import {
  getPatients,
  getPatientsServerSnapshot,
  getStoredUser,
  subscribeToPatients,
  type Patient,
} from "@/lib/auth";
import { formatBytes, type MediaAttachment } from "@/lib/attachments";
import {
  acknowledgeStaffReport,
  getStaffReportsServerSnapshot,
  getStaffReportsSnapshot,
  REVIEW_STATUS_LABELS,
  reviewStaffReport,
  subscribeToStaffReports,
  updateStaffReport,
  type ReviewStatus,
  type StaffReport,
} from "@/lib/reports";
import {
  getTeamMembers,
  getTeamMembersServerSnapshot,
  getVisibleMembers,
  isAuthoredBy,
  memberDesignation,
  ROLE_LABELS,
  subscribeToTeamMembers,
  type TeamMember,
} from "@/lib/team";

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
  const members = useSyncExternalStore(
    subscribeToTeamMembers,
    getTeamMembers,
    getTeamMembersServerSnapshot,
  );
  const patients = useSyncExternalStore(
    subscribeToPatients,
    getPatients,
    getPatientsServerSnapshot,
  );
  const storedReports = useSyncExternalStore(
    subscribeToStaffReports,
    getStaffReportsSnapshot,
    getStaffReportsServerSnapshot,
  );

  const [overrides, setOverrides] = useState<Record<string, StaffReport>>({});
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const currentMember = useMemo(() => {
    if (!user) return null;
    return (
      members.find(
        (member) =>
          member.email.toLowerCase() === user.email.toLowerCase() &&
          member.approvalStatus === "approved",
      ) ?? null
    );
  }, [members, user]);

  const teamStaff = useMemo(() => {
    if (currentMember?.role !== "supervisor") return [];
    return members.filter(
      (member) =>
        member.role === "staff" &&
        member.approvalStatus === "approved" &&
        member.reportsTo === currentMember.id,
    );
  }, [currentMember, members]);

  const visibleMembers = useMemo(
    () => getVisibleMembers(members, currentMember),
    [currentMember, members],
  );

  const canViewAll = currentMember?.role === "admin" || currentMember?.role === "manager";

  const viewOptions = useMemo(() => {
    if (!currentMember) return [];
    if (canViewAll) {
      return members
        .filter((member) => member.approvalStatus === "approved" && member.role !== "admin")
        .sort((a, b) => a.fullName.localeCompare(b.fullName));
    }
    if (currentMember.role === "supervisor") return [currentMember, ...teamStaff];
    return [];
  }, [canViewAll, currentMember, members, teamStaff]);

  const selectedMember = viewOptions.find((member) => member.id === selectedMemberId) ?? null;

  // Selecting a Duty Doctor means viewing their whole team, not just the
  // updates they personally submitted.
  const selectedScopeMembers = useMemo(() => {
    if (!selectedMember) return [];
    if (selectedMember.role !== "supervisor") return [selectedMember];
    const assignedStaff = members.filter(
      (member) =>
        member.role === "staff" &&
        member.approvalStatus === "approved" &&
        member.reportsTo === selectedMember.id,
    );
    return [selectedMember, ...assignedStaff];
  }, [members, selectedMember]);

  const reports = useMemo(() => {
    const byId = new Map<string, StaffReport>();
    for (const report of storedReports) byId.set(report.id, report);
    for (const report of Object.values(overrides)) byId.set(report.id, report);
    return [...byId.values()].filter((report) => report.status === "submitted");
  }, [storedReports, overrides]);

  const scopedReports = useMemo(() => {
    if (!currentMember) return [];
    const allowed = selectedScopeMembers.length > 0 ? selectedScopeMembers : visibleMembers;
    return reports.filter((report) =>
      allowed.some((member) => isAuthoredBy(report.staffId, member)),
    );
  }, [currentMember, reports, selectedScopeMembers, visibleMembers]);

  function canReviewReport(report: StaffReport): boolean {
    if (!currentMember || isAuthoredBy(report.staffId, currentMember)) return false;
    if (currentMember.role === "admin" || currentMember.role === "manager") return true;
    if (currentMember.role === "supervisor") {
      return teamStaff.some((member) => isAuthoredBy(report.staffId, member));
    }
    return false;
  }

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

  const scopeDescription = !currentMember
    ? "Your account is not linked to an approved team member."
    : selectedMember
      ? selectedMember.role === "supervisor"
        ? `Showing activity for ${selectedMember.fullName} and staff assigned to them.`
        : `Showing activity for ${selectedMember.fullName}.`
      : currentMember.role === "staff"
        ? "Showing only the treatment reports you submitted."
        : currentMember.role === "supervisor"
          ? "Showing your activity and reports from staff assigned to you."
          : "Showing activity from all care team members.";

  const dashboardTitle = selectedMember
    ? selectedMember.role === "supervisor"
      ? `${selectedMember.fullName}'s team dashboard`
      : `${selectedMember.fullName}'s dashboard`
    : currentMember?.role === "staff"
      ? "My treatment dashboard"
      : currentMember?.role === "supervisor"
        ? "Team activity dashboard"
        : "Patient review dashboard";

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
                {dashboardTitle}
              </h1>
              <p className="mt-1 text-sm text-muted">
                {user
                  ? `Signed in as ${user.name}${currentMember ? ` · ${ROLE_LABELS[currentMember.role]}` : ""}`
                  : "Patient-wise reports for your team."}
              </p>
            </div>
            <SignOutButton className="justify-self-end sm:col-start-3 sm:row-start-1" />
            <nav className="col-span-2 row-start-2 flex w-full flex-wrap items-center gap-1.5 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:w-auto sm:justify-end sm:gap-2">
              <Link
                href="/chat"
                className="shrink-0 whitespace-nowrap rounded-lg border border-border bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 sm:px-3 sm:py-2 sm:text-sm"
              >
                Treatment
              </Link>
              <Link
                href="/onboarding"
                className="shrink-0 whitespace-nowrap rounded-lg border border-border bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 sm:px-3 sm:py-2 sm:text-sm"
              >
                Patient
              </Link>
              <Link
                href="/team-onboarding"
                className="shrink-0 whitespace-nowrap rounded-lg border border-border bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 sm:px-3 sm:py-2 sm:text-sm"
              >
                Team
              </Link>
            </nav>
          </header>

          <section className="mb-5 rounded-2xl border border-border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-56 flex-1">
                <label
                  htmlFor="view-member"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  Viewing
                </label>
                {!currentMember ? (
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    Your account is not linked to an approved team member. Ask an Admin to onboard
                    you in{" "}
                    <Link href="/team-onboarding" className="font-medium underline">
                      Team onboarding
                    </Link>
                    .
                  </p>
                ) : viewOptions.length > 0 ? (
                  <select
                    id="view-member"
                    value={selectedMemberId}
                    onChange={(event) => setSelectedMemberId(event.target.value)}
                    className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-brand/20 transition focus:border-brand focus:ring-4"
                  >
                    <option value="">
                      {canViewAll ? "All care team members" : "My team activity"}
                    </option>
                    {viewOptions.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.fullName} · {memberDesignation(member)}
                        {member.id === currentMember.id ? " (you)" : ""}
                      </option>
                    ))}
                  </select>
                ) : null}
                <p className="mt-1.5 text-xs leading-5 text-muted">{scopeDescription}</p>
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
                {item.id === "changes_requested" && stats.changes > 0 ? (
                  <span
                    className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] ${
                      filter === item.id ? "bg-white/20" : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    {stats.changes}
                  </span>
                ) : null}
              </button>
            ))}
          </section>

          {!currentMember ? (
            <EmptyState
              title="No team profile"
              body="Your account is not linked to an approved team member. Ask an Admin to onboard you in Team onboarding."
            />
          ) : scopedReports.length === 0 ? (
            <EmptyState
              title={selectedMember ? "No reports from this member yet" : "No submitted reports yet"}
              body={
                selectedMember
                  ? `${selectedMember.fullName} has not submitted any treatment reports yet.`
                  : currentMember.role === "staff"
                    ? "Your submitted treatment reports will appear here once you submit them."
                    : currentMember.role === "supervisor"
                      ? "Reports from you and staff assigned to you will appear here once they are submitted."
                      : "Submitted team reports will appear here, grouped by patient."
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
                            reviewer={currentMember}
                            canReview={canReviewReport(report)}
                            isOwnReport={
                              currentMember ? isAuthoredBy(report.staffId, currentMember) : false
                            }
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
  canReview,
  isOwnReport,
  onReviewed,
}: {
  report: StaffReport;
  reviewer: TeamMember | null;
  canReview: boolean;
  isOwnReport: boolean;
  onReviewed: (report: StaffReport) => void;
}) {
  const [reviewing, setReviewing] = useState(false);
  const [note, setNote] = useState(report.reviewNote);
  const [error, setError] = useState("");
  const [ackNote, setAckNote] = useState("");
  const [ackError, setAckError] = useState("");
  const [acknowledging, setAcknowledging] = useState(false);
  const [editingReport, setEditingReport] = useState(false);
  const [editedText, setEditedText] = useState(report.correctedText);
  const [editedAttachments, setEditedAttachments] = useState<MediaAttachment[]>(report.attachments);
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const pending = report.reviewStatus === "pending";
  const acknowledgedChange =
    report.reviewStatus === "changes_requested" && Boolean(report.acknowledgedAt);
  const canDecideAgain = pending || acknowledgedChange;

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

  async function decide(status: "approved" | "changes_requested") {
    if (!reviewer) {
      setError("You are not allowed to review this report.");
      return;
    }
    const trimmed = note.trim();
    if (status === "changes_requested" && !trimmed) {
      setError("Add a note explaining what the staff member needs to change.");
      return;
    }

    const updated = await reviewStaffReport(report.id, {
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

  async function submitAcknowledgement() {
    const trimmed = ackNote.trim();
    if (!trimmed) {
      setAckError("Add a note before acknowledging the change request.");
      return;
    }
    setAcknowledging(true);
    const updated = await acknowledgeStaffReport(report.id, trimmed);
    setAcknowledging(false);
    if (!updated) {
      setAckError("Could not save your acknowledgement. Please try again.");
      return;
    }
    setAckNote("");
    setAckError("");
    onReviewed(updated);
  }

  function openEdit() {
    setEditedText(report.correctedText);
    setEditedAttachments(report.attachments);
    setEditError("");
    setEditingReport(true);
  }

  async function saveEdit() {
    const text = editedText.trim();
    if (!text && editedAttachments.length === 0) {
      setEditError("Add a treatment note or attach a picture, video or audio file.");
      return;
    }
    setSavingEdit(true);
    const updated = await updateStaffReport(report.id, {
      correctedText: text,
      attachments: editedAttachments,
      reviewStatus: "pending",
      reviewedBy: null,
      reviewedByName: null,
      reviewedAt: null,
      reviewNote: "",
      acknowledgementNote: "",
      acknowledgedAt: null,
    });
    setSavingEdit(false);
    if (!updated) {
      setEditError("Could not save your changes. Please try again.");
      return;
    }
    setEditingReport(false);
    setEditError("");
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

      {report.correctedText ? (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
          {report.correctedText}
        </p>
      ) : null}

      {report.attachments.length > 0 ? (
        <ReportAttachments attachments={report.attachments} />
      ) : null}

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

      {report.reviewStatus === "changes_requested" && isOwnReport ? (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50/70 p-3">
          <p className="text-xs font-semibold text-rose-900">Change requested — action needed</p>
          <p className="mt-1 text-xs leading-5 text-rose-800">
            {report.reviewedByName || "The reviewer"} asked for changes
            {report.reviewedAt ? ` on ${new Date(report.reviewedAt).toLocaleString()}` : ""}. Read
            the review note above, update the report if needed, then acknowledge with your notes.
          </p>

          {report.acknowledgedAt ? (
            <div className="mt-2 rounded-lg bg-white px-2.5 py-2 text-xs text-slate-700">
              <p className="font-semibold text-emerald-700">
                Acknowledged {new Date(report.acknowledgedAt).toLocaleString()}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap">{report.acknowledgementNote}</p>
            </div>
          ) : (
            <div className="mt-2">
              <label
                htmlFor={`ack-note-${report.id}`}
                className="mb-1.5 block text-xs font-medium text-slate-700"
              >
                Your acknowledgement note
              </label>
              <textarea
                id={`ack-note-${report.id}`}
                value={ackNote}
                onChange={(event) => setAckNote(event.target.value)}
                rows={2}
                placeholder="e.g. Noted — I will add the pain score and resubmit."
                className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-rose-200 transition focus:border-rose-400 focus:ring-4"
              />
              {ackError ? (
                <p className="mt-1 text-xs text-danger" role="alert">
                  {ackError}
                </p>
              ) : null}
              <button
                type="button"
                onClick={submitAcknowledgement}
                disabled={acknowledging}
                className="mt-2 rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {acknowledging ? "Saving..." : "Acknowledge"}
              </button>
            </div>
          )}

          <div className="mt-3 border-t border-rose-200 pt-3">
            <button
              type="button"
              onClick={editingReport ? () => setEditingReport(false) : openEdit}
              className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              {editingReport ? "Cancel editing" : "Edit care record & add media"}
            </button>

            {editingReport ? (
              <div className="mt-3 rounded-xl border border-border bg-white p-3">
                <label
                  htmlFor={`edit-report-${report.id}`}
                  className="mb-1.5 block text-xs font-medium text-slate-700"
                >
                  Corrected treatment note
                </label>
                <textarea
                  id={`edit-report-${report.id}`}
                  value={editedText}
                  onChange={(event) => setEditedText(event.target.value)}
                  rows={4}
                  placeholder="Describe the care given and what was corrected."
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-brand/20 transition focus:border-brand focus:ring-4"
                />
                <div className="mt-3">
                  <MediaAttachmentEditor
                    attachments={editedAttachments}
                    onChange={setEditedAttachments}
                  />
                </div>
                {editError ? (
                  <p className="mt-2 text-xs text-danger" role="alert">
                    {editError}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={savingEdit}
                  className="mt-3 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingEdit ? "Saving..." : "Save changes & resubmit"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-2 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {canReview ? (
        reviewing ? (
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
                onClick={() => decide("changes_requested")}
                className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-strong"
              >
                Request changes
              </button>
              <button
                type="button"
                onClick={() => decide("approved")}
                className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
              >
                Approve
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
            {canDecideAgain ? (
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
        )
      ) : null}
    </div>
  );
}

function ReportAttachments({ attachments }: { attachments: MediaAttachment[] }) {
  return (
    <div className="mt-2">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Assessment media
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {attachments.map((attachment) => (
          <li
            key={attachment.id}
            className="overflow-hidden rounded-xl border border-border bg-slate-50"
          >
            {attachment.kind === "image" ? (
              <a href={attachment.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={attachment.url}
                  alt={attachment.name}
                  className="max-h-56 w-full object-contain"
                />
              </a>
            ) : attachment.kind === "video" ? (
              <video
                controls
                preload="metadata"
                src={attachment.url}
                className="max-h-56 w-full bg-black"
              >
                Your browser does not support video playback.
              </video>
            ) : (
              <audio controls preload="metadata" src={attachment.url} className="w-full px-2 py-2">
                Your browser does not support audio playback.
              </audio>
            )}
            <div className="flex items-center justify-between gap-2 px-2 py-1 text-[11px] text-muted">
              <span className="truncate">{attachment.name}</span>
              <span className="shrink-0">{formatBytes(attachment.size)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
