import * as z from "zod/v4";

export const FileEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(["dir", "file"]),
  size: z.number(),
  modifiedAt: z.number(),
});

export const FileListResponseSchema = z.object({
  entries: FileEntrySchema.array(),
});

export const FileContentSchema = z.object({
  name: z.string(),
  path: z.string(),
  content: z.string(),
  size: z.number(),
  encoding: z.string(),
});

export const FileUploadItemSchema = z.object({
  name: z.string(),
  path: z.string(),
  size: z.number(),
});

export const FileUploadResponseSchema = z.object({
  files: FileUploadItemSchema.array(),
});

export const FileWriteResultSchema = z.object({
  name: z.string(),
  path: z.string(),
  size: z.number(),
});

export const WriteFileRequestSchema = z.object({
  content: z.string().min(1, "content field required"),
});

export type FileEntry = z.infer<typeof FileEntrySchema>;
export type FileListResponse = z.infer<typeof FileListResponseSchema>;
export type FileContent = z.infer<typeof FileContentSchema>;
export type FileUploadResponse = z.infer<typeof FileUploadResponseSchema>;
export type FileWriteResult = z.infer<typeof FileWriteResultSchema>;
