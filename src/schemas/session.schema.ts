import * as z from "zod/v4";

export const SessionResponseSchema = z.object({
  id: z.string(),
  environment_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  title: z.string().nullable(),
  status: z.string(),
  source: z.string(),
  username: z.string().nullable(),
  created_at: z.number(),
  updated_at: z.number(),
});

export const SessionSummarySchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  status: z.string(),
  username: z.string().nullable(),
  updated_at: z.number(),
});

export const SessionEventPayloadSchema = z.record(z.string(), z.unknown());

export const SessionEventSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  type: z.string(),
  timestamp: z.number(),
  payload: SessionEventPayloadSchema,
});

export const SessionHistorySchema = z.object({
  events: SessionEventSchema.array(),
});

export type SessionResponse = z.infer<typeof SessionResponseSchema>;
export type SessionSummary = z.infer<typeof SessionSummarySchema>;
export type SessionEvent = z.infer<typeof SessionEventSchema>;
export type SessionHistory = z.infer<typeof SessionHistorySchema>;
