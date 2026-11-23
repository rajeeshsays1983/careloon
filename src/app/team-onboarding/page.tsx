"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState, useSyncExternalStore } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { SignOutButton } from "@/components/SignOutButton";
import type { ApprovalDecision } from "@/lib/approvals";
import { getStoredUser } from "@/lib/auth";
import {
  addTeamMemberToTeam,
  assignTeamMemberToDutyDoctor,
  getMemberAndDescendantIds,
  getTeamMembers,
  getTeamMembersServerSnapshot,
  recommendTeamMember,
  removeTeamMember,
  restoreTeamMember,
  reviewTeamMember,
  ROLE_LABELS,
  saveTeamMember,
  STAFF_SPECIALTIES,
  subscribeToTeamMembers,
  unassignTeamMemberFromDutyDoctor,
  type TeamMember,
  type TeamRole,
} from "@/lib/team";

function subscribe() {
  return () => {};
}

const ADMIN_ROLE_TABS: TeamRole[] = ["manager", "supervisor", "staff"];
const STANDARD_ROLE_TABS: TeamRole[] = ["supervisor", "staff"];

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
  const [role, setRole] = useState<TeamRole>("supervisor");
  const [form, setForm] = useState<FormState>(initialForm);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  const storedMembers = useSyncExternalStore(
    subscribeToTeamMembers,
    getTeamMembers,
    getTeamMembersServerSnapshot,
  );
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
  const admins = useMemo(
    () => approvedMembers.filter((member) => member.role === "admin"),
    [approvedMembers],
  );
  const managers = useMemo(
    () => approvedMembers.filter((member) => member.role === "manager"),
    [approvedMembers],
  );
  const supervisors = useMemo(
    () => approvedMembers.filter((member) => member.role === "supervisor"),
    [approvedMembers],
  );
  const staff = useMemo(
    () => approvedMembers.filter((member) => member.role === "staff"),
    [approvedMembers],
  );

  const onboardingQueue = useMemo(
    () =>
      members
        .filter((member) => member.role !== "admin" && member.approvalStatus === "pending")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [members],
  );

  const rejectedQueue = useMemo(
    () =>
      members
        .filter((member) => member.role !== "admin" && member.approvalStatus === "rejected")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [members],
  );

  const currentMember = useMemo(() => {
    if (!user) return null;
    return (
      members.find(
        (member) => member.email.toLowerCase() === user.email.toLowerCase() &&
          member.approvalStatus === "approved",
      ) ?? null
    );
  }, [members, user]);

  const isAdmin = currentMember ? currentMember.role === "admin" : admins.length > 0;
  const roleTabs = isAdmin ? ADMIN_ROLE_TABS : STANDARD_ROLE_TABS;
  const activeRole = roleTabs.includes(role) ? role : roleTabs[0];
  const canApproveMembers = currentMember
    ? currentMember.role === "admin" ||
      currentMember.role === "manager" ||
      currentMember.role === "supervisor"
    : admins.length + managers.length + supervisors.length > 0;
  const canManageTeam = currentMember
    ? currentMember.role === "admin" || currentMember.role === "manager"
    : admins.length + managers.length > 0;
  const canRecommendMembers = currentMember?.role === "supervisor";

  // The signed-in leader is the default parent. Fall back to the first onboarded leader
  // so the "Reports to" choice is never required for PMR Doctors and Duty Doctors.
  const defaultAdminId =
    currentMember?.role === "admin" ? currentMember.id : (admins[0]?.id ?? "");
  const defaultManagerId =
    currentMember?.role === "manager" ? currentMember.id : (managers[0]?.id ?? "");
  const defaultManagerName =
    managers.find((member) => member.id === defaultManagerId)?.fullName ?? "PMR Doctor";

  // A Duty Doctor must be added to Team before staff can be assigned to them.
  const teamSupervisors = useMemo(
    () => supervisors.filter((member) => member.inTeam),
    [supervisors],
  );

  // PMR Doctors are on the care team by default and lead the Team roster.
  const teamManagers = useMemo(
    () => managers.filter((member) => member.inTeam),
    [managers],
  );

  const teamGroups = useMemo(() => {
    return teamSupervisors.map((supervisor) => ({
      supervisor,
      careStaff: staff.filter((member) => member.reportsTo === supervisor.id),
    }));
  }, [staff, teamSupervisors]);

  const unassigned = useMemo(() => {
    const adminIds = new Set(admins.map((member) => member.id));
    const teamSupervisorIds = new Set(teamGroups.map((group) => group.supervisor.id));
    return [
      ...managers.filter(
        (member) => !member.inTeam && (!member.reportsTo || !adminIds.has(member.reportsTo)),
      ),
      ...supervisors.filter((member) => !teamSupervisorIds.has(member.id)),
      ...staff.filter((member) => !member.reportsTo || !teamSupervisorIds.has(member.reportsTo)),
    ];
  }, [admins, managers, staff, supervisors, teamGroups]);

  // Onboarded is a one-time placement list: approved leaders plus staff who have
  // never been placed in the team hierarchy.
  const onboardedLeaders = unassigned.filter((member) => member.role !== "staff");
  const onboardedStaff = unassigned.filter(
    (member) => member.role === "staff" && !member.hasBeenAssigned,
  );
  // Staff who were previously assigned to a Duty Doctor and have since been
  // unassigned stay approved but leave the one-time Onboarded list.
  const unassignedStaff = unassigned.filter(
    (member) => member.role === "staff" && member.hasBeenAssigned,
  );

  const teamMemberCount = useMemo(
    () =>
      teamManagers.length +
      teamGroups.reduce((count, group) => count + 1 + group.careStaff.length, 0),
    [teamManagers, teamGroups],
  );

  function reviewerFor(member: TeamMember): TeamMember | null {
    const allowedRoles: TeamRole[] =
      member.role === "manager"
        ? ["admin"]
        : member.role === "supervisor"
          ? ["admin", "manager"]
          : ["admin", "manager", "supervisor"];
    const eligible = (candidate: TeamMember) => allowedRoles.includes(candidate.role);
    if (currentMember && eligible(currentMember)) return currentMember;
    return [...admins, ...managers, ...supervisors].find(eligible) ?? null;
  }

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

    if (activeRole === "manager" && !defaultAdminId) {
      return "Add an Admin first.";
    }

    if (activeRole === "supervisor" && !defaultManagerId) {
      return "Add a PMR Doctor first.";
    }

    if (activeRole === "staff") {
      if (!form.reportsTo) return "Select a Duty Doctor who is in the Team.";
      if (!teamSupervisors.some((member) => member.id === form.reportsTo)) {
        return "Select a Duty Doctor who is in the Team.";
      }
      if (!form.specialty) return "Select a health care specialty.";
      if (form.specialty === "Other" && !form.customSpecialty.trim()) {
        return "Enter the staff specialty.";
      }
    }

    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
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
      const saved = await saveTeamMember({
        role: activeRole,
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        registration: form.registration.trim(),
        specialty:
          activeRole === "staff"
            ? form.specialty === "Other"
              ? form.customSpecialty.trim()
              : form.specialty
            : "",
        reportsTo:
          activeRole === "manager"
            ? defaultAdminId
            : activeRole === "supervisor"
              ? defaultManagerId
              : form.reportsTo,
      });
      setSavedMembers((prev) => [saved, ...prev]);
      setSuccess(
        saved.role === "manager"
          ? `${saved.fullName} has been added as ${ROLE_LABELS[activeRole]} and is awaiting Admin approval.`
          : saved.role === "supervisor"
            ? `${saved.fullName} has been added as ${ROLE_LABELS[activeRole]} and is in Onboarded. Use Team In to add them to the Team.`
            : `${saved.fullName} has been onboarded as ${ROLE_LABELS[activeRole]} and is awaiting approval.`,
      );
      setForm((prev) => ({ ...initialForm, reportsTo: prev.reportsTo }));
    } catch {
      setError("Could not save team member. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(member: TeamMember) {
    const subject = member.approvalStatus === "approved" ? "team member" : "candidate";
    const warning =
      member.role === "admin"
        ? " This also removes the PMR Doctors, Duty Doctors, and health care staff under them."
        : member.role === "manager"
          ? " This also removes the Duty Doctors and health care staff under them."
          : member.role === "supervisor"
            ? " This also removes the health care staff under them."
            : "";

    if (
      !window.confirm(
        `Are you sure you want to remove ${member.fullName} (${subject}) from the team? This cannot be undone.${warning}`,
      )
    ) {
      return;
    }

    const removedIds = getMemberAndDescendantIds(members, member.id);
    await removeTeamMember(member.id);
    setDeletedIds((prev) => new Set([...prev, ...removedIds]));
    setError("");
    setSuccess(`${member.fullName} removed from the team.`);
  }

  async function handleMemberReview(
    id: string,
    decision: ApprovalDecision,
    reviewer: TeamMember,
    note: string,
  ) {
    const updated = await reviewTeamMember(id, {
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
        : `${updated.fullName} was rejected. The review note explains what to correct.`,
    );
  }

  async function handleRowReview(member: TeamMember, decision: ApprovalDecision, note: string) {
    const reviewer = reviewerFor(member);
    if (!reviewer) return;
    await handleMemberReview(member.id, decision, reviewer, note);
  }

  async function handleRecommend(member: TeamMember, note: string) {
    if (!currentMember) return false;
    const updated = await recommendTeamMember(member.id, {
      recommenderId: currentMember.id,
      recommenderName: currentMember.fullName,
      note,
    });
    if (!updated) {
      setError("Could not save the recommendation. Please try again.");
      return false;
    }
    setError("");
    setMemberOverrides((prev) => ({ ...prev, [updated.id]: updated }));
    setSuccess(`${updated.fullName}'s recommendation was saved for review.`);
    return true;
  }

  async function handleAssign(member: TeamMember, dutyDoctorId: string) {
    const dutyDoctor = supervisors.find((item) => item.id === dutyDoctorId);
    const updated = await assignTeamMemberToDutyDoctor(member.id, dutyDoctorId);
    if (!updated) {
      setError("Could not assign the staff member. Please try again.");
      return false;
    }
    setError("");
    setMemberOverrides((prev) => ({ ...prev, [updated.id]: updated }));
    setSuccess(`${updated.fullName} is now assigned to ${dutyDoctor?.fullName ?? "the Duty Doctor"}.`);
    return true;
  }

  async function handleTeamIn(member: TeamMember) {
    const updated = await addTeamMemberToTeam(member.id);
    if (!updated) {
      setError("Could not add the Duty Doctor to the Team. Please try again.");
      return;
    }
    setError("");
    setMemberOverrides((prev) => ({ ...prev, [updated.id]: updated }));
    setSuccess(`${updated.fullName} is now in the Team.`);
  }

  async function handleUnassign(member: TeamMember) {
    const updated = await unassignTeamMemberFromDutyDoctor(member.id);
    if (!updated) {
      setError("Could not unassign the staff member. Please try again.");
      return;
    }
    setError("");
    setMemberOverrides((prev) => ({ ...prev, [updated.id]: updated }));
    setSuccess(
      `${updated.fullName} is now unassigned and appears under Unassigned staff.`,
    );
  }

  async function handleRestore(member: TeamMember) {
    const updated = await restoreTeamMember(member.id);
    if (!updated) {
      setError("Could not restore the team member. Please try again.");
      return;
    }
    setError("");
    setMemberOverrides((prev) => ({ ...prev, [updated.id]: updated }));
    setSuccess(`${updated.fullName} was restored and is back in Onboarding.`);
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
            <nav className="col-span-2 row-start-2 flex w-full flex-wrap items-center gap-1.5 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:w-auto sm:justify-end sm:gap-2">
              <Link
                href="/chat"
                className="shrink-0 whitespace-nowrap rounded-lg border border-border bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 sm:px-3 sm:py-2 sm:text-sm"
              >
                Treatment
              </Link>
              <Link
                href="/dashboard"
                className="shrink-0 whitespace-nowrap rounded-lg border border-border bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 sm:px-3 sm:py-2 sm:text-sm"
              >
                Dashboard
              </Link>
              <Link
                href="/onboarding"
                className="shrink-0 whitespace-nowrap rounded-lg border border-border bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 sm:px-3 sm:py-2 sm:text-sm"
              >
                Patient
              </Link>
            </nav>
          </header>

          <section className="mb-5 rounded-2xl border border-border bg-white px-4 py-4">
            <p className="text-base font-semibold text-slate-900">Onboard in this order</p>
            <ol className="mt-2 grid gap-2 text-sm font-medium text-slate-800 sm:grid-cols-4">
              <li className="rounded-lg bg-slate-50 px-2.5 py-1.5">1. Add the Admin</li>
              <li className="rounded-lg bg-slate-50 px-2.5 py-1.5">2. Add PMR Doctors under the Admin</li>
              <li className="rounded-lg bg-slate-50 px-2.5 py-1.5">3. Add Duty Doctors under a PMR Doctor</li>
              <li className="rounded-lg bg-slate-50 px-2.5 py-1.5">4. Add health care staff under a Duty Doctor</li>
            </ol>
            <div className="mt-3 grid gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-sm leading-6 text-slate-800 sm:grid-cols-2">
              <p>
                <span className="font-bold text-indigo-700">PMR Doctors</span> are on the care team by
                default and appear in Team as the team lead.
              </p>
              <p>
                <span className="font-bold text-amber-700">Health care staff</span> start in Onboarding
                and need approval.
              </p>
              <p>
                <span className="font-bold text-emerald-700">Duty Doctors</span> added by a PMR Doctor
                are approved automatically and appear in Onboarded.
              </p>
              <p>
                <span className="font-bold text-indigo-700">Team In</span> is required before staff can
                be assigned to that Duty Doctor.
              </p>
              <p className="sm:col-span-2">
                <span className="font-bold text-rose-700">Unassigned staff</span> stay approved and wait
                under Unassigned staff until they are reassigned.
              </p>
            </div>
            {canApproveMembers ? (
              <p className="mt-3 text-sm font-medium text-emerald-900">
                As an Admin, PMR Doctor or Duty Doctor you can approve or reject team members in the
                Onboarding section.
              </p>
            ) : null}
            {canRecommendMembers ? (
              <p className="mt-3 text-sm font-medium text-sky-900">
                As a Duty Doctor you can add a recommendation on care team members; the reviewer will
                see your note.
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm font-medium text-slate-700">
              <span>{admins.length} admin(s)</span>
              <span>{managers.length} PMR Doctor(s)</span>
              <span>{supervisors.length} Duty Doctor(s)</span>
              <span>{staff.length} health care staff</span>
              <span>{teamMemberCount} in Team</span>
              <span>{onboardingQueue.length} awaiting approval</span>
              <span>{rejectedQueue.length} rejected</span>
              <span>{members.length} total</span>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-6">
            <div
              className={`grid gap-2 ${roleTabs.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
              role="tablist"
              aria-label="Team role"
            >
              {roleTabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeRole === tab}
                  onClick={() => selectRole(tab)}
                  className={`rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    activeRole === tab
                      ? "bg-brand text-white shadow-sm"
                      : "border border-border bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Add {ROLE_LABELS[tab]}
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

              {activeRole === "staff" ? (
                <Field label="Reports to Duty Doctor" htmlFor="reportsTo" required>
                  <select
                    id="reportsTo"
                    value={form.reportsTo}
                    onChange={(event) => update("reportsTo", event.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select Duty Doctor</option>
                    {teamSupervisors.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.fullName} ({member.email})
                      </option>
                    ))}
                  </select>
                  {teamSupervisors.length === 0 ? (
                    <p className="mt-1.5 text-xs text-danger">
                      No Duty Doctor is in the Team yet. Add a Duty Doctor and use Team In first.
                    </p>
                  ) : null}
                </Field>
              ) : (
                <p className="rounded-xl bg-slate-100 px-3 py-2 text-xs leading-5 text-slate-700">
                  {activeRole === "manager"
                    ? `This PMR Doctor will report to ${admins.find((member) => member.id === defaultAdminId)?.fullName ?? "the Admin"}.`
                    : `This Duty Doctor will report to ${defaultManagerName}.`}
                </p>
              )}

              {activeRole === "staff" ? (
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

              {activeRole === "manager" ? (
                <p className="rounded-xl bg-brand-soft/60 px-3 py-2 text-xs leading-5 text-brand-strong">
                  PMR Doctors verify Duty Doctors and care staff. An Admin must approve this PMR
                  Doctor before they can start reviewing.
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
                {saving ? "Saving..." : `Add ${ROLE_LABELS[activeRole]}`}
              </button>
            </form>
          </section>

          <section className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                Admin &amp; PMR Doctors
              </h2>
              <span className="text-sm font-medium text-slate-700">
                {admins.length + managers.length} leader(s)
              </span>
            </div>
            {admins.length + managers.filter((member) => !member.inTeam).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-white px-4 py-6 text-center text-sm text-muted">
                No Admin or PMR Doctor awaiting placement. PMR Doctors on the care team are listed
                under Team.
              </div>
            ) : (
              <>
                <ul className="space-y-2">
                  {[...admins, ...managers.filter((member) => !member.inTeam)].map((leader) => (
                    <li key={leader.id} className="rounded-xl border border-white/20 bg-[#1e8285] p-3 text-white">
                      <MemberRow member={leader} onDelete={handleDelete} />
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-sm font-medium text-slate-700">
                  PMR Doctors on the care team are listed under Team as the team lead.
                </p>
              </>
            )}
          </section>

          <section className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                Onboarding
              </h2>
              <span className="text-sm font-medium text-slate-700">
                {onboardingQueue.length} awaiting approval
              </span>
            </div>
            <p className="mb-3 text-sm leading-6 text-slate-700">
              PMR Doctors and health care staff awaiting verification. Approve or reject them here;
              approved members move to Onboarded. Duty Doctors are approved automatically.
            </p>
            {onboardingQueue.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-white px-4 py-6 text-center text-sm text-muted">
                No team members are currently in onboarding.
              </div>
            ) : (
              <ul className="space-y-2">
                {onboardingQueue.map((member) => (
                  <li
                    key={member.id}
                    className="rounded-xl border border-white/20 bg-[#1e8285] p-3 text-white"
                  >
                    <MemberRow
                      member={member}
                      onDelete={(item) => handleDelete(item)}
                      canApprove={canApproveMembers}
                      onReview={handleRowReview}
                      canRecommend={canRecommendMembers && member.role === "staff"}
                      onRecommend={handleRecommend}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                Onboarded
              </h2>
              <span className="text-sm font-medium text-slate-700">
                {onboardedLeaders.length + onboardedStaff.length} awaiting placement
              </span>
            </div>
            <p className="mb-3 text-sm leading-6 text-slate-700">
              First-time placement for approved team members. A Duty Doctor must be added with Team
              In before staff can be assigned to them. Once a staff member has been placed, they move
              to Team and never return here.
            </p>

            {onboardedLeaders.length + onboardedStaff.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-white px-4 py-6 text-center text-sm text-muted">
                No onboarded team members are awaiting first placement.
              </div>
            ) : (
              <ul className="space-y-2">
                {[...onboardedLeaders, ...onboardedStaff].map((member) => (
                  <li
                    key={member.id}
                    className="rounded-xl border border-white/20 bg-[#1e8285] p-3 text-white"
                  >
                    <MemberRow
                      member={member}
                      onDelete={handleDelete}
                      canRecommend={canRecommendMembers && member.role === "staff"}
                      onRecommend={handleRecommend}
                      dutyDoctors={member.role === "staff" ? teamSupervisors : undefined}
                      onAssign={member.role === "staff" ? handleAssign : undefined}
                      canTeamIn={member.role === "supervisor" && canManageTeam}
                      onTeamIn={handleTeamIn}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                Unassigned staff
              </h2>
              <span className="text-sm font-medium text-slate-700">{unassignedStaff.length} awaiting reassignment</span>
            </div>
            <p className="mb-3 text-sm leading-6 text-slate-700">
              Approved staff who were previously assigned and are now waiting for a new Duty Doctor.
              They keep their approval and treatment history; reassign them to any Duty Doctor in
              Team.
            </p>

            {unassignedStaff.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-white px-4 py-6 text-center text-sm text-muted">
                No unassigned staff. Everyone placed before is currently in Team.
              </div>
            ) : (
              <ul className="space-y-2">
                {unassignedStaff.map((member) => (
                  <li
                    key={member.id}
                    className="rounded-xl border border-white/20 bg-[#1e8285] p-3 text-white"
                  >
                    <MemberRow
                      member={member}
                      onDelete={handleDelete}
                      canRecommend={canRecommendMembers}
                      onRecommend={handleRecommend}
                      dutyDoctors={teamSupervisors}
                      onAssign={handleAssign}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                Team
              </h2>
              <span className="text-sm font-medium text-slate-700">{teamMemberCount} member(s)</span>
            </div>
            <p className="mb-3 text-sm leading-6 text-slate-700">
              Assigned care team. The PMR Doctor leads the team, and health care staff are grouped
              under Duty Doctors who are in Team.
            </p>

            {teamManagers.length === 0 && teamGroups.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-white px-4 py-6 text-center text-sm text-muted">
                No staff assigned to a Duty Doctor yet.
              </div>
            ) : (
              <ul className="space-y-4">
                {teamManagers.map((manager) => (
                  <li
                    key={manager.id}
                    className="rounded-2xl border border-white/20 bg-[#1e8285] p-4 text-white"
                  >
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white">
                      Team lead · PMR Doctor
                    </p>
                    <MemberRow member={manager} onDelete={handleDelete} />
                  </li>
                ))}
                {teamGroups.map(({ supervisor, careStaff }) => (
                  <li
                    key={supervisor.id}
                    className="rounded-2xl border border-white/20 bg-[#1e8285] p-4 text-white"
                  >
                    <MemberRow member={supervisor} onDelete={handleDelete} />
                    {careStaff.length === 0 ? (
                      <p className="mt-2 pl-4 text-sm font-medium text-white/90">No health care staff yet.</p>
                    ) : (
                      <ul className="mt-3 space-y-2 border-l-2 border-brand-soft pl-4">
                        {careStaff.map((member) => (
                          <li key={member.id}>
                            <MemberRow
                              member={member}
                              onDelete={handleDelete}
                              canRecommend={canRecommendMembers}
                              onRecommend={handleRecommend}
                              canUnassign
                              onUnassign={handleUnassign}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                Rejected
              </h2>
              <span className="text-sm font-medium text-slate-700">{rejectedQueue.length} rejected</span>
            </div>
            <p className="mb-3 text-sm leading-6 text-slate-700">
              Rejected candidates can be restored to Onboarding for another review, or removed from
              the team.
            </p>
            {rejectedQueue.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-white px-4 py-6 text-center text-sm text-muted">
                No rejected team members.
              </div>
            ) : (
              <ul className="space-y-2">
                {rejectedQueue.map((member) => (
                  <li
                    key={member.id}
                    className="rounded-xl border border-white/20 bg-[#1e8285] p-3 text-white"
                  >
                    <MemberRow
                      member={member}
                      onDelete={handleDelete}
                      onRestore={handleRestore}
                    />
                  </li>
                ))}
              </ul>
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
  onReview,
  canApprove = false,
  onRecommend,
  canRecommend = false,
  onRestore,
  dutyDoctors,
  onAssign,
  onTeamIn,
  canTeamIn = false,
  onUnassign,
  canUnassign = false,
}: {
  member: TeamMember;
  onDelete: (member: TeamMember) => void;
  onReview?: (member: TeamMember, decision: ApprovalDecision, note: string) => void | Promise<void>;
  canApprove?: boolean;
  onRecommend?: (member: TeamMember, note: string) => Promise<boolean>;
  canRecommend?: boolean;
  onRestore?: (member: TeamMember) => void | Promise<void>;
  dutyDoctors?: TeamMember[];
  onAssign?: (member: TeamMember, dutyDoctorId: string) => Promise<boolean>;
  onTeamIn?: (member: TeamMember) => void | Promise<void>;
  canTeamIn?: boolean;
  onUnassign?: (member: TeamMember) => void | Promise<void>;
  canUnassign?: boolean;
}) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedDutyDoctorId, setSelectedDutyDoctorId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function openReview() {
    setNote(member.reviewNote);
    setError("");
    setRecommendOpen(false);
    setReviewOpen(true);
  }

  function openRecommendation() {
    setNote(member.recommendationNote);
    setError("");
    setReviewOpen(false);
    setRecommendOpen(true);
  }

  async function submitReview(decision: ApprovalDecision) {
    if (!onReview) return;
    const trimmed = note.trim();
    if (decision === "rejected" && !trimmed) {
      setError("Add a reason for rejection.");
      return;
    }
    setSaving(true);
    try {
      await onReview(member, decision, trimmed);
      setReviewOpen(false);
      setNote("");
      setError("");
    } finally {
      setSaving(false);
    }
  }

  async function submitRecommendation() {
    if (!onRecommend) return;
    const trimmed = note.trim();
    if (!trimmed) {
      setError("Add a recommendation note.");
      return;
    }
    setSaving(true);
    try {
      const saved = await onRecommend(member, trimmed);
      if (saved) {
        setRecommendOpen(false);
        setNote("");
        setError("");
      } else {
        setError("Could not save the recommendation.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function submitRestore() {
    if (!onRestore) return;
    setSaving(true);
    try {
      await onRestore(member);
    } finally {
      setSaving(false);
    }
  }

  async function submitTeamIn() {
    if (!onTeamIn) return;
    setSaving(true);
    try {
      await onTeamIn(member);
    } finally {
      setSaving(false);
    }
  }

  async function submitUnassign() {
    if (!onUnassign) return;
    setSaving(true);
    try {
      await onUnassign(member);
    } finally {
      setSaving(false);
    }
  }

  function openAssign() {
    setSelectedDutyDoctorId(dutyDoctors?.[0]?.id ?? "");
    setError("");
    setReviewOpen(false);
    setRecommendOpen(false);
    setAssignOpen(true);
  }

  async function submitAssign() {
    if (!onAssign || !selectedDutyDoctorId) return;
    setSaving(true);
    try {
      const saved = await onAssign(member, selectedDutyDoctorId);
      if (saved) {
        setAssignOpen(false);
        setSelectedDutyDoctorId("");
        setError("");
      } else {
        setError("Could not assign the staff member.");
      }
    } finally {
      setSaving(false);
    }
  }

  // Buttons share the row on small screens and return to their natural width
  // on larger ones, so the card never pushes past the viewport.
  const actionButton =
    "min-w-0 flex-1 rounded-lg px-2 py-1.5 text-center text-xs font-semibold sm:w-auto sm:flex-none sm:px-2.5";

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-white">{member.fullName}</p>
            <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium text-white">
              {member.specialty || ROLE_LABELS[member.role]}
            </span>
          </div>
          <p className="truncate text-sm text-white/85">
            {member.email}
            {member.phone ? ` · ${member.phone}` : ""}
          </p>
          {member.registration ? (
            <p className="text-sm font-medium text-white/85">Reg. {member.registration}</p>
          ) : null}
        </div>
        <div className="flex w-full flex-wrap items-stretch gap-2 sm:w-auto sm:justify-end sm:gap-1.5">
          {canApprove && onReview ? (
            <>
              <button
                type="button"
                onClick={() => submitReview("approved")}
                className={`${actionButton} bg-white text-[#1e8285] hover:bg-white/90`}
              >
                Approve
              </button>
              <button
                type="button"
                onClick={openReview}
                className={`${actionButton} border border-rose-200 bg-white text-rose-700 hover:bg-rose-50`}
              >
                Reject
              </button>
            </>
          ) : null}
          {canRecommend && onRecommend ? (
            <button
              type="button"
              onClick={openRecommendation}
              className={`${actionButton} border border-sky-200 bg-white text-sky-700 hover:bg-sky-50`}
            >
              {member.recommendationNote ? "Edit recommendation" : "Recommend"}
            </button>
          ) : null}
          {canTeamIn && onTeamIn ? (
            <button
              type="button"
              onClick={submitTeamIn}
              disabled={saving}
              className={`${actionButton} bg-indigo-700 text-white hover:bg-indigo-800 disabled:opacity-60`}
            >
              Team In
            </button>
          ) : null}
          {onAssign && dutyDoctors && dutyDoctors.length > 0 ? (
            <button
              type="button"
              onClick={openAssign}
              className={`${actionButton} border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50`}
            >
              Assign to Duty Doctor
            </button>
          ) : null}
          {canUnassign && onUnassign ? (
            <button
              type="button"
              onClick={submitUnassign}
              disabled={saving}
              className={`${actionButton} border border-amber-200 bg-white text-amber-700 hover:bg-amber-50 disabled:opacity-60`}
            >
              Unassign
            </button>
          ) : null}
          {onRestore ? (
            <button
              type="button"
              onClick={submitRestore}
              disabled={saving}
              className={`${actionButton} border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 disabled:opacity-60`}
            >
              Restore
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onDelete(member)}
            className={`${actionButton} border border-border bg-white font-medium text-slate-600 hover:bg-red-50 hover:text-danger`}
          >
            Remove
          </button>
        </div>
      </div>

      {member.recommendationNote ? (
        <p className="mt-2 rounded-lg bg-sky-50 px-2.5 py-2 text-xs text-sky-800">
          <span className="font-semibold">
            Duty Doctor recommendation
            {member.recommendedByName ? ` (${member.recommendedByName})` : ""}:
          </span>{" "}
          {member.recommendationNote}
        </p>
      ) : null}

      {error ? (
        <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-2 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {assignOpen && dutyDoctors ? (
        <div className="mt-2 rounded-lg border border-indigo-200 bg-white p-2.5">
          <label
            htmlFor={`assign-duty-doctor-${member.id}`}
            className="mb-1.5 block text-xs font-medium text-slate-700"
          >
            Assign {member.fullName} to a Duty Doctor
          </label>
          <select
            id={`assign-duty-doctor-${member.id}`}
            value={selectedDutyDoctorId}
            onChange={(event) => setSelectedDutyDoctorId(event.target.value)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-brand/20 transition focus:border-brand focus:ring-4"
          >
            {dutyDoctors.map((dutyDoctor) => (
              <option key={dutyDoctor.id} value={dutyDoctor.id}>
                {dutyDoctor.fullName} ({dutyDoctor.email})
              </option>
            ))}
          </select>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={submitAssign}
              disabled={saving || !selectedDutyDoctorId}
              className="rounded-lg bg-indigo-700 px-2 py-1 text-xs font-semibold text-white hover:bg-indigo-800 disabled:opacity-60"
            >
              Assign
            </button>
            <button
              type="button"
              onClick={() => {
                setAssignOpen(false);
                setError("");
              }}
              className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {reviewOpen ? (
        <div className="mt-2 rounded-lg border border-border bg-white p-2.5">
          <label className="mb-1.5 block text-xs font-medium text-slate-700">
            Reason for rejection
          </label>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            placeholder="Explain what needs to be corrected before approval."
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-brand/20 transition focus:border-brand focus:ring-4"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => submitReview("approved")}
              disabled={saving}
              className="rounded-lg bg-brand px-2 py-1 text-xs font-semibold text-white hover:bg-brand-strong disabled:opacity-60"
            >
              Approve anyway
            </button>
            <button
              type="button"
              onClick={() => submitReview("rejected")}
              disabled={saving}
              className="rounded-lg bg-rose-600 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
            >
              Confirm rejection
            </button>
            <button
              type="button"
              onClick={() => {
                setReviewOpen(false);
                setError("");
              }}
              className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {recommendOpen ? (
        <div className="mt-2 rounded-lg border border-sky-200 bg-white p-2.5">
          <label className="mb-1.5 block text-xs font-medium text-slate-700">
            Recommendation for the reviewer
          </label>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            placeholder="e.g. Verified qualifications and experience for this role."
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-brand/20 transition focus:border-brand focus:ring-4"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={submitRecommendation}
              disabled={saving}
              className="rounded-lg bg-sky-700 px-2 py-1 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
            >
              Submit recommendation
            </button>
            <button
              type="button"
              onClick={() => {
                setRecommendOpen(false);
                setError("");
              }}
              className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
