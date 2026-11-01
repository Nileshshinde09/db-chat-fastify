"use client"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  BarChart3,
  ChevronDown,
  Database,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  Zap,
  MessageSquare,
} from "lucide-react"
import { useEffect, useState } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  initials,
  demoUser,
  canManageTeam,
  type Organization,
  User,
} from "@/lib/types"
import { cn } from "@/lib/utils"
import { useAuthStore } from "@/stores/useAuthStore"
import { logout } from "@/lib/api/auth/auth"

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  // { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/databases", label: "Databases", icon: Database },
  { href: "/team", label: "Team", icon: Users, team: true },
  { href: "/security", label: "Security", icon: ShieldCheck },
]

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const { user } = useAuthStore.getState()
  return (
    <nav className="flex flex-col gap-1 px-3 py-4">
      {nav
        .filter((item) => !item.team || canManageTeam(user?.role!))
        .map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                pathname === item.href &&
                  "bg-sidebar-accent text-sidebar-primary"
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          )
        })}
    </nav>
  )
}
function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-3 px-5 py-5">
      <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <Database className="size-4" />
      </span>
      <span className="text-sm font-semibold tracking-tight">
        Database Chat
      </span>
    </Link>
  )
}

function UserMenu() {
  const router = useRouter()
  const [dark, setDark] = useState(false)
  const [userData, setUserData] = useState<User>()
  const { user } = useAuthStore.getState()
  useEffect(() => {
    ;(async () => {
      if (user) setUserData(user as User)
    })()
  }, [user])
  const handleLogout = async () => {
    await logout()
    router.push("/login")
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto gap-3 px-2 py-1.5">
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary/10 text-xs text-primary">
              {user?.name ? initials(user.name) : null}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-left sm:block">
            <span className="block text-sm leading-tight font-medium">
              {user?.name}
            </span>
            <span className="block text-xs text-muted-foreground">
              {user?.email}
            </span>
          </span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="px-2 py-1.5">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">{user?.name}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {user?.email}
            </span>
            <Badge variant="secondary" className="mt-1 w-fit">
              Owner
            </Badge>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            setDark(!dark)
            document.documentElement.classList.toggle("dark")
          }}
        >
          <Moon className="mr-2 size-4" />
          Toggle theme
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/security")}>
          <Settings className="mr-2 size-4" />
          Account settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="text-destructive">
          <LogOut className="mr-2 size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppShell({
  children,
  title,
  description,
}: {
  children: React.ReactNode
  title: string
  description?: string
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [organizationData, setOrganizationData] = useState<Organization>()
  const { organization } = useAuthStore.getState()
  useEffect(() => {
    ;(async () => {
      if (organization) setOrganizationData(organization as Organization)
    })()
  }, [organization])
  return (
    <div className="min-h-screen bg-muted/20">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r bg-sidebar lg:block">
        <Brand />
        <div className="px-5">
          <div className="rounded-xl border bg-background/70 p-3">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Zap className="size-3.5" />
              </span>
              <div>
                <p className="text-xs font-semibold">
                  {organizationData?.name} Labs
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Pro workspace
                </p>
              </div>
            </div>
          </div>
        </div>
        <NavContent />
        {/* <div className="absolute inset-x-0 bottom-0">
          <Separator />
          <div className="flex items-center gap-3 p-4">
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary/10 text-xs text-primary">
                {initials(demoUser.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{demoUser.name}</p>
              <p className="text-xs text-muted-foreground">{demoUser.role}</p>
            </div>
          </div>
        </div> */}
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/85 px-4 backdrop-blur-md sm:px-8">
          <div className="flex items-center gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger
                render={
                  <Button variant="ghost" size="icon" className="lg:hidden">
                    <Menu className="size-5" />
                  </Button>
                }
              />
              <SheetContent side="left" className="w-72 p-0">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <Brand />
                <NavContent onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
            <div>
              <h1 className="text-sm font-semibold sm:text-base">{title}</h1>
              {description && (
                <p className="hidden text-xs text-muted-foreground sm:block">
                  {description}
                </p>
              )}
            </div>
          </div>
          <UserMenu />
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-8">{children}</main>
      </div>
    </div>
  )
}

export function LogoMark() {
  return (
    <div className="flex items-center justify-center gap-3">
      <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <Database className="size-5" />
      </span>
      <span className="text-lg font-semibold tracking-tight">
        Database Chat
      </span>
    </div>
  )
}
