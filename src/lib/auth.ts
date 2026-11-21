import { parseApprovalStatus, type ApprovalDecision, type ApprovalStatus } from "@/lib/approvals";

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
  approvalStatus: ApprovalStatus;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string;
  createdAt: string;
};

export type NewPatient = Omit<
  Patient,
  "id" | "createdAt" | "approvalStatus" | "reviewedBy" | "reviewedByName" | "reviewedAt" | "reviewNote"
>;

const AUTH_KEY = "careloon_auth";
const PATIENTS_KEY = "careloon_patients";

export function getStoredUser(): User | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(AUTH_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function login(email: string, password: string): User {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password.trim()) {
    throw new Error("Email and password are required.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error("Enter a valid email address.");
  }
  if (password.trim().length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  const user: User = {
    email: normalizedEmail,
    name: normalizedEmail.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  };
  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  return user;
}

export function logout() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_KEY);
}

function parsePatient(value: unknown): Patient | null {
  if (typeof value !== "object" || value === null) return null;
  const patient = value as Record<string, unknown>;

  if (
    typeof patient.id !== "string" ||
    typeof patient.fullName !== "string" ||
    typeof patient.createdAt !== "string"
  ) {
    return null;
  }

  return {
    id: patient.id,
    fullName: patient.fullName,
    dateOfBirth: typeof patient.dateOfBirth === "string" ? patient.dateOfBirth : "",
    gender: typeof patient.gender === "string" ? patient.gender : "",
    phone: typeof patient.phone === "string" ? patient.phone : "",
    address: typeof patient.address === "string" ? patient.address : "",
    emergencyContactName:
      typeof patient.emergencyContactName === "string" ? patient.emergencyContactName : "",
    emergencyContactPhone:
      typeof patient.emergencyContactPhone === "string" ? patient.emergencyContactPhone : "",
    diagnosis: typeof patient.diagnosis === "string" ? patient.diagnosis : "",
    careNotes: typeof patient.careNotes === "string" ? patient.careNotes : "",
    approvalStatus: parseApprovalStatus(patient.approvalStatus),
    reviewedBy: typeof patient.reviewedBy === "string" ? patient.reviewedBy : null,
    reviewedByName: typeof patient.reviewedByName === "string" ? patient.reviewedByName : null,
    reviewedAt: typeof patient.reviewedAt === "string" ? patient.reviewedAt : null,
    reviewNote: typeof patient.reviewNote === "string" ? patient.reviewNote : "",
    createdAt: patient.createdAt,
  };
}

export function getPatients(): Patient[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(PATIENTS_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parsePatient)
      .filter((patient): patient is Patient => patient !== null);
  } catch {
    return [];
  }
}

export function savePatient(patient: NewPatient): Patient {
  const patients = getPatients();
  const newPatient: Patient = {
    ...patient,
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()),
    approvalStatus: "pending",
    reviewedBy: null,
    reviewedByName: null,
    reviewedAt: null,
    reviewNote: "",
    createdAt: new Date().toISOString(),
  };
  patients.unshift(newPatient);
  localStorage.setItem(PATIENTS_KEY, JSON.stringify(patients));
  return newPatient;
}

export function removePatient(id: string): void {
  const patients = getPatients().filter((patient) => patient.id !== id);
  localStorage.setItem(PATIENTS_KEY, JSON.stringify(patients));
}

export function reviewPatient(
  id: string,
  review: {
    approvalStatus: ApprovalDecision;
    reviewerId: string;
    reviewerName: string;
    note: string;
  },
): Patient | null {
  const patients = getPatients();
  const index = patients.findIndex((patient) => patient.id === id);
  if (index === -1) return null;

  const updated: Patient = {
    ...patients[index],
    approvalStatus: review.approvalStatus,
    reviewedBy: review.reviewerId,
    reviewedByName: review.reviewerName,
    reviewedAt: new Date().toISOString(),
    reviewNote: review.note.trim(),
  };
  patients[index] = updated;
  localStorage.setItem(PATIENTS_KEY, JSON.stringify(patients));
  return updated;
}
