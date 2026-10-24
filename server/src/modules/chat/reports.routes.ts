import type { FastifyInstance } from "fastify";
import { env } from "../../config/env";
import { z } from "zod";

export default async function reportRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };

  // Proxy to FastAPI to create a report
  app.post("/", auth, async (req, reply) => {
    const body = z.object({
      connectionId: z.string(),
      query: z.union([z.string(), z.record(z.unknown())]),
      format: z.enum(["csv", "xlsx"]),
      title: z.string().optional(),
    }).parse(req.body);

    const res = await fetch(`${env.LLM_SERVER_URL}/api/v1/reports`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": req.user.sub,
        "x-organization-id": req.user.orgId,
        "authorization": `Bearer ${env.LLM_SERVER_API_KEY}`, // internal auth
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return reply.code(res.status).send(err);
    }
    return reply.send(await res.json());
  });

  // Proxy for polling status
  app.get("/:id", auth, async (req, reply) => {
    const { id } = req.params as { id: string };
    const res = await fetch(`${env.LLM_SERVER_URL}/api/v1/reports/${id}`, {
      headers: {
        "x-user-id": req.user.sub,
        "x-organization-id": req.user.orgId,
        "authorization": `Bearer ${env.LLM_SERVER_API_KEY}`,
      },
    });
    return reply.code(res.status).send(await res.json());
  });

  // Proxy for download
  app.get("/:id/download", auth, async (req, reply) => {
    const { id } = req.params as { id: string };
    const res = await fetch(`${env.LLM_SERVER_URL}/api/v1/reports/${id}/download`, {
      headers: {
        "x-user-id": req.user.sub,
        "x-organization-id": req.user.orgId,
        "authorization": `Bearer ${env.LLM_SERVER_API_KEY}`,
      },
    });

    if (!res.ok) return reply.code(res.status).send(await res.json());
    
    reply.header("content-type", res.headers.get("content-type"));
    reply.header("content-disposition", res.headers.get("content-disposition"));
    return reply.send(res.body); // stream the file
  });
}