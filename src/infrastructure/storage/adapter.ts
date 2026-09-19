import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { isProduction } from "@/lib/config/env";
import { InternalError } from "@/lib/errors";

/**
 * Object storage port (§47). The application never touches bytes directly —
 * it stores `storageKey` references and resolves them through this adapter.
 * Development uses a local volume (`.data/uploads`); production plugs in S3 /
 * R2 / MinIO by implementing the same port and configuring the driver.
 */
export interface StorageAdapter {
  readonly name: string;
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ bytes: Buffer; contentType: string }>;
}

class LocalVolumeStorage implements StorageAdapter {
  readonly name = "local-volume";
  private readonly root = path.join(process.cwd(), ".data", "uploads");

  private resolve(key: string): string {
    // Defense-in-depth: keys are generated server-side (`uploads/<uuid>.<ext>`)
    // but never allow traversal out of the volume.
    const safe = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, "");
    const resolved = path.join(this.root, safe);
    if (!resolved.startsWith(this.root)) {
      throw new InternalError("Invalid storage key");
    }
    return resolved;
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }

  async get(key: string): Promise<{ bytes: Buffer; contentType: string }> {
    const target = this.resolve(key);
    const bytes = await readFile(target);
    return { bytes, contentType: "application/octet-stream" };
  }
}

class MissingStorage implements StorageAdapter {
  readonly name = "unconfigured";

  async put(): Promise<void> {
    throw new InternalError("Object storage is not configured — set DBER_STORAGE_DRIVER");
  }

  async get(): Promise<{ bytes: Buffer; contentType: string }> {
    throw new InternalError("Object storage is not configured");
  }
}

export const storage: StorageAdapter = isProduction ? new MissingStorage() : new LocalVolumeStorage();

/** Upload policy (§47): bounded size and safe types. */
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const UPLOAD_ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

export function extensionForMime(mimeType: string): string {
  return EXTENSION_BY_MIME[mimeType] ?? "bin";
}
