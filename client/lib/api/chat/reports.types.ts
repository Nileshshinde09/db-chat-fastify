import { z } from "zod"

export const ReportFormatSchema = z.enum(["csv", "xlsx"])
export type ReportFormat = z.infer<typeof ReportFormatSchema>

export const ReportStatusSchema = z.object({
  reportId: z.string(),
  status: z.enum(["processing", "ready", "failed", "expired"]),
  rowCount: z.number().nullable().optional(),
  sizeBytes: z.number().nullable().optional(),
  truncated: z.boolean().optional(),
  title: z.string().nullable().optional(),
  format: ReportFormatSchema.nullable().optional(),
  version: z.number().optional(),
  error: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date().nullable().optional(),
})

export type ReportStatus = z.infer<typeof ReportStatusSchema>

export interface CreateReportInput {
  connectionId: string
  query: string | Record<string, unknown>
  format: ReportFormat
  title?: string
}

export interface CreateReportResponse {
  reportId: string
  status: string
  version: number
}