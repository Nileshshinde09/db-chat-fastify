"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  UserRound,
  LockKeyhole,
  LoaderCircle,
  ArrowRight,
  AlertCircle,
  MailCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { acceptInvite } from "@/lib/api/invites/invites";

function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [formData, setFormData] = useState({
    name: "",
    password: "",
    confirmPassword: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Invitation token is missing. Please use the link you received.");
      return;
    }

    if (formData.name.trim().length < 2) {
      setError("Name must contain at least 2 characters.");
      return;
    }

    if (formData.password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      await acceptInvite({
        token,
        name: formData.name.trim(),
        password: formData.password,
      });

      router.push("/dashboard");
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not accept the invitation. Please try again."
      );
    } finally {
      setLoading(false);
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
            Join your organization
          </h1>

          <p className="text-sm text-muted-foreground">
            Complete your account setup to accept your invitation and join
            your team's workspace.
          </p>
        </div>

        <Card className="border-border/70 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MailCheck className="h-5 w-5" />
              Accept invitation
            </CardTitle>
            <CardDescription>
              Create your account using the invitation link you received.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {!token && (
                <div
                  role="alert"
                  className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Invitation token is missing. Open the complete invitation
                    link to continue.
                  </span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <div className="relative">
                  <UserRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="name"
                    name="name"
                    placeholder="Enter your full name"
                    value={formData.name}
                    onChange={handleChange}
                    className="pl-9"
                    autoComplete="name"
                    minLength={2}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Create password</Label>
                <div className="relative">
                  <LockKeyhole className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="At least 8 characters"
                    value={formData.password}
                    onChange={handleChange}
                    className="pl-9"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <div className="relative">
                  <LockKeyhole className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    placeholder="Re-enter your password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className="pl-9"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </div>
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

              <Button
                type="submit"
                className="w-full"
                disabled={loading || !token}
              >
                {loading ? (
                  <>
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                    Accepting invitation...
                  </>
                ) : (
                  <>
                    Accept invitation
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
      </div>
    </main>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-background">
          <LoaderCircle className="h-6 w-6 animate-spin text-muted-foreground" />
        </main>
      }
    >
      <AcceptInviteForm />
    </Suspense>
  );
}