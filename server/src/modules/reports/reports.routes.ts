// src/modules/reports/reports.routes.ts
import type { FastifyInstance } from "fastify";
import { Readable } from "node:stream";
import { env } from "../../config/env";

export default async function reportRoutes(app: FastifyInstance) {
  const base = env.LLM_SERVER_URL;
  const internalAuth = `Bearer ${env.LLM_SERVER_API_KEY}`;

  app.post("/", async (req, reply) => {
    const body = req.body as { connectionId: string; query: string; format: "csv" | "xlsx"; title?: string; withSummary?: boolean };

    // Load + decrypt the connection
    const conn = await loadConnectionForLlm(req.user.orgId, body.connectionId);

    const res = await fetch(`${base}/v1/reports`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: internalAuth },
      body: JSON.stringify({
        connection: conn,
        connectionId: body.connectionId,
        orgId: req.user.orgId,
        userId: req.user.id,
        query: body.query,
        format: body.format,
        title: body.title ?? "report",
        withSummary: body.withSummary ?? false,
      }),
    });
    return reply.code(res.status).send(await res.json());
  });

  app.get("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const res = await fetch(`${base}/v1/reports/${id}`, {
      headers: { authorization: internalAuth },
    });
    const doc = await res.json();
    // Verify ownership before returning
    if (doc.orgId && doc.orgId !== req.user.orgId) return reply.code(404).send({});
    return reply.code(res.status).send(doc);
  });

  app.get("/:id/download", async (req, reply) => {
    const { id } = req.params as { id: string };
    const res = await fetch(`${base}/v1/reports/${id}/download`, {
      headers: { authorization: internalAuth },
    });
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => ({}));
      return reply.code(res.status).send(body);
    }
    const ct = res.headers.get("content-type");
    const cd = res.headers.get("content-disposition");
    if (ct) reply.header("content-type", ct);
    if (cd) reply.header("content-disposition", cd);
    return reply.send(Readable.fromWeb(res.body as any));
  });
}