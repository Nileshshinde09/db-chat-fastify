// store/auth-store.ts
import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type UserRole = "member" | "admin" | "owner";

export type User = {
  id: string;
  orgId: string;
  email: string;
  name: string;
  role: UserRole;
  status: string;             // "active" | "invited" | ... — narrow when you know
  twoFactorEnabled: boolean;
  lastLoginAt: string | null; // ISO string
  createdAt: string | null;   // ISO string
};

export type Org = {
  id: string;
  name: string;
  slug: string;
  status: string;
};

export type MeResponse = {
  user: User;
  organization: Org | null;
};

type AuthState = {
  accessToken: string | null;
  user: User | null;
  organization: Org | null;
  status: "idle" | "loading" | "authenticated" | "unauthenticated";

  /** After login — has token */
  setSession: (data: {
    accessToken: string;
    user: User;
    organization?: Org | null;
  }) => void;

  /** After GET /auth/me — no token, keeps existing one */
  setMe: (data: MeResponse) => void;

  setAccessToken: (token: string) => void;
  setStatus: (status: AuthState["status"]) => void;
  clear: () => void;
};

export const useAuthStore = create<AuthState>()(
  devtools(
    (set) => ({
      accessToken: null,
      user: null,
      organization: null,
      status: "idle",

      setSession: ({ accessToken, user, organization = null }) =>
        set({ accessToken, user, organization, status: "authenticated" }),

      setMe: ({ user, organization }) =>
        set({ user, organization: organization ?? null, status: "authenticated" }),

      setAccessToken: (accessToken) => set({ accessToken }),

      setStatus: (status) => set({ status }),

      clear: () =>
        set({
          accessToken: null,
          user: null,
          organization: null,
          status: "unauthenticated",
        }),
    }),
    { name: "AuthStore" }
  )
);