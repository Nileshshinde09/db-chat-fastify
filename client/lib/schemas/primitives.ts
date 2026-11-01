import { z } from "zod"

/**
 * Hostname, IP address (v4/v6), or unix-socket path.
 * Accepts: "localhost", "db.internal", "10.0.0.5", "::1", "/var/run/postgresql"
 * Rejects: empty strings, anything containing whitespace, and full URLs like
 * "postgres://host" (the form/driver expects a bare host).
 */
export const host = z
  .string({ error: "Host is required" })
  .trim()
  .min(1, "Host is required")
  .max(255, "Host is too long")
  .refine((v) => !/\s/.test(v), "Host must not contain whitespace")
  .refine(
    (v) => !/^[a-z][a-z0-9+.-]*:\/\//i.test(v),
    "Host must not include a scheme (e.g. postgres://)",
  )

/**
 * TCP port. Coerces from string so both JSON bodies (`5432`) and form
 * payloads (`"5432"`) validate. `NaN`, `0`, and out-of-range values fail.
 */
export const port = z.coerce
  .number({ error: "Port must be a number" })
  .int("Port must be a whole number")
  .min(1, "Port must be between 1 and 65535")
  .max(65535, "Port must be between 1 and 65535")

/**
 * Free-form driver/connection options (e.g. `{ sslmode: "require" }`).
 * No default here — the caller applies `.default({})` so the base schema
 * stays reusable for PATCH-style partials.
 */
export const options = z.record(z.string(), z.unknown())