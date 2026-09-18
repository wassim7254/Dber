import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import type { Role } from "@/lib/auth/types";

export type ContextKind = "http" | "job" | "system";

export interface RequestContext {
  requestId: string;
  userId: string | null;
  role: Role | null;
  kind: ContextKind;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function createRequestContext(input?: Partial<RequestContext>): RequestContext {
  return {
    requestId: input?.requestId ?? randomUUID(),
    userId: input?.userId ?? null,
    role: input?.role ?? null,
    kind: input?.kind ?? "system",
  };
}

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getRequestContext(): RequestContext | null {
  return storage.getStore() ?? null;
}

/**
 * The request id of the current async context, or a synthetic id for work
 * running outside any request (jobs, startup tasks).
 */
export function currentRequestId(): string {
  return storage.getStore()?.requestId ?? "system";
}
