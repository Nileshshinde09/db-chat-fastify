"use client"

import { apiClient } from "../client"
import { MeResponse, useAuthStore } from "@/stores/useAuthStore"

const { accessToken } = useAuthStore.getState()

type LoginResponse = {
  accessToken: string
  user: { id: string; email: string; name: string }
}

export async function login(email: string, password: string) {
  const data = await apiClient<LoginResponse>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    skipAuth: true, // no token yet
    skipRefresh: true, // don't try to refresh if 401
  })

  // Persist to store (in-memory)
  useAuthStore.getState().setSession({
    accessToken: data.accessToken,
    user: data.user,
  })

  return data
}

export async function logout() {
  try {
    await apiClient("/api/v1/auth/logout", { method: "POST",
      headers: {
      Authorization: `Bearer ${accessToken}`,
    },
     })
  } finally {
    useAuthStore.getState().clear()
  }
}

export async function me() {
  const data = await apiClient<MeResponse>("/api/v1/auth/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
  useAuthStore.getState().setMe(data)
  return data
}
