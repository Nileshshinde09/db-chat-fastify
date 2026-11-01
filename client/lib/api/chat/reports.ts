import { apiClient } from "../client"
import { useAuthStore } from "@/stores/useAuthStore"

const BASE = "/api/v1/reports"
const getToken = () => useAuthStore.getState().accessToken
const enc = (v: string) => encodeURIComponent(v)

export interface CreateReportInput {
  connectionId: string
  query: string | Record<string, unknown>
  format: "csv" | "xlsx"
  title?: string
}

export interface ReportStatus {
  reportId: string
  status: "processing" | "ready" | "failed"
  error?: string
}

// 1. Create Report
export async function createReport(input: CreateReportInput) {
  return apiClient<{ reportId: string }>(BASE, {
    method: "POST",
    body: JSON.stringify(input),
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
  })
}

// 2. Check Status
export async function getReportStatus(reportId: string) {
  return apiClient<ReportStatus>(`${BASE}/${enc(reportId)}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  })
}

// 3. Blob Download (The Fix)
export async function downloadReportFile(reportId: string, filename: string) {
  // We use fetch directly here to get the raw bytes (Blob)
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || ""
  const response = await fetch(`${baseUrl}${BASE}/${enc(reportId)}/download`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
  })

  if (!response.ok) {
    throw new Error("Failed to download file")
  }

  // Convert response to a Blob
  const blob = await response.blob()
  
  // Create a temporary URL for the Blob
  const url = window.URL.createObjectURL(blob)
  
  // Create a hidden link and click it
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  
  // Cleanup
  a.remove()
  window.URL.revokeObjectURL(url)
}

// 4. All-in-one flow
export async function generateAndDownloadReport(
  input: CreateReportInput,
  onProgress?: (status: string) => void
) {
  onProgress?.("Generating report...")
  
  const { reportId } = await createReport(input)

  let attempts = 0
  while (attempts < 30) {
    await new Promise((r) => setTimeout(r, 1000))
    const status = await getReportStatus(reportId)

    if (status.status === "ready") {
      onProgress?.("Downloading...")
      // 🟢 Use the Blob download function instead of window.location.href
      const ext = input.format === "csv" ? "csv" : "xlsx"
      const safeTitle = (input.title || "report").replace(/[^a-z0-9]/gi, "-").toLowerCase()
      const filename = `${safeTitle}-${new Date().toISOString().split('T')[0]}.${ext}`
      
      await downloadReportFile(reportId, filename)
      return
    }

    if (status.status === "failed") {
      throw new Error(status.error || "Report generation failed")
    }
    attempts++
  }

  throw new Error("Report generation timed out.")
}