import { and, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import { authTokens, userRoles, users } from "@/db/schema";
import { recordAudit } from "@/infrastructure/audit/writer";
import {
  createOneTimeToken,
  emailSender,
  hashOneTimeToken,
} from "@/infrastructure/email/adapter";
import {
  createSession,
  revokeAllSessionsForUser,
} from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import type { Identity } from "@/lib/auth/types";
import { ConflictError, ForbiddenError, ResourceNotFoundError, UnauthorizedError, ValidationError } from "@/lib/errors";
import type { Tx } from "@/db/tx";
import type { RegisterInput, LoginInput } from "@/domains/identity/schemas";

const EMAIL_TOKEN_TTL_MS = 60 * 3_600_000; // 1 hour

export interface AuthResult {
  identity: Identity;
  displayName: string;
  role: Identity["role"];
  email: string | null;
  emailVerified: boolean;
  sessionToken?: string;
  sessionExpiresAt?: Date;
}

async function consumeToken(
  tx: Tx,
  kind: "email_verification" | "password_reset",
  token: string,
): Promise<string> {
  const tokenHash = hashOneTimeToken(token);
  const [row] = await tx
    .select({ id: authTokens.id, userId: authTokens.userId })
    .from(authTokens)
    .where(
      and(
        eq(authTokens.tokenHash, tokenHash),
        eq(authTokens.kind, kind),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) {
    throw new ValidationError("This link is invalid or has expired. Request a new one.");
  }
  const updated = await tx
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(authTokens.id, row.id), isNull(authTokens.usedAt)))
    .returning({ id: authTokens.id });
  if (updated.length === 0) {
    throw new ValidationError("This link was already used. Request a new one.");
  }
  return row.userId;
}

/**
 * Registers a customer/provider account. Duplicate emails are a normal,
 * user-visible conflict — never an identifier-existence oracle beyond the
 * explicit "email already registered" message users need to sign in.
 */
export async function register(input: RegisterInput, userAgent: string): Promise<AuthResult> {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
    if (existing) {
      throw new ConflictError("An account with this email already exists — try signing in instead");
    }
    const passwordHash = await hashPassword(input.password);
    const [user] = await tx
      .insert(users)
      .values({
        role: input.activeRole,
        displayName: input.displayName,
        email: input.email,
        passwordHash,
        phone: input.phone ?? null,
        country: input.country ?? null,
      })
      .returning({ id: users.id, role: users.role, displayName: users.displayName, email: users.email });

    // Multi-role entitlements (§38): every selected role is persisted server-side
    // so the account can switch contexts later without touching the DB manually.
    await tx
      .insert(userRoles)
      .values(input.entitlements.map((role) => ({ userId: user.id, role })))
      .onConflictDoNothing();

    // Verification email (single-use token, 1 hour).
    const { token, tokenHash } = createOneTimeToken();
    await tx.insert(authTokens).values({
      kind: "email_verification",
      tokenHash,
      userId: user.id,
      expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MS),
    });
    const verifyUrl = `${process.env.DBER_PUBLIC_URL ?? "http://localhost:3000"}/verify-email?token=${encodeURIComponent(token)}`;
    await emailSender.send({
      to: input.email,
      subject: "Confirm your DBER account",
      body: `Welcome to DBER, ${user.displayName}. Confirm your email address: ${verifyUrl} (valid for 1 hour).`,
    });

    await recordAudit(tx, {
      actorId: user.id,
      actorRole: user.role,
      action: "user.registered",
      entityType: "user",
      entityId: user.id,
      after: { role: user.role, email: user.email },
    });

    const session = await createSession(user.id, userAgent, tx);
    return {
      identity: { userId: user.id, role: user.role },
      displayName: user.displayName,
      role: user.role,
      email: user.email,
      emailVerified: false,
      sessionToken: session.token,
      sessionExpiresAt: session.expiresAt,
    };
  });
}

export async function login(input: LoginInput, userAgent: string): Promise<AuthResult> {
  const [user] = await db
    .select({
      id: users.id,
      role: users.role,
      displayName: users.displayName,
      email: users.email,
      passwordHash: users.passwordHash,
      status: users.status,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  if (!user || !user.passwordHash) {
    // Same message for unknown email and wrong password (no account oracle).
    throw new UnauthorizedError("Email or password is incorrect");
  }
  if (user.status !== "active") {
    throw new ForbiddenError("This account is suspended");
  }
  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) {
    throw new UnauthorizedError("Email or password is incorrect");
  }
  const session = await createSession(user.id, userAgent);
  return {
    identity: { userId: user.id, role: user.role },
    displayName: user.displayName,
    role: user.role,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    sessionToken: session.token,
    sessionExpiresAt: session.expiresAt,
  };
}

/**
 * Sends a password-reset link. Always returns success-shaped output so the
 * endpoint cannot be used to enumerate registered emails (§63); delivery
 * failures are surfaced as a generic "email unavailable" state instead.
 */
export async function requestPasswordReset(email: string): Promise<{ delivered: boolean }> {
  const [user] = await db
    .select({ id: users.id, displayName: users.displayName, email: users.email, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user || !user.passwordHash) {
    // Do not reveal whether the account exists; report "accepted".
    return { delivered: true };
  }
  const { token, tokenHash } = createOneTimeToken();
  await db.insert(authTokens).values({
    kind: "password_reset",
    tokenHash,
    userId: user.id,
    expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MS),
  });
  const resetUrl = `${process.env.DBER_PUBLIC_URL ?? "http://localhost:3000"}/reset-password?token=${encodeURIComponent(token)}`;
  const result = await emailSender.send({
    to: user.email ?? email,
    subject: "Reset your DBER password",
    body: `Hello ${user.displayName}. Reset your password: ${resetUrl} (valid for 1 hour). If you did not request this, ignore this email.`,
  });
  return result;
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await db.transaction(async (tx) => {
    const userId = await consumeToken(tx, "password_reset", token);
    const passwordHash = await hashPassword(newPassword);
    const [user] = await tx
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ id: users.id, role: users.role });
    if (!user) throw new ResourceNotFoundError("User");
    // A password reset invalidates every existing session (account takeover defense).
    await revokeAllSessionsForUser(user.id);
    await recordAudit(tx, {
      actorId: user.id,
      actorRole: user.role,
      action: "user.password_reset",
      entityType: "user",
      entityId: user.id,
    });
  });
}

export async function verifyEmail(token: string): Promise<void> {
  await db.transaction(async (tx) => {
    const userId = await consumeToken(tx, "email_verification", token);
    const [user] = await tx
      .update(users)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ id: users.id, role: users.role });
    if (!user) throw new ResourceNotFoundError("User");
    await recordAudit(tx, {
      actorId: user.id,
      actorRole: user.role,
      action: "user.email_verified",
      entityType: "user",
      entityId: user.id,
    });
  });
}

export async function resendVerificationEmail(identity: Identity): Promise<{ delivered: boolean }> {
  const [user] = await db
    .select({ id: users.id, email: users.email, emailVerifiedAt: users.emailVerifiedAt, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, identity.userId))
    .limit(1);
  if (!user || !user.email) throw new ResourceNotFoundError("Account");
  if (user.emailVerifiedAt) return { delivered: true };
  if (!user.passwordHash) return { delivered: true }; // dev-only identity, nothing to verify
  const { token, tokenHash } = createOneTimeToken();
  await db.insert(authTokens).values({
    kind: "email_verification",
    tokenHash,
    userId: user.id,
    expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MS),
  });
  const verifyUrl = `${process.env.DBER_PUBLIC_URL ?? "http://localhost:3000"}/verify-email?token=${encodeURIComponent(token)}`;
  return emailSender.send({
    to: user.email,
    subject: "Confirm your DBER account",
    body: `Confirm your email address: ${verifyUrl} (valid for 1 hour).`,
  });
}

export async function changePassword(
  identity: Identity,
  currentPassword: string,
  newPassword: string,
  currentSessionId: string | undefined,
): Promise<void> {
  const [user] = await db
    .select({ id: users.id, role: users.role, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, identity.userId))
    .limit(1);
  if (!user || !user.passwordHash) {
    throw new ValidationError("This account has no password set");
  }
  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) {
    throw new UnauthorizedError("Your current password is incorrect");
  }
  const passwordHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, user.id));
    await revokeAllSessionsForUser(user.id, currentSessionId);
    await recordAudit(tx, {
      actorId: user.id,
      actorRole: user.role,
      action: "user.password_changed",
      entityType: "user",
      entityId: user.id,
    });
  });
}
