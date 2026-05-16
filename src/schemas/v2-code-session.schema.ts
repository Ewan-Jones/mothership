import * as z from "zod/v4";

/** POST /v1/code/sessions — 创建 code session 请求体 */
export const CreateCodeSessionRequestSchema = z.object({
  environment_id: z.string().optional(),
  title: z.string().optional(),
  source: z.string().optional(),
  username: z.string().optional(),
});

export type CreateCodeSessionRequest = z.infer<typeof CreateCodeSessionRequestSchema>;
