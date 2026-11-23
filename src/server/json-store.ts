import { promises as fs } from "node:fs";
import path from "node:path";
import { get, put } from "@vercel/blob";

export type JsonResource = "patients" | "team-members" | "staff-reports" | "chat-messages";

const DATA_DIR = path.join(process.cwd(), "data");
const BLOB_PREFIX = "careloon/data";

const FILE_NAMES: Record<JsonResource, string> = {
  patients: "patients.json",
  "team-members": "team-members.json",
  "staff-reports": "staff-reports.json",
  "chat-messages": "chat-messages.json",
};

const locks = new Map<JsonResource, Promise<void>>();

function filePath(resource: JsonResource): string {
  return path.join(DATA_DIR, FILE_NAMES[resource]);
}

function blobPathname(resource: JsonResource): string {
  return `${BLOB_PREFIX}/${FILE_NAMES[resource]}`;
}

// Locally we keep using the JSON files. On Vercel (where BLOB_READ_WRITE_TOKEN is
// configured) the filesystem is read-only, so Blob becomes the source of truth.
export function isBlobMode(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function parseItems(raw: string): unknown[] {
  if (!raw.trim()) return [];
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

async function readFromDisk(resource: JsonResource, createIfMissing: boolean): Promise<unknown[]> {
  const file = filePath(resource);
  try {
    return parseItems(await fs.readFile(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    if (createIfMissing) {
      await fs.mkdir(DATA_DIR, { recursive: true });
      try {
        await fs.writeFile(file, "[]\n", { encoding: "utf8", flag: "wx" });
      } catch (writeError) {
        if ((writeError as NodeJS.ErrnoException).code !== "EEXIST") throw writeError;
      }
    }
    return [];
  }
}

async function readFromBlob(resource: JsonResource): Promise<unknown[] | null> {
  const result = await get(blobPathname(resource), {
    access: "private",
    // Always read the latest committed data, never a cached copy.
    useCache: false,
  });
  if (!result?.stream) return null;
  return parseItems(await new Response(result.stream).text());
}

export async function readJson(resource: JsonResource): Promise<unknown[]> {
  if (isBlobMode()) {
    const stored = await readFromBlob(resource);
    if (stored) return stored;
    // The bundled data/*.json files seed the Blob store on first access.
    return readFromDisk(resource, false);
  }
  return readFromDisk(resource, true);
}

async function writeJson(resource: JsonResource, items: unknown[]): Promise<void> {
  const serialized = `${JSON.stringify(items, null, 2)}\n`;
  if (isBlobMode()) {
    await put(blobPathname(resource), serialized, {
      access: "private",
      allowOverwrite: true,
      contentType: "application/json",
    });
    return;
  }
  const file = filePath(resource);
  await fs.mkdir(DATA_DIR, { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, serialized, "utf8");
  await fs.rename(temp, file);
}

async function acquire(resource: JsonResource): Promise<() => void> {
  const previous = locks.get(resource) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(resource, previous.then(() => next));
  await previous;
  return release;
}

export async function mutateJson<R>(
  resource: JsonResource,
  mutate: (items: unknown[]) => { items: unknown[]; result: R },
): Promise<R> {
  const release = await acquire(resource);
  try {
    const current = await readJson(resource);
    const { items, result } = mutate(current);
    await writeJson(resource, items);
    return result;
  } finally {
    release();
  }
}
