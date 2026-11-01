export const DEFAULT_PORTS: Record<DbType, number> = {
  postgres: 5432,
  mysql: 3306,
  mariadb: 3306,
  mssql: 1433,
  mongodb: 27017,
}

export const DB_TYPES = [
  "postgres",
  "mysql",
  "mariadb",
  "mssql",
  "mongodb",
] as const
export type DbType = (typeof DB_TYPES)[number]
