export const USER_ROLES = ["buyer", "seller", "professional", "ops_admin", "admin"] as const;

export type Role = (typeof USER_ROLES)[number];

export type PrivilegedRole = "ops_admin" | "admin";

export interface Identity {
  readonly userId: string;
  readonly role: Role;
}
