"use client";

import { useRef, useState } from "react";
import {
  ATTACHMENT_ACCEPT,
  formatBytes,
  kindFromMime,
  MAX_ATTACHMENT_BYTES,
  type MediaAttachment,
} from "@/lib/attachments";

export function MediaAttachmentEditor({
  attachments,
  onChange,
  label = "Assessment media",
}: {
  attachments: MediaAttachment[];
  onChange: (next: MediaAttachment[]) => void;
  label?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState("");

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setError("");

    for (const file of Array.from(fileList)) {
      const kind = kindFromMime(file.type);
      if (!kind) {
        setError(`${file.name} is not a video, audio or picture file.`);
        continue;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError(`${file.name} is larger than 100 MB.`);
        continue;
      }

      setUploading((count) => count + 1);
      try {
        const body = new FormData();
        body.append("file", file);
        const response = await fetch("/api/uploads", { method: "POST", body });
        const payload = (await response.json()) as MediaAttachment & { error?: string };
        if (!response.ok) throw new Error(payload.error || "Could not upload the file.");
        onChange([...attachments, payload]);
      } catch (uploadFailure) {
        setError(
          uploadFailure instanceof Error ? uploadFailure.message : "Could not upload the file.",
        );
      } finally {
        setUploading((count) => Math.max(0, count - 1));
      }
    }
  }

  function removeAttachment(id: string) {
    onChange(attachments.filter((attachment) => attachment.id !== id));
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-700">{label}</span>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading > 0}
          className="rounded-lg border border-border bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {uploading > 0 ? "Uploading..." : "Add pictures / videos / audio"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPT}
          className="hidden"
          onChange={(event) => {
            void handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {error ? (
        <p className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {attachments.length > 0 ? (
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="overflow-hidden rounded-lg border border-border bg-slate-50"
            >
              <div className="flex items-center gap-2 p-2">
                {attachment.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={attachment.url}
                    alt={attachment.name}
                    className="h-10 w-10 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-white text-lg">
                    {attachment.kind === "video" ? "🎬" : "🎵"}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-slate-800">{attachment.name}</p>
                  <p className="text-xs text-muted">{formatBytes(attachment.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeAttachment(attachment.id)}
                  className="shrink-0 rounded px-1.5 py-1 text-xs text-slate-500 hover:bg-slate-200 hover:text-danger"
                  aria-label={`Remove ${attachment.name}`}
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
