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

    // --- Database connections & chat ---
    // 32 random bytes, base64. Encrypts stored database passwords (AES-256-GCM).
    ENCRYPTION_KEY: z
      .string()
      .refine(
        (v) => Buffer.from(v, "base64").length === 32,
        "ENCRYPTION_KEY must be 32 bytes, base64-encoded",
      ),
    // Signs the short-lived download URLs handed to the LLM server for uploaded files.
    FILE_SIGNING_SECRET: z
      .string()
      .min(32, "FILE_SIGNING_SECRET must be at least 32 characters"),

    // "mock" = built-in fake LLM (development/tests), "http" = the FastAPI LLM server.
    LLM_SERVER_MODE: z.enum(["mock", "http"]).default("http"),
    LLM_SERVER_URL: z.string().url().optional().default("http://127.0.0.1:8000"),
    LLM_SERVER_API_KEY: z.string().min(16).optional().default(""),
    LLM_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
    // How the LLM server reaches THIS service to download uploaded files.
    INTERNAL_BASE_URL: z.string().url().default("http://localhost:3000"),

    UPLOAD_DIR: z.string().default("./uploads"),
    MAX_UPLOAD_MB: z.coerce.number().positive().default(10),
    CHAT_HISTORY_LIMIT: z.coerce.number().int().positive().default(20),
    CHAT_ROW_LIMIT: z.coerce.number().int().positive().default(1000),
    CHAT_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
    UPLOAD_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
    // Rejects localhost / private IP literals when users add database connections.
    BLOCK_PRIVATE_HOSTS: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
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
