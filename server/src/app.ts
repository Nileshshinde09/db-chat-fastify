import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { devToolsEnabled, env, isProd } from "./config/env";
import authPlugin from "./plugins/auth";
import securityPlugin from "./plugins/security";
import authRoutes from "./modules/auth/auth.routes";
import inviteRoutes from "./modules/invites/invites.routes";
import userRoutes from "./modules/users/users.routes";
import { AppError } from "./utils/errors";
import devDbCleanRoutes from "./modules/dev/dbClean";
import connectionRoutes from "./modules/connections/connections.routes";
import conversationRoutes from "./modules/chat/conversations.routes";
import attachmentRoutes from "./modules/chat/attachments.routes";
import internalFileRoutes from "./modules/internal/files.routes";
import { createLlmClient } from "./services/llm";
import reportRoutes from "./modules/chat/reports.routes";

interface ErrorLike {
  statusCode?: number;
  code?: string | number;
  message?: string;
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      env.NODE_ENV === "test" ? false : { level: isProd ? "info" : "debug" },
    trustProxy: isProd, // set up properly if you run behind a load balancer
    bodyLimit: 100 * 1024,
  });

  // Error handlers must be set BEFORE registering route plugins: child
  // contexts copy the parent's handler at the moment they are created.
  app.setNotFoundHandler((_req, reply) => {
    reply
      .status(404)
      .send({ statusCode: 404, code: "NOT_FOUND", message: "Route not found" });
  });

  // One consistent error shape: { statusCode, code, message }
  app.setErrorHandler((error: unknown, req, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid request",
        issues: error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        code: error.code,
        message: error.message,
      });
    }

    const err = error as ErrorLike;

    if (err.code === 11000) {
      return reply.status(409).send({
        statusCode: 409,
        code: "CONFLICT",
        message: "A record with these details already exists",
      });
    }

    const statusCode =
      err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (statusCode >= 500) {
      req.log.error(error);
      return reply.status(500).send({
        statusCode: 500,
        code: "INTERNAL_ERROR",
        message: isProd
          ? "Something went wrong"
          : (err.message ?? "Internal error"),
      });
    }

    // Framework errors such as rate limiting (429), malformed JSON (400), etc.
    return reply.status(statusCode).send({
      statusCode,
      code: typeof err.code === "string" ? err.code : "ERROR",
      message: err.message ?? "Request failed",
    });
  });
  app.decorate("llm", createLlmClient());
  await app.register(securityPlugin);
  await app.register(authPlugin);
  await app.register(authRoutes, { prefix: "/api/v1/auth" });
  await app.register(inviteRoutes, { prefix: "/api/v1/auth/invites" });
  await app.register(userRoutes, { prefix: "/api/v1/auth/users" });
  if (devToolsEnabled) {
    await app.register(devDbCleanRoutes, { prefix: "/api/dev/db/clean" });
  }
  // Database connections, chat workspace and files
await app.register(reportRoutes, { prefix: "/api/v1/reports" });

  await app.register(connectionRoutes, { prefix: "/api/v1/connections" });
  await app.register(conversationRoutes, { prefix: "/api/v1/conversations" });
  await app.register(attachmentRoutes, { prefix: "/api/v1/attachments" });
  await app.register(internalFileRoutes, { prefix: "/api/v1/internal" });

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
