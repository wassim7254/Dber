import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import {
  professionalProfiles,
  rentalProviderProfiles,
  sellerProfiles,
  users,
} from "@/db/schema";
import type { Tx, DbExecutor } from "@/db/tx";
import { recordAudit } from "@/infrastructure/audit/writer";
import type { Identity } from "@/lib/auth/types";
import { ResourceNotFoundError } from "@/lib/errors";
import type { JsonObject } from "@/types/json";

/**
 * Provider profiles (§5). Each workspace owns its profile shape; creation is
 * implicit on first save so providers are never blocked by a required wizard
 * before they can work.
 */

export interface SellerProfileInput {
  storeName?: string;
  description?: string;
  contactEmail?: string;
  contactPhone?: string;
  city?: string;
  country?: string;
  deliveryInfo?: string;
  pickupInfo?: string;
  payoutHandle?: string;
}

export interface ProfessionalProfileInput {
  headline?: string;
  bio?: string;
  specialties?: string[];
  serviceArea?: string;
  yearsExperience?: number;
  languages?: string[];
  serviceMode?: string;
  payoutHandle?: string;
}

export interface RentalProviderProfileInput {
  businessName?: string;
  description?: string;
  city?: string;
  country?: string;
  rentalPolicies?: string;
  payoutHandle?: string;
}

export async function getSellerProfile(executor: DbExecutor = db, userId: string) {
  const [row] = await executor.select().from(sellerProfiles).where(eq(sellerProfiles.userId, userId)).limit(1);
  return row ?? null;
}

export async function getProfessionalProfile(executor: DbExecutor = db, userId: string) {
  const [row] = await executor
    .select()
    .from(professionalProfiles)
    .where(eq(professionalProfiles.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function getRentalProviderProfile(executor: DbExecutor = db, userId: string) {
  const [row] = await executor
    .select()
    .from(rentalProviderProfiles)
    .where(eq(rentalProviderProfiles.userId, userId))
    .limit(1);
  return row ?? null;
}

/** Public professional card enrichment (name + profile). */
export async function getProfessionalPublicProfile(executor: DbExecutor, professionalId: string) {
  const [row] = await executor
    .select({
      id: users.id,
      displayName: users.displayName,
      role: users.role,
      headline: professionalProfiles.headline,
      bio: professionalProfiles.bio,
      specialties: professionalProfiles.specialties,
      serviceArea: professionalProfiles.serviceArea,
      yearsExperience: professionalProfiles.yearsExperience,
      languages: professionalProfiles.languages,
      verificationStatus: professionalProfiles.verificationStatus,
    })
    .from(users)
    .leftJoin(professionalProfiles, eq(professionalProfiles.userId, users.id))
    .where(eq(users.id, professionalId))
    .limit(1);
  return row ?? null;
}

export async function updateSellerProfile(tx: Tx, identity: Identity, input: SellerProfileInput) {
  const existing = await getSellerProfile(tx, identity.userId);
  const values = {
    userId: identity.userId,
    storeName: input.storeName ?? existing?.storeName ?? identity.role,
    description: input.description ?? existing?.description ?? "",
    contactEmail: input.contactEmail ?? existing?.contactEmail ?? null,
    contactPhone: input.contactPhone ?? existing?.contactPhone ?? null,
    city: input.city ?? existing?.city ?? "",
    country: input.country ?? existing?.country ?? "MA",
    deliveryInfo: input.deliveryInfo ?? existing?.deliveryInfo ?? "",
    pickupInfo: input.pickupInfo ?? existing?.pickupInfo ?? "",
    payoutHandle: input.payoutHandle ?? existing?.payoutHandle ?? "",
    updatedAt: new Date(),
  };
  await tx
    .insert(sellerProfiles)
    .values(values)
    .onConflictDoUpdate({ target: sellerProfiles.userId, set: values });
  await recordAudit(tx, {
    actorId: identity.userId,
    actorRole: identity.role,
    action: "seller.profile.updated",
    entityType: "user",
    entityId: identity.userId,
    after: input as JsonObject,
  });
  return getSellerProfile(tx, identity.userId);
}

export async function updateProfessionalProfile(tx: Tx, identity: Identity, input: ProfessionalProfileInput) {
  const existing = await getProfessionalProfile(tx, identity.userId);
  const values = {
    userId: identity.userId,
    headline: input.headline ?? existing?.headline ?? "",
    bio: input.bio ?? existing?.bio ?? "",
    specialties: input.specialties ?? existing?.specialties ?? [],
    serviceArea: input.serviceArea ?? existing?.serviceArea ?? "",
    yearsExperience: input.yearsExperience ?? existing?.yearsExperience ?? null,
    languages: input.languages ?? existing?.languages ?? [],
    serviceMode: input.serviceMode ?? existing?.serviceMode ?? "both",
    payoutHandle: input.payoutHandle ?? existing?.payoutHandle ?? "",
    updatedAt: new Date(),
  };
  await tx
    .insert(professionalProfiles)
    .values(values)
    .onConflictDoUpdate({ target: professionalProfiles.userId, set: values });
  await recordAudit(tx, {
    actorId: identity.userId,
    actorRole: identity.role,
    action: "professional.profile.updated",
    entityType: "user",
    entityId: identity.userId,
    after: input as JsonObject,
  });
  return getProfessionalProfile(tx, identity.userId);
}

export async function updateRentalProviderProfile(
  tx: Tx,
  identity: Identity,
  input: RentalProviderProfileInput,
) {
  const existing = await getRentalProviderProfile(tx, identity.userId);
  if (!existing && !input.businessName) {
    throw new ResourceNotFoundError("Rental provider profile");
  }
  const values = {
    userId: identity.userId,
    businessName: input.businessName ?? existing?.businessName ?? "",
    description: input.description ?? existing?.description ?? "",
    city: input.city ?? existing?.city ?? "",
    country: input.country ?? existing?.country ?? "MA",
    rentalPolicies: input.rentalPolicies ?? existing?.rentalPolicies ?? "",
    payoutHandle: input.payoutHandle ?? existing?.payoutHandle ?? "",
    updatedAt: new Date(),
  };
  await tx
    .insert(rentalProviderProfiles)
    .values(values)
    .onConflictDoUpdate({ target: rentalProviderProfiles.userId, set: values });
  await recordAudit(tx, {
    actorId: identity.userId,
    actorRole: identity.role,
    action: "rental_provider.profile.updated",
    entityType: "user",
    entityId: identity.userId,
    after: input as JsonObject,
  });
  return getRentalProviderProfile(tx, identity.userId);
}
