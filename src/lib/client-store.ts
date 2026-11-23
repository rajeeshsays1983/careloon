import { loadAllData } from "@/app/actions";
import type { ChatMessage } from "@/lib/chat";
import type { Patient } from "@/lib/auth";
import type { StaffReport } from "@/lib/reports";
import type { TeamMember } from "@/lib/team";

export type DataResource = "patients" | "teamMembers" | "staffReports" | "chatMessages";
export type DataStatus = "loading" | "ready" | "error";

type DataState = {
  patients: Patient[];
  teamMembers: TeamMember[];
  staffReports: StaffReport[];
  chatMessages: ChatMessage[];
};

const EMPTY_DATA: DataState = {
  patients: [],
  teamMembers: [],
  staffReports: [],
  chatMessages: [],
};

let state: DataState = EMPTY_DATA;
let status: DataStatus = "loading";
let errorMessage = "";
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeData(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDataSnapshot(): DataState {
  return state;
}

export function getDataServerSnapshot(): DataState {
  return EMPTY_DATA;
}

export function getDataStatusSnapshot(): DataStatus {
  return status;
}

export function getDataErrorSnapshot(): string {
  return errorMessage;
}

export function replaceData<K extends DataResource>(resource: K, items: DataState[K]): void {
  state = { ...state, [resource]: items };
  emit();
}

export function ensureDataLoaded(): Promise<void> {
  if (status === "ready") return Promise.resolve();
  if (loading) return loading;

  loading = loadAllData()
    .then((data) => {
      state = {
        patients: data.patients,
        teamMembers: data.teamMembers,
        staffReports: data.staffReports,
        chatMessages: data.chatMessages,
      };
      status = "ready";
      errorMessage = "";
      emit();
    })
    .catch(() => {
      status = "error";
      errorMessage = "Could not load the care data from the server. Please retry.";
      emit();
    })
    .finally(() => {
      loading = null;
    });

  return loading;
}
