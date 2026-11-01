"use client";
import { useEffect, useRef } from "react";
import { useAuthStore } from "@/stores/useAuthStore";
import { me } from "@/lib/api/auth/auth";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;              
    ran.current = true;

    if (useAuthStore.getState().status !== "idle") return;

    useAuthStore.setState({ status: "loading" });

    me()
      .catch(() => {
        // me() sets "authenticated" on success; on failure reset:
        useAuthStore.setState({
          accessToken: null,
          user: null,
          organization: null,
          status: "unauthenticated",
        });
      });
  }, []);

  return <>{children}</>;
}