"use server";

import type { ApprovalDecision } from "@/lib/approvals";
import type { NewPatient, Patient } from "@/lib/auth";
import type { ChatMessage, NewChatMessage } from "@/lib/chat";
import type { NewStaffReport, ReviewStatus, StaffReport } from "@/lib/reports";
import type { NewTeamMember, TeamMember } from "@/lib/team";
import { mutateJson, readJson } from "@/server/json-store";
import * as records from "@/server/records";

type ReviewInput = {
  approvalStatus: ApprovalDecision;
  reviewerId: string;
  reviewerName: string;
  note: string;
  careProviderId?: string | null;
  careProviderName?: string;
};

type RecommendationInput = {
  recommenderId: string;
  recommenderName: string;
  note: string;
};

type ReportReviewInput = {
  reviewStatus: Exclude<ReviewStatus, "pending">;
  reviewerId: string;
  reviewerName: string;
  note: string;
};

export async function loadAllData(): Promise<{
  patients: Patient[];
  teamMembers: TeamMember[];
  staffReports: StaffReport[];
  chatMessages: ChatMessage[];
}> {
  const [patients, members, reports, messages] = await Promise.all([
    readJson("patients"),
    readJson("team-members"),
    readJson("staff-reports"),
    readJson("chat-messages"),
  ]);

  return {
    patients: records.parsePatients(patients),
    teamMembers: records.parseTeamMembers(members),
    staffReports: records.parseReports(reports),
    chatMessages: records.parseMessages(messages),
  };
}

// Patients

export async function createPatientAction(input: NewPatient): Promise<Patient> {
  return mutateJson("patients", (items) => {
    const created = records.createPatient(input);
    return { items: [created, ...records.parsePatients(items)], result: created };
  });
}

export async function reviewPatientAction(
  id: string,
  review: ReviewInput,
): Promise<Patient | null> {
  let assignment = review;
  if (review.approvalStatus === "approved") {
    const members = records.parseTeamMembers(await readJson("team-members"));
    const teamDoctorIds = new Set(
      members
        .filter(
          (member) =>
            member.role === "supervisor" &&
            member.approvalStatus === "approved" &&
            member.inTeam,
        )
        .map((member) => member.id),
    );
    const provider = members.find(
      (member) =>
        member.id === review.careProviderId &&
        member.approvalStatus === "approved" &&
        (member.role === "supervisor"
          ? member.inTeam
          : member.role === "staff" && Boolean(member.reportsTo && teamDoctorIds.has(member.reportsTo))),
    );
    if (!provider) throw new Error("Select a Duty Doctor or health care staff member in the Team.");
    assignment = { ...review, careProviderName: provider.fullName };
  }

  return mutateJson("patients", (items) => {
    const outcome = records.reviewPatient(records.parsePatients(items), id, assignment);
    return { items: outcome.items, result: outcome.result };
  });
}

export async function removePatientAction(id: string): Promise<void> {
  await mutateJson("patients", (items) => ({
    items: records.removePatient(records.parsePatients(items), id),
    result: undefined,
  }));
}

// Team members

export async function createTeamMemberAction(input: NewTeamMember): Promise<TeamMember> {
  return mutateJson("team-members", (items) => {
    const created = records.createTeamMember(input);
    return { items: [created, ...records.parseTeamMembers(items)], result: created };
  });
}

export async function reviewTeamMemberAction(
  id: string,
  review: ReviewInput,
): Promise<TeamMember | null> {
  return mutateJson("team-members", (items) => {
    const outcome = records.reviewTeamMember(records.parseTeamMembers(items), id, review);
    return { items: outcome.items, result: outcome.result };
  });
}

export async function recommendTeamMemberAction(
  id: string,
  recommendation: RecommendationInput,
): Promise<TeamMember | null> {
  return mutateJson("team-members", (items) => {
    const outcome = records.recommendTeamMember(records.parseTeamMembers(items), id, recommendation);
    return { items: outcome.items, result: outcome.result };
  });
}

export async function assignTeamMemberToDutyDoctorAction(
  id: string,
  dutyDoctorId: string,
): Promise<TeamMember | null> {
  return mutateJson("team-members", (items) => {
    const outcome = records.assignTeamMemberToDutyDoctor(
      records.parseTeamMembers(items),
      id,
      dutyDoctorId,
    );
    return { items: outcome.items, result: outcome.result };
  });
}

export async function addTeamMemberToTeamAction(id: string): Promise<TeamMember | null> {
  return mutateJson("team-members", (items) => {
    const outcome = records.addTeamMemberToTeam(records.parseTeamMembers(items), id);
    return { items: outcome.items, result: outcome.result };
  });
}

export async function unassignTeamMemberFromDutyDoctorAction(
  id: string,
): Promise<TeamMember | null> {
  return mutateJson("team-members", (items) => {
    const outcome = records.unassignTeamMemberFromDutyDoctor(records.parseTeamMembers(items), id);
    return { items: outcome.items, result: outcome.result };
  });
}

export async function restoreTeamMemberAction(id: string): Promise<TeamMember | null> {
  return mutateJson("team-members", (items) => {
    const outcome = records.restoreTeamMember(records.parseTeamMembers(items), id);
    return { items: outcome.items, result: outcome.result };
  });
}

export async function removeTeamMemberAction(id: string): Promise<string[]> {
  return mutateJson("team-members", (items) => {
    const outcome = records.removeTeamMember(records.parseTeamMembers(items), id);
    return { items: outcome.items, result: outcome.removedIds };
  });
}

// Staff reports

export async function createStaffReportAction(input: NewStaffReport): Promise<StaffReport> {
  const members = records.parseTeamMembers(await readJson("team-members"));
  const authorId = input.staffId.trim().toLowerCase();
  const author = members.find(
    (member) =>
      authorId === member.id.toLowerCase() || authorId === `user:${member.email.trim().toLowerCase()}`,
  );

  // A treatment recorded by the PMR Doctor is trusted, so it is approved by
  // default. This also avoids the self-review block leaving their own reports
  // stranded in Awaiting review with nobody allowed to approve them.
  const prepared: NewStaffReport =
    author?.role === "manager"
      ? {
          ...input,
          reviewStatus: "approved",
          reviewedBy: author.id,
          reviewedByName: author.fullName,
          reviewedAt: new Date().toISOString(),
          reviewNote: "Auto-approved — recorded by the PMR Doctor.",
        }
      : input;

  return mutateJson("staff-reports", (items) => {
    const created = records.createReport(prepared);
    return { items: [created, ...records.parseReports(items)], result: created };
  });
}

export async function updateStaffReportAction(
  id: string,
  patch: Partial<Omit<StaffReport, "id" | "staffId" | "createdAt">>,
): Promise<StaffReport | null> {
  const members = records.parseTeamMembers(await readJson("team-members"));
  return mutateJson("staff-reports", (items) => {
    const existing = records.parseReports(items).find((report) => report.id === id);
    const authorId = (existing?.staffId || "").trim().toLowerCase();
    const author = members.find(
      (member) =>
        authorId === member.id.toLowerCase() || authorId === `user:${member.email.trim().toLowerCase()}`,
    );
    // Keep PMR Doctor treatments approved even when they edit their own report.
    const finalPatch =
      author?.role === "manager"
        ? {
            ...patch,
            reviewStatus: "approved" as const,
            reviewedBy: author.id,
            reviewedByName: author.fullName,
            reviewedAt: new Date().toISOString(),
            reviewNote: "Auto-approved — recorded by the PMR Doctor.",
          }
        : patch;
    const outcome = records.updateReport(records.parseReports(items), id, finalPatch);
    return { items: outcome.items, result: outcome.result };
  });
}

export async function acknowledgeStaffReportAction(
  id: string,
  note: string,
): Promise<StaffReport | null> {
  const trimmed = note.trim();
  if (!trimmed) throw new Error("Add a note when acknowledging a change request.");
  return mutateJson("staff-reports", (items) => {
    const reports = records.parseReports(items);
    const report = reports.find((candidate) => candidate.id === id);
    if (!report || report.reviewStatus !== "changes_requested") {
      return { items, result: null };
    }
    const outcome = records.updateReport(reports, id, {
      acknowledgementNote: trimmed,
      acknowledgedAt: new Date().toISOString(),
    });
    return { items: outcome.items, result: outcome.result };
  });
}

export async function reviewStaffReportAction(
  id: string,
  review: ReportReviewInput,
): Promise<StaffReport | null> {
  return mutateJson("staff-reports", (items) => {
    const outcome = records.reviewReport(records.parseReports(items), id, review);
    return { items: outcome.items, result: outcome.result };
  });
}

export async function deleteStaffReportAction(id: string): Promise<void> {
  await mutateJson("staff-reports", (items) => ({
    items: records.removeReport(records.parseReports(items), id),
    result: undefined,
  }));
}

// Chat messages

export async function createChatMessageAction(input: NewChatMessage): Promise<ChatMessage> {
  return mutateJson("chat-messages", (items) => {
    const created = records.createMessage(input);
    return { items: [...records.parseMessages(items), created], result: created };
  });
}

export async function attachReportToMessageAction(
  messageId: string,
  reportId: string,
): Promise<ChatMessage | null> {
  return mutateJson("chat-messages", (items) => {
    const outcome = records.attachReport(records.parseMessages(items), messageId, reportId);
    return { items: outcome.items, result: outcome.result };
  });
}
