import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getRequestContext } from "@/infrastructure/request-context/request-context";
import { logger } from "@/infrastructure/logging/logger";
import { DomainError } from "@/lib/errors";
import type { Json } from "@/types/json";

export interface ApiSuccess {
  data: Json;
  requestId: string;
}

export interface ApiError {
  error: { code: string; message: string; details?: Json };
  requestId: string;
}

function requestId(): string {
  return getRequestContext()?.requestId ?? "system";
}

export function ok(data: Json, status = 200, headers?: HeadersInit): NextResponse<ApiSuccess> {
  return NextResponse.json({ data, requestId: requestId() } satisfies ApiSuccess, {
    status,
    headers,
  });
}

/** Maps any thrown value to a safe API error response (§44/§65). Never leaks internals. */
export function fail(error: unknown): NextResponse<ApiError> {
  if (error instanceof DomainError) {
    const details = error.details === undefined ? undefined : (error.details as Json);
    return NextResponse.json(
      {
        error: { code: error.code, message: error.message, details },
        requestId: requestId(),
      } satisfies ApiError,
      { status: error.httpStatus },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_FAILED",
          message: "The request payload is invalid",
          details: {
            issues: error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
        requestId: requestId(),
      } satisfies ApiError,
      { status: 400 },
    );
  }
  logger.error("Unhandled route failure", {
    error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
  });
  return NextResponse.json(
    {
      error: { code: "INTERNAL", message: "An unexpected error occurred" },
      requestId: requestId(),
    } satisfies ApiError,
    { status: 500 },
  );
}
