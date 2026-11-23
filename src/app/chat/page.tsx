"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { ChatComposer } from "@/components/ChatComposer";
import { SignOutButton } from "@/components/SignOutButton";
import {
  getPatients,
  getPatientsServerSnapshot,
  getStoredUser,
  subscribeToPatients,
} from "@/lib/auth";
import {
  attachReportToMessage,
  AUTHOR_ROLE_LABELS,
  getChatMessageSnapshot,
  getChatServerSnapshot,
  saveChatMessage,
  subscribeToChatMessages,
  TEAM_CHANNEL_ID,
  type ChatAuthorRole,
  type ChatMessage,
} from "@/lib/chat";
import { formatBytes, type MediaAttachment } from "@/lib/attachments";
import { saveStaffReport } from "@/lib/reports";
import {
  getTeamMembers,
  getTeamMembersServerSnapshot,
  getVisibleMembers,
  isAuthoredBy,
  ROLE_LABELS,
  subscribeToTeamMembers,
} from "@/lib/team";

function subscribe() {
  return () => {};
}

function today(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

type AuthorOption = {
  id: string;
  name: string;
  email: string;
  role: ChatAuthorRole;
  label: string;
};

type Channel = {
  id: string;
  name: string;
  detail: string;
  patientId: string | null;
};

export default function ChatPage() {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const user = useMemo(() => (mounted ? getStoredUser() : null), [mounted]);
  const members = useSyncExternalStore(
    subscribeToTeamMembers,
    getTeamMembers,
    getTeamMembersServerSnapshot,
  );
  const patients = useSyncExternalStore(
    subscribeToPatients,
    getPatients,
    getPatientsServerSnapshot,
  );

  const messages = useSyncExternalStore(
    subscribeToChatMessages,
    getChatMessageSnapshot,
    getChatServerSnapshot,
  );
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [selectedAuthorId, setSelectedAuthorId] = useState("");
  const [patientQuery, setPatientQuery] = useState("");
  const [error, setError] = useState("");
  const [loggingId, setLoggingId] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const signedInMember = useMemo(
    () =>
      user
        ? members.find(
            (member) =>
              member.approvalStatus === "approved" &&
              member.email.toLowerCase() === user.email.toLowerCase(),
          ) ?? null
        : null,
    [members, user],
  );

  const authorOptions = useMemo<AuthorOption[]>(() => {
    const teamOptions = members
      .filter((member) => member.approvalStatus === "approved")
      .map((member) => ({
        id: member.id,
        name: member.fullName,
        email: member.email,
        role: member.role,
        label: ROLE_LABELS[member.role],
      }));

    if (!user) return teamOptions;

    // Attribute signed-in posts to the real team member ID so the dashboard can
    // scope the resulting treatment reports to the right person.
    const signedInOption: AuthorOption | null = signedInMember
      ? null
      : {
          id: `user:${user.email}`,
          name: user.name,
          email: user.email,
          role: "signed_in" as const,
          label: AUTHOR_ROLE_LABELS.signed_in,
        };

    // Staff post only as themselves; leaders can choose an author for demo purposes.
    if (signedInMember?.role === "staff") {
      const self = teamOptions.filter((option) => option.id === signedInMember.id);
      return self.length > 0 ? self : signedInOption ? [signedInOption] : [];
    }

    return signedInOption ? [signedInOption, ...teamOptions] : teamOptions;
  }, [members, signedInMember, user]);

  const defaultAuthorId = useMemo(() => {
    if (!user) return authorOptions[0]?.id ?? "";
    const matching = authorOptions.find(
      (option) => option.email.toLowerCase() === user.email.toLowerCase(),
    );
    return (matching ?? authorOptions[0])?.id ?? "";
  }, [authorOptions, user]);

  const author =
    authorOptions.find((option) => option.id === selectedAuthorId) ??
    authorOptions.find((option) => option.id === defaultAuthorId) ??
    null;

  const visibleMembers = useMemo(
    () => getVisibleMembers(members, signedInMember),
    [members, signedInMember],
  );

  // Staff see only their own treatment updates; a Duty Doctor also sees updates
  // from staff assigned to them; PMR Doctors and Admin see the whole team.
  const scopedMessages = useMemo(
    () =>
      messages.filter((message) =>
        visibleMembers.some((member) => isAuthoredBy(message.authorId, member)),
      ),
    [messages, visibleMembers],
  );

  const approvedPatients = useMemo(
    () => patients.filter((patient) => patient.approvalStatus === "approved"),
    [patients],
  );

  const channels = useMemo<Channel[]>(() => {
    const result: Channel[] = [];
    for (const patient of approvedPatients) {
      result.push({
        id: patient.id,
        name: patient.fullName,
        detail: [patient.diagnosis || "Patient channel", patient.careProviderName ? `Assigned: ${patient.careProviderName}` : ""]
          .filter(Boolean)
          .join(" · "),
        patientId: patient.id,
      });
    }
    for (const message of scopedMessages) {
      if (message.channelId === TEAM_CHANNEL_ID) continue;
      if (result.some((channel) => channel.id === message.channelId)) continue;
      result.push({
        id: message.channelId,
        name: "Archived patient",
        detail: "Patient record is no longer active",
        patientId: message.channelId,
      });
    }
    return result;
  }, [approvedPatients, scopedMessages]);

  const visibleChannels = useMemo(() => {
    const term = patientQuery.trim().toLowerCase();
    if (!term) return channels;
    return channels.filter(
      (channel) =>
        channel.name.toLowerCase().includes(term) || channel.detail.toLowerCase().includes(term),
    );
  }, [channels, patientQuery]);

  const activeChannel =
    channels.find((channel) => channel.id === selectedChannelId) ?? channels[0] ?? null;
  const selectedPatient = activeChannel?.patientId
    ? patients.find((patient) => patient.id === activeChannel.patientId) ?? null
    : null;
  const scopeDescription = !signedInMember
    ? "Your account is not linked to an approved team member."
    : signedInMember.role === "staff"
      ? "Showing only your own treatment updates."
      : signedInMember.role === "supervisor"
        ? "Showing your updates and those from staff assigned to you."
        : "Showing treatment updates from all care team members.";

  const visibleMessages = useMemo(
    () => scopedMessages.filter((message) => message.channelId === activeChannel?.id),
    [activeChannel?.id, scopedMessages],
  );
  const messageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const message of scopedMessages) {
      counts.set(message.channelId, (counts.get(message.channelId) ?? 0) + 1);
    }
    return counts;
  }, [scopedMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [activeChannel?.id, visibleMessages.length]);

  async function handleSend(
    text: string,
    source: "typed" | "voice",
    attachments: MediaAttachment[],
  ) {
    if (!author) {
      setError("Add an approved team member in Team onboarding before posting an update.");
      return;
    }
    if (!activeChannel) {
      setError("Add and approve a patient in Patient onboarding before posting an update.");
      return;
    }
    try {
      await saveChatMessage({
        channelId: activeChannel.id,
        authorId: author.id,
        authorName: author.name,
        authorRole: author.role,
        text,
        source,
        attachments,
      });
      setError("");
    } catch {
      setError("Could not save your update. Please try again.");
    }
  }

  async function handleLogReport(message: ChatMessage) {
    const channel = activeChannel;
    if (!channel?.patientId) return;
    const patient = patients.find((item) => item.id === channel.patientId);
    if (!patient) return;

    setLoggingId(message.id);
    try {
      const report = await saveStaffReport({
        staffId: message.authorId,
        staffName: message.authorName,
        patientId: patient.id,
        patientName: patient.fullName,
        date: today(),
        generatedText: message.source === "voice" ? message.text : "",
        correctedText: message.text,
        attachments: message.attachments,
        status: "submitted",
        reviewStatus: "pending",
        reviewedBy: null,
        reviewedByName: null,
        reviewedAt: null,
        reviewNote: "",
        submittedAt: new Date().toISOString(),
      });
      await attachReportToMessage(message.id, report.id);
      setError("");
    } catch {
      setError("Could not add this update to the review dashboard. Please try again.");
    } finally {
      setLoggingId("");
    }
  }

  return (
    <AuthGuard>
      <main className="min-h-screen w-full bg-slate-50 px-4 pb-10 pt-5 sm:px-6">
        <div className="w-full">
          <header className="mb-5 grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-[0.16em] text-brand">CARELOON</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                Treatment
              </h1>
              <p className="mt-1 text-sm text-muted">
                {user ? `Signed in as ${user.name}` : "Report treatment activity as you go."}
              </p>
              <p className="mt-0.5 text-xs text-muted">{scopeDescription}</p>
            </div>
            <SignOutButton className="justify-self-end sm:col-start-3 sm:row-start-1" />
            <nav className="col-span-2 row-start-2 flex w-full flex-wrap items-center gap-1.5 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:w-auto sm:justify-end sm:gap-2">
              <Link
                href="/chat"
                className="shrink-0 whitespace-nowrap rounded-lg border border-brand bg-brand-soft/40 px-2 py-1.5 text-xs font-semibold text-brand-strong sm:px-3 sm:py-2 sm:text-sm"
              >
                Treatment
              </Link>
              <Link
                href="/dashboard"
                className="shrink-0 whitespace-nowrap rounded-lg border border-border bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 sm:px-3 sm:py-2 sm:text-sm"
              >
                Dashboard
              </Link>
              <Link
                href="/onboarding"
                className="shrink-0 whitespace-nowrap rounded-lg border border-border bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 sm:px-3 sm:py-2 sm:text-sm"
              >
                Patient
              </Link>
              <Link
                href="/team-onboarding"
                className="shrink-0 whitespace-nowrap rounded-lg border border-border bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 sm:px-3 sm:py-2 sm:text-sm"
              >
                Team
              </Link>
            </nav>
          </header>

          {error ? (
            <p
              className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <section className="rounded-2xl border border-border bg-white p-3 shadow-sm">
              <div className="mb-2 flex items-baseline justify-between gap-2 px-1">
                <h2 className="text-sm font-semibold text-slate-900">Select patient</h2>
                <span className="text-xs text-muted">{messages.length} total updates</span>
              </div>
              <label htmlFor="patient-channel-search" className="sr-only">
                Search patients
              </label>
              <input
                id="patient-channel-search"
                type="search"
                value={patientQuery}
                onChange={(event) => setPatientQuery(event.target.value)}
                placeholder="Search patients by name or diagnosis"
                autoComplete="off"
                className="mb-2 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-brand/20 transition placeholder:text-slate-400 focus:border-brand focus:ring-4"
              />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
                {visibleChannels.map((channel) => {
                  const isActive = channel.id === activeChannel?.id;
                  return (
                    <button
                      key={channel.id}
                      type="button"
                      onClick={() => setSelectedChannelId(channel.id)}
                      className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                        isActive
                          ? "border-brand bg-brand-soft/30"
                          : "border-border bg-white hover:bg-slate-50"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-slate-900">
                          {channel.name}
                        </span>
                        <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-xs font-medium text-slate-500">
                          {messageCounts.get(channel.id) ?? 0}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted">
                        {channel.detail}
                      </span>
                    </button>
                  );
                })}
              </div>
              {channels.length === 0 ? (
                <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  No approved patients yet. Add and approve a patient in Patient onboarding first.
                </p>
              ) : null}
              <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-muted">
                Updates are saved in this browser. Use “Log as report” on a patient update to add it
                to the doctor review dashboard.
              </p>
            </section>

            <section className="flex min-h-[560px] flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                    Patient channel
                  </p>
                  <h2 className="truncate text-base font-semibold text-slate-900">
                    {activeChannel?.name ?? "No patient selected"}
                  </h2>
                  <p className="truncate text-xs text-muted">
                    {activeChannel?.detail ??
                      "Add and approve a patient to start logging treatment updates."}
                  </p>
                </div>
                <div className="w-full sm:w-60">
                  <label
                    htmlFor="chat-author"
                    className="mb-1 block text-xs font-medium text-slate-700"
                  >
                    Posting as
                  </label>
                  <select
                    id="chat-author"
                    value={author?.id ?? ""}
                    onChange={(event) => setSelectedAuthorId(event.target.value)}
                    className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-brand/20 transition focus:border-brand focus:ring-4"
                  >
                    {authorOptions.length === 0 ? (
                      <option value="">No approved team members</option>
                    ) : (
                      authorOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name} · {option.label}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div
                className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 px-3 py-4 sm:px-4"
                style={{ maxHeight: "min(58vh, 560px)" }}
              >
                {visibleMessages.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-white px-4 py-10 text-center">
                    <p className="text-sm font-medium text-slate-800">No updates yet</p>
                    <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                      Select the patient receiving treatment from the list, then speak, type, or
                      attach photos, videos and audio as an assessment record. Add a spoken note with
                      the media so the review dashboard has full context.
                    </p>
                  </div>
                ) : (
                  visibleMessages.map((message) => {
                    const mine = author?.id === message.authorId;
                    return (
                      <div
                        key={message.id}
                        className={`flex ${mine ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 shadow-sm sm:max-w-[78%] ${
                            mine
                              ? "bg-brand text-white"
                              : "border border-border bg-white text-slate-800"
                          }`}
                        >
                          <div
                            className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs ${
                              mine ? "text-teal-50" : "text-muted"
                            }`}
                          >
                            <span className="font-semibold">{message.authorName}</span>
                            <span>{AUTHOR_ROLE_LABELS[message.authorRole]}</span>
                            <span>
                              {new Date(message.createdAt).toLocaleString([], {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {message.source === "voice" ? (
                              <span
                                className={`rounded-full px-1.5 py-0.5 font-medium ${
                                  mine ? "bg-white/20 text-white" : "bg-brand-soft/50 text-brand-strong"
                                }`}
                              >
                                🎙 voice
                              </span>
                            ) : null}
                          </div>
                          {message.text ? (
                            <p className="mt-1 whitespace-pre-wrap text-sm leading-6">
                              {message.text}
                            </p>
                          ) : null}
                          {message.attachments.length > 0 ? (
                            <MessageAttachments
                              attachments={message.attachments}
                              mine={mine}
                            />
                          ) : null}
                          {message.reportId ? (
                            <p className="mt-2 text-xs font-medium text-emerald-700">
                              ✓ Logged for review ·{" "}
                              <Link href="/dashboard" className="underline">
                                View dashboard
                              </Link>
                            </p>
                          ) : activeChannel?.patientId ? (
                            <button
                              type="button"
                              onClick={() => handleLogReport(message)}
                              disabled={loggingId === message.id}
                              className="mt-2 rounded-lg border border-border bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                            >
                              {loggingId === message.id ? "Logging…" : "Log as report"}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              <div className="border-t border-border p-3">
                <ChatComposer
                  onSend={handleSend}
                  disabled={!author}
                  canUseMic={Boolean(selectedPatient)}
                />
                {!selectedPatient ? (
                  <p className="mt-2 text-xs text-amber-700">
                    Select the patient receiving treatment from the list before using the
                    microphone.
                  </p>
                ) : null}
                {!author ? (
                  <p className="mt-2 text-xs text-danger">
                    Add and approve a team member in{" "}
                    <Link href="/team-onboarding" className="font-medium underline">
                      Team onboarding
                    </Link>{" "}
                    before posting.
                  </p>
                ) : null}
              </div>
            </section>
          </div>
        </div>
      </main>
    </AuthGuard>
  );
}

function MessageAttachments({
  attachments,
  mine,
}: {
  attachments: MediaAttachment[];
  mine: boolean;
}) {
  return (
    <ul className="mt-2 space-y-2">
      {attachments.map((attachment) => (
        <li key={attachment.id}>
          <div
            className={`overflow-hidden rounded-xl border ${
              mine ? "border-white/30 bg-white/10" : "border-border bg-slate-50"
            }`}
          >
            {attachment.kind === "image" ? (
              <a href={attachment.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={attachment.url}
                  alt={attachment.name}
                  className="max-h-64 w-full object-contain"
                />
              </a>
            ) : attachment.kind === "video" ? (
              <video
                controls
                preload="metadata"
                src={attachment.url}
                className="max-h-64 w-full bg-black"
              >
                Your browser does not support video playback.
              </video>
            ) : (
              <audio controls preload="metadata" src={attachment.url} className="w-full px-2 py-2">
                Your browser does not support audio playback.
              </audio>
            )}
            <div
              className={`flex items-center justify-between gap-2 px-2 py-1 text-xs ${
                mine ? "text-teal-50" : "text-muted"
              }`}
            >
              <span className="truncate">{attachment.name}</span>
              <span className="shrink-0">{formatBytes(attachment.size)}</span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
