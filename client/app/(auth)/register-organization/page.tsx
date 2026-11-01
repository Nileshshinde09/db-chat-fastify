"use client"
import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Building2,
  UserRound,
  Mail,
  LockKeyhole,
  LoaderCircle,
  ArrowRight,
  AlertCircle,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function OrgRegister() {
  const router = useRouter()

  const [formData, setFormData] = useState({
    organizationName: "",
    name: "",
    email: "",
    password: "",
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }))
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const response = await fetch("/api/proxy/api/v1/auth/register-organization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
        credentials: "include",
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        const message =
          data?.message || data?.error || "Unable to create your organization."

        throw new Error(Array.isArray(message) ? message.join(", ") : message)
      }

      router.push("/dashboard")
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Building2 className="h-6 w-6" />
          </div>

          <h1 className="text-2xl font-bold tracking-tight">
            Create your organization
          </h1>

          <p className="text-sm text-muted-foreground">
            Set up your workspace and invite your team later.
          </p>
        </div>

        <Card className="border-border/70 shadow-lg">
          <CardHeader>
            <CardTitle>Get started</CardTitle>
            <CardDescription>
              Enter your organization and owner details below.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="organizationName">Organization name</Label>
                <div className="relative">
                  <Building2 className="absolute top-3 left-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="organizationName"
                    name="organizationName"
                    placeholder="e.g. Acme Inc."
                    value={formData.organizationName}
                    onChange={handleChange}
                    className="pl-9"
                    required
                    autoComplete="organization"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Your full name</Label>
                <div className="relative">
                  <UserRound className="absolute top-3 left-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="name"
                    name="name"
                    placeholder="John Doe"
                    value={formData.name}
                    onChange={handleChange}
                    className="pl-9"
                    required
                    autoComplete="name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Work email</Label>
                <div className="relative">
                  <Mail className="absolute top-3 left-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="you@company.com"
                    value={formData.email}
                    onChange={handleChange}
                    className="pl-9"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <LockKeyhole className="absolute top-3 left-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="Create a strong password"
                    value={formData.password}
                    onChange={handleChange}
                    className="pl-9"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Use at least 8 characters.
                </p>
              </div>

              {error && (
                <div
                  role="alert"
                  className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                    Creating organization...
                  </>
                ) : (
                  <>
                    Create organization
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="justify-center border-t pt-5">
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
            </p>
          </CardFooter>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          By continuing, you agree to your organization&apos;s applicable terms
          and privacy policies.
        </p>
      </div>
    </main>
  )
}
