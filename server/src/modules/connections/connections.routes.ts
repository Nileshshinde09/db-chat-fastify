import type { FastifyInstance } from "fastify";
import { idParamSchema } from "../invites/invites.schemas";
import {
  createConnectionSchema,
  testConnectionSchema,
  updateConnectionSchema,
} from "./connections.schemas";
import * as service from "./connections.service";

const testLimit = {
  config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
};

export default async function connectionRoutes(app: FastifyInstance) {
  const anyUser = { preHandler: [app.authenticate] };
  const manage = {
    preHandler: [app.authenticate, app.authorize("owner", "admin")],
  };

  // Everyone in the org can list and use connections (members see a reduced view).
  app.get("/", anyUser, async (req) => {
    const connections = await service.listConnections(req.user.orgId);
    return {
      connections: connections.map((c) =>
        service.toPublicConnection(c, req.user.role),
      ),
    };
  });

  app.get("/:id", anyUser, async (req) => {
    const { id } = idParamSchema.parse(req.params);
    const conn = await service.getConnection(req.user.orgId, id);
    return { connection: service.toPublicConnection(conn, req.user.role) };
  });

  app.get("/:id/schema", anyUser, async (req) => {
    const { id } = idParamSchema.parse(req.params);
    return service.getConnectionSchema(app, req.user.orgId, id);
  });

  // Only owner/admin can create, change, delete or test connections.
  app.post("/", manage, async (req, reply) => {
    const input = createConnectionSchema.parse(req.body);
    const conn = await service.createConnection(req.user, input);
    return reply
      .status(201)
      .send({ connection: service.toPublicConnection(conn, req.user.role) });
  });

  app.post("/test", { ...manage, ...testLimit }, async (req) => {
    const input = testConnectionSchema.parse(req.body);
    return service.testUnsavedConnection(app, input);
  });

  app.patch("/:id", manage, async (req) => {
    const { id } = idParamSchema.parse(req.params);
    const patch = updateConnectionSchema.parse(req.body);
    const conn = await service.updateConnection(req.user, id, patch);
    return { connection: service.toPublicConnection(conn, req.user.role) };
  });

  app.delete("/:id", manage, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    await service.deleteConnection(req.user, id);
    return reply.status(204).send();
  });

  app.post("/:id/test", { ...manage, ...testLimit }, async (req) => {
    const { id } = idParamSchema.parse(req.params);
    return service.testSavedConnection(app, req.user.orgId, id);
  });
}
