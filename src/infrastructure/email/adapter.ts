import { createHash, randomBytes } from "node:crypto";

import { logger } from "@/infrastructure/logging/logger";
import { isProduction } from "@/lib/config/env";

/**
 * Transactional email port (§79 honesty rule). The dev adapter writes the
 * message to structured logs and surfaces the one-time link in the API
 * response **only in development**. A production deployment must configure a
 * delivery provider; until then auth emails fail loudly instead of
 * pretending to be sent.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

export interface EmailSender {
  readonly name: string;
  send(message: EmailMessage): Promise<{ delivered: boolean }>;
}

class ConsoleEmailSender implements EmailSender {
  readonly name = "console";

  async send(message: EmailMessage): Promise<{ delivered: boolean }> {
    // Dev-only convenience: the log carries the actionable content so flows
    // are testable without an email provider.
    logger.info("email.console_delivery", { to: message.to, subject: message.subject, body: message.body });
    return { delivered: true };
  }
}

class UnconfiguredEmailSender implements EmailSender {
  readonly name = "unconfigured";

  async send(_message: EmailMessage): Promise<{ delivered: boolean }> {
    // Honest behavior (§79): no fake "email sent" claim. The caller surfaces
    // a configuration-required state to the user instead.
    logger.error("email.not_configured", { subject: _message.subject });
    return { delivered: false };
  }
}

export const emailSender: EmailSender = isProduction
  ? new UnconfiguredEmailSender()
  : new ConsoleEmailSender();

/** Creates a single-use URL-safe token; only its SHA-256 is persisted. */
export function createOneTimeToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

export function hashOneTimeToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
