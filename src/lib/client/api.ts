export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function newKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `key-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface Envelope<T> {
  data?: T;
  error?: { code: string; message: string; details?: unknown };
  requestId?: string;
}

/**
 * Browser API client. Sends the correlation id and idempotency key on every
 * mutation; doubles are replayed safely server-side (§7).
 */
export async function apiPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-idempotency-key": newKey(),
      "x-request-id": newKey(),
    },
    body: JSON.stringify(body ?? {}),
  });
  const payload = (await response.json().catch(() => null)) as Envelope<T> | null;
  if (!response.ok || !payload || payload.error) {
    throw new ApiError(
      payload?.error?.code ?? "INTERNAL",
      payload?.error?.message ?? "The request failed. Please try again.",
      response.status,
      payload?.error?.details,
    );
  }
  return payload.data as T;
}

/** Maps known API error codes to calm, actionable copy (§21/§53). */
export function describeApiError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "INSUFFICIENT_CAPACITY":
        return "Someone just took the last spots. The group filled before your request arrived.";
      case "BOOKING_OVERLAP":
        return "Those dates were booked moments ago. Pick another slot from the calendar.";
      case "INVALID_STATE_TRANSITION":
        return "This transaction just changed state. Refresh to see the latest status.";
      case "CONFLICT":
        return error.message;
      case "FORBIDDEN":
        return "Your account doesn't have access to that action.";
      case "UNAUTHENTICATED":
        return "Please sign in first — pick a demo account on the Welcome page.";
      case "IDEMPOTENCY_CONFLICT":
        return "This action was already submitted with different details. Start over to retry.";
      case "RATE_LIMITED":
        return "Too many attempts in a short time. Wait a moment and try again.";
      case "PAYMENT_STATE":
        return error.message;
      default:
        return error.message;
    }
  }
  return "Something went wrong. Your data is safe — try again in a moment.";
}
