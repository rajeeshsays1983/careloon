import { parseApprovalStatus, type ApprovalDecision } from "@/lib/approvals";
import { isMediaAttachment, type MediaAttachment } from "@/lib/attachments";
import type { NewPatient, Patient } from "@/lib/auth";
import type { ChatMessage, NewChatMessage } from "@/lib/chat";
import type { NewStaffReport, ReviewStatus, StaffReport } from "@/lib/reports";
import type { NewTeamMember, TeamMember, TeamRole } from "@/lib/team";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function parseAttachments(value: unknown): MediaAttachment[] {
  return Array.isArray(value) ? value.filter(isMediaAttachment) : [];
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function now(): string {
  return new Date().toISOString();
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
}

function parseRole(value: unknown): TeamRole | null {
  if (value === "admin" || value === "manager" || value === "supervisor" || value === "staff") {
    return value;
  }
  // Migrate legacy role names from earlier data files.
  if (value === "pmr") return "manager";
  if (value === "duty_doctor") return "supervisor";
  return null;
}

function parseReviewStatus(value: unknown): ReviewStatus {
  if (value === "approved" || value === "changes_requested" || value === "pending") return value;
  return "pending";
}

function parseApprovalReview(value: unknown) {
  if (!isObject(value)) throw new Error("Invalid approval decision.");
  if (value.approvalStatus !== "approved" && value.approvalStatus !== "rejected") {
    throw new Error("Invalid approval decision.");
  }
  return {
    approvalStatus: value.approvalStatus as ApprovalDecision,
    reviewerId: requireText(value.reviewerId, "Reviewer"),
    reviewerName: requireText(value.reviewerName, "Reviewer name"),
    note: text(value.note).trim(),
    careProviderId: text(value.careProviderId) || null,
    careProviderName: text(value.careProviderName).trim(),
  };
}

function parseRecommendation(value: unknown) {
  if (!isObject(value)) throw new Error("Invalid recommendation.");
  return {
    recommenderId: requireText(value.recommenderId, "Recommender"),
    recommenderName: requireText(value.recommenderName, "Recommender name"),
    note: requireText(value.note, "Recommendation note"),
  };
}

function parseReportReview(value: unknown) {
  if (!isObject(value)) throw new Error("Invalid review decision.");
  if (value.reviewStatus !== "approved" && value.reviewStatus !== "changes_requested") {
    throw new Error("Invalid review decision.");
  }
  return {
    reviewStatus: value.reviewStatus as ReviewStatus,
    reviewerId: requireText(value.reviewerId, "Reviewer"),
    reviewerName: requireText(value.reviewerName, "Reviewer name"),
    note: text(value.note).trim(),
  };
}

// ---------- Patients ----------

export function parsePatient(value: unknown): Patient | null {
  if (!isObject(value)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.fullName !== "string" ||
    typeof value.createdAt !== "string"
  ) {
    return null;
  }

  return {
    id: value.id,
    fullName: value.fullName,
    dateOfBirth: text(value.dateOfBirth),
    gender: text(value.gender),
    phone: text(value.phone),
    address: text(value.address),
    emergencyContactName: text(value.emergencyContactName),
    emergencyContactPhone: text(value.emergencyContactPhone),
    diagnosis: text(value.diagnosis),
    careNotes: text(value.careNotes),
    careProviderId: text(value.careProviderId) || null,
    careProviderName: text(value.careProviderName),
    approvalStatus: parseApprovalStatus(value.approvalStatus),
    reviewedBy: text(value.reviewedBy) || null,
    reviewedByName: text(value.reviewedByName) || null,
    reviewedAt: text(value.reviewedAt) || null,
    reviewNote: text(value.reviewNote),
    createdAt: value.createdAt,
  };
}

export function parsePatients(items: unknown[]): Patient[] {
  return items
    .map(parsePatient)
    .filter((patient): patient is Patient => patient !== null);
}

export function createPatient(input: NewPatient): Patient {
  if (!isObject(input)) throw new Error("Invalid patient.");
  return {
    ...input,
    id: createId(),
    careProviderId: null,
    careProviderName: "",
    approvalStatus: "pending",
    reviewedBy: null,
    reviewedByName: null,
    reviewedAt: null,
    reviewNote: "",
    createdAt: now(),
  };
}

export function reviewPatient(
  patients: Patient[],
  id: string,
  value: unknown,
): { items: Patient[]; result: Patient | null } {
  const review = parseApprovalReview(value);
  const index = patients.findIndex((patient) => patient.id === id);
  if (index === -1) return { items: patients, result: null };

  if (review.approvalStatus === "approved" && !review.careProviderId) {
    throw new Error("Select a Duty Doctor or health care staff member before approving.");
  }

  const updated: Patient = {
    ...patients[index],
    approvalStatus: review.approvalStatus,
    reviewedBy: review.reviewerId,
    reviewedByName: review.reviewerName,
    reviewedAt: now(),
    reviewNote: review.note,
    careProviderId:
      review.approvalStatus === "approved" ? review.careProviderId : patients[index].careProviderId,
    careProviderName:
      review.approvalStatus === "approved"
        ? review.careProviderName
        : patients[index].careProviderName,
  };
  const items = [...patients];
  items[index] = updated;
  return { items, result: updated };
}

export function removePatient(patients: Patient[], id: string): Patient[] {
  return patients.filter((patient) => patient.id !== id);
}

// ---------- Team members ----------

export function parseTeamMember(value: unknown): TeamMember | null {
  if (!isObject(value)) return null;
  const role = parseRole(value.role);
  if (typeof value.id !== "string" || !role || typeof value.fullName !== "string") return null;

  return {
    id: value.id,
    role,
    fullName: value.fullName,
    email: text(value.email),
    username: text(value.username) || undefined,
    phone: text(value.phone),
    registration: text(value.registration),
    specialty: text(value.specialty),
    reportsTo: text(value.reportsTo) || null,
    inTeam: value.inTeam === true,
    hasBeenAssigned: value.hasBeenAssigned === true,
    approvalStatus: role === "admin" ? "approved" : parseApprovalStatus(value.approvalStatus),
    reviewedBy: text(value.reviewedBy) || null,
    reviewedByName: text(value.reviewedByName) || null,
    reviewedAt: text(value.reviewedAt) || null,
    reviewNote: text(value.reviewNote),
    recommendedBy: text(value.recommendedBy) || null,
    recommendedByName: text(value.recommendedByName) || null,
    recommendedAt: text(value.recommendedAt) || null,
    recommendationNote: text(value.recommendationNote),
    createdAt: text(value.createdAt, now()),
  };
}

export function parseTeamMembers(items: unknown[]): TeamMember[] {
  return items
    .map(parseTeamMember)
    .filter((member): member is TeamMember => member !== null);
}

export function createTeamMember(input: NewTeamMember): TeamMember {
  if (!isObject(input)) throw new Error("Invalid team member.");
  const role = parseRole(input.role);
  if (!role) throw new Error("Invalid team role.");
  requireText(input.fullName, "Full name");
  requireText(input.email, "Email");

  return {
    ...input,
    role,
    id: createId(),
    // PMR Doctors are on the care team from the moment they are added; Duty
    // Doctors need Team In before staff can be assigned to them.
    inTeam: role === "manager",
    hasBeenAssigned: false,
    // Duty Doctors added by a PMR Doctor do not need a separate approval step.
    approvalStatus: role === "admin" || role === "supervisor" ? "approved" : "pending",
    reviewedBy: null,
    reviewedByName: null,
    reviewedAt: null,
    reviewNote: "",
    recommendedBy: null,
    recommendedByName: null,
    recommendedAt: null,
    recommendationNote: "",
    createdAt: now(),
  };
}

export function reviewTeamMember(
  members: TeamMember[],
  id: string,
  value: unknown,
): { items: TeamMember[]; result: TeamMember | null } {
  const review = parseApprovalReview(value);
  const index = members.findIndex((member) => member.id === id);
  if (index === -1) return { items: members, result: null };

  const current = members[index];
  const reviewer = members.find((member) => member.id === review.reviewerId);
  if (current.role === "admin") return { items: members, result: null };
  if (current.role === "manager" && reviewer?.role !== "admin") {
    return { items: members, result: null };
  }
  if (
    current.role === "supervisor" &&
    reviewer?.role !== "admin" &&
    reviewer?.role !== "manager"
  ) {
    return { items: members, result: null };
  }
  if (current.role === "staff" && !reviewer) return { items: members, result: null };

  const updated: TeamMember = {
    ...current,
    approvalStatus: review.approvalStatus,
    reviewedBy: review.reviewerId,
    reviewedByName: review.reviewerName,
    reviewedAt: now(),
    reviewNote: review.note,
  };
  const items = [...members];
  items[index] = updated;
  return { items, result: updated };
}

export function recommendTeamMember(
  members: TeamMember[],
  id: string,
  value: unknown,
): { items: TeamMember[]; result: TeamMember | null } {
  const recommendation = parseRecommendation(value);
  const recommender = members.find((member) => member.id === recommendation.recommenderId);
  if (recommender?.role !== "supervisor" || recommender.approvalStatus !== "approved") {
    throw new Error("Only an approved Duty Doctor can recommend a team member.");
  }

  const index = members.findIndex((member) => member.id === id);
  if (index === -1) return { items: members, result: null };

  const current = members[index];
  if (current.role === "admin") return { items: members, result: null };

  const updated: TeamMember = {
    ...current,
    recommendedBy: recommendation.recommenderId,
    recommendedByName: recommendation.recommenderName,
    recommendedAt: now(),
    recommendationNote: recommendation.note,
  };
  const items = [...members];
  items[index] = updated;
  return { items, result: updated };
}

export function assignTeamMemberToDutyDoctor(
  members: TeamMember[],
  id: string,
  dutyDoctorId: string,
): { items: TeamMember[]; result: TeamMember | null } {  const index = members.findIndex((member) => member.id === id);
  if (index === -1) return { items: members, result: null };

  const current = members[index];
  if (current.role !== "staff") return { items: members, result: null };

  const dutyDoctor = members.find((member) => member.id === dutyDoctorId);
  if (
    dutyDoctor?.role !== "supervisor" ||
    dutyDoctor.approvalStatus !== "approved" ||
    !dutyDoctor.inTeam
  ) {
    throw new Error("Select a Duty Doctor who is in the Team.");
  }

  const updated: TeamMember = { ...current, reportsTo: dutyDoctor.id, hasBeenAssigned: true };
  const items = [...members];
  items[index] = updated;
  return { items, result: updated };
}

export function addTeamMemberToTeam(
  members: TeamMember[],
  id: string,
): { items: TeamMember[]; result: TeamMember | null } {
  const index = members.findIndex((member) => member.id === id);
  if (index === -1) return { items: members, result: null };

  const current = members[index];
  if (current.role !== "supervisor" || current.approvalStatus !== "approved") {
    return { items: members, result: null };
  }

  const updated: TeamMember = { ...current, inTeam: true };
  const items = [...members];
  items[index] = updated;
  return { items, result: updated };
}

export function unassignTeamMemberFromDutyDoctor(
  members: TeamMember[],
  id: string,
): { items: TeamMember[]; result: TeamMember | null } {
  const index = members.findIndex((member) => member.id === id);
  if (index === -1) return { items: members, result: null };

  const current = members[index];
  if (current.role !== "staff" || !current.reportsTo) {
    return { items: members, result: null };
  }

  const updated: TeamMember = { ...current, reportsTo: null, hasBeenAssigned: true };
  const items = [...members];
  items[index] = updated;
  return { items, result: updated };
}

export function restoreTeamMember(
  members: TeamMember[],
  id: string,
): { items: TeamMember[]; result: TeamMember | null } {
  const index = members.findIndex((member) => member.id === id);
  if (index === -1) return { items: members, result: null };

  const current = members[index];
  if (current.role === "admin" || current.approvalStatus !== "rejected") {
    return { items: members, result: null };
  }

  const updated: TeamMember = {
    ...current,
    approvalStatus: "pending",
    reviewedBy: null,
    reviewedByName: null,
    reviewedAt: null,
    reviewNote: "",
  };
  const items = [...members];
  items[index] = updated;
  return { items, result: updated };
}

export function removeTeamMember(
  members: TeamMember[],
  id: string,
): { items: TeamMember[]; removedIds: string[] } {
  const removedIds = new Set<string>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const member of members) {
      if (member.reportsTo && removedIds.has(member.reportsTo) && !removedIds.has(member.id)) {
        removedIds.add(member.id);
        changed = true;
      }
    }
  }
  return {
    items: members.filter((member) => !removedIds.has(member.id)),
    removedIds: [...removedIds],
  };
}

// ---------- Staff reports ----------

export function parseReport(value: unknown): StaffReport | null {
  if (!isObject(value)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.staffId !== "string" ||
    typeof value.staffName !== "string" ||
    typeof value.date !== "string"
  ) {
    return null;
  }

  return {
    id: value.id,
    staffId: value.staffId,
    staffName: value.staffName,
    patientId: text(value.patientId) || null,
    patientName: text(value.patientName),
    date: value.date,
    generatedText: text(value.generatedText),
    correctedText: text(value.correctedText),
    attachments: parseAttachments(value.attachments),
    status: value.status === "submitted" ? "submitted" : "draft",
    reviewStatus: parseReviewStatus(value.reviewStatus),
    reviewedBy: text(value.reviewedBy) || null,
    reviewedByName: text(value.reviewedByName) || null,
    reviewedAt: text(value.reviewedAt) || null,
    reviewNote: text(value.reviewNote),
    acknowledgementNote: text(value.acknowledgementNote),
    acknowledgedAt: text(value.acknowledgedAt) || null,
    createdAt: text(value.createdAt, now()),
    updatedAt: text(value.updatedAt, now()),
    submittedAt: text(value.submittedAt) || null,
  };
}

export function parseReports(items: unknown[]): StaffReport[] {
  return items.map(parseReport).filter((report): report is StaffReport => report !== null);
}

export function createReport(input: NewStaffReport): StaffReport {
  if (!isObject(input)) throw new Error("Invalid staff report.");
  requireText(input.staffId, "Staff member");
  const attachments = parseAttachments(input.attachments);
  if (!text(input.correctedText).trim() && attachments.length === 0) {
    throw new Error("Add a report note or attach an assessment file.");
  }
  const timestamp = now();
  return {
    ...input,
    attachments,
    id: createId(),
    acknowledgementNote: "",
    acknowledgedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function updateReport(
  reports: StaffReport[],
  id: string,
  value: unknown,
): { items: StaffReport[]; result: StaffReport | null } {
  if (!isObject(value)) throw new Error("Invalid report update.");
  const index = reports.findIndex((report) => report.id === id);
  if (index === -1) return { items: reports, result: null };

  const current = reports[index];
  const updated: StaffReport = {
    ...current,
    ...value,
    id: current.id,
    staffId: current.staffId,
    createdAt: current.createdAt,
    updatedAt: now(),
  };
  const items = [...reports];
  items[index] = updated;
  return { items, result: updated };
}

export function reviewReport(
  reports: StaffReport[],
  id: string,
  value: unknown,
): { items: StaffReport[]; result: StaffReport | null } {
  const review = parseReportReview(value);
  const index = reports.findIndex((report) => report.id === id);
  if (index === -1) return { items: reports, result: null };

  const updated: StaffReport = {
    ...reports[index],
    reviewStatus: review.reviewStatus,
    reviewedBy: review.reviewerId,
    reviewedByName: review.reviewerName,
    reviewedAt: now(),
    reviewNote: review.note,
    // A new decision replaces the previous one, so any older acknowledgement
    // no longer applies.
    acknowledgementNote: "",
    acknowledgedAt: null,
  };
  const items = [...reports];
  items[index] = updated;
  return { items, result: updated };
}

export function removeReport(reports: StaffReport[], id: string): StaffReport[] {
  return reports.filter((report) => report.id !== id);
}

// ---------- Chat messages ----------

function parseAuthorRole(value: unknown): ChatMessage["authorRole"] | null {
  if (value === "signed_in") return "signed_in";
  return parseRole(value);
}

export function parseMessage(value: unknown): ChatMessage | null {
  if (!isObject(value)) return null;
  const authorRole = parseAuthorRole(value.authorRole);
  if (
    typeof value.id !== "string" ||
    typeof value.channelId !== "string" ||
    typeof value.authorId !== "string" ||
    typeof value.authorName !== "string" ||
    typeof value.text !== "string" ||
    typeof value.createdAt !== "string" ||
    !authorRole
  ) {
    return null;
  }

  return {
    id: value.id,
    channelId: value.channelId,
    authorId: value.authorId,
    authorName: value.authorName,
    authorRole,
    text: value.text,
    source: value.source === "voice" ? "voice" : "typed",
    attachments: parseAttachments(value.attachments),
    createdAt: value.createdAt,
    reportId: text(value.reportId) || null,
  };
}

export function parseMessages(items: unknown[]): ChatMessage[] {
  return items
    .map(parseMessage)
    .filter((message): message is ChatMessage => message !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function createMessage(input: NewChatMessage): ChatMessage {
  if (!isObject(input)) throw new Error("Invalid chat message.");
  requireText(input.channelId, "Channel");
  requireText(input.authorId, "Author");
  if (!parseAuthorRole(input.authorRole)) throw new Error("Invalid author role.");
  const attachments = parseAttachments(input.attachments);
  if (!text(input.text).trim() && attachments.length === 0) {
    throw new Error("Add a treatment note or attach an assessment file.");
  }

  return {
    ...input,
    text: text(input.text),
    attachments,
    id: createId(),
    createdAt: now(),
    reportId: input.reportId ?? null,
  };
}

export function attachReport(
  messages: ChatMessage[],
  messageId: string,
  reportId: string,
): { items: ChatMessage[]; result: ChatMessage | null } {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index === -1) return { items: messages, result: null };

  const updated: ChatMessage = { ...messages[index], reportId };
  const items = [...messages];
  items[index] = updated;
  return { items, result: updated };
}
