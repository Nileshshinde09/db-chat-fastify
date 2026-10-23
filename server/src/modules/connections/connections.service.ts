import type { FastifyInstance } from "fastify";
import { Types } from "mongoose";
import { Conversation } from "../../models/conversation.model";
import {
  DEFAULT_PORTS,
  DbConnection,
  type IDbConnection,
} from "../../models/db-connection.model";
import type { Role } from "../../models/user.model";
import type {
  ConnectionTestResult,
  LlmConnection,
} from "../../services/llm/types";
import { decryptJson, encryptJson } from "../../utils/crypto";
import { AppError, conflict, notFound } from "../../utils/errors";
import { assertHostAllowed } from "../../utils/host-guard";
import { llmErrorToAppError } from "../../utils/llm-errors";
import type {
  CreateConnectionInput,
  TestConnectionInput,
  UpdateConnectionInput,
} from "./connections.schemas";

export const MAX_CONNECTIONS_PER_ORG = 25;

export interface Actor {
  sub: string;
  orgId: string;
  role: Role;
}

/**
 * Members may use connections but only see what they need to pick one.
 * Hosts, ports and usernames are shown to owner/admin only. Passwords are never returned to anyone.
 */
export function toPublicConnection(c: IDbConnection, role: Role) {
  const base = {
    id: c._id.toString(),
    name: c.name,
    description: c.description ?? null,
    type: c.type,
    database: c.database,
    readOnly: c.readOnly,
    lastTestedAt: c.lastTestedAt ?? null,
    lastTestStatus: c.lastTestStatus ?? null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
  if (role === "owner" || role === "admin") {
    return {
      ...base,
      host: c.host,
      port: c.port,
      username: c.username,
      ssl: c.ssl,
      options: c.options ?? {},
      lastTestMessage: c.lastTestMessage ?? null,
    };
  }
  return base;
}

function isDuplicateKey(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === 11000
  );
}

const nameTaken = () =>
  conflict(
    "A connection with this name already exists",
    "CONNECTION_NAME_TAKEN",
  );

export async function listConnections(orgId: string) {
  return DbConnection.find({ orgId }).sort({ name: 1 });
}

export async function getConnection(orgId: string, id: string) {
  const conn = await DbConnection.findOne({ _id: id, orgId });
  if (!conn) throw notFound("Connection not found");
  return conn;
}

export async function createConnection(
  actor: Actor,
  input: CreateConnectionInput,
) {
  assertHostAllowed(input.host);

  if (
    (await DbConnection.countDocuments({ orgId: actor.orgId })) >=
    MAX_CONNECTIONS_PER_ORG
  ) {
    throw conflict(
      `An organization can have at most ${MAX_CONNECTIONS_PER_ORG} connections`,
      "CONNECTION_LIMIT",
    );
  }
  if (await DbConnection.exists({ orgId: actor.orgId, name: input.name }))
    throw nameTaken();

  try {
    return await DbConnection.create({
      orgId: actor.orgId,
      name: input.name,
      description: input.description,
      type: input.type,
      host: input.host,
      port: input.port ?? DEFAULT_PORTS[input.type],
      database: input.database,
      username: input.username,
      credentialsEnc: encryptJson({ password: input.password }),
      ssl: input.ssl,
      readOnly: input.readOnly,
      options: input.options,
      createdBy: actor.sub,
      updatedBy: actor.sub,
    });
  } catch (err) {
    if (isDuplicateKey(err)) throw nameTaken();
    throw err;
  }
}

export async function updateConnection(
  actor: Actor,
  id: string,
  patch: UpdateConnectionInput,
) {
  const conn = await DbConnection.findOne({
    _id: id,
    orgId: actor.orgId,
  }).select("+credentialsEnc");
  if (!conn) throw notFound("Connection not found");

  if (patch.host !== undefined) assertHostAllowed(patch.host);
  if (patch.name !== undefined && patch.name !== conn.name) {
    if (
      await DbConnection.exists({
        orgId: actor.orgId,
        name: patch.name,
        _id: { $ne: conn._id },
      })
    ) {
      throw nameTaken();
    }
  }

  const { password, ...rest } = patch;
  conn.set(rest);
  if (password !== undefined) conn.credentialsEnc = encryptJson({ password });
  conn.updatedBy = new Types.ObjectId(actor.sub);

  // A previous "tested OK" says nothing about changed connection details.
  const affectsConnectivity = [
    "type",
    "host",
    "port",
    "database",
    "username",
    "ssl",
    "options",
    "password",
  ].some((k) => k in patch);
  if (affectsConnectivity) {
    conn.lastTestedAt = undefined;
    conn.lastTestStatus = undefined;
    conn.lastTestMessage = undefined;
  }

  try {
    await conn.save();
  } catch (err) {
    if (isDuplicateKey(err)) throw nameTaken();
    throw err;
  }
  return conn;
}

export async function deleteConnection(
  actor: Actor,
  id: string,
): Promise<void> {
  const res = await DbConnection.deleteOne({ _id: id, orgId: actor.orgId });
  if (res.deletedCount === 0) throw notFound("Connection not found");
  // Chats keep their history; they just lose their active database (connectionName stays as a label).
  await Conversation.updateMany(
    { orgId: actor.orgId, connectionId: id },
    { connectionId: null },
  );
}

/** Loads a connection WITH its decrypted password. Only for handing to the LLM server. */
export async function loadForLlm(
  orgId: string,
  id: string,
): Promise<LlmConnection> {
  const conn = await DbConnection.findOne({ _id: id, orgId }).select(
    "+credentialsEnc",
  );
  if (!conn) throw notFound("Connection not found");
  let password = "";
  try {
    password = conn.credentialsEnc
      ? decryptJson<{ password: string }>(conn.credentialsEnc).password
      : "";
  } catch {
    throw new AppError(
      422,
      "CREDENTIALS_UNREADABLE",
      "The saved credentials cannot be decrypted. Edit the connection and re-enter the password.",
    );
  }
  return {
    id: conn._id.toString(),
    name: conn.name,
    type: conn.type,
    host: conn.host,
    port: conn.port,
    database: conn.database,
    username: conn.username,
    password,
    ssl: conn.ssl,
    options: conn.options ?? {},
  };
}

export async function testSavedConnection(
  app: FastifyInstance,
  orgId: string,
  id: string,
): Promise<ConnectionTestResult> {
  const { id: _id, name: _name, ...conn } = await loadForLlm(orgId, id);
  let result: ConnectionTestResult;
  try {
    result = await app.llm.testConnection(conn);
  } catch (err) {
    result = { ok: false, message: llmErrorToAppError(err).message };
  }
  await DbConnection.updateOne(
    { _id: id, orgId },
    {
      lastTestedAt: new Date(),
      lastTestStatus: result.ok ? "ok" : "failed",
      lastTestMessage: (result.message ?? "").slice(0, 300),
    },
  );
  return result;
}

export async function testUnsavedConnection(
  app: FastifyInstance,
  input: TestConnectionInput,
): Promise<ConnectionTestResult> {
  assertHostAllowed(input.host);
  try {
    return await app.llm.testConnection({
      type: input.type,
      host: input.host,
      port: input.port ?? DEFAULT_PORTS[input.type],
      database: input.database,
      username: input.username,
      password: input.password,
      ssl: input.ssl,
      options: input.options,
    });
  } catch (err) {
    return { ok: false, message: llmErrorToAppError(err).message };
  }
}

export async function getConnectionSchema(
  app: FastifyInstance,
  orgId: string,
  id: string,
) {
  const { id: _id, name: _name, ...conn } = await loadForLlm(orgId, id);
  try {
    return await app.llm.getSchema(conn);
  } catch (err) {
    throw llmErrorToAppError(err);
  }
}
