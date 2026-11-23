export type AttachmentKind = "image" | "video" | "audio";

export type MediaAttachment = {
  id: string;
  name: string;
  kind: AttachmentKind;
  mimeType: string;
  size: number;
  url: string;
};

export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

export const ATTACHMENT_ACCEPT = "image/*,video/*,audio/*";

export function kindFromMime(mimeType: string): AttachmentKind | null {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return null;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}

export function isMediaAttachment(value: unknown): value is MediaAttachment {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.url === "string" &&
    typeof record.mimeType === "string" &&
    typeof record.size === "number" &&
    (record.kind === "image" || record.kind === "video" || record.kind === "audio")
  );
}
