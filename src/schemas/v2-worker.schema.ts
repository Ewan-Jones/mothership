import * as z from "zod/v4";

export const UpdateWorkerRequestSchema = z.object({
  worker_status: z.string().optional(),
  external_metadata: z.record(z.string(), z.unknown()).optional(),
  requires_action_details: z.record(z.string(), z.unknown()).optional(),
});

export type UpdateWorkerRequest = z.infer<typeof UpdateWorkerRequestSchema>;
