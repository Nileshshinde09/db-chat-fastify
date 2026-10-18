import type { FastifyInstance } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { env, devToolsEnabled} from "../../config/env"
import { cleanDb } from "../../utils/cleanDb";

const eq = (a: string, b: string) => {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
};

export default async function devDbCleanRoutes(app: FastifyInstance) {
  app.post<{
    Body: { password: string; preserve?: string[]; hard?: boolean };
  }>(
    "",
    {
      schema: {
        body: {
          type: "object",
          required: ["password"],
          additionalProperties: false,
          properties: {
            password: { type: "string", minLength: 1 },
            preserve: { type: "array", items: { type: "string" } },
            hard: { type: "boolean" },
          },
        },
      },
    },
    async (req, reply) => {
      // Second-layer guard — same flag, single condition, no && chains.
      if (!devToolsEnabled) {
        return reply.code(404).send({ message: "Not found" });
      }

      // Safe: devToolsEnabled guarantees DB_CLEAN_PASSWORD is present.
      if (!eq(req.body.password, env.DB_CLEAN_PASSWORD!)) {
        req.log.warn({ ip: req.ip }, "db-clean: bad password");
        return reply.code(401).send({ message: "Unauthorized" });
      }

      const result = await cleanDb({
        preserve: req.body.preserve,
        hard: req.body.hard,
      });

      req.log.warn({ ...result, ip: req.ip }, "db-clean executed");
      return reply.send({ ok: true, ...result });
    },
  );
}