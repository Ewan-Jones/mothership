import Elysia from "elysia";
import { authGuardPlugin } from "../../plugins/auth";
import {
  createApiKey,
  listApiKeysByUser,
  deleteApiKey,
  updateApiKeyLabel,
} from "../../auth/api-key-service";
import {
  ApiKeyInfoSchema,
  CreateApiKeyRequestSchema,
  CreateApiKeyResponseSchema,
  UpdateApiKeyLabelRequestSchema,
} from "../../schemas/api-key.schema";

const app = new Elysia({ name: "web-api-keys", prefix: "/web" })
  .use(authGuardPlugin)
  .model({
    "api-key-info": ApiKeyInfoSchema,
    "api-key-info-list": ApiKeyInfoSchema.array(),
    "create-api-key-request": CreateApiKeyRequestSchema,
    "create-api-key-response": CreateApiKeyResponseSchema,
    "update-api-key-label-request": UpdateApiKeyLabelRequestSchema,
  });

/** GET /web/apiKeys — List current user's API keys */
app.get("/apiKeys", async ({ store }) => {
  const user = store.user!;
  const keys = await listApiKeysByUser(user.id);
  return keys;
}, { sessionAuth: true, response: "api-key-info-list" });

/** POST /web/apiKeys — Create a new API key */
app.post("/apiKeys", async ({ store, body }) => {
  const user = store.user!;
  const b = body as { label?: string };
  const { record, fullKey } = await createApiKey(user.id, b.label || "");
  return { ...record, full_key: fullKey };
}, { sessionAuth: true, body: "create-api-key-request", response: "create-api-key-response" });

/** DELETE /web/apiKeys/:id — Delete an API key */
app.delete("/apiKeys/:id", async ({ store, params, error }) => {
  const user = store.user!;
  const keyId = params.id;
  const deleted = await deleteApiKey(user.id, keyId);
  if (!deleted) {
    return error(404, { error: { type: "not_found", message: "API key not found" } });
  }
  return { ok: true as const };
}, { sessionAuth: true });

/** PATCH /web/apiKeys/:id — Update API key label */
app.patch("/apiKeys/:id", async ({ store, params, body, error }) => {
  const user = store.user!;
  const keyId = params.id;
  const b = body as { label: string };
  const updated = await updateApiKeyLabel(user.id, keyId, b.label);
  if (!updated) {
    return error(404, { error: { type: "not_found", message: "API key not found" } });
  }
  return { ok: true as const };
}, { sessionAuth: true, body: "update-api-key-label-request" });

export default app;
