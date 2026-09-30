import { z } from "zod";

/** Self-service registration roles. ops_admin/admin are never self-assigned. */
export const registrableRoleSchema = z.enum(["buyer", "seller", "professional", "rental_owner"]);

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128)
  .regex(/[a-zA-Z]/, "Include at least one letter")
  .regex(/[0-9]/, "Include at least one number");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(200);

export const registerSchema = z
  .object({
    displayName: z.string().trim().min(2, "Enter your name").max(80),
    email: emailSchema,
    password: passwordSchema,
    /** Single role (legacy clients). Ignored when `roles` is provided. */
    role: registrableRoleSchema.default("buyer"),
    /** Multi-role selection (§1/§2): shopping is implicit; provider roles are explicit. */
    roles: z.array(registrableRoleSchema).max(4).optional(),
    /** Optional profile context collected at registration (§4 minimum set). */
    country: z.string().trim().max(60).optional(),
    phone: z.string().trim().max(30).optional(),
  })
  .transform((input) => {
    const selected = input.roles?.length ? Array.from(new Set(input.roles)) : [input.role];
    // Everyone shops (buyer is implicit); the active context starts at the first provider role.
    const entitlements = Array.from(new Set(["buyer" as const, ...selected]));
    const activeRole = (selected.find((role) => role !== "buyer") ?? "buyer") as z.infer<typeof registrableRoleSchema>;
    return { ...input, entitlements, activeRole };
  });

/** Switching the active workspace context — validated against user_roles server-side. */
export const switchRoleSchema = z.object({
  role: registrableRoleSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(128),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(10).max(200),
  password: passwordSchema,
});

export const verifyEmailSchema = z.object({ token: z.string().min(10).max(200) });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

export const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().max(30).optional(),
  country: z.string().trim().max(60).optional(),
  city: z.string().trim().max(120).optional(),
  locale: z.enum(["en", "fr", "ar"]).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export const sellerProfileSchema = z.object({
  storeName: z.string().trim().min(2).max(120).optional(),
  description: z.string().max(5000).default(""),
  contactEmail: z.string().trim().toLowerCase().email().max(200).optional().or(z.literal("")),
  contactPhone: z.string().trim().max(30).optional().or(z.literal("")),
  city: z.string().trim().max(120).default(""),
  country: z.string().trim().max(60).default("MA"),
  deliveryInfo: z.string().max(2000).default(""),
  pickupInfo: z.string().max(2000).default(""),
  payoutHandle: z.string().max(120).default(""),
});
