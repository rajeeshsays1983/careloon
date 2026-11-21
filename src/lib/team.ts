import { parseApprovalStatus, type ApprovalDecision, type ApprovalStatus } from "@/lib/approvals";

export type TeamRole = "pmr" | "duty_doctor" | "staff";

export type TeamMember = {
  id: string;
  role: TeamRole;
  fullName: string;
  email: string;
  phone: string;
  registration: string;
  specialty: string;
  reportsTo: string | null;
  approvalStatus: ApprovalStatus;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string;
  createdAt: string;
};

export type NewTeamMember = Omit<
  TeamMember,
  "id" | "createdAt" | "approvalStatus" | "reviewedBy" | "reviewedByName" | "reviewedAt" | "reviewNote"
>;

export const ROLE_LABELS: Record<TeamRole, string> = {
  pmr: "PMR Doctor (Admin)",
  duty_doctor: "Duty Doctor",
  staff: "Health Care Staff",
};

export const STAFF_SPECIALTIES = [
  "Physiotherapist",
  "Nurse",
  "Caregiver",
  "Speech & Swallow Therapist",
  "Occupational Therapist",
  "Dietitian",
  "Social Worker",
  "Psychologist",
  "Other",
] as const;

const TEAM_KEY = "careloon_team";

function parseMember(value: unknown): TeamMember | null {
  if (typeof value !== "object" || value === null) return null;
  const member = value as Record<string, unknown>;

  if (
    typeof member.id !== "string" ||
    (member.role !== "pmr" && member.role !== "duty_doctor" && member.role !== "staff") ||
    typeof member.fullName !== "string"
  ) {
    return null;
  }

  return {
    id: member.id,
    role: member.role,
    fullName: member.fullName,
    email: typeof member.email === "string" ? member.email : "",
    phone: typeof member.phone === "string" ? member.phone : "",
    registration: typeof member.registration === "string" ? member.registration : "",
    specialty: typeof member.specialty === "string" ? member.specialty : "",
    reportsTo: typeof member.reportsTo === "string" ? member.reportsTo : null,
    approvalStatus:
      member.role === "pmr" ? "approved" : parseApprovalStatus(member.approvalStatus),
    reviewedBy: typeof member.reviewedBy === "string" ? member.reviewedBy : null,
    reviewedByName: typeof member.reviewedByName === "string" ? member.reviewedByName : null,
    reviewedAt: typeof member.reviewedAt === "string" ? member.reviewedAt : null,
    reviewNote: typeof member.reviewNote === "string" ? member.reviewNote : "",
    createdAt: typeof member.createdAt === "string" ? member.createdAt : new Date().toISOString(),
  };
}

export function getTeamMembers(): TeamMember[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(TEAM_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseMember).filter((member): member is TeamMember => member !== null);
  } catch {
    return [];
  }
}

export function saveTeamMember(input: NewTeamMember): TeamMember {
  const members = getTeamMembers();
  const member: TeamMember = {
    ...input,
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : String(Date.now()),
    approvalStatus: input.role === "pmr" ? "approved" : "pending",
    reviewedBy: null,
    reviewedByName: null,
    reviewedAt: null,
    reviewNote: "",
    createdAt: new Date().toISOString(),
  };
  window.localStorage.setItem(TEAM_KEY, JSON.stringify([member, ...members]));
  return member;
}

export function reviewTeamMember(
  id: string,
  review: {
    approvalStatus: ApprovalDecision;
    reviewerId: string;
    reviewerName: string;
    note: string;
  },
): TeamMember | null {
  const members = getTeamMembers();
  const index = members.findIndex((member) => member.id === id);
  if (index === -1) return null;

  const updated: TeamMember = {
    ...members[index],
    approvalStatus: members[index].role === "pmr" ? "approved" : review.approvalStatus,
    reviewedBy: review.reviewerId,
    reviewedByName: review.reviewerName,
    reviewedAt: new Date().toISOString(),
    reviewNote: review.note.trim(),
  };
  members[index] = updated;
  window.localStorage.setItem(TEAM_KEY, JSON.stringify(members));
  return updated;
}

export function getMemberAndDescendantIds(members: TeamMember[], id: string): Set<string> {
  const ids = new Set<string>([id]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const member of members) {
      if (member.reportsTo && ids.has(member.reportsTo) && !ids.has(member.id)) {
        ids.add(member.id);
        changed = true;
      }
    }
  }

  return ids;
}

export function removeTeamMember(id: string): void {
  const members = getTeamMembers();
  const removedIds = getMemberAndDescendantIds(members, id);
  const remaining = members.filter((member) => !removedIds.has(member.id));
  window.localStorage.setItem(TEAM_KEY, JSON.stringify(remaining));
}
