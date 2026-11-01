"use client"

import Link from "next/link"

import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Lock,
  MessageSquare,
  ShieldCheck,
  Zap,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

const features = [
  {
    title: "Natural Language Chat",
    description:
      "Stop writing complex SQL or MongoDB aggregations. Ask questions in plain English and let our Agentic AI do the heavy lifting.",
    icon: MessageSquare,
  },
  {
    title: "Multi-Database Support",
    description:
      "Connect seamlessly to PostgreSQL, MySQL, MariaDB, MSSQL, and MongoDB. One unified interface for your entire data stack.",
    icon: Database,
  },
  {
    title: "Instant Report Generation",
    description:
      "Generate perfectly formatted CSV or Excel reports from your chat results with a single click. No more copy-pasting.",
    icon: FileSpreadsheet,
  },
  {
    title: "Contextual Memory",
    description:
      "Our AI remembers your previous queries. Say 'only show active users' or 'sort by date' and it understands exactly what you mean.",
    icon: BrainCircuit,
  },
  {
    title: "Privacy First",
    description:
      "Powered by local open-source models via Ollama. Your database credentials and sensitive data never leave your infrastructure.",
    icon: Lock,
  },
  {
    title: "Secure by Design",
    description:
      "Built-in SSRF protection, read-only execution modes, and strict multi-tenant isolation ensure your data stays safe.",
    icon: ShieldCheck,
  },
]

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 selection:bg-primary/30">
      {/* ── Hero Section ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-24 pb-16 md:pt-32 md:pb-24">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-800/40 via-zinc-950 to-zinc-950" />

        <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-4 text-center md:px-6">
          <Badge
            variant="outline"
            className="mb-6 border-zinc-700 bg-zinc-900/50 text-zinc-300"
          >
            <Zap className="mr-2 size-3.5" />
            Powered by Agentic RAG
          </Badge>

          <h1 className="text-4xl font-bold tracking-tight text-white drop-shadow-md md:text-6xl lg:text-7xl">
            Talk to your data. <br className="hidden md:block" /> Export it
            instantly.
          </h1>

          <p className="mt-6 max-w-2xl text-base text-zinc-400 md:text-lg">
            Stop writing complex queries. Chat naturally with your databases,
            let our AI generate the code, and download your results as CSV or
            Excel files in seconds.
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              {/* 🟢 Navigates to Chat Dashboard */}
              <Button
                asChild
                size="lg"
                className="h-12 px-8 text-base font-semibold"
              >
                <Link href="/dashboard">
                  Start Chatting
                </Link>
              </Button>

              {/* 🟢 Navigates to Documentation */}
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 border-zinc-700 bg-transparent px-8 text-base text-zinc-300 hover:bg-zinc-800 hover:text-white"
              >
                <Link href="/docs">View Documentation</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature Grid ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-16 md:px-6 md:py-24">
        <div className="mb-16 flex flex-col items-center text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
            Everything you need to master your data
          </h2>
          <p className="mt-4 max-w-2xl text-zinc-400">
            Built for modern data teams. No SQL knowledge required. Just ask,
            analyze, and export.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card
              key={feature.title}
              className="border-zinc-800 bg-zinc-900/50 transition-colors hover:bg-zinc-900"
            >
              <CardHeader>
                <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-zinc-800 text-primary">
                  <feature.icon className="size-6" />
                </div>
                <CardTitle className="text-xl text-white">
                  {feature.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base leading-relaxed text-zinc-400">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Separator className="mx-auto max-w-5xl bg-zinc-800" />

      {/* ── How it Works ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-16 md:px-6 md:py-24">
        <div className="mb-16 flex flex-col items-center text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
            How it works
          </h2>
          <p className="mt-4 max-w-2xl text-zinc-400">
            Get from raw database to downloadable report in three simple steps.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {[
            {
              step: "01",
              title: "Connect",
              desc: "Securely link your PostgreSQL, MySQL, or MongoDB database.",
            },
            {
              step: "02",
              title: "Chat",
              desc: "Ask questions like 'Show me Q3 revenue by customer'.",
            },
            {
              step: "03",
              title: "Export",
              desc: "One click to download your results as a clean CSV or Excel file.",
            },
          ].map((item, i) => (
            <div
              key={i}
              className="relative flex flex-col items-center text-center"
            >
              <div className="mb-4 flex size-16 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-2xl font-bold text-primary">
                {item.step}
              </div>
              <h3 className="text-xl font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-zinc-400">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA Section ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 pb-24 md:px-6">
        <div className="flex flex-col items-center rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 px-6 py-16 text-center md:px-16">
          <CheckCircle2 className="mb-6 size-12 text-primary" />
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
            Ready to talk to your database?
          </h2>
          <p className="mt-4 max-w-xl text-zinc-400">
            Join the teams who have replaced complex SQL editors with a simple,
            secure chat interface.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" className="h-12 px-8 text-base font-semibold">
              Create Free Account
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 border-zinc-700 px-8 text-base"
            >
              Book a Demo
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
