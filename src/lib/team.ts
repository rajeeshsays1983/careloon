import {
  addTeamMemberToTeamAction,
  assignTeamMemberToDutyDoctorAction,
  createTeamMemberAction,
  recommendTeamMemberAction,
  removeTeamMemberAction,
  restoreTeamMemberAction,
  reviewTeamMemberAction,
  unassignTeamMemberFromDutyDoctorAction,
} from "@/app/actions";
import type { ApprovalDecision, ApprovalStatus } from "@/lib/approvals";
import {
  getDataServerSnapshot,
  getDataSnapshot,
  replaceData,
  subscribeData,
} from "@/lib/client-store";

export type TeamRole = "admin" | "manager" | "supervisor" | "staff";

export type TeamMember = {
  id: string;
  role: TeamRole;
  fullName: string;
  email: string;
  username?: string;
  phone: string;
  registration: string;
  specialty: string;
  reportsTo: string | null;
  inTeam: boolean;
  hasBeenAssigned: boolean;
  approvalStatus: ApprovalStatus;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string;
  recommendedBy: string | null;
  recommendedByName: string | null;
  recommendedAt: string | null;
  recommendationNote: string;
  createdAt: string;
};

export type NewTeamMember = Omit<
  TeamMember,
  | "id"
  | "createdAt"
  | "inTeam"
  | "hasBeenAssigned"
  | "approvalStatus"
  | "reviewedBy"
  | "reviewedByName"
  | "reviewedAt"
  | "reviewNote"
  | "recommendedBy"
  | "recommendedByName"
  | "recommendedAt"
  | "recommendationNote"
>;

export const ROLE_LABELS: Record<TeamRole, string> = {
  admin: "Admin",
  manager: "PMR Doctor",
  supervisor: "Duty Doctor",
  staff: "Health Care Staff",
};

// Report/message author IDs used to be stored as `user:<email>` for signed-in
// leaders. Match those legacy IDs to the team member so their own activity is
// still visible and self-review stays blocked.
export function isAuthoredBy(
  authorId: string | null | undefined,
  member: TeamMember,
): boolean {
  if (!authorId) return false;
  const id = authorId.trim().toLowerCase();
  return (
    id === member.id.toLowerCase() ||
    id === `user:${member.email.trim().toLowerCase()}`
  );
}

// Members whose treatment activity the signed-in user is allowed to see.
export function getVisibleMembers(
  members: TeamMember[],
  currentMember: TeamMember | null,
): TeamMember[] {
  if (!currentMember) return [];
  if (currentMember.role === "admin" || currentMember.role === "manager") {
    // Admin manages accounts, not care activity. Neither Admin nor the PMR
    // Doctor sees Admin activity in the dashboard or Treatment; both see only
    // the approved care team (staff and Duty Doctors).
    return members.filter(
      (member) => member.approvalStatus === "approved" && member.role !== "admin",
    );
  }
  if (currentMember.role === "supervisor") {
    const teamStaff = members.filter(
      (member) =>
        member.role === "staff" &&
        member.approvalStatus === "approved" &&
        member.reportsTo === currentMember.id,
    );
    return [currentMember, ...teamStaff];
  }
  return [currentMember];
}

// Selection lists show a care worker's actual designation instead of the
// generic "Health Care Staff" role label.
export function memberDesignation(member: TeamMember): string {
  if (member.role === "staff") return member.specialty.trim() || "Care staff";
  return ROLE_LABELS[member.role];
}

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

// Team members live in data/team-members.json. The client store mirrors the server data.

export function getTeamMembers(): TeamMember[] {
  return getDataSnapshot().teamMembers;
}

export function subscribeToTeamMembers(listener: () => void): () => void {
  return subscribeData(listener);
}

export function getTeamMembersServerSnapshot(): TeamMember[] {
  return getDataServerSnapshot().teamMembers;
}

export async function saveTeamMember(input: NewTeamMember): Promise<TeamMember> {
  const created = await createTeamMemberAction(input);
  replaceData("teamMembers", [created, ...getTeamMembers()]);
  return created;
}

export async function reviewTeamMember(
  id: string,
  review: {
    approvalStatus: ApprovalDecision;
    reviewerId: string;
    reviewerName: string;
    note: string;
  },
): Promise<TeamMember | null> {
  const updated = await reviewTeamMemberAction(id, review);
  if (updated) {
    replaceData(
      "teamMembers",
      getTeamMembers().map((member) => (member.id === updated.id ? updated : member)),
    );
  }
  return updated;
}

export async function recommendTeamMember(
  id: string,
  recommendation: { recommenderId: string; recommenderName: string; note: string },
): Promise<TeamMember | null> {
  const updated = await recommendTeamMemberAction(id, recommendation);
  if (updated) {
    replaceData(
      "teamMembers",
      getTeamMembers().map((member) => (member.id === updated.id ? updated : member)),
    );
  }
  return updated;
}

export async function assignTeamMemberToDutyDoctor(
  id: string,
  dutyDoctorId: string,
): Promise<TeamMember | null> {
  const updated = await assignTeamMemberToDutyDoctorAction(id, dutyDoctorId);
  if (updated) {
    replaceData(
      "teamMembers",
      getTeamMembers().map((member) => (member.id === updated.id ? updated : member)),
    );
  }
  return updated;
}

export async function addTeamMemberToTeam(id: string): Promise<TeamMember | null> {
  const updated = await addTeamMemberToTeamAction(id);
  if (updated) {
    replaceData(
      "teamMembers",
      getTeamMembers().map((member) => (member.id === updated.id ? updated : member)),
    );
  }
  return updated;
}

export async function unassignTeamMemberFromDutyDoctor(
  id: string,
): Promise<TeamMember | null> {
  const updated = await unassignTeamMemberFromDutyDoctorAction(id);
  if (updated) {
    replaceData(
      "teamMembers",
      getTeamMembers().map((member) => (member.id === updated.id ? updated : member)),
    );
  }
  return updated;
}

export async function restoreTeamMember(id: string): Promise<TeamMember | null> {
  const updated = await restoreTeamMemberAction(id);
  if (updated) {
    replaceData(
      "teamMembers",
      getTeamMembers().map((member) => (member.id === updated.id ? updated : member)),
    );
  }
  return updated;
}

export async function removeTeamMember(id: string): Promise<string[]> {
  const removedIds = await removeTeamMemberAction(id);
  replaceData(
    "teamMembers",
    getTeamMembers().filter((member) => !removedIds.includes(member.id)),
  );
  return removedIds;
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
