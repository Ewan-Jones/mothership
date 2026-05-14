import * as z from "zod/v4";

export const InstanceStatusSchema = z.enum(["starting", "running", "stopped", "error"]);

export const InstanceInfoSchema = z.object({
  id: z.string(),
  port: z.number(),
  status: InstanceStatusSchema,
  error: z.string().nullable(),
  group_id: z.string(),
  environment_id: z.string().nullable(),
  session_id: z.string().nullable(),
  instance_number: z.number(),
  created_at: z.number(),
});

export const SpawnInstanceFromEnvironmentRequestSchema = z.object({
  environmentId: z.string().min(1, "environmentId is required"),
});

export type InstanceInfo = z.infer<typeof InstanceInfoSchema>;
export type InstanceStatus = z.infer<typeof InstanceStatusSchema>;
export type SpawnInstanceFromEnvironmentRequest = z.infer<typeof SpawnInstanceFromEnvironmentRequestSchema>;
