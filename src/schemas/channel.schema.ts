import * as z from "zod/v4";

export const ChannelProviderTypeSchema = z.enum(["wechat", "feishu"]);
export const ChannelProviderStatusSchema = z.enum(["disabled", "enabled"]);

export const ChannelProviderDescriptorSchema = z.object({
  type: ChannelProviderTypeSchema,
  label: z.string(),
  status: ChannelProviderStatusSchema,
});

export const HermesStatusSchema = z.object({
  connected: z.boolean(),
  url: z.string(),
  platforms: z.array(z.string()),
  reconnecting: z.boolean(),
  lastConnectedAt: z.number().nullable(),
});

export const ChannelBindingSchema = z.object({
  id: z.string(),
  platform: z.string(),
  chatId: z.string().nullable(),
  agentId: z.string(),
  enabled: z.boolean(),
  agentName: z.string().nullable().optional(),
});

export const CreateChannelBindingRequestSchema = z.object({
  platform: z.string().min(1, "platform 为必填字段"),
  chatId: z.string().nullable().optional(),
  agentId: z.string().min(1, "agentId 为必填字段"),
  enabled: z.boolean().optional().default(true),
});

export type ChannelProviderDescriptor = z.infer<typeof ChannelProviderDescriptorSchema>;
export type HermesStatus = z.infer<typeof HermesStatusSchema>;
export type ChannelBinding = z.infer<typeof ChannelBindingSchema>;
export type CreateChannelBindingRequest = z.infer<typeof CreateChannelBindingRequestSchema>;
