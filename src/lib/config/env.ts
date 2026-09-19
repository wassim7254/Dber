import { config as loadEnvFile } from "dotenv";
import { z } from "zod";

// Outside Next.js (seeds, workers, tests) env files are not auto-loaded.
loadEnvFile({ path: ".env.local" });
loadEnvFile(); // .env fallback

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    DBER_ENV: z.enum(["development", "test", "production"]).default("development"),
    // Shared secret for the background-job tick endpoint. Required in production.
    DBER_JOBS_SECRET: z.string().min(16).optional(),
    // HMAC secret verifying payment-provider webhook signatures. Required in production.
    DBER_WEBHOOK_SECRET: z.string().min(16).optional(),
    // Payment provider selection (§19): "mock" (dev/test) or "stripe" (production adapter).
    DBER_PAYMENT_PROVIDER: z.enum(["mock", "stripe"]).default("mock"),
    STRIPE_SECRET_KEY: z.string().min(20).optional(),
    STRIPE_WEBHOOK_SECRET: z.string().min(16).optional(),
    // Public origin used in emails and provider redirect URLs.
    DBER_PUBLIC_URL: z.string().url().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.DBER_ENV === "production") {
      if (!value.DBER_JOBS_SECRET) {
        ctx.addIssue({ code: "custom", message: "DBER_JOBS_SECRET is required in production" });
      }
      if (!value.DBER_WEBHOOK_SECRET) {
        ctx.addIssue({ code: "custom", message: "DBER_WEBHOOK_SECRET is required in production" });
      }
      if (!value.DBER_PUBLIC_URL) {
        ctx.addIssue({ code: "custom", message: "DBER_PUBLIC_URL is required in production" });
      }
      if (value.DBER_PAYMENT_PROVIDER === "mock") {
        ctx.addIssue({
          code: "custom",
          message: "DBER_PAYMENT_PROVIDER must be a real provider in production (mock is dev/test only)",
        });
      }
      if (value.DBER_PAYMENT_PROVIDER === "stripe") {
        if (!value.STRIPE_SECRET_KEY) {
          ctx.addIssue({ code: "custom", message: "STRIPE_SECRET_KEY is required when DBER_PAYMENT_PROVIDER=stripe" });
        }
        if (!value.STRIPE_WEBHOOK_SECRET) {
          ctx.addIssue({ code: "custom", message: "STRIPE_WEBHOOK_SECRET is required when DBER_PAYMENT_PROVIDER=stripe" });
        }
      }
    }
  });

const parsedEnv = envSchema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  DBER_ENV: process.env.DBER_ENV,
  DBER_JOBS_SECRET: process.env.DBER_JOBS_SECRET,
  DBER_WEBHOOK_SECRET: process.env.DBER_WEBHOOK_SECRET,
  DBER_PAYMENT_PROVIDER: process.env.DBER_PAYMENT_PROVIDER,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  DBER_PUBLIC_URL: process.env.DBER_PUBLIC_URL,
});

if (!parsedEnv.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsedEnv.error.issues) {
    console.error(`  - ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  throw new Error("Invalid environment configuration");
}

export const env = parsedEnv.data;
export const isProduction = env.DBER_ENV === "production";
export const isDevelopment = env.DBER_ENV === "development";
