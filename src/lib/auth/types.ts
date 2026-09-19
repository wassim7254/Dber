export const USER_ROLES = ["buyer", "seller", "professional", "rental_owner", "ops_admin", "admin"] as const;

/** Marketplace participant roles a user can hold simultaneously (§38). */
export const PARTICIPANT_ROLES = ["buyer", "seller", "professional", "rental_owner"] as const;

export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];

export type Role = (typeof USER_ROLES)[number];

export type PrivilegedRole = "ops_admin" | "admin";

export interface Identity {
  readonly userId: string;
  readonly role: Role;
}
