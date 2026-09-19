import type { Json } from "@/types/json";

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_STATE_TRANSITION"
  | "INSUFFICIENT_CAPACITY"
  | "BOOKING_OVERLAP"
  | "PAYMENT_STATE"
  | "REFUND_STATE"
  | "CANCELLATION_STATE"
  | "DISPUTE_STATE"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "CONFIGURATION"
  | "INTERNAL";

export interface ErrorDetails {
  [key: string]: Json | undefined;
}

/**
 * Base class for every expected domain failure. Route handlers never map raw
 * exceptions; they map DomainError instances (or fall back to 500).
 */
export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details?: ErrorDetails;

  constructor(code: ErrorCode, httpStatus: number, message: string, details?: ErrorDetails) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = "Authentication is required") {
    super("UNAUTHENTICATED", 401, message);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "You are not allowed to perform this action") {
    super("FORBIDDEN", 403, message);
  }
}

export class ValidationError extends DomainError {
  constructor(message = "The request is invalid", details?: ErrorDetails) {
    super("VALIDATION_FAILED", 400, message, details);
  }
}

export class ResourceNotFoundError extends DomainError {
  constructor(entityType: string, entityId?: string) {
    super(
      "NOT_FOUND",
      404,
      entityId ? `${entityType} "${entityId}" was not found` : `${entityType} was not found`,
    );
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, details?: ErrorDetails) {
    super("CONFLICT", 409, message, details);
  }
}

export class IdempotencyConflictError extends DomainError {
  constructor(message = "This idempotency key was already used with a different request payload") {
    super("IDEMPOTENCY_CONFLICT", 422, message);
  }
}

export class InvalidStateTransitionError extends DomainError {
  constructor(input: { machine: string; from: string; action: string }) {
    super("INVALID_STATE_TRANSITION", 409, `Illegal ${input.action} while in ${input.from}`, {
      machine: input.machine,
      from: input.from,
      action: input.action,
    });
  }
}

export class InsufficientCapacityError extends DomainError {
  constructor(remainingCapacity: number) {
    super("INSUFFICIENT_CAPACITY", 409, "Not enough remaining capacity to join this group", {
      remainingCapacity,
    });
  }
}

export class BookingOverlapError extends DomainError {
  constructor(message = "The selected time is no longer available") {
    super("BOOKING_OVERLAP", 409, message);
  }
}

export class PaymentStateError extends DomainError {
  constructor(message: string, details?: ErrorDetails) {
    super("PAYMENT_STATE", 409, message, details);
  }
}

export class RefundStateError extends DomainError {
  constructor(message: string, details?: ErrorDetails) {
    super("REFUND_STATE", 409, message, details);
  }
}

export class CancellationStateError extends DomainError {
  constructor(message: string, details?: ErrorDetails) {
    super("CANCELLATION_STATE", 409, message, details);
  }
}

export class DisputeStateError extends DomainError {
  constructor(message: string, details?: ErrorDetails) {
    super("DISPUTE_STATE", 409, message, details);
  }
}

export class RateLimitedError extends DomainError {
  constructor(retryAfterSeconds: number) {
    super("RATE_LIMITED", 429, "Too many requests. Please slow down and try again.", {
      retryAfterSeconds,
    });
  }
}

export class InternalError extends DomainError {
  constructor(message = "An unexpected error occurred") {
    super("INTERNAL", 500, message);
  }
}

/** The payment provider rejected or could not be reached (§82). */
export class PaymentProviderError extends DomainError {
  constructor(message: string, details?: ErrorDetails) {
    super("PROVIDER_ERROR", 502, message, details);
  }
}

/** A required deployment configuration is missing or invalid (§72). */
export class ConfigurationError extends DomainError {
  constructor(message: string) {
    super("CONFIGURATION", 503, message);
  }
}
