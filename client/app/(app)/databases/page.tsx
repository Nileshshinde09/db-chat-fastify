"use client"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  ArrowRight,
  Check,
  Database,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Table2,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import AddDatabase, { type FormState } from "@/components/add-database"

import {
  ConnectionApiError,
  createConnection,
  listConnections,
  testSavedConnection,
  type ConnectionOptions,
  type CreateConnectionInput,
  type DbConnection,
  type DbType,
} from "@/lib/api/connections/connections"

// ─── Presentation helpers ────────────────────────────────────────────────────

const TYPE_LABEL: Record<DbType, string> = {
  postgres: "PostgreSQL",
  cockroachdb: "CockroachDB",
  mysql: "MySQL",
  mariadb: "MariaDB",
  mongodb: "MongoDB",
  mssql: "SQL Server",
  oracle: "Oracle",
  redis: "Redis",
}

const TYPE_ACCENT: Record<DbType, string> = {
  postgres: "bg-blue-600",
  cockroachdb: "bg-indigo-600",
  mysql: "bg-orange-600",
  mariadb: "bg-teal-600",
  mongodb: "bg-green-600",
  mssql: "bg-sky-600",
  oracle: "bg-red-600",
  redis: "bg-rose-600",
}

type AddDatabaseValues = {
  name: string
  type: DbType
  host: string
  database: string
  username: string
  password: string
  ssl: boolean
  readOnly: boolean
  options: Record<string, unknown>
  description?: string
  port?: number
}

function statusMeta(status: DbConnection["lastTestStatus"]) {
  if (status === "ok") {
    return { label: "Connected", dot: "bg-emerald-500" }
  }
  if (status === "failed") {
    return { label: "Failed", dot: "bg-red-500" }
  }
  return { label: "Untested", dot: "bg-muted-foreground/40" }
}

function formatLastTested(at: Date | null): string {
  if (!at) return "Never tested"
  return `Tested ${at.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DatabasesPage() {
  const router = useRouter()

  const [connections, setConnections] = useState<DbConnection[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)

  const loadConnections = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await listConnections()
      setConnections(list)
      setSelected((prev) => prev ?? list[0]?.id ?? null)
    } catch (err) {
      setError(
        err instanceof ConnectionApiError
          ? err.message
          : "Could not load your database connections."
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadConnections()
  }, [loadConnections])

  const filteredConnections = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return connections
    return connections.filter((c) =>
      `${c.name} ${c.type} ${c.database} ${c.description ?? ""}`
        .toLowerCase()
        .includes(q)
    )
  }, [connections, query])

  function continueToChat(id: string) {
    setSelected(id)
    router.push(`/chat?connectionId=${encodeURIComponent(id)}`)
  }

  async function addDatabaseHandler(value: AddDatabaseValues) {
    const input: CreateConnectionInput = {
      name: value.name,
      type: value.type,
      host: value.host,
      database: value.database,
      username: value.username,
      password: value.password,
      ssl: value.ssl,
      readOnly: value.readOnly,
      description: value.description,
      port: value.port,
      // Backend enforces: primitive values, ≤10 keys, key regex /^[A-Za-z][A-Za-z0-9_]{0,39}$/.
      // Widening from `unknown` to the typed union is safe here.
      options: value.options as ConnectionOptions,
    }

    const created = await createConnection(input)
    setConnections((prev) =>
      [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
    )
    setSelected(created.id)
  }

  async function reTest(id: string) {
    setTestingId(id)
    try {
      const result = await testSavedConnection(id)
      // Backend persists lastTest* alongside the response — re-fetch to sync.
      setConnections((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                lastTestStatus: result.ok ? "ok" : "failed",
                lastTestedAt: new Date(),
                lastTestMessage: result.message ?? null,
              }
            : c
        )
      )
    } catch (err) {
      const message =
        err instanceof ConnectionApiError ? err.message : "Test failed"
      setError(message)
    } finally {
      setTestingId(null)
    }
  }

  return (
    <AppShell
      title="Database workspaces"
      description="Choose the data source for your next conversation"
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <Badge variant="secondary" className="mb-3 gap-1.5">
              <Database className="size-3.5" />
              Chat data sources
            </Badge>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Where do you want to ask questions?
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Select a connected database workspace. Your next chat will use its
              schema and read-only permissions.
            </p>
          </div>
          <AddDatabase onSubmit={addDatabaseHandler}>
            <Button>
              <Plus data-icon="inline-start" />
              Connect database
            </Button>
          </AddDatabase>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            <span className="flex items-center gap-2">
              <AlertCircle className="size-4" />
              {error}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void loadConnections()}
            >
              <RefreshCw className="size-3.5" />
              Retry
            </Button>
          </div>
        )}

        <Card>
          <CardHeader className="gap-4 border-b sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">
                Your database connections
              </CardTitle>
              <CardDescription>
                {loading
                  ? "Loading connections…"
                  : `${connections.length} connected source${connections.length === 1 ? "" : "s"} available to your workspace`}
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search connections"
                aria-label="Search database connections"
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 p-4 lg:grid-cols-3 lg:p-6">
            {loading ? (
              <div className="col-span-full flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading connections…
              </div>
            ) : filteredConnections.length === 0 ? (
              <div className="col-span-full flex flex-col items-center gap-3 py-12 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                  <Database className="size-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {connections.length === 0
                      ? "No connections yet"
                      : "No connections match your search"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {connections.length === 0
                      ? "Connect your first database to start asking questions."
                      : "Try a different search term."}
                  </p>
                </div>
              </div>
            ) : (
              filteredConnections.map((conn) => {
                const isSelected = selected === conn.id
                const status = statusMeta(conn.lastTestStatus)
                const isTesting = testingId === conn.id
                return (
                  <div
                    key={conn.id}
                    onClick={() => setSelected(conn.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        setSelected(conn.id)
                      }
                    }}
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={0}
                    className={`group flex h-full flex-col rounded-xl border p-4 text-left transition-all hover:border-primary/50 hover:shadow-sm ${
                      isSelected
                        ? "border-primary bg-primary/[0.04] ring-1 ring-primary/20"
                        : "bg-background"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className={`flex size-10 items-center justify-center rounded-xl text-white ${TYPE_ACCENT[conn.type]}`}
                      >
                        <Database className="size-5" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="gap-1.5 text-[11px]"
                        >
                          <span
                            className={`size-1.5 rounded-full ${status.dot}`}
                          />
                          {status.label}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={(event) => {
                            event.stopPropagation()
                            void reTest(conn.id)
                          }}
                          disabled={isTesting}
                          aria-label="Test connection"
                          title="Test connection"
                        >
                          {isTesting ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="size-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{conn.name}</h3>
                        {isSelected && (
                          <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="size-3.5" />
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {conn.description ?? "No description"}
                      </p>
                    </div>

                    <Separator className="my-4" />

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Table2 className="size-3.5" />
                        {conn.database}
                      </span>
                      <span>{TYPE_LABEL[conn.type]}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{conn.readOnly ? "Read-only" : "Read-write"}</span>
                      <span>{formatLastTested(conn.lastTestedAt)}</span>
                    </div>

                    <Button
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      className="mt-5 w-full"
                      onClick={(event) => {
                        event.stopPropagation()
                        continueToChat(conn.id)
                      }}
                    >
                      {isSelected ? "Open database chat" : "Use this database"}
                      <ArrowRight data-icon="inline-end" />
                    </Button>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4 rounded-xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">Read-only by default</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Database Chat can inspect schema and run safe queries, but it
                cannot modify your data.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/security")}
          >
            Review security
          </Button>
        </div>
      </div>
    </AppShell>
  )
}
