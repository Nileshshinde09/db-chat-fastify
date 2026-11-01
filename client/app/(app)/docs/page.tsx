"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Book,
  Check,
  ChevronRight,
  Copy,
  Database,
  FileSpreadsheet,
  MessageSquare,
  Search,
  Settings,
  Terminal,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"

// ── Mock Data for Navigation ──────────────────────────────────────────────────
const sidebarNav = [
  {
    title: "Getting Started",
    icon: Book,
    items: [
      { title: "Introduction", active: true },
      { title: "Quickstart Guide" },
      { title: "System Architecture" },
    ],
  },
  {
    title: "Connections",
    icon: Database,
    items: [
      { title: "Connecting a Database" },
      { title: "Supported Dialects" },
      { title: "Security & Encryption" },
    ],
  },
  {
    title: "Chat Interface",
    icon: MessageSquare,
    items: [
      { title: "Asking Questions" },
      { title: "Contextual Memory" },
      { title: "Handling Errors" },
    ],
  },
  {
    title: "Reports",
    icon: FileSpreadsheet,
    items: [{ title: "Generating CSV/Excel" }, { title: "Report API" }],
  },
]

// ── Reusable Code Block Component ─────────────────────────────────────────────
function CodeBlock({
  code,
  language = "bash",
}: {
  code: string
  language?: string
}) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative mt-4 rounded-lg border border-zinc-800 bg-zinc-900 font-mono text-sm">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <span className="text-xs text-zinc-400">{language}</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-zinc-400 hover:text-white"
          onClick={copy}
        >
          {copied ? (
            <Check className="size-3.5 text-emerald-500" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </Button>
      </div>
      <div className="overflow-x-auto p-4 text-zinc-300">
        <pre>
          <code>{code}</code>
        </pre>
      </div>
    </div>
  )
}

// ── Main Page Component ───────────────────────────────────────────────────────
export default function DocsPage() {
  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-50 selection:bg-primary/30">
      {/* ── LEFT SIDEBAR (Navigation) ────────────────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-zinc-800 bg-zinc-950/95 backdrop-blur md:flex">
        <div className="flex h-16 items-center border-b border-zinc-800 px-6">
          <Link
            href="/"
            className="flex items-center gap-2 font-bold tracking-tight text-white"
          >
            <Terminal className="size-5 text-primary" />
            DB_Chat Docs
          </Link>
        </div>

        <ScrollArea className="flex-1 px-4 py-6">
          <div className="relative mb-6">
            <Search className="absolute top-2.5 left-2.5 size-4 text-zinc-500" />
            <Input
              type="search"
              placeholder="Search docs..."
              className="h-9 w-full border-zinc-800 bg-zinc-900 pl-9 text-sm text-zinc-300 placeholder:text-zinc-500 focus-visible:ring-primary"
            />
          </div>

          <nav className="flex flex-col gap-6">
            {sidebarNav.map((section) => (
              <div key={section.title}>
                <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
                  <section.icon className="size-3.5" />
                  {section.title}
                </h4>
                <ul className="flex flex-col gap-1">
                  {section.items.map((item) => (
                    <li key={item.title}>
                      <Link
                        href="#"
                        className={`block rounded-md px-3 py-1.5 text-sm transition-colors ${
                          item.active
                            ? "bg-primary/10 font-medium text-primary"
                            : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                        }`}
                      >
                        {item.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </ScrollArea>
      </aside>

      {/* ── MAIN CONTENT AREA ────────────────────────────────────────────── */}
      <main className="flex-1 md:pl-64">
        <div className="mx-auto max-w-4xl px-6 py-12 md:px-12 md:py-16">
          {/* Breadcrumbs */}
          <div className="mb-8 flex items-center gap-2 text-sm text-zinc-400">
            <span>Docs</span>
            <ChevronRight className="size-4" />
            <span>Getting Started</span>
            <ChevronRight className="size-4" />
            <span className="text-zinc-100">Introduction</span>
          </div>

          {/* Article Header */}
          <div className="mb-10">
            <Badge
              variant="outline"
              className="mb-4 border-primary/30 bg-primary/10 text-primary"
            >
              Getting Started
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight text-white md:text-5xl">
              Introduction to DB_Chat
            </h1>
            <p className="mt-4 text-lg text-zinc-400">
              Welcome to the future of database management. DB_Chat allows you
              to chat with your PostgreSQL, MySQL, and MongoDB databases using
              plain English, and export the results instantly.
            </p>
          </div>

          <Separator className="my-8 bg-zinc-800" />

          {/* Article Body */}
          <div className="prose prose-invert prose-headings:text-white prose-p:text-zinc-400 prose-a:text-primary prose-strong:text-zinc-200 max-w-none">
            <h2 className="text-2xl font-semibold" id="how-it-works">
              How it works
            </h2>
            <p>
              DB_Chat uses an Agentic RAG (Retrieval-Augmented Generation)
              pipeline. When you ask a question, our system:
            </p>
            <ul>
              <li>
                <strong>Retrieves</strong> the relevant schema from your
                connected database.
              </li>
              <li>
                <strong>Generates</strong> a read-only SQL or MongoDB query
                using a locally hosted LLM (via Ollama).
              </li>
              <li>
                <strong>Validates</strong> the query to ensure it is strictly
                read-only and safe from SQL injection.
              </li>
              <li>
                <strong>Executes</strong> the query and returns the formatted
                results directly in your chat window.
              </li>
            </ul>

            {/* Callout Box */}
            <div className="my-6 rounded-lg border-l-4 border-primary bg-primary/5 p-4">
              <div className="flex items-start gap-3">
                <Settings className="mt-0.5 size-5 text-primary" />
                <div>
                  <h4 className="m-0 text-sm font-semibold text-primary">
                    Privacy First
                  </h4>
                  <p className="m-0 mt-1 text-sm text-zinc-400">
                    Your data never leaves your infrastructure. The AI models
                    run entirely locally on your own servers.
                  </p>
                </div>
              </div>
            </div>

            <h2 className="mt-10 text-2xl font-semibold" id="quickstart">
              Quickstart API
            </h2>
            <p>
              If you prefer to interact with our API directly, you can send a
              POST request to the chat endpoint. Make sure to include your JWT
              and the active connection ID.
            </p>

            <CodeBlock
              language="bash"
              code={`curl -X POST http://localhost:3000/api/v1/conversations/123/messages \\
  -H "Authorization: Bearer <your_jwt_token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "content": "Show me the top 5 customers by revenue",
    "reportId": "optional_report_id"
  }'`}
            />

            <h3 className="mt-8 text-xl font-semibold">Response Format</h3>
            <p>
              The API returns a stream of Server-Sent Events (SSE). You will
              receive <code>delta</code> events for the text, <code>block</code>{" "}
              events for tables/charts, and a final <code>done</code> event
              containing the complete message object.
            </p>
          </div>

          {/* Footer Navigation */}
          <div className="mt-16 flex items-center justify-between border-t border-zinc-800 pt-8">
            <Button
              variant="ghost"
              className="text-zinc-400 hover:text-white"
              disabled
            >
              <ChevronRight className="mr-2 size-4 rotate-180" />
              Previous
            </Button>
            <Button variant="ghost" className="text-zinc-400 hover:text-white">
              Quickstart Guide
              <ChevronRight className="ml-2 size-4" />
            </Button>
          </div>
        </div>
      </main>

      {/* ── RIGHT SIDEBAR (Table of Contents) ────────────────────────────── */}
      <aside className="fixed inset-y-0 right-0 z-20 hidden w-64 flex-col border-l border-zinc-800 bg-zinc-950/95 py-10 xl:flex">
        <h4 className="mb-4 px-6 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
          On this page
        </h4>
        <ul className="flex flex-col gap-3 px-6 text-sm">
          <li>
            <a
              href="#how-it-works"
              className="text-zinc-400 transition-colors hover:text-white"
            >
              How it works
            </a>
          </li>
          <li>
            <a
              href="#quickstart"
              className="text-zinc-400 transition-colors hover:text-white"
            >
              Quickstart API
            </a>
          </li>
        </ul>
      </aside>
    </div>
  )
}
