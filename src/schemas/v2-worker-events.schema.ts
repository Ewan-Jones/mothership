import * as z from "zod/v4";

export const WorkerEventsRequestSchema = z.union([
  z.object({
    events: z.array(z.record(z.string(), z.unknown())),
  }),
  z.array(z.record(z.string(), z.unknown())),
  z.record(z.string(), z.unknown()),
]);

export const WorkerStateRequestSchema = z.object({
  status: z.string().optional(),
});

export type WorkerEventsRequest = z.infer<typeof WorkerEventsRequestSchema>;
export type WorkerStateRequest = z.infer<typeof WorkerStateRequestSchema>;
