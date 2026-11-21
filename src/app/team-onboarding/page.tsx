"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState, useSyncExternalStore } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { PmrApprovalPanel, type ApprovalQueueItem } from "@/components/PmrApprovalPanel";
import { SignOutButton } from "@/components/SignOutButton";
import { VoiceReportPanel } from "@/components/VoiceReportPanel";
import type { ApprovalDecision } from "@/lib/approvals";
import { getStoredUser } from "@/lib/auth";
import {
  getMemberAndDescendantIds,
  getTeamMembers,
  removeTeamMember,
  reviewTeamMember,
  ROLE_LABELS,
  saveTeamMember,
  STAFF_SPECIALTIES,
  type TeamMember,
  type TeamRole,
} from "@/lib/team";

function subscribe() {
  return () => {};
}

const ROLE_TABS: TeamRole[] = ["pmr", "duty_doctor", "staff"];

type FormState = {
  fullName: string;
  email: string;
  phone: string;
  registration: string;
  reportsTo: string;
  specialty: string;
  customSpecialty: string;
};

const initialForm: FormState = {
  fullName: "",
  email: "",
  phone: "",
  registration: "",
  reportsTo: "",
  specialty: "",
  customSpecialty: "",
};

export default function TeamOnboardingPage() {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const user = useMemo(() => (mounted ? getStoredUser() : null), [mounted]);

  const [savedMembers, setSavedMembers] = useState<TeamMember[]>([]);
  const [memberOverrides, setMemberOverrides] = useState<Record<string, TeamMember>>({});
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [role, setRole] = useState<TeamRole>("pmr");
  const [form, setForm] = useState<FormState>(() => {
    if (typeof window === "undefined" || getTeamMembers().some((member) => member.role === "pmr")) {
      return initialForm;
    }
    const signedInUser = getStoredUser();
    return signedInUser
      ? { ...initialForm, fullName: signedInUser.name, email: signedInUser.email }
      : initialForm;
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeReportStaffId, setActiveReportStaffId] = useState<string | null>(null);

  const storedMembers = useMemo(() => (mounted ? getTeamMembers() : []), [mounted]);
  const members = useMemo(() => {
    const byId = new Map<string, TeamMember>();
    for (const member of [...savedMembers, ...storedMembers]) byId.set(member.id, member);
    for (const member of Object.values(memberOverrides)) byId.set(member.id, member);
    return [...byId.values()].filter((member) => !deletedIds.has(member.id));
  }, [deletedIds, memberOverrides, savedMembers, storedMembers]);

  const approvedMembers = useMemo(
    () => members.filter((member) => member.approvalStatus === "approved"),
    [members],
  );
  const pmrs = useMemo(
    () => approvedMembers.filter((member) => member.role === "pmr"),
    [approvedMembers],
  );
  const dutyDoctors = useMemo(
    () => approvedMembers.filter((member) => member.role === "duty_doctor"),
    [approvedMembers],
  );
  const staff = useMemo(
    () => approvedMembers.filter((member) => member.role === "staff"),
    [approvedMembers],
  );

  const approvalQueue = useMemo(
    () =>
      members
        .filter((member) => member.role !== "pmr" && member.approvalStatus !== "approved")
        .sort((a, b) =>
          a.approvalStatus === b.approvalStatus
            ? b.createdAt.localeCompare(a.createdAt)
            : a.approvalStatus === "pending"
              ? -1
              : 1,
        ),
    [members],
  );

  const teamApprovalItems = useMemo<ApprovalQueueItem[]>(
    () =>
      approvalQueue.map((member) => {
        const supervisor = member.reportsTo
          ? members.find((item) => item.id === member.reportsTo)
          : null;
        return {
          id: member.id,
          title: member.fullName,
          subtitle: `${ROLE_LABELS[member.role]}${member.specialty ? ` · ${member.specialty}` : ""}`,
          meta: [
            member.email,
            member.phone,
            member.registration ? `Reg. ${member.registration}` : "",
            supervisor ? `Reports to ${supervisor.fullName}` : "No supervisor",
          ]
            .filter(Boolean)
            .join(" · "),
          approvalStatus: member.approvalStatus,
          reviewNote: member.reviewNote,
          reviewedByName: member.reviewedByName,
          reviewedAt: member.reviewedAt,
        };
      }),
    [approvalQueue, members],
  );

  const parentOptions = role === "duty_doctor" ? pmrs : dutyDoctors;
  const parentLabel = role === "duty_doctor" ? "PMR Doctor (Admin)" : "Duty Doctor";
  const parentEmptyMessage =
    role === "duty_doctor" ? "Add a PMR doctor first." : "Add a duty doctor first.";

  const unassigned = useMemo(() => {
    const pmrIds = new Set(pmrs.map((member) => member.id));
    const dutyIds = new Set(dutyDoctors.map((member) => member.id));
    const unassignedDutyDoctors = dutyDoctors.filter(
      (member) => !member.reportsTo || !pmrIds.has(member.reportsTo),
    );
    const unassignedDutyIds = new Set(unassignedDutyDoctors.map((member) => member.id));
    return [
      ...unassignedDutyDoctors,
      ...staff.filter(
        (member) =>
          !member.reportsTo ||
          !dutyIds.has(member.reportsTo) ||
          unassignedDutyIds.has(member.reportsTo),
      ),
    ];
  }, [dutyDoctors, pmrs, staff]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function selectRole(nextRole: TeamRole) {
    setRole(nextRole);
    setForm((prev) => ({ ...prev, reportsTo: "", specialty: "", customSpecialty: "" }));
    setError("");
    setSuccess("");
  }

  function validate(): string | null {
    if (!form.fullName.trim()) return "Full name is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return "Enter a valid email address.";
    }
    if (!form.phone.trim()) return "Phone number is required.";

    if (role === "duty_doctor") {
      if (!form.reportsTo) return "Select the PMR doctor this duty doctor reports to.";
      if (!pmrs.some((member) => member.id === form.reportsTo)) {
        return "Select a valid PMR doctor.";
      }
    }

    if (role === "staff") {
      if (!form.reportsTo) return "Select the duty doctor this staff member reports to.";
      if (!dutyDoctors.some((member) => member.id === form.reportsTo)) {
        return "Select a valid duty doctor.";
      }
      if (!form.specialty) return "Select a health care specialty.";
      if (form.specialty === "Other" && !form.customSpecialty.trim()) {
        return "Enter the staff specialty.";
      }
    }

    return null;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    try {
      const saved = saveTeamMember({
        role,
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        registration: form.registration.trim(),
        specialty:
          role === "staff"
            ? form.specialty === "Other"
              ? form.customSpecialty.trim()
              : form.specialty
            : "",
        reportsTo: role === "pmr" ? null : form.reportsTo,
      });
      setSavedMembers((prev) => [saved, ...prev]);
      setSuccess(
        saved.role === "pmr"
          ? `${saved.fullName} has been onboarded as ${ROLE_LABELS[role]} and can approve records.`
          : `${saved.fullName} has been onboarded as ${ROLE_LABELS[role]} and is awaiting PMR approval.`,
      );
      setForm((prev) => ({ ...initialForm, reportsTo: prev.reportsTo }));
    } catch {
      setError("Could not save team member. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(member: TeamMember) {
    const warning =
      member.role === "pmr"
        ? " This also removes the duty doctors and health care staff under them."
        : member.role === "duty_doctor"
          ? " This also removes the health care staff under them."
          : "";

    if (!window.confirm(`Remove ${member.fullName} from the team?${warning}`)) return;

    const removedIds = getMemberAndDescendantIds(members, member.id);
    removeTeamMember(member.id);
    setDeletedIds((prev) => new Set([...prev, ...removedIds]));
    setError("");
    setSuccess(`${member.fullName} removed from the team.`);
  }

  function handleMemberReview(
    id: string,
    decision: ApprovalDecision,
    reviewer: TeamMember,
    note: string,
  ) {
    const updated = reviewTeamMember(id, {
      approvalStatus: decision,
      reviewerId: reviewer.id,
      reviewerName: reviewer.fullName,
      note,
    });
    if (!updated) {
      setError("Could not save the approval decision. Please try again.");
      return;
    }
    setError("");
    setMemberOverrides((prev) => ({ ...prev, [updated.id]: updated }));
    setSuccess(
      decision === "approved"
        ? `${updated.fullName} has been verified and approved.`
        : `${updated.fullName} was rejected. The PMR note explains what to correct.`,
    );
  }

  function handleRemoveById(id: string) {
    const member = members.find((item) => item.id === id);
    if (member) handleDelete(member);
  }

  function toggleReportPanel(staffId: string) {
    setActiveReportStaffId((prev) => (prev === staffId ? null : staffId));
  }

  return (
    <AuthGuard>
      <main className="min-h-screen w-full bg-slate-50 px-4 pb-10 pt-5 sm:px-6">
        <div className="w-full">
          <header className="mb-5 grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-[0.16em] text-brand">CARELOON</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                Team onboarding
              </h1>
              <p className="mt-1 text-sm text-muted">
                {user ? `Signed in as ${user.name}` : "Build your care team hierarchy."}
              </p>
            </div>
            <SignOutButton className="justify-self-end sm:col-start-3 sm:row-start-1" />
            <nav className="col-span-2 row-start-2 flex w-full flex-nowrap items-center gap-1.5 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:w-auto sm:gap-2">
              <Link
                href="/dashboard"
                className="whitespace-nowrap rounded-lg border border-border bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 sm:px-3 sm:py-2 sm:text-sm"
              >
                Review dashboard
              </Link>
              <Link
                href="/onboarding"
                className="whitespace-nowrap rounded-lg border border-border bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 sm:px-3 sm:py-2 sm:text-sm"
              >
                Patient onboarding
              </Link>
            </nav>
          </header>

          <section className="mb-5 rounded-2xl border border-border bg-white px-4 py-4">
            <p className="text-sm font-medium text-slate-800">Onboard in this order</p>
            <ol className="mt-2 grid gap-1 text-sm text-muted sm:grid-cols-3">
              <li>1. Add the PMR doctor (admin)</li>
              <li>2. Add duty doctors under the PMR</li>
              <li>3. Add health care staff under a duty doctor</li>
            </ol>
            <p className="mt-2 text-xs leading-5 text-muted">
              Duty doctors and health care staff join the PMR approval queue and become active once
              the PMR doctor approves them.
            </p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
              <span>{pmrs.length} PMR admin(s)</span>
              <span>{dutyDoctors.length} duty doctor(s)</span>
              <span>{staff.length} health care staff</span>
              <span>{approvalQueue.length} awaiting approval</span>
              <span>{members.length} total</span>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-6">
            <div className="grid gap-2 sm:grid-cols-3" role="tablist" aria-label="Team role">
              {ROLE_TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={role === tab}
                  onClick={() => selectRole(tab)}
                  className={`rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    role === tab
                      ? "bg-brand text-white shadow-sm"
                      : "border border-border bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {ROLE_LABELS[tab]}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Full name" htmlFor="fullName" required>
                  <input
                    id="fullName"
                    value={form.fullName}
                    onChange={(event) => update("fullName", event.target.value)}
                    className={inputClass}
                    placeholder="Full name"
                  />
                </Field>
                <Field label="Email" htmlFor="email" required>
                  <input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(event) => update("email", event.target.value)}
                    className={inputClass}
                    placeholder="name@careloon.com"
                  />
                </Field>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Phone number" htmlFor="phone" required>
                  <input
                    id="phone"
                    type="tel"
                    inputMode="tel"
                    value={form.phone}
                    onChange={(event) => update("phone", event.target.value)}
                    className={inputClass}
                    placeholder="+1 555 000 0000"
                  />
                </Field>
                <Field label="Registration / license number" htmlFor="registration">
                  <input
                    id="registration"
                    value={form.registration}
                    onChange={(event) => update("registration", event.target.value)}
                    className={inputClass}
                    placeholder="Optional"
                  />
                </Field>
              </div>

              {role !== "pmr" ? (
                <Field label={`Reports to ${parentLabel}`} htmlFor="reportsTo" required>
                  <select
                    id="reportsTo"
                    value={form.reportsTo}
                    onChange={(event) => update("reportsTo", event.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select {parentLabel}</option>
                    {parentOptions.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.fullName} ({member.email})
                      </option>
                    ))}
                  </select>
                  {parentOptions.length === 0 ? (
                    <p className="mt-1.5 text-xs text-danger">{parentEmptyMessage}</p>
                  ) : null}
                </Field>
              ) : null}

              {role === "staff" ? (
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Health care role" htmlFor="specialty" required>
                    <select
                      id="specialty"
                      value={form.specialty}
                      onChange={(event) => {
                        update("specialty", event.target.value);
                        update("customSpecialty", "");
                      }}
                      className={inputClass}
                    >
                      <option value="">Select role</option>
                      {STAFF_SPECIALTIES.map((specialty) => (
                        <option key={specialty} value={specialty}>
                          {specialty}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {form.specialty === "Other" ? (
                    <Field label="Specify role" htmlFor="customSpecialty" required>
                      <input
                        id="customSpecialty"
                        value={form.customSpecialty}
                        onChange={(event) => update("customSpecialty", event.target.value)}
                        className={inputClass}
                        placeholder="e.g. Music therapist"
                      />
                    </Field>
                  ) : null}
                </div>
              ) : null}

              {role === "pmr" ? (
                <p className="rounded-xl bg-brand-soft/60 px-3 py-2 text-xs leading-5 text-brand-strong">
                  The PMR doctor is the admin. You can add duty doctors and health care staff under
                  this account after saving.
                </p>
              ) : null}

              {error ? (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
                  {error}
                </p>
              ) : null}
              {success ? (
                <p className="rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-800">{success}</p>
              ) : null}

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-70"
              >
                {saving ? "Saving..." : `Add ${ROLE_LABELS[role]}`}
              </button>
            </form>
          </section>

          <PmrApprovalPanel
            className="mt-6"
            title="PMR approval queue · Team"
            description="Duty doctors and health care staff must be verified by the PMR doctor before they become active in the care team."
            emptyMessage="No team members are waiting for PMR approval."
            items={teamApprovalItems}
            pmrDoctors={pmrs}
            onReview={handleMemberReview}
            onRemove={handleRemoveById}
          />

          <section className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                Care team
              </h2>
              <span className="text-xs text-muted">{approvedMembers.length} approved</span>
            </div>

            {approvedMembers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-white px-4 py-6 text-center text-sm text-muted">
                No approved team members yet. Start with the PMR doctor above.
              </div>
            ) : (
              <>
                {unassigned.length > 0 ? (
                  <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-sm font-medium text-amber-900">Unassigned members</p>
                    <ul className="mt-2 space-y-2">
                      {unassigned.map((member) => (
                        <li key={member.id}>
                          <MemberRow
                            member={member}
                            onDelete={handleDelete}
                            onVoiceReport={
                              member.role === "staff"
                                ? () => toggleReportPanel(member.id)
                                : undefined
                            }
                          />
                          {member.role === "staff" && activeReportStaffId === member.id ? (
                            <VoiceReportPanel
                              staff={member}
                              onClose={() => setActiveReportStaffId(null)}
                            />
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {pmrs.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-white px-4 py-6 text-center text-sm text-muted">
                    No PMR doctor (admin) onboarded yet.
                  </div>
                ) : (
                  <ul className="space-y-4">
                    {pmrs.map((pmr) => {
                      const doctors = dutyDoctors.filter((member) => member.reportsTo === pmr.id);
                      return (
                        <li key={pmr.id} className="rounded-2xl border border-border bg-white p-4">
                          <MemberRow member={pmr} onDelete={handleDelete} />
                          {doctors.length === 0 ? (
                            <p className="mt-2 pl-4 text-xs text-muted">No duty doctors yet.</p>
                          ) : (
                            <ul className="mt-3 space-y-3 border-l-2 border-brand-soft pl-4">
                              {doctors.map((doctor) => {
                                const careStaff = staff.filter(
                                  (member) => member.reportsTo === doctor.id,
                                );
                                return (
                                  <li key={doctor.id}>
                                    <MemberRow member={doctor} onDelete={handleDelete} />
                                    {careStaff.length === 0 ? (
                                      <p className="mt-2 pl-4 text-xs text-muted">
                                        No health care staff yet.
                                      </p>
                                    ) : (
                                      <ul className="mt-2 space-y-2 border-l-2 border-slate-200 pl-4">
                                        {careStaff.map((member) => (
                                          <li key={member.id}>
                                            <MemberRow
                                              member={member}
                                              onDelete={handleDelete}
                                              onVoiceReport={() => toggleReportPanel(member.id)}
                                            />
                                            {activeReportStaffId === member.id ? (
                                              <VoiceReportPanel
                                                staff={member}
                                                onClose={() => setActiveReportStaffId(null)}
                                              />
                                            ) : null}
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </section>
        </div>
      </main>
    </AuthGuard>
  );
}

const inputClass =
  "w-full rounded-xl border border-border bg-white px-4 py-3 text-base text-slate-900 outline-none ring-brand/20 transition focus:border-brand focus:ring-4";

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label} {required ? <span className="text-danger">*</span> : null}
      </label>
      {children}
    </div>
  );
}

function MemberRow({
  member,
  onDelete,
  onVoiceReport,
}: {
  member: TeamMember;
  onDelete: (member: TeamMember) => void;
  onVoiceReport?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-slate-900">{member.fullName}</p>
          <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-[11px] font-medium text-brand-strong">
            {member.specialty || ROLE_LABELS[member.role]}
          </span>
        </div>
        <p className="truncate text-sm text-muted">
          {member.email}
          {member.phone ? ` · ${member.phone}` : ""}
        </p>
        {member.registration ? (
          <p className="text-xs text-muted">Reg. {member.registration}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onVoiceReport ? (
          <button
            type="button"
            onClick={onVoiceReport}
            className="rounded-lg border border-brand/30 bg-brand-soft/40 px-2.5 py-1.5 text-xs font-medium text-brand-strong hover:bg-brand-soft"
          >
            Voice report
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onDelete(member)}
          className="rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-red-50 hover:text-danger"
        >
          Remove
        </button>
      </div>
    </div>
  );
}
