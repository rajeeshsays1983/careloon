import {
  acknowledgeStaffReportAction,
  createStaffReportAction,
  deleteStaffReportAction,
  reviewStaffReportAction,
  updateStaffReportAction,
} from "@/app/actions";
import type { MediaAttachment } from "@/lib/attachments";
import {
  getDataServerSnapshot,
  getDataSnapshot,
  replaceData,
  subscribeData,
} from "@/lib/client-store";

export type StaffReportStatus = "draft" | "submitted";

export type ReviewStatus = "pending" | "approved" | "changes_requested";

export type StaffReport = {
  id: string;
  staffId: string;
  staffName: string;
  patientId: string | null;
  patientName: string;
  date: string;
  generatedText: string;
  correctedText: string;
  attachments: MediaAttachment[];
  status: StaffReportStatus;
  reviewStatus: ReviewStatus;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string;
  acknowledgementNote: string;
  acknowledgedAt: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
};

export type NewStaffReport = Omit<
  StaffReport,
  "id" | "createdAt" | "updatedAt" | "acknowledgementNote" | "acknowledgedAt"
>;

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: "Awaiting review",
  approved: "Approved",
  changes_requested: "Changes requested",
};

// Staff reports live in data/staff-reports.json. The client store mirrors the server data.

export function getStaffReports(): StaffReport[] {
  return [...getDataSnapshot().staffReports].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );
}

export function subscribeToStaffReports(listener: () => void): () => void {
  return subscribeData(listener);
}

export function getStaffReportsSnapshot(): StaffReport[] {
  return getDataSnapshot().staffReports;
}

export function getStaffReportsServerSnapshot(): StaffReport[] {
  return getDataServerSnapshot().staffReports;
}

export function getReportsForStaff(staffId: string): StaffReport[] {
  return getStaffReports().filter((report) => report.staffId === staffId);
}

export function getReportsForPatient(patientId: string): StaffReport[] {
  return getStaffReports().filter((report) => report.patientId === patientId);
}

export async function saveStaffReport(input: NewStaffReport): Promise<StaffReport> {
  const created = await createStaffReportAction(input);
  replaceData("staffReports", [created, ...getDataSnapshot().staffReports]);
  return created;
}

export async function updateStaffReport(
  id: string,
  patch: Partial<Omit<StaffReport, "id" | "staffId" | "createdAt">>,
): Promise<StaffReport | null> {
  const updated = await updateStaffReportAction(id, patch);
  if (updated) {
    replaceData(
      "staffReports",
      getDataSnapshot().staffReports.map((report) => (report.id === updated.id ? updated : report)),
    );
  }
  return updated;
}

export async function reviewStaffReport(
  id: string,
  review: {
    reviewStatus: Exclude<ReviewStatus, "pending">;
    reviewerId: string;
    reviewerName: string;
    note: string;
  },
): Promise<StaffReport | null> {
  const updated = await reviewStaffReportAction(id, review);
  if (updated) {
    replaceData(
      "staffReports",
      getDataSnapshot().staffReports.map((report) => (report.id === updated.id ? updated : report)),
    );
  }
  return updated;
}

export async function acknowledgeStaffReport(
  id: string,
  note: string,
): Promise<StaffReport | null> {
  const updated = await acknowledgeStaffReportAction(id, note);
  if (updated) {
    replaceData(
      "staffReports",
      getDataSnapshot().staffReports.map((report) => (report.id === updated.id ? updated : report)),
    );
  }
  return updated;
}

export async function deleteStaffReport(id: string): Promise<void> {
  await deleteStaffReportAction(id);
  replaceData(
    "staffReports",
    getDataSnapshot().staffReports.filter((report) => report.id !== id),
  );
}
