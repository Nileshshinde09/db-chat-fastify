import { Schema, model, type Types } from "mongoose";

export const DB_TYPES = [
  "postgres",
  "mysql",
  "mariadb",
  "mssql",
  "mongodb"
] as const;
export type DbType = (typeof DB_TYPES)[number];

export const DEFAULT_PORTS: Record<DbType, number> = {
  postgres: 5432,
  mysql: 3306,
  mariadb: 3306,
  mssql: 1433,
  mongodb: 27017
};

export interface IDbConnection {
  _id: Types.ObjectId;
  orgId: Types.ObjectId;
  name: string;
  description?: string;
  type: DbType;
  host: string;
  port: number;
  database: string;
  username: string;
  /** AES-256-GCM payload of { password }. Never leaves the server except to the LLM server. */
  credentialsEnc?: string;
  ssl: boolean;
  /** Tells the LLM server to run in read-only mode (strongly recommended). */
  readOnly: boolean;
  /** Non-secret driver options, e.g. { authSource: "admin" }. */
  options: Record<string, string | number | boolean>;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  lastTestedAt?: Date;
  lastTestStatus?: "ok" | "failed";
  lastTestMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const dbConnectionSchema = new Schema<IDbConnection>(
  {
    orgId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    type: { type: String, enum: DB_TYPES, required: true },
    host: { type: String, required: true, trim: true },
    port: { type: Number, required: true },
    database: { type: String, required: true, trim: true },
    username: { type: String, default: "" },
    credentialsEnc: { type: String, select: false },
    ssl: { type: Boolean, default: false },
    readOnly: { type: Boolean, default: true },
    options: { type: Schema.Types.Mixed, default: {} },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    lastTestedAt: { type: Date },
    lastTestStatus: { type: String, enum: ["ok", "failed"] },
    lastTestMessage: { type: String },
  },
  { timestamps: true },
);

// Connection names are unique inside an organization.
dbConnectionSchema.index({ orgId: 1, name: 1 }, { unique: true });

export const DbConnection = model<IDbConnection>(
  "DbConnection",
  dbConnectionSchema,
);
