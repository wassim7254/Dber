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
  })
  .superRefine((value, ctx) => {
    if (value.DBER_ENV === "production") {
      if (!value.DBER_JOBS_SECRET) {
        ctx.addIssue({ code: "custom", message: "DBER_JOBS_SECRET is required in production" });
      }
      if (!value.DBER_WEBHOOK_SECRET) {
        ctx.addIssue({ code: "custom", message: "DBER_WEBHOOK_SECRET is required in production" });
      }
    }
  });

const parsedEnv = envSchema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  DBER_ENV: process.env.DBER_ENV,
  DBER_JOBS_SECRET: process.env.DBER_JOBS_SECRET,
  DBER_WEBHOOK_SECRET: process.env.DBER_WEBHOOK_SECRET,
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
