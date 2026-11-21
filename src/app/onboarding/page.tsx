"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState, useSyncExternalStore } from "react";
import { ApprovalBadge } from "@/components/ApprovalBadge";
import { AuthGuard } from "@/components/AuthGuard";
import { PmrApprovalPanel, type ApprovalQueueItem } from "@/components/PmrApprovalPanel";
import { SignOutButton } from "@/components/SignOutButton";
import type { ApprovalDecision } from "@/lib/approvals";
import {
  getPatients,
  getStoredUser,
  removePatient,
  reviewPatient,
  savePatient,
  type Patient,
} from "@/lib/auth";
import { getTeamMembers, type TeamMember } from "@/lib/team";

function subscribe() {
  return () => {};
}

type FormState = {
  fullName: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  diagnosis: string;
  careNotes: string;
};

const initialForm: FormState = {
  fullName: "",
  dateOfBirth: "",
  gender: "",
  phone: "",
  address: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  diagnosis: "",
  careNotes: "",
};

export default function OnboardingPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [savedPatients, setSavedPatients] = useState<Patient[]>([]);
  const [patientOverrides, setPatientOverrides] = useState<Record<string, Patient>>({});
  const [deletedPatientIds, setDeletedPatientIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const user = useMemo(() => (mounted ? getStoredUser() : null), [mounted]);
  const members = useMemo(() => (mounted ? getTeamMembers() : []), [mounted]);
  const pmrs = useMemo(
    () => members.filter((member) => member.role === "pmr" && member.approvalStatus === "approved"),
    [members],
  );
  const storedPatients = useMemo(() => (mounted ? getPatients() : []), [mounted]);
  const patients = useMemo(() => {
    const byId = new Map<string, Patient>();
    for (const patient of [...savedPatients, ...storedPatients]) byId.set(patient.id, patient);
    for (const patient of Object.values(patientOverrides)) byId.set(patient.id, patient);
    return [...byId.values()].filter((patient) => !deletedPatientIds.has(patient.id));
  }, [deletedPatientIds, patientOverrides, savedPatients, storedPatients]);

  const approvalQueue = useMemo(
    () =>
      patients
        .filter((patient) => patient.approvalStatus !== "approved")
        .sort((a, b) =>
          a.approvalStatus === b.approvalStatus
            ? b.createdAt.localeCompare(a.createdAt)
            : a.approvalStatus === "pending"
              ? -1
              : 1,
        ),
    [patients],
  );
  const approvedPatients = useMemo(
    () => patients.filter((patient) => patient.approvalStatus === "approved"),
    [patients],
  );
  const patientApprovalItems = useMemo<ApprovalQueueItem[]>(
    () =>
      approvalQueue.map((patient) => ({
        id: patient.id,
        title: patient.fullName,
        subtitle: patient.diagnosis || "No diagnosis added",
        meta: [
          patient.dateOfBirth ? `DOB ${patient.dateOfBirth}` : "",
          patient.phone,
          patient.emergencyContactName
            ? `Emergency: ${patient.emergencyContactName} (${patient.emergencyContactPhone})`
            : "",
        ]
          .filter(Boolean)
          .join(" · "),
        approvalStatus: patient.approvalStatus,
        reviewNote: patient.reviewNote,
        reviewedByName: patient.reviewedByName,
        reviewedAt: patient.reviewedAt,
      })),
    [approvalQueue],
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(values: FormState): string | null {
    if (!values.fullName.trim()) return "Patient name is required.";
    if (!values.dateOfBirth) return "Date of birth is required.";
    if (!values.gender) return "Please select a gender.";
    if (!values.phone.trim()) return "Phone number is required.";
    if (!values.emergencyContactName.trim()) return "Emergency contact name is required.";
    if (!values.emergencyContactPhone.trim()) return "Emergency contact phone is required.";
    return null;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    const validationError = validate(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    try {
      const saved = savePatient({
        fullName: form.fullName.trim(),
        dateOfBirth: form.dateOfBirth,
        gender: form.gender,
        phone: form.phone.trim(),
        address: form.address.trim(),
        emergencyContactName: form.emergencyContactName.trim(),
        emergencyContactPhone: form.emergencyContactPhone.trim(),
        diagnosis: form.diagnosis.trim(),
        careNotes: form.careNotes.trim(),
      });
      setSavedPatients((prev) => [saved, ...prev]);
      setForm(initialForm);
      setSuccess(`${saved.fullName} has been onboarded and is awaiting PMR approval.`);
    } catch {
      setError("Could not save patient. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handlePatientReview(
    id: string,
    decision: ApprovalDecision,
    reviewer: TeamMember,
    note: string,
  ) {
    const updated = reviewPatient(id, {
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
    setPatientOverrides((prev) => ({ ...prev, [updated.id]: updated }));
    setSuccess(
      decision === "approved"
        ? `${updated.fullName} has been verified and approved.`
        : `${updated.fullName} was rejected. The PMR note explains what to correct.`,
    );
  }

  function handleRemovePatient(id: string) {
    const patient = patients.find((item) => item.id === id);
    if (!patient) return;
    if (!window.confirm(`Remove ${patient.fullName} from patient onboarding?`)) return;

    removePatient(id);
    setDeletedPatientIds((prev) => new Set([...prev, id]));
    setError("");
    setSuccess(`${patient.fullName} removed.`);
  }

  return (
    <AuthGuard>
      <main className="min-h-screen w-full bg-slate-50 px-4 pb-8 pt-5 sm:px-6">
        <div className="w-full">
          <header className="mb-5 grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-[0.16em] text-brand">CARELOON</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Patient onboarding</h1>
              <p className="mt-1 text-sm text-muted">
                {user ? `Signed in as ${user.name}` : "Add a new patient to begin care coordination."}
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
                href="/team-onboarding"
                className="whitespace-nowrap rounded-lg border border-border bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 sm:px-3 sm:py-2 sm:text-sm"
              >
                Team onboarding
              </Link>
            </nav>
          </header>

          <div className="space-y-6">
            <section className="rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-6">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Full name" htmlFor="fullName" required>
                    <input id="fullName" value={form.fullName} onChange={(e) => update("fullName", e.target.value)} className={inputClass} placeholder="Patient full name" />
                  </Field>
                  <Field label="Date of birth" htmlFor="dateOfBirth" required>
                    <input id="dateOfBirth" type="date" value={form.dateOfBirth} onChange={(e) => update("dateOfBirth", e.target.value)} className={inputClass} />
                  </Field>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Gender" htmlFor="gender" required>
                    <select id="gender" value={form.gender} onChange={(e) => update("gender", e.target.value)} className={inputClass}>
                      <option value="">Select gender</option>
                      <option value="Female">Female</option>
                      <option value="Male">Male</option>
                      <option value="Non-binary">Non-binary</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                      <option value="Other">Other</option>
                    </select>
                  </Field>
                  <Field label="Phone number" htmlFor="phone" required>
                    <input id="phone" type="tel" inputMode="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} className={inputClass} placeholder="+1 555 000 0000" />
                  </Field>
                </div>

                <Field label="Address" htmlFor="address">
                  <textarea id="address" value={form.address} onChange={(e) => update("address", e.target.value)} className={`${inputClass} min-h-20 resize-y`} placeholder="Street, city, state" />
                </Field>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Emergency contact name" htmlFor="emergencyContactName" required>
                    <input id="emergencyContactName" value={form.emergencyContactName} onChange={(e) => update("emergencyContactName", e.target.value)} className={inputClass} placeholder="Contact name" />
                  </Field>
                  <Field label="Emergency contact phone" htmlFor="emergencyContactPhone" required>
                    <input id="emergencyContactPhone" type="tel" inputMode="tel" value={form.emergencyContactPhone} onChange={(e) => update("emergencyContactPhone", e.target.value)} className={inputClass} placeholder="Contact phone" />
                  </Field>
                </div>

                <Field label="Primary diagnosis / condition" htmlFor="diagnosis">
                  <input id="diagnosis" value={form.diagnosis} onChange={(e) => update("diagnosis", e.target.value)} className={inputClass} placeholder="e.g., Advanced heart failure" />
                </Field>

                <Field label="Care notes" htmlFor="careNotes">
                  <textarea id="careNotes" value={form.careNotes} onChange={(e) => update("careNotes", e.target.value)} className={`${inputClass} min-h-24 resize-y`} placeholder="Comfort needs, preferences, or important notes" />
                </Field>

                {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger" role="alert">{error}</p> : null}
                {success ? <p className="rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-800">{success}</p> : null}

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {saving ? "Saving..." : "Save patient"}
                </button>
              </form>
            </section>

            <div className="space-y-6">
              <PmrApprovalPanel
                title="PMR approval queue · Patients"
                description="Newly onboarded patients must be verified by the PMR doctor before care reports can be recorded for them."
                emptyMessage="No patients are waiting for PMR approval."
                items={patientApprovalItems}
                pmrDoctors={pmrs}
                onReview={handlePatientReview}
                onRemove={handleRemovePatient}
              />

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Approved patients</h2>
                  <span className="text-xs text-muted">{approvedPatients.length} total</span>
                </div>
                {approvedPatients.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-white px-4 py-6 text-center text-sm text-muted">
                    No approved patients yet. Patients appear here after the PMR doctor verifies them.
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {approvedPatients.map((p) => (
                      <li key={p.id} className="rounded-2xl border border-border bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-slate-900">{p.fullName}</p>
                            <p className="text-sm text-muted">{p.diagnosis || "No diagnosis added"}</p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <ApprovalBadge status={p.approvalStatus} />
                            <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-strong">
                              {new Date(p.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
                          <p><span className="text-muted">DOB:</span> {p.dateOfBirth || "-"}</p>
                          <p><span className="text-muted">Phone:</span> {p.phone || "-"}</p>
                          <p className="col-span-2"><span className="text-muted">Emergency:</span> {p.emergencyContactName} ({p.emergencyContactPhone})</p>
                        </div>
                        {p.reviewedAt ? (
                          <p className="mt-2 text-xs text-muted">
                            Verified by {p.reviewedByName || "PMR doctor"} · {new Date(p.reviewedAt).toLocaleString()}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
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
