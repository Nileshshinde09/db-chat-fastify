import "dotenv/config";
import { z } from "zod";

const schema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    // Explicit region marker — independent of NODE_ENV so dev-only
    // features can be gated without TS narrowing conflicts.
    REGION: z.enum(["dev", "staging", "prod"]).default("dev"),

    PORT: z.coerce.number().int().positive().default(3000),
    HOST: z.string().default("0.0.0.0"),

    MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),

    // No default — must be provided explicitly in dev, forbidden in prod.
    DB_CLEAN_PASSWORD: z.string().min(8).optional(),

    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    ACCESS_TOKEN_TTL: z.string().default("15m"),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
    INVITE_TTL_HOURS: z.coerce.number().int().positive().default(72),

    TWO_FACTOR_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),

    CORS_ORIGIN: z.string().default("http://localhost:3000"),
    APP_URL: z.string().default("http://localhost:3000"),
  })
  .superRefine((val, ctx) => {
    // Prod must never ship the dev-clean password.
    if (val.NODE_ENV === "production" && val.DB_CLEAN_PASSWORD) {
      ctx.addIssue({
        code: "custom",
        path: ["DB_CLEAN_PASSWORD"],
        message: "DB_CLEAN_PASSWORD must not be set in production",
      });
    }

    // Dev/staging dev-clean route needs a password if it will be enabled.
    if (
      val.NODE_ENV !== "production" &&
      val.REGION === "dev" &&
      !val.DB_CLEAN_PASSWORD
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["DB_CLEAN_PASSWORD"],
        message: "DB_CLEAN_PASSWORD is required when REGION=dev",
      });
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;

// Derived flags — single source of truth for guards.
export const isProd = env.NODE_ENV === "production";
export const isDev = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";

// The dev-only DB-clean route should exist iff:
//   - we're not in prod, AND
//   - we're explicitly in the dev region.
// Combined into one boolean so route registration & handler both use it
// and can never disagree.
export const devToolsEnabled =
  !isProd && env.REGION === "dev" && Boolean(env.DB_CLEAN_PASSWORD);