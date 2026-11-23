import { promises as fs } from "node:fs";
import path from "node:path";
import { get, put } from "@vercel/blob";
import { isBlobMode } from "@/server/json-store";
import {
  kindFromMime,
  MAX_ATTACHMENT_BYTES,
  type MediaAttachment,
} from "@/lib/attachments";

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");
const BLOB_UPLOAD_PREFIX = "careloon/uploads";
const STORED_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,5}$/i;

// Store media with a stable extension so the serving route can send the right type.
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/ogg": "ogv",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/webm": "weba",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
};

const EXTENSION_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  ogv: "video/ogg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  weba: "audio/webm",
  m4a: "audio/mp4",
  aac: "audio/aac",
};

function extensionFor(file: File, kind: string): string {
  const mapped = MIME_EXTENSIONS[file.type.toLowerCase()];
  if (mapped) return mapped;
  const fromName = path.extname(file.name).slice(1).toLowerCase();
  if (/^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  return kind === "image" ? "png" : kind === "video" ? "mp4" : "mp3";
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Could not read the uploaded file." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Choose a video, audio or picture to upload." }, { status: 400 });
  }

  const kind = kindFromMime(file.type);
  if (!kind) {
    return Response.json(
      { error: "Only video, audio and picture files can be uploaded." },
      { status: 415 },
    );
  }

  if (file.size <= 0) {
    return Response.json({ error: "The selected file is empty." }, { status: 400 });
  }

  if (file.size > MAX_ATTACHMENT_BYTES) {
    return Response.json({ error: "Files must be 100 MB or smaller." }, { status: 413 });
  }

  const id = crypto.randomUUID();
  const extension = extensionFor(file, kind);
  const storedName = `${id}.${extension}`;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    if (isBlobMode()) {
      await put(`${BLOB_UPLOAD_PREFIX}/${storedName}`, buffer, {
        access: "private",
        contentType: file.type || EXTENSION_MIME[extension] || "application/octet-stream",
      });
    } else {
      await fs.mkdir(UPLOAD_DIR, { recursive: true });
      await fs.writeFile(path.join(UPLOAD_DIR, storedName), buffer);
    }
  } catch {
    return Response.json({ error: "Could not save the uploaded file." }, { status: 500 });
  }

  const attachment: MediaAttachment = {
    id,
    name: file.name || `Assessment ${kind}`,
    kind,
    mimeType: file.type,
    size: file.size,
    url: `/api/uploads?name=${encodeURIComponent(storedName)}`,
  };

  return Response.json(attachment);
}

export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name") ?? "";
  if (!STORED_NAME.test(name)) {
    return new Response("Not found", { status: 404 });
  }

  const extension = path.extname(name).slice(1).toLowerCase();
  const headers = {
    "Content-Type": EXTENSION_MIME[extension] ?? "application/octet-stream",
    "Cache-Control": "public, max-age=31536000, immutable",
  };

  try {
    if (isBlobMode()) {
      const result = await get(`${BLOB_UPLOAD_PREFIX}/${name}`, { access: "private" });
      if (!result?.stream) return new Response("Not found", { status: 404 });
      return new Response(result.stream, { headers });
    }
    const data = await fs.readFile(path.join(UPLOAD_DIR, name));
    return new Response(data, {
      headers: { ...headers, "Content-Length": String(data.byteLength) },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
