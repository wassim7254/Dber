import { randomUUID } from "node:crypto";
import { db } from "@/db/client";
import { uploads } from "@/db/schema";
import { recordAudit } from "@/infrastructure/audit/writer";
import { runWithRequestContext, createRequestContext } from "@/infrastructure/request-context/request-context";
import {
  extensionForMime,
  storage,
  UPLOAD_ALLOWED_MIME,
  UPLOAD_MAX_BYTES,
} from "@/infrastructure/storage/adapter";
import { authenticate } from "@/lib/auth/identity";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { fail, ok } from "@/lib/http/envelope";
import { UnauthorizedError, ValidationError } from "@/lib/errors";

/**
 * Media upload (§47): multipart POST with a real file. Bytes go to the
 * storage adapter; the uploads row is the authoritative metadata. Returns
 * the serving URL used verbatim in listing `images` arrays.
 */
export async function POST(req: Request): Promise<Response> {
  return runWithRequestContext(createRequestContext({ kind: "http" }), async () => {
    try {
      const identity = await authenticate();
      if (!identity) throw new UnauthorizedError();
      enforceRateLimit(`media.upload:${identity.userId}`, 30, 60_000);

      const form = await req.formData().catch(() => null);
      if (!form) throw new ValidationError("Send the image as multipart/form-data with a \"file\" field");
      const file = form.get("file");
      if (!(file instanceof File)) throw new ValidationError("Attach an image file in the \"file\" field");
      if (file.size <= 0 || file.size > UPLOAD_MAX_BYTES) {
        throw new ValidationError("Images must be between 1 byte and 5 MB");
      }
      if (!UPLOAD_ALLOWED_MIME.has(file.type)) {
        throw new ValidationError("Use a JPEG, PNG, WebP or AVIF image");
      }
      const altText = String(form.get("altText") ?? "").slice(0, 300);

      const id = randomUUID();
      const storageKey = `uploads/${id}.${extensionForMime(file.type)}`;
      const bytes = Buffer.from(await file.arrayBuffer());
      await storage.put(storageKey, bytes, file.type);

      await db.transaction(async (tx) => {
        await tx.insert(uploads).values({
          id,
          ownerId: identity.userId,
          mimeType: file.type,
          sizeBytes: file.size,
          storageKey,
          altText,
        });
        await recordAudit(tx, {
          actorId: identity.userId,
          actorRole: identity.role,
          action: "media.uploaded",
          entityType: "user",
          entityId: identity.userId,
          metadata: { uploadId: id, sizeBytes: file.size, mimeType: file.type },
        });
      });

      return ok({ id, url: `/api/v1/media/${id}`, altText });
    } catch (error) {
      return fail(error);
    }
  });
}
