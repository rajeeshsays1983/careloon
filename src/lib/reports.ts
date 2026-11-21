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
  status: StaffReportStatus;
  reviewStatus: ReviewStatus;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
};

export type NewStaffReport = Omit<StaffReport, "id" | "createdAt" | "updatedAt">;

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: "Awaiting review",
  approved: "Approved",
  changes_requested: "Changes requested",
};

const REPORTS_KEY = "careloon_staff_reports";

function parseReviewStatus(value: unknown): ReviewStatus {
  if (value === "approved" || value === "changes_requested" || value === "pending") {
    return value;
  }
  return "pending";
}

function parseReport(value: unknown): StaffReport | null {
  if (typeof value !== "object" || value === null) return null;
  const report = value as Record<string, unknown>;

  if (
    typeof report.id !== "string" ||
    typeof report.staffId !== "string" ||
    typeof report.staffName !== "string" ||
    typeof report.date !== "string"
  ) {
    return null;
  }

  return {
    id: report.id,
    staffId: report.staffId,
    staffName: report.staffName,
    patientId: typeof report.patientId === "string" && report.patientId ? report.patientId : null,
    patientName: typeof report.patientName === "string" ? report.patientName : "",
    date: report.date,
    generatedText: typeof report.generatedText === "string" ? report.generatedText : "",
    correctedText: typeof report.correctedText === "string" ? report.correctedText : "",
    status: report.status === "submitted" ? "submitted" : "draft",
    reviewStatus: parseReviewStatus(report.reviewStatus),
    reviewedBy: typeof report.reviewedBy === "string" ? report.reviewedBy : null,
    reviewedByName: typeof report.reviewedByName === "string" ? report.reviewedByName : null,
    reviewedAt: typeof report.reviewedAt === "string" ? report.reviewedAt : null,
    reviewNote: typeof report.reviewNote === "string" ? report.reviewNote : "",
    createdAt: typeof report.createdAt === "string" ? report.createdAt : new Date().toISOString(),
    updatedAt: typeof report.updatedAt === "string" ? report.updatedAt : new Date().toISOString(),
    submittedAt: typeof report.submittedAt === "string" ? report.submittedAt : null,
  };
}

function sortReports(reports: StaffReport[]): StaffReport[] {
  return [...reports].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );
}

export function getStaffReports(): StaffReport[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(REPORTS_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sortReports(parsed.map(parseReport).filter((report): report is StaffReport => report !== null));
  } catch {
    return [];
  }
}

export function getReportsForStaff(staffId: string): StaffReport[] {
  return getStaffReports().filter((report) => report.staffId === staffId);
}

export function getReportsForPatient(patientId: string): StaffReport[] {
  return getStaffReports().filter((report) => report.patientId === patientId);
}

function createId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : String(Date.now());
}

export function saveStaffReport(input: NewStaffReport): StaffReport {
  const now = new Date().toISOString();
  const report: StaffReport = {
    ...input,
    id: createId(),
    createdAt: now,
    updatedAt: now,
  };
  const reports = getStaffReports();
  window.localStorage.setItem(REPORTS_KEY, JSON.stringify([report, ...reports]));
  return report;
}

export function updateStaffReport(
  id: string,
  patch: Partial<Omit<StaffReport, "id" | "staffId" | "createdAt">>,
): StaffReport | null {
  const reports = getStaffReports();
  const index = reports.findIndex((report) => report.id === id);
  if (index === -1) return null;

  const updated: StaffReport = {
    ...reports[index],
    ...patch,
    id: reports[index].id,
    staffId: reports[index].staffId,
    createdAt: reports[index].createdAt,
    updatedAt: new Date().toISOString(),
  };
  reports[index] = updated;
  window.localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
  return updated;
}

export function reviewStaffReport(
  id: string,
  review: {
    reviewStatus: Exclude<ReviewStatus, "pending">;
    reviewerId: string;
    reviewerName: string;
    note: string;
  },
): StaffReport | null {
  return updateStaffReport(id, {
    reviewStatus: review.reviewStatus,
    reviewedBy: review.reviewerId,
    reviewedByName: review.reviewerName,
    reviewedAt: new Date().toISOString(),
    reviewNote: review.note.trim(),
  });
}

export function deleteStaffReport(id: string): void {
  const reports = getStaffReports().filter((report) => report.id !== id);
  window.localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
}
