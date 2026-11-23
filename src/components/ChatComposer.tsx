"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  ATTACHMENT_ACCEPT,
  formatBytes,
  kindFromMime,
  MAX_ATTACHMENT_BYTES,
  type MediaAttachment,
} from "@/lib/attachments";
import type { ChatMessageSource } from "@/lib/chat";
import { useSpeechRecognition } from "@/lib/speech";

function MicIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 10.5v1a6.5 6.5 0 0 0 13 0v-1" />
      <path d="M12 18v3" />
      <path d="M8.5 21h7" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function AttachIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M20.5 11.5 12 20a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10 18a2 2 0 0 1-3-3l7.5-7.5" />
    </svg>
  );
}

function FileIcon({ kind }: { kind: MediaAttachment["kind"] }) {
  if (kind === "image") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="8.5" cy="9.5" r="1.5" />
        <path d="m21 16-5-5L5 20" />
      </svg>
    );
  }
  if (kind === "video") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden="true">
        <rect x="3" y="5" width="13" height="14" rx="2" />
        <path d="m16 10 5-3v10l-5-3" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden="true">
      <path d="M9 18V6l11-2v12" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </svg>
  );
}

export function ChatComposer({
  onSend,
  disabled = false,
  canUseMic = true,
}: {
  onSend: (
    text: string,
    source: ChatMessageSource,
    attachments: MediaAttachment[],
  ) => void | Promise<void>;
  disabled?: boolean;
  canUseMic?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<MediaAttachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const usedVoiceRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFinal = useCallback((text: string) => {
    usedVoiceRef.current = true;
    setDraft((previous) => `${previous}${previous && !/\s$/.test(previous) ? " " : ""}${text}`);
  }, []);

  const { listening, interim, error, start, stop, clearError } = useSpeechRecognition({
    onFinal: handleFinal,
  });

  useEffect(() => {
    if (!canUseMic) stop();
  }, [canUseMic, stop]);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setUploadError("");

    for (const file of Array.from(fileList)) {
      const kind = kindFromMime(file.type);
      if (!kind) {
        setUploadError(`${file.name} is not a video, audio or picture file.`);
        continue;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setUploadError(`${file.name} is larger than 100 MB.`);
        continue;
      }

      setUploading((count) => count + 1);
      try {
        const body = new FormData();
        body.append("file", file);
        const response = await fetch("/api/uploads", { method: "POST", body });
        const payload = (await response.json()) as MediaAttachment & { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || "Could not upload the file.");
        }
        setAttachments((previous) => [...previous, payload]);
      } catch (uploadFailure) {
        setUploadError(
          uploadFailure instanceof Error ? uploadFailure.message : "Could not upload the file.",
        );
      } finally {
        setUploading((count) => Math.max(0, count - 1));
      }
    }
  }

  function removeAttachment(id: string) {
    setAttachments((previous) => previous.filter((attachment) => attachment.id !== id));
  }

  function submit() {
    const text = draft.trim();
    if (disabled || uploading > 0) return;
    if (!text && attachments.length === 0) return;
    void onSend(text, usedVoiceRef.current ? "voice" : "typed", attachments);
    setDraft("");
    setAttachments([]);
    usedVoiceRef.current = false;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  const canSubmit = !disabled && uploading === 0 && Boolean(draft.trim() || attachments.length > 0);

  return (
    <div className="rounded-2xl border border-border bg-white p-3 shadow-sm">
      {listening ? (
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-brand-soft/40 px-3 py-2 text-sm text-brand-strong">
          <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />
          <span>
            Listening… speak clearly. Your words appear in the box below as you talk.
          </span>
        </div>
      ) : null}

      {interim ? (
        <p aria-live="polite" className="mb-2 rounded-xl bg-slate-50 px-3 py-2 text-sm italic text-muted">
          <span className="font-medium not-italic text-slate-600">Live transcript:</span> {interim}
        </p>
      ) : null}

      {error ? (
        <div className="mb-2 flex items-start justify-between gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">
          <span role="alert">{error}</span>
          <button
            type="button"
            onClick={clearError}
            className="shrink-0 text-xs font-semibold hover:underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {attachments.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex max-w-full items-center gap-2 rounded-xl border border-border bg-slate-50 px-2 py-1.5 text-xs text-slate-700"
            >
              {attachment.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={attachment.url}
                  alt={attachment.name}
                  className="h-9 w-9 rounded-lg object-cover"
                />
              ) : (
                <span className="text-slate-500">
                  <FileIcon kind={attachment.kind} />
                </span>
              )}
              <span className="min-w-0">
                <span className="block max-w-[180px] truncate font-medium">{attachment.name}</span>
                <span className="text-[11px] text-muted">
                  {attachment.kind} · {formatBytes(attachment.size)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => removeAttachment(attachment.id)}
                aria-label={`Remove ${attachment.name}`}
                className="shrink-0 rounded-full px-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {uploading > 0 ? (
        <p className="mb-2 rounded-xl bg-brand-soft/40 px-3 py-2 text-xs text-brand-strong">
          Uploading {uploading} file{uploading > 1 ? "s" : ""}…
        </p>
      ) : null}

      {uploadError ? (
        <p className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-danger" role="alert">
          {uploadError}
        </p>
      ) : null}

      <label htmlFor="chat-message" className="sr-only">
        Treatment activity update
      </label>
      <textarea
        id="chat-message"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        rows={3}
        disabled={disabled}
        placeholder="Tap the microphone and speak, type a treatment update, or attach an assessment photo, video or audio…"
        className="w-full resize-y rounded-xl border border-border bg-white px-3 py-2.5 text-sm leading-6 text-slate-900 outline-none ring-brand/20 transition placeholder:text-slate-400 focus:border-brand focus:ring-4 disabled:bg-slate-50"
      />

      <div className="mt-2 flex flex-col items-center gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={listening ? stop : start}
            disabled={disabled || !canUseMic}
            aria-pressed={listening}
            aria-label={
              !canUseMic
                ? "Select a patient to enable the microphone"
                : listening
                  ? "Stop recording"
                  : "Tap to speak"
            }
            title={
              !canUseMic
                ? "Select a patient from the list first"
                : listening
                  ? "Stop recording"
                  : "Tap to speak"
            }
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
              listening ? "animate-pulse bg-red-600 hover:bg-red-700" : "bg-brand hover:bg-brand-strong"
            }`}
          >
            {listening ? <StopIcon /> : <MicIcon />}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ATTACHMENT_ACCEPT}
            multiple
            className="sr-only"
            onChange={(event) => {
              void handleFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || !canUseMic}
            className="flex h-10 items-center gap-1.5 rounded-full border border-border bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            title={canUseMic ? "Attach assessment media" : "Select a patient from the list first"}
          >
            <AttachIcon />
            Add media
          </button>
        </div>
        {canUseMic ? (
          <p className="text-center text-[11px] leading-4 text-muted">
            Photos, videos and audio up to 100 MB · Enter to send · Shift + Enter for a new line
          </p>
        ) : (
          <p className="text-center text-[11px] leading-4 text-amber-700">
            Select the patient receiving treatment from the list to enable the microphone and media.
          </p>
        )}
        <div className="flex w-full flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            Send update
          </button>
          {draft || attachments.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                stop();
                setDraft("");
                setAttachments([]);
                setUploadError("");
                usedVoiceRef.current = false;
              }}
              className="rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
