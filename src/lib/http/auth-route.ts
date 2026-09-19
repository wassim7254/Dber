import type { NextRequest } from "next/server";
import type { z } from "zod";

import { runWithRequestContext, createRequestContext } from "@/infrastructure/request-context/request-context";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { fail, ok } from "@/lib/http/envelope";
import { ValidationError } from "@/lib/errors";
import { asPgError, translatePersistenceError } from "@/lib/persistence/pg-errors";

/**
 * Pipeline for authentication routes: correlation → validation → rate limit
 * → handler → envelope. Deliberately WITHOUT the idempotency layer (auth
 * flows are safe to retry; sessions are the state) and without requireRole
 * (these endpoints establish identity).
 */
export function authRoute<TBody>(config: {
  scope: string;
  body: z.ZodType<TBody>;
  rateLimit: { limit: number; windowMs: number };
  /** Scopes the limiter per-identity (e.g. email) when the body is parsed. */
  limitKey?: (req: NextRequest, body: TBody) => string;
  handler: (ctx: { body: TBody; req: NextRequest }) => Promise<unknown>;
}): (req: NextRequest) => Promise<Response> {
  return async (req) => {
    const headerRequestId = req.headers.get("x-request-id");
    const requestId = headerRequestId && headerRequestId.length <= 64 ? headerRequestId : crypto.randomUUID();
    return runWithRequestContext(
      createRequestContext({ requestId, kind: "http" }),
      async (): Promise<Response> => {
        try {
          let raw: unknown;
          try {
            raw = await req.json();
          } catch {
            raw = {};
          }
          const parsed = config.body.safeParse(raw);
          if (!parsed.success) {
            throw new ValidationError("The request payload is invalid", {
              issues: parsed.error.issues.map((issue) => ({
                path: issue.path.join("."),
                message: issue.message,
              })),
            });
          }
          const limitKey = config.limitKey
            ? config.limitKey(req, parsed.data)
            : (req.headers.get("x-forwarded-for") ?? "local");
          enforceRateLimit(`${config.scope}:${limitKey}`, config.rateLimit.limit, config.rateLimit.windowMs);
          const data = await config.handler({ body: parsed.data, req });
          return ok(data as never);
        } catch (error) {
          if (asPgError(error)) {
            return fail(translatePersistenceError(error));
          }
          return fail(error);
        }
      },
    );
  };
}
