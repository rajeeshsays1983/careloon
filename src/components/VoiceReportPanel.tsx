"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getPatients } from "@/lib/auth";
import {
  getReportsForStaff,
  REVIEW_STATUS_LABELS,
  saveStaffReport,
  updateStaffReport,
  type StaffReport,
} from "@/lib/reports";
import type { TeamMember } from "@/lib/team";

type SpeechAlternative = { transcript: string; confidence: number };
type SpeechResult = {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechAlternative;
};
type SpeechResultList = {
  length: number;
  [index: number]: SpeechResult;
};
type SpeechResultEvent = { resultIndex: number; results: SpeechResultList };
type SpeechErrorEvent = { error: string; message?: string };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

function subscribe() {
  return () => {};
}

function today(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function describeSpeechError(error: string): string {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "Microphone permission was denied. Allow microphone access or type the report manually.";
  }
  if (error === "no-speech") {
    return "No speech was detected. Try again or type the report manually.";
  }
  if (error === "audio-capture") {
    return "No microphone was found. You can type the report manually.";
  }
  return `Speech recognition stopped (${error}). You can type the report manually.`;
}

export function VoiceReportPanel({
  staff,
  onClose,
}: {
  staff: TeamMember;
  onClose: () => void;
}) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const [date, setDate] = useState(today);
  const [patientId, setPatientId] = useState("");
  const [generatedText, setGeneratedText] = useState("");
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savedReports, setSavedReports] = useState<StaffReport[]>([]);
  const [overrides, setOverrides] = useState<Record<string, StaffReport>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const patients = useMemo(
    () => (mounted ? getPatients().filter((patient) => patient.approvalStatus === "approved") : []),
    [mounted],
  );
  const storedReports = useMemo(
    () => (mounted ? getReportsForStaff(staff.id) : []),
    [mounted, staff.id],
  );
  const reports = useMemo(() => {
    const byId = new Map<string, StaffReport>();
    for (const report of [...savedReports, ...storedReports]) byId.set(report.id, report);
    for (const report of Object.values(overrides)) byId.set(report.id, report);
    return [...byId.values()].sort(
      (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    );
  }, [overrides, savedReports, storedReports]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  function stopListening() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
    setInterim("");
  }

  function handleClose() {
    stopListening();
    onClose();
  }

  function startListening() {
    setError("");
    setSuccess("");

    const speechWindow = window as SpeechWindow;
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setError("Speech recognition is not supported in this browser. Type the report manually.");
      return;
    }
    if (listening) return;

    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);
    recognition.onresult = (event) => {
      let finalChunk = "";
      let interimChunk = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          finalChunk += transcript;
        } else {
          interimChunk += transcript;
        }
      }

      const spoken = finalChunk.trim();
      if (spoken) {
        setGeneratedText((prev) => `${prev}${prev ? " " : ""}${spoken}`);
        setText((prev) => `${prev}${prev ? " " : ""}${spoken}`);
      }
      setInterim(interimChunk.trim());
    };
    recognition.onerror = (event) => {
      setError(describeSpeechError(event.error));
      setListening(false);
      setInterim("");
    };
    recognition.onend = () => {
      setListening(false);
      setInterim("");
      if (recognitionRef.current === recognition) recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setError("Could not start the microphone. You can type the report manually.");
      setListening(false);
    }
  }

  function clearEditor() {
    stopListening();
    setDate(today());
    setPatientId("");
    setGeneratedText("");
    setText("");
    setInterim("");
    setEditingId(null);
    setError("");
  }

  function startEditing(report: StaffReport) {
    stopListening();
    setEditingId(report.id);
    setDate(report.date);
    setPatientId(report.patientId ?? "");
    setGeneratedText(report.generatedText);
    setText(report.correctedText);
    setError("");
    setSuccess("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const corrected = text.trim();

    if (!date) {
      setError("Choose a report date.");
      return;
    }
    if (!patientId) {
      setError("Select the patient this report is for.");
      return;
    }
    const patient = patients.find((item) => item.id === patientId);
    if (!patient) {
      setError("Select a valid patient.");
      return;
    }
    if (!corrected) {
      setError("Dictate or type the treatment report before submitting.");
      return;
    }

    stopListening();
    const raw = generatedText.trim() || corrected;
    const submittedAt = new Date().toISOString();

    try {
      if (editingId) {
        const updated = updateStaffReport(editingId, {
          date,
          patientId: patient.id,
          patientName: patient.fullName,
          generatedText: raw,
          correctedText: corrected,
          status: "submitted",
          reviewStatus: "pending",
          reviewedBy: null,
          reviewedByName: null,
          reviewedAt: null,
          reviewNote: "",
          submittedAt,
        });
        if (!updated) throw new Error("Report not found.");
        setOverrides((prev) => ({ ...prev, [updated.id]: updated }));
        setSuccess("Corrected report updated.");
      } else {
        const saved = saveStaffReport({
          staffId: staff.id,
          staffName: staff.fullName,
          patientId: patient.id,
          patientName: patient.fullName,
          date,
          generatedText: raw,
          correctedText: corrected,
          status: "submitted",
          reviewStatus: "pending",
          reviewedBy: null,
          reviewedByName: null,
          reviewedAt: null,
          reviewNote: "",
          submittedAt,
        });
        setSavedReports((prev) => [saved, ...prev]);
        setSuccess("Corrected report submitted.");
      }
      clearEditor();
    } catch {
      setError("Could not save the report. Please try again.");
    }
  }

  return (
    <div className="mt-3 rounded-2xl border border-brand/20 bg-brand-soft/25 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-base text-white">
            🎙
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Voice report · {staff.fullName}
            </p>
            <p className="text-xs leading-5 text-muted">
              Dictate the treatment you gave. The generated text appears below so you can correct
              it before submitting.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-white hover:text-slate-800"
        >
          Close
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-3 space-y-3">
        <div>
          <label
            htmlFor={`report-patient-${staff.id}`}
            className="mb-1.5 block text-xs font-medium text-slate-700"
          >
            Patient
          </label>
          <select
            id={`report-patient-${staff.id}`}
            value={patientId}
            onChange={(event) => setPatientId(event.target.value)}
            className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-brand/20 transition focus:border-brand focus:ring-4"
          >
            <option value="">Select patient</option>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.fullName}
                {patient.diagnosis ? ` · ${patient.diagnosis}` : ""}
              </option>
            ))}
          </select>
          {patients.length === 0 ? (
            <p className="mt-1.5 text-xs text-danger">
              No approved patients yet.{" "}
              <Link href="/onboarding" className="font-medium underline">
                Add a patient
              </Link>{" "}
              and get PMR approval first.
            </p>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label
              htmlFor={`report-date-${staff.id}`}
              className="mb-1.5 block text-xs font-medium text-slate-700"
            >
              Report date
            </label>
            <input
              id={`report-date-${staff.id}`}
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-brand/20 transition focus:border-brand focus:ring-4"
            />
          </div>
          <button
            type="button"
            onClick={listening ? stopListening : startListening}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              listening
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-brand text-white hover:bg-brand-strong"
            }`}
          >
            {listening ? "Stop recording" : "Start voice report"}
          </button>
        </div>

        <p className="text-xs text-muted">
          {listening
            ? "Listening... speak clearly, then stop recording."
            : "Uses your browser's microphone. You can also type the report directly."}
        </p>

        {interim ? (
          <p className="rounded-xl bg-white px-3 py-2 text-sm italic text-muted">
            Live: {interim}
          </p>
        ) : null}

        {generatedText && generatedText !== text ? (
          <div className="rounded-xl bg-white px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Generated by voice
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{generatedText}</p>
          </div>
        ) : null}

        <div>
          <label
            htmlFor={`report-text-${staff.id}`}
            className="mb-1.5 block text-xs font-medium text-slate-700"
          >
            Corrected report text
          </label>
          <textarea
            id={`report-text-${staff.id}`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={5}
            placeholder="Example: Today I completed a 30-minute mobility session, assisted transfers, and documented pain levels after each activity."
            className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm leading-6 text-slate-900 outline-none ring-brand/20 transition focus:border-brand focus:ring-4"
          />
          <p className="mt-1 text-[11px] leading-4 text-muted">
            Edit names, numbers, and treatment details here before submitting.
          </p>
        </div>

        {error ? (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-800">{success}</p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={!text.trim() || !date || !patientId}
            className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
          >
            {editingId ? "Update corrected report" : "Submit corrected report"}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={clearEditor}
              className="rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel edit
            </button>
          ) : null}
        </div>
      </form>

      {reports.length > 0 ? (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Submitted reports
          </p>
          <ul className="mt-2 space-y-2">
            {reports.map((report) => (
              <li key={report.id} className="rounded-xl bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {report.patientName || "Unassigned patient"} · {report.date}
                    </p>
                    <p className="text-[11px] text-muted">
                      Submitted {new Date(report.submittedAt || report.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        report.reviewStatus === "approved"
                          ? "bg-emerald-100 text-emerald-800"
                          : report.reviewStatus === "changes_requested"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {REVIEW_STATUS_LABELS[report.reviewStatus]}
                    </span>
                    <button
                      type="button"
                      onClick={() => startEditing(report)}
                      className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Edit
                    </button>
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                  {report.correctedText}
                </p>
                {report.reviewStatus === "changes_requested" && report.reviewNote ? (
                  <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-2 text-xs text-rose-800">
                    <span className="font-semibold">Reviewer note:</span> {report.reviewNote}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
