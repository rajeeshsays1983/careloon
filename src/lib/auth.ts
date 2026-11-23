import {
  createPatientAction,
  removePatientAction,
  reviewPatientAction,
} from "@/app/actions";
import type { ApprovalDecision, ApprovalStatus } from "@/lib/approvals";
import {
  getDataServerSnapshot,
  getDataSnapshot,
  replaceData,
  subscribeData,
} from "@/lib/client-store";

export type User = {
  email: string;
  name: string;
};

export type Patient = {
  id: string;
  fullName: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  diagnosis: string;
  careNotes: string;
  careProviderId: string | null;
  careProviderName: string;
  approvalStatus: ApprovalStatus;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string;
  createdAt: string;
};

export type NewPatient = Omit<
  Patient,
  | "id"
  | "createdAt"
  | "careProviderId"
  | "careProviderName"
  | "approvalStatus"
  | "reviewedBy"
  | "reviewedByName"
  | "reviewedAt"
  | "reviewNote"
>;

const AUTH_KEY = "careloon_auth";

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "Admin@123";
const STAFF_PASSWORD = "Careloon@123";

export const DEMO_CREDENTIALS = {
  adminUsername: ADMIN_USERNAME,
  adminPassword: ADMIN_PASSWORD,
  staffPassword: STAFF_PASSWORD,
};
const ADMIN_USER: User = {
  email: "admin@careloon.local",
  name: "Admin",
};

export function getStoredUser(): User | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(AUTH_KEY);
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as Partial<User>;
    if (
      typeof stored.email !== "string" ||
      !stored.email.trim() ||
      typeof stored.name !== "string" ||
      !stored.name.trim()
    ) {
      localStorage.removeItem(AUTH_KEY);
      return null;
    }
    return { email: stored.email, name: stored.name };
  } catch {
    return null;
  }
}

function normalizeLoginName(value: string): string {
  return value.trim().toLowerCase().replace(/[\s._-]+/g, "");
}

export function login(
  username: string,
  password: string,
  members: {
    fullName: string;
    email: string;
    role: string;
    approvalStatus: string;
    username?: string;
  }[] = [],
): User {
  const normalizedUsername = normalizeLoginName(username);
  if (!normalizedUsername || !password) {
    throw new Error("Username and password are required.");
  }

  if (normalizedUsername === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(ADMIN_USER));
    return ADMIN_USER;
  }

  // Approved team members sign in with their username, email, the part before @,
  // or their full name, plus the shared demo password.
  const member = members.find((candidate) => {
    if (candidate.approvalStatus !== "approved" || candidate.role === "admin") return false;
    const email = candidate.email.toLowerCase();
    return (
      (candidate.username ? normalizeLoginName(candidate.username) === normalizedUsername : false) ||
      email === normalizedUsername ||
      email.split("@")[0] === normalizedUsername ||
      normalizeLoginName(candidate.fullName) === normalizedUsername
    );
  });

  if (!member || password !== STAFF_PASSWORD) {
    throw new Error("Invalid username or password.");
  }

  const user: User = { email: member.email, name: member.fullName };
  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  return user;
}

export function logout() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_KEY);
}

// Patients live in data/patients.json. The client store mirrors the server data.

export function getPatients(): Patient[] {
  return getDataSnapshot().patients;
}

export function subscribeToPatients(listener: () => void): () => void {
  return subscribeData(listener);
}

export function getPatientsServerSnapshot(): Patient[] {
  return getDataServerSnapshot().patients;
}

export async function savePatient(input: NewPatient): Promise<Patient> {
  const saved = await createPatientAction(input);
  replaceData("patients", [saved, ...getPatients()]);
  return saved;
}

export async function reviewPatient(
  id: string,
  review: {
    approvalStatus: ApprovalDecision;
    reviewerId: string;
    reviewerName: string;
    note: string;
    careProviderId?: string | null;
    careProviderName?: string;
  },
): Promise<Patient | null> {
  const updated = await reviewPatientAction(id, review);
  if (updated) {
    replaceData(
      "patients",
      getPatients().map((patient) => (patient.id === updated.id ? updated : patient)),
    );
  }
  return updated;
}

export async function removePatient(id: string): Promise<void> {
  await removePatientAction(id);
  replaceData(
    "patients",
    getPatients().filter((patient) => patient.id !== id),
  );
}
