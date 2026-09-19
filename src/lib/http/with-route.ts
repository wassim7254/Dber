import { createHash, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import type { z } from "zod";

import { reserveIdempotency, completeIdempotency } from "@/infrastructure/idempotency/service";
import { runWithRequestContext, createRequestContext } from "@/infrastructure/request-context/request-context";
import type { Identity, Role } from "@/lib/auth/types";
import { requireRole } from "@/lib/auth/rbac";
import { resolveIdentityFromHeaders, parseIdentityRaw } from "@/lib/auth/identity";
import { resolveSessionIdentity, SESSION_COOKIE } from "@/lib/auth/session";
import { asPgError, translatePersistenceError } from "@/lib/persistence/pg-errors";
import { DomainError, UnauthorizedError, ValidationError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { fail, ok } from "@/lib/http/envelope";
import { idempotencyKeySchema } from "@/lib/validation";
import { db } from "@/db/client";
import type { Tx } from "@/db/tx";
import { canonicalJson, toJson } from "@/types/json";

const IDEMPOTENCY_HEADER = "x-idempotency-key";

export interface MutationContext<TBody> {
  tx: Tx;
  identity: Identity;
  body: TBody;
  params: Record<string, string>;
}

export interface MutationOutcome {
  status?: number;
  data: unknown;
}

/**
 * Handlers may return a `{ data, status? }` outcome or any serializable
 * value, which is wrapped as `{ data: value }` with status 200.
 */
function asOutcome(result: unknown): MutationOutcome {
  if (result !== null && typeof result === "object" && !Array.isArray(result)) {
    const record = result as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length > 0 && keys.every((key) => key === "data" || key === "status")) {
      return {
        status: typeof record.status === "number" ? record.status : undefined,
        data: record.data,
      };
    }
  }
  return { data: result };
}

export interface MutationRouteConfig<TBody> {
  /** Idempotency scope — the route's stable identity, e.g. "souq.join". */
  scope: string;
  auth: readonly Role[];
  body: z.ZodType<TBody>;
  rateLimit?: { limit: number; windowMs: number };
  /** Runs INSIDE the transaction: business mutation + audit + outbox all commit atomically. */
  handler: (ctx: MutationContext<TBody>) => Promise<unknown>;
}

function requestHashOf(body: unknown): string {
  return createHash("sha256").update(canonicalJson(body)).digest("hex");
}

async function parseBody<T>(req: NextRequest, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new DomainError("VALIDATION_FAILED", 400, "The request payload is invalid", {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

async function resolveRequestIdentity(req: NextRequest): Promise<Identity | null> {
  // 1. Server-side session (all environments).
  const session = await resolveSessionIdentity(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) return session.identity;
  // 2. Development identity: plaintext headers (API/testing) or dev session
  //    cookies (browser flows). Never trusted in production (§50).
  return resolveIdentityFromHeaders(req.headers) ?? parseIdentityRaw({
    userId: req.cookies.get("dber_user_id")?.value ?? null,
    role: req.cookies.get("dber_role")?.value ?? null,
  });
}

/**
 * The single mutation pipeline (§43/§7): correlation → authentication →
 * authorization → rate limit → validation → idempotency reservation →
 * transaction(handler) → idempotency completion → commit → envelope.
 * Route handlers using this helper cannot bypass layers.
 */
export function mutationRoute<TBody>(
  config: MutationRouteConfig<TBody>,
): (req: NextRequest, segment?: { params?: Promise<Record<string, string>> }) => Promise<Response> {
  return async (req, segment) => {
    const headerRequestId = req.headers.get("x-request-id");
    const requestId = headerRequestId && headerRequestId.length <= 64 ? headerRequestId : randomUUID();
    return runWithRequestContext(
      createRequestContext({ requestId, kind: "http" }),
      async (): Promise<Response> => {
        try {
          const identity = await resolveRequestIdentity(req);
          if (!identity) throw new UnauthorizedError();
          requireRole(identity, config.auth);
          if (config.rateLimit) {
            enforceRateLimit(`${config.scope}:${identity.userId}`, config.rateLimit.limit, config.rateLimit.windowMs);
          }

          const body = await parseBody(req, config.body);
          const keyHeader = req.headers.get(IDEMPOTENCY_HEADER);
          const key = idempotencyKeySchema.safeParse(keyHeader);
          if (!key.success) {
            throw new ValidationError(
              `Mutation requests require a valid ${IDEMPOTENCY_HEADER} header (8-128 URL-safe characters)`,
            );
          }
          const params = (await segment?.params) ?? {};

          const requestHash = requestHashOf(body);
          const outcome = await db.transaction(async (tx) => {
            const reservation = await reserveIdempotency(tx, {
              scope: config.scope,
              key: key.data,
              userId: identity.userId,
              requestHash,
            });
            if (reservation.outcome === "replay") {
              return {
                replay: true as const,
                status: reservation.responseStatus,
                data: reservation.responseBody,
              };
            }
            const result = asOutcome(await config.handler({ tx, identity, body, params }));
            const status = result.status ?? 200;
            const data = toJson(result.data);
            await completeIdempotency(tx, {
              scope: config.scope,
              key: key.data,
              userId: identity.userId,
              requestHash,
              responseStatus: status,
              responseBody: data,
            });
            return { replay: false as const, status, data };
          });

          const headers: Record<string, string> = { "x-request-id": requestId };
          if (outcome.replay) headers["idempotency-replayed"] = "true";
          return ok(outcome.data, outcome.status, headers);
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

export interface QueryContext {
  identity: Identity | null;
  req: NextRequest;
  params: Record<string, string>;
  url: URL;
}

export interface QueryRouteConfig {
  /** Undefined = public read. */
  auth?: readonly Role[];
  handler: (ctx: QueryContext) => Promise<unknown>;
}

export function queryRoute(
  config: QueryRouteConfig,
): (req: NextRequest, segment?: { params?: Promise<Record<string, string>> }) => Promise<Response> {
  return async (req, segment) => {
    const headerRequestId = req.headers.get("x-request-id");
    const requestId = headerRequestId && headerRequestId.length <= 64 ? headerRequestId : randomUUID();
    return runWithRequestContext(
      createRequestContext({ requestId, kind: "http" }),
      async (): Promise<Response> => {
        try {
          const identity = await resolveRequestIdentity(req);
          if (config.auth) {
            if (!identity) throw new UnauthorizedError();
            requireRole(identity, config.auth);
          }
          const params = (await segment?.params) ?? {};
          const data = toJson(
            await config.handler({
              identity,
              req,
              params,
              url: new URL(req.url),
            }),
          );
          return ok(data);
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
