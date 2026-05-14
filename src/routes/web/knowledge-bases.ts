import Elysia from "elysia";
import { authGuardPlugin } from "../../plugins/auth";
import {
  createKnowledgeBaseRecord,
  deleteKnowledgeBase,
  getKnowledgeBaseDetail,
  listKnowledgeBasesByUserId,
  updateKnowledgeBase,
} from "../../services/knowledge-base";
import {
  deleteKnowledgeResource,
  importKnowledgeResourceFromUrl,
  listKnowledgeResources,
  uploadKnowledgeResource,
} from "../../services/knowledge-upload";
import {
  KnowledgeBaseInfoSchema,
  KnowledgeResourceItemSchema,
  CreateKnowledgeBaseRequestSchema,
  UpdateKnowledgeBaseRequestSchema,
  ImportKnowledgeUrlRequestSchema,
} from "../../schemas/knowledge.schema";

const app = new Elysia({ name: "web-knowledge-bases", prefix: "/web" })
  .use(authGuardPlugin)
  .model({
    "knowledge-base-info": KnowledgeBaseInfoSchema,
    "knowledge-base-list": KnowledgeBaseInfoSchema.array(),
    "knowledge-resource-item": KnowledgeResourceItemSchema,
    "knowledge-resource-list": KnowledgeResourceItemSchema.array(),
    "create-knowledge-base-request": CreateKnowledgeBaseRequestSchema,
    "update-knowledge-base-request": UpdateKnowledgeBaseRequestSchema,
    "import-knowledge-url-request": ImportKnowledgeUrlRequestSchema,
  });

app.get("/knowledgeBases", async ({ store }) => {
  const user = store.user!;
  return await listKnowledgeBasesByUserId(user.id);
}, { sessionAuth: true, response: "knowledge-base-list" });

app.post("/knowledgeBases", async ({ store, body, error }) => {
  const user = store.user!;
  const payload = body as { name: string; slug: string; description?: string };
  const result = await createKnowledgeBaseRecord(user.id, {
    name: payload.name,
    slug: payload.slug,
    description: payload.description,
  });
  if (!result.success) {
    return error(400, { error: { type: result.error.code, message: result.error.message } });
  }
  return result.data;
}, { sessionAuth: true, body: "create-knowledge-base-request" });

app.get("/knowledgeBases/:id", async ({ store, params, error }) => {
  const user = store.user!;
  const id = params.id;
  const detail = await getKnowledgeBaseDetail(user.id, id);
  if (!detail) {
    return error(404, { error: { type: "NOT_FOUND", message: "知识库不存在" } });
  }
  return detail;
}, { sessionAuth: true });

app.patch("/knowledgeBases/:id", async ({ store, params, body, error }) => {
  const user = store.user!;
  const id = params.id;
  const payload = body as { name?: string; slug?: string; description?: string };
  const result = await updateKnowledgeBase(user.id, id, {
    name: payload.name,
    slug: payload.slug,
    description: payload.description,
  });
  if (!result.success) {
    const status = result.error.code === "NOT_FOUND" ? 404 : 400;
    return error(status, { error: { type: result.error.code, message: result.error.message } });
  }
  return result.data;
}, { sessionAuth: true, body: "update-knowledge-base-request" });

app.delete("/knowledgeBases/:id", async ({ store, params, error }) => {
  const user = store.user!;
  const id = params.id;
  try {
    const result = await deleteKnowledgeBase(user.id, id);
    if (!result.success) {
      return error(404, { error: { type: "NOT_FOUND", message: result.error.message } });
    }
    return { ok: true as const };
  } catch (err) {
    return error(400, {
      error: {
        type: "DELETE_FAILED",
        message: err instanceof Error ? err.message : "删除知识库失败",
      },
    });
  }
}, { sessionAuth: true });

app.post("/knowledgeBases/:id/resources/upload", async ({ store, params, request, error }) => {
  const user = store.user!;
  const id = params.id;
  try {
    const form = await request.formData();
    const files = Array.from(form.getAll("files")).filter((entry: any): entry is globalThis.File => entry instanceof globalThis.File);
    const items = await Promise.all(files.map((file) => uploadKnowledgeResource(user.id, id, file as unknown as File)));

    for (let index = 0; index < items.length; index += 1) {
      if (items[index]?.status !== "error") {
        continue;
      }
      await deleteKnowledgeResource(user.id, id, items[index]!.id);
      items[index] = await uploadKnowledgeResource(user.id, id, files[index]! as unknown as File);
    }

    const failedItem = items.find((item) => item.status === "error");
    if (failedItem) {
      throw new Error(failedItem.lastError || `${failedItem.sourceName} 上传失败`);
    }
    return { items };
  } catch (err) {
    const message = (err as Error).message;
    const status = message.includes("不存在") ? 404 : 400;
    return error(status, { error: { type: status === 404 ? "NOT_FOUND" : "VALIDATION_ERROR", message } });
  }
}, { sessionAuth: true });

app.post("/knowledgeBases/:id/resources/url", async ({ store, params, body, error }) => {
  const user = store.user!;
  const id = params.id;
  const payload = body as { url: string; sourceName?: string };
  if (!payload.url || typeof payload.url !== "string") {
    return error(400, { error: { type: "VALIDATION_ERROR", message: "url 为必填字段" } });
  }
  try {
    const item = await importKnowledgeResourceFromUrl(user.id, id, {
      url: payload.url,
      sourceName: payload.sourceName,
    });
    const status = item.status === "error" ? 502 : 201;
    if (status >= 400) return error(status, item);
    return item;
  } catch (err) {
    const message = (err as Error).message;
    const status = message.includes("不存在") ? 404 : 400;
    return error(status, { error: { type: status === 404 ? "NOT_FOUND" : "VALIDATION_ERROR", message } });
  }
}, { sessionAuth: true, body: "import-knowledge-url-request" });

app.get("/knowledgeBases/:id/resources", async ({ store, params, error }) => {
  const user = store.user!;
  const id = params.id;
  const items = await listKnowledgeResources(user.id, id);
  if (!items) {
    return error(404, { error: { type: "NOT_FOUND", message: "知识库不存在" } });
  }
  return items;
}, { sessionAuth: true });

app.delete("/knowledgeBases/:id/resources/:resourceId", async ({ store, params, error }) => {
  const user = store.user!;
  const id = params.id;
  const resourceId = params.resourceId;
  try {
    const result = await deleteKnowledgeResource(user.id, id, resourceId);
    if (!result.success) {
      return error(404, { error: { type: result.error.code, message: result.error.message } });
    }
    return result.data;
  } catch (err) {
    return error(400, {
      error: {
        type: "DELETE_FAILED",
        message: err instanceof Error ? err.message : "删除资源失败",
      },
    });
  }
}, { sessionAuth: true });

export default app;
