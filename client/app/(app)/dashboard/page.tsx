import Link from "next/link"
import {
  Activity,
  ArrowUpRight,
  Database,
  FileSpreadsheet,
  Link2,
  MessageSquare,
  Plus,
  Sparkles,
  Table2,
  Users,
} from "lucide-react"
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
import { demoOrganization, demoUser } from "@/lib/types"

export default function DashboardPage() {
  return (
    <AppShell title="Overview" description="Your workspace at a glance">
      <div className="flex flex-col gap-8">
        
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm text-muted-foreground">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight">
              Good morning, {demoUser.name.split(' ')[0]}
            </h2>
            <p className="mt-2 text-muted-foreground">
              Here&apos;s what&apos;s happening in {demoOrganization.name}.
            </p>
          </div>
          
          <Button asChild>
            <Link href="/chat">
              <Plus className="mr-2 size-4" />
              New conversation
            </Link>
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardDescription>Conversations</CardDescription>
              <MessageSquare className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">12</p>
              <p className="mt-1 text-xs text-muted-foreground">
                <span className="text-emerald-600">+4</span> from last week
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardDescription>Active Connections</CardDescription>
              <Database className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">2</p>
              <p className="mt-1 text-xs text-muted-foreground">
                PostgreSQL, MongoDB
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardDescription>Reports Exported</CardDescription>
              <FileSpreadsheet className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">45</p>
              <p className="mt-1 text-xs text-muted-foreground">
                CSV & Excel files generated
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Call to Action: Connect Database */}
        <Card className="overflow-hidden border-primary/20 bg-primary/[0.03]">
          <CardContent className="flex flex-col items-start justify-between gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
            <div className="flex gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Link2 className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">Connect a new database</h3>
                  {/* 🟢 Removed "Coming soon" Badge */}
                  <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20">Ready</Badge>
                </div>
                <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                  Link PostgreSQL, MySQL, or MongoDB and start chatting with your data using Agentic AI.
                </p>
              </div>
            </div>
            <Button asChild variant="default">
              <Link href="/connections">
                Add Connection <ArrowUpRight className="ml-2 size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Bottom Grid: Activity & Promo */}
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent activity</CardTitle>
              <CardDescription>Updates from your workspace</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="flex items-start gap-3">
                <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                  <Activity className="size-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm">
                    <span className="font-medium">{demoUser.name}</span> exported the <span className="font-medium">Q3 Revenue</span> report
                  </p>
                  <p className="text-xs text-muted-foreground">2 hours ago</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                  <Database className="size-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm">
                    Connected a new <span className="font-medium">MongoDB</span> database
                  </p>
                  <p className="text-xs text-muted-foreground">1 day ago</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                  <Users className="size-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm">
                    <span className="font-medium">Jamie Chen</span> joined the team
                  </p>
                  <p className="text-xs text-muted-foreground">6 days ago</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Promo Card changed to highlight Report Exporting */}
          <Card className="bg-primary text-primary-foreground">
            <CardHeader>
              <Sparkles className="mb-2 size-5" />
              <CardTitle className="text-base">Export anything instantly</CardTitle>
              <CardDescription className="text-primary-foreground/70">
                Chat with your database and download the results as clean CSV or Excel files with one click.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="secondary" size="sm">
                <Link href="/chat">Try it now</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  )
}