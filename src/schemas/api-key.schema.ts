import * as z from "zod/v4";

export const ApiKeyInfoSchema = z.object({
  id: z.string(),
  label: z.string(),
  keyPrefix: z.string(),
  createdAt: z.number(),
  lastUsedAt: z.number().nullable(),
});

export const CreateApiKeyRequestSchema = z.object({
  label: z.string().optional().default(""),
});

export const CreateApiKeyResponseSchema = ApiKeyInfoSchema.extend({
  full_key: z.string(),
});

export const UpdateApiKeyLabelRequestSchema = z.object({
  label: z.string().min(1, "Label is required"),
});

export const OkResponseSchema = z.object({ ok: z.literal(true) });

export type ApiKeyInfo = z.infer<typeof ApiKeyInfoSchema>;
export type CreateApiKeyRequest = z.infer<typeof CreateApiKeyRequestSchema>;
export type CreateApiKeyResponse = z.infer<typeof CreateApiKeyResponseSchema>;
export type UpdateApiKeyLabelRequest = z.infer<typeof UpdateApiKeyLabelRequestSchema>;
