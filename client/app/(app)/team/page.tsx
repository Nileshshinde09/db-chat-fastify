"use client"
import { useEffect, useState, useCallback, useRef } from "react"
import {
  Check,
  LinkIcon,
  MoreHorizontal,
  Plus,
  Shield,
  UserCheck,
  UserX,
  Users,
} from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { useRouter } from "next/navigation"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import {
  Invite,
  type CreateInviteResponse,
} from "@/lib/api/invites/invites.types"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { initials, relativeTime, roleLabel } from "@/lib/types"
import { createInvite, listInvites } from "@/lib/api/invites/invites"
import { useAuthStore } from "@/stores/useAuthStore"

// 🟢 IMPORT THE NEW USER API SERVICES
import {
  listUsers,
  updateUserRole,
  updateUserStatus,
} from "@/lib/api/users/user"
import { type DbUser, type Role } from "@/lib/api/users/users.types"
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type InviteMemberDialogProps = {
  onInvited?: (result: CreateInviteResponse) => void | Promise<void>
}

/**
 * Displays a user's role.
 */
function RoleBadge({ role }: { role: Role }) {
  return (
    <Badge
      variant={
        role === "admin"
          ? "default"
          : role === "owner"
            ? "destructive"
            : "secondary"
      }
    >
      {roleLabel(role)}
    </Badge>
  )
}

/**
 * Default success behavior: notify the user and copy the invite link.
 */
export async function defaultOnInvited(
  result: CreateInviteResponse
): Promise<void> {
  toast.success(`Invitation sent to ${result.invite.email}`)
  if (!result.inviteLink) return
  try {
    await navigator.clipboard.writeText(result.inviteLink)
    toast.info("Invite link copied to clipboard")
  } catch {
    toast.info("Invite sent. Copy the link manually if needed.")
  }
}

export default function TeamPage({ onInvited }: InviteMemberDialogProps) {
  const [inviteOpen, setInviteOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<Role>("member")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 🟢 Change type from User[] to DbUser[]
  const [members, setMembers] = useState<DbUser[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [copied, setCopied] = useState(false)

  const { user } = useAuthStore.getState()
  const router = useRouter()

  // 🟢 Fetch real data from the new API
  useEffect(() => {
    ;(async () => {
      try {
        if (user && user.role === "member") {
          router.push("/dashboard") // Fixed typo from /bashboard
          return
        }

        // Fetch both in parallel for speed
        const [usersData, invitesData] = await Promise.all([
          listUsers(),
          listInvites(),
        ])

        setMembers(usersData)
        setInvites(invitesData?.invites || [])
      } catch (err: unknown) {
        console.error("Failed to load team data:", err)
        toast.error("Failed to load team members")
      }
    })()
  }, [user, router])

  const handleCopy = async (link: string) => {
    if (!link) {
      toast.error("No invite link to copy")
      return
    }
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      toast.success("Link copied to clipboard")
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Copy failed:", err)
      toast.error("Couldn't copy the link. Copy it manually.")
    }
  }

  const resetForm = () => {
    setEmail("")
    setRole("member")
    setError(null)
  }

  const handleOpenChange = (open: boolean) => {
    if (isSubmitting) return
    setInviteOpen(open)
    if (!open) resetForm()
  }

  const handleInvite = async () => {
    const trimmed = email.trim()
    if (!EMAIL_RE.test(trimmed)) {
      setError("Enter a valid email address.")
      return
    }

    setError(null)
    setIsSubmitting(true)

    try {
      const result = await createInvite({ email: trimmed, role })
      setInviteOpen(false)
      resetForm()

      // Update local invites list
      setInvites((prev) => [result.invite, ...prev])

      try {
        await (onInvited ?? defaultOnInvited)(result)
      } catch (callbackError) {
        console.error("Invite success callback failed:", callbackError)
        toast.success("Invitation created successfully.")
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Couldn't send the invitation."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  // 🟢 HANDLERS FOR USER ACTIONS
  const handleRoleChange = async (
    userId: string,
    newRole: "admin" | "member"
  ) => {
    try {
      const updated = await updateUserRole(userId, newRole)
      setMembers((prev) => prev.map((m) => (m.id === userId ? updated : m)))
      toast.success(`Role updated to ${newRole}`)
    } catch (err: any) {
      toast.error(err.message || "Failed to update role")
    }
  }

  const handleStatusToggle = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "disabled" : "active"
    try {
      const updated = await updateUserStatus(userId, newStatus)
      setMembers((prev) => prev.map((m) => (m.id === userId ? updated : m)))
      toast.success(`User ${newStatus === "active" ? "enabled" : "disabled"}`)
    } catch (err: any) {
      toast.error(err.message || "Failed to update status")
    }
  }

  return (
    <AppShell
      title="Team"
      description="Manage who has access to your workspace"
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm text-muted-foreground">Workspace settings</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Team</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Manage members and invitations for Northstar Labs.
            </p>
          </div>
          <Dialog open={inviteOpen} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 size-4" />
                Invite member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite a team member</DialogTitle>
                <DialogDescription>
                  They&apos;ll receive an invitation to join your workspace.
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-4 py-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="invite-email">Email address</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder="teammate@company.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      if (error) setError(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !isSubmitting) handleInvite()
                    }}
                    aria-invalid={!!error}
                    aria-describedby={error ? "invite-error" : undefined}
                    disabled={isSubmitting}
                  />
                  {error && (
                    <p id="invite-error" className="text-sm text-destructive">
                      {error}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <Label>Role</Label>
                  <Select
                    value={role}
                    onValueChange={(v) => setRole(v as Role)}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">
                        Member — can access shared data
                      </SelectItem>
                      <SelectItem value="admin">
                        Admin — can manage members
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleInvite}
                  disabled={isSubmitting || email.trim() === ""}
                >
                  {isSubmitting ? "Sending…" : "Send invitation"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <Tabs defaultValue="members">
            <CardHeader className="border-b pb-0">
              <TabsList className="w-fit">
                <TabsTrigger value="members">
                  <Users className="mr-2 size-4" />
                  Members{" "}
                  <Badge variant="secondary" className="ml-2">
                    {members.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="invites">
                  Pending invites{" "}
                  <Badge variant="secondary" className="ml-2">
                    {invites.length}
                  </Badge>
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            <TabsContent value="members" className="m-0">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-6">Member</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last login</TableHead>
                        <TableHead className="w-12 pr-6" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {members.length > 0 ? (
                        members.map((member) => (
                          <TableRow key={member.id}>
                            <TableCell className="pl-6">
                              <div className="flex items-center gap-3">
                                <Avatar className="size-8">
                                  <AvatarFallback className="bg-primary/10 text-xs text-primary">
                                    {initials(member.name)}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-medium">
                                    {member.name}
                                    {member.id === user?.id && (
                                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                                        (you)
                                      </span>
                                    )}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {member.email}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <RoleBadge role={member.role} />
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  member.status === "active"
                                    ? "outline"
                                    : "destructive"
                                }
                              >
                                {member.status === "active" ? (
                                  <UserCheck className="mr-1 size-3" />
                                ) : (
                                  <UserX className="mr-1 size-3" />
                                )}
                                {member.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {member.lastLoginAt
                                ? relativeTime(member.lastLoginAt)
                                : "Never"}
                            </TableCell>
                            <TableCell className="pr-6">
                              {/* 🟢 WIRED UP THE ACTION MENU */}
                              {member.role !== "owner" &&
                                member.id !== user?.id && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label={`Actions for ${member.name}`}
                                      >
                                        <MoreHorizontal className="size-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      {/* 🟢 WRAP EVERYTHING INSIDE A GROUP */}
                                      <DropdownMenuGroup>
                                        <DropdownMenuLabel>
                                          Manage User
                                        </DropdownMenuLabel>
                                        <DropdownMenuSeparator />

                                        <DropdownMenuItem
                                          onClick={() =>
                                            handleRoleChange(
                                              member.id,
                                              member.role === "admin"
                                                ? "member"
                                                : "admin"
                                            )
                                          }
                                        >
                                          <Shield className="mr-2 size-4" />
                                          {member.role === "admin"
                                            ? "Demote to Member"
                                            : "Promote to Admin"}
                                        </DropdownMenuItem>

                                        <DropdownMenuSeparator />

                                        <DropdownMenuItem
                                          onClick={() =>
                                            handleStatusToggle(
                                              member.id,
                                              member.status
                                            )
                                          }
                                          className={
                                            member.status === "active"
                                              ? "text-destructive"
                                              : "text-emerald-600"
                                          }
                                        >
                                          {member.status === "active" ? (
                                            <>
                                              <UserX className="mr-2 size-4" />{" "}
                                              Disable Account
                                            </>
                                          ) : (
                                            <>
                                              <UserCheck className="mr-2 size-4" />{" "}
                                              Enable Account
                                            </>
                                          )}
                                        </DropdownMenuItem>
                                      </DropdownMenuGroup>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="h-24 text-center text-muted-foreground"
                          >
                            No members found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </TabsContent>

            <TabsContent value="invites" className="m-0">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-6">Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Sent</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead className="w-12 pr-6" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invites.map((invite) => (
                        <TableRow key={invite.id}>
                          <TableCell className="pl-6 font-medium">
                            {invite.email}
                          </TableCell>
                          <TableCell>
                            <RoleBadge role={invite.role} />
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {relativeTime(invite.createdAt)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {relativeTime(invite.expiresAt)}
                          </TableCell>
                          <TableCell className="pr-6">
                            <Button variant="ghost" size="sm">
                              Revoke
                            </Button>
                          </TableCell>
                          <TableCell className="pr-6">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCopy(invite.inviteLink!)}
                              disabled={false}
                              aria-live="polite"
                            >
                              {copied ? (
                                <Check className="mr-2 size-4" />
                              ) : (
                                <LinkIcon className="mr-2 size-4" />
                              )}
                              {copied ? "Copied" : "Link"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {invites.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="h-24 text-center text-muted-foreground"
                          >
                            No pending invites.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </TabsContent>
          </Tabs>
        </Card>

        <Card className="border-dashed bg-muted/20">
          <CardContent className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-background">
              <Shield className="size-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Roles and permissions</p>
              <p className="text-sm text-muted-foreground">
                Owners have full access. Admins can manage members, while
                members can work with shared data.
              </p>
            </div>
            <Button variant="link" className="px-0">
              Learn more
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}

export function useCopyToClipboard(resetAfterMs = 2000) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const copy = useCallback(
    async (text: string | null | undefined): Promise<boolean> => {
      if (!text) {
        toast.error("Nothing to copy")
        return false
      }

      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text)
        } else {
          const textarea = document.createElement("textarea")
          textarea.value = text
          textarea.setAttribute("readonly", "")
          textarea.style.position = "fixed"
          textarea.style.opacity = "0"
          document.body.appendChild(textarea)
          textarea.select()
          const ok = document.execCommand("copy")
          document.body.removeChild(textarea)
          if (!ok) throw new Error("execCommand copy failed")
        }

        setCopied(true)
        toast.success("Link copied to clipboard")

        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        timeoutRef.current = setTimeout(() => setCopied(false), resetAfterMs)

        return true
      } catch (err) {
        console.error("Copy failed:", err)
        toast.error("Couldn't copy the link. Copy it manually.")
        return false
      }
    },
    [resetAfterMs]
  )

  return { copy, copied }
}
