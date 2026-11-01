"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog, DialogClose, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { DB_TYPES, DEFAULT_PORTS } from "@/lib/db"
import {
  createConnectionSchema,
  type CreateConnection,
} from "@/lib/schemas/connection"

type DbType = (typeof DB_TYPES)[number]

// Form state mirrors the schema but keeps `port` as a string for the input.
export type FormState = {
  name: string
  description: string
  type: DbType
  host: string
  port: string
  database: string
  username: string
  password: string
  ssl: boolean
  readOnly: boolean
}

const EMPTY: FormState = {
  name: "",
  description: "",
  type: "postgres",
  host: "localhost",
  port: String(DEFAULT_PORTS.postgres ?? ""),
  database: "",
  username: "",
  password: "",
  ssl: false,
  readOnly: true,
}

type Props = {
  children: React.ReactElement
  onSubmit?: (value: CreateConnection) => void | Promise<void>
}

export default function AddDatabase({ children, onSubmit }: Props) {
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState<FormState>(EMPTY)
  const [errors, setErrors] = React.useState<
    Partial<Record<keyof CreateConnection, string[]>>
  >({})
  const [submitting, setSubmitting] = React.useState(false)

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleTypeChange = (next: string | null) => {
    if (!next) return
    const type = next as DbType
    const def = DEFAULT_PORTS[type]
    setForm((prev) => ({ ...prev, type, port: def == null ? "" : String(def) }))
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setForm(EMPTY)
      setErrors({})
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrors({})

    // Build a payload with *exactly* the schema's keys — no more, no less,
    // because the schema is .strict().
    const candidate = {
      name: form.name,
      description: form.description.trim() || undefined, // "" → omitted
      type: form.type,
      host: form.host,
      port: form.port.trim() ? Number(form.port) : undefined, // "" → omitted
      database: form.database,
      username: form.username,
      password: form.password,
      ssl: form.ssl,
      readOnly: form.readOnly,
      options: {}, // no UI yet; server default is {}
    }

    const parsed = createConnectionSchema.safeParse(candidate)
    if (!parsed.success) {
      setErrors(parsed.error.flatten().fieldErrors)
      return
    }

    setSubmitting(true)
    try {
      await onSubmit?.(parsed.data) // defaults (username '', ssl false, …) applied
      setOpen(false)
      setForm(EMPTY)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={children} />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>Add database</DialogTitle>
            <DialogDescription>
              Connect a new database to your workspace.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field>
              <Label htmlFor="conn-name">Name</Label>
              <Input
                id="conn-name"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Production database"
              />
              {errors.name?.[0] && (
                <p className="text-xs text-destructive">{errors.name[0]}</p>
              )}
            </Field>

            <Field>
              <Label htmlFor="conn-description">Description</Label>
              <Textarea
                id="conn-description"
                rows={2}
                placeholder="Optional"
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
              />
            </Field>

            <Field>
              <Label htmlFor="conn-type">Type</Label>
              <Select value={form.type} onValueChange={handleTypeChange}>
                <SelectTrigger id="conn-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="postgres">PostgreSQL</SelectItem>
                  <SelectItem value="mysql">MySQL</SelectItem>
                  <SelectItem value="mariadb">MariaDB</SelectItem>
                  <SelectItem value="mssql">SQL Server</SelectItem>
                  <SelectItem value="mongodb">MongoDB</SelectItem>
                  <SelectItem value="sqlite3">SQLite</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <div className="grid grid-cols-[1fr_120px] gap-2">
              <Field>
                <Label htmlFor="conn-host">Host</Label>
                <Input
                  id="conn-host"
                  value={form.host}
                  onChange={(e) => update("host", e.target.value)}
                />
                {errors.host?.[0] && (
                  <p className="text-xs text-destructive">{errors.host[0]}</p>
                )}
              </Field>
              <Field>
                <Label htmlFor="conn-port">Port</Label>
                <Input
                  id="conn-port"
                  inputMode="numeric"
                  value={form.port}
                  onChange={(e) => update("port", e.target.value)}
                />
                {errors.port?.[0] && (
                  <p className="text-xs text-destructive">{errors.port[0]}</p>
                )}
              </Field>
            </div>

            <Field>
              <Label htmlFor="conn-database">Database</Label>
              <Input
                id="conn-database"
                value={form.database}
                onChange={(e) => update("database", e.target.value)}
              />
              {errors.database?.[0] && (
                <p className="text-xs text-destructive">{errors.database[0]}</p>
              )}
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field>
                <Label htmlFor="conn-username">Username</Label>
                <Input
                  id="conn-username"
                  autoComplete="off"
                  value={form.username}
                  onChange={(e) => update("username", e.target.value)}
                />
              </Field>
              <Field>
                <Label htmlFor="conn-password">Password</Label>
                <Input
                  id="conn-password"
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                />
              </Field>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="conn-ssl">SSL</Label>
                <p className="text-xs text-muted-foreground">
                  Use TLS when connecting
                </p>
              </div>
              <Switch
                id="conn-ssl"
                checked={form.ssl}
                onCheckedChange={(v) => update("ssl", v)}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="conn-readonly">Read only</Label>
                <p className="text-xs text-muted-foreground">
                  Block write queries in chats
                </p>
              </div>
              <Switch
                id="conn-readonly"
                checked={form.readOnly}
                onCheckedChange={(v) => update("readOnly", v)}
              />
            </div>
          </FieldGroup>

          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              }
            />
            <Button type="submit" disabled={submitting}>
              {submitting ? "Adding…" : "Add database"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}