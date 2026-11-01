"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  Mail,
  LockKeyhole,
  LoaderCircle,
  ArrowRight,
  AlertCircle,
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
import { login } from "@/lib/api/auth/auth";

export default function OrgLogin() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
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
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "");
    const password = String(fd.get("password") ?? "");

    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message ?? "Login failed");
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
            Welcome back
          </h1>

          <p className="text-sm text-muted-foreground">
            Sign in to access your organization workspace.
          </p>
        </div>

        <Card className="border-border/70 shadow-lg">
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Enter your registered work email and password.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Work email</Label>

                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />

                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="you@company.com"
                    value={formData.email}
                    onChange={handleChange}
                    className="pl-9"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>

                  <Link
                    href="/forgot-password"
                    className="text-sm text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>

                <div className="relative">
                  <LockKeyhole className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />

                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="Enter your password"
                    value={formData.password}
                    onChange={handleChange}
                    className="pl-9"
                    autoComplete="current-password"
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
                disabled={loading}
              >
                {loading ? (
                  <>
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="justify-center border-t pt-5">
            <p className="text-sm text-muted-foreground">
              New to the platform?{" "}
              <Link
                href="/register-organization"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Create an organization
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}