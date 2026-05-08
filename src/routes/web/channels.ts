import { Hono } from "hono";

import { sessionAuth } from "../../auth/middleware";
import { getChannelProvider, listChannelProviders } from "../../services/channel-provider";
import { getHermesClient } from "../../services/hermes-client";
import { listBindings, createBinding, deleteBinding, updateBinding } from "../../services/channel-binding";
import { storeGetEnvironment } from "../../store";

const app = new Hono();

app.get("/channels/providers", sessionAuth, (c) => {
  return c.json(listChannelProviders(), 200);
});

app.get("/channels", sessionAuth, (c) => {
  return c.json([], 200);
});

app.post("/channels", sessionAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const provider = typeof body?.type === "string" ? getChannelProvider(body.type) : undefined;
  const status = provider ? 409 : 400;
  return c.json(
    { error: { type: "FORBIDDEN", message: "当前平台暂未开放" } },
    status,
  );
});

// --- Hermes Status ---

app.get("/channels/hermes/status", sessionAuth, (c) => {
  const client = getHermesClient();
  if (!client) {
    return c.json({
      connected: false,
      url: "",
      platforms: [],
      reconnecting: false,
      lastConnectedAt: null,
    }, 200);
  }
  return c.json(client.getStatus(), 200);
});

// --- Bindings CRUD ---

app.get("/channels/bindings", sessionAuth, async (c) => {
  const bindings = await listBindings();
  const enriched = bindings.map((b) => {
    const env = storeGetEnvironment(b.agentId);
    return { ...b, agentName: env?.name ?? null };
  });
  return c.json(enriched, 200);
});

app.post("/channels/bindings", sessionAuth, async (c) => {
  const body = await c.req.json();
  const { platform, chatId, agentId, enabled } = body;
  if (!platform || !agentId) {
    return c.json({
      error: { type: "VALIDATION_ERROR", message: "platform 和 agentId 为必填字段" },
    }, 400);
  }
  const binding = await createBinding({ platform, chatId: chatId ?? null, agentId, enabled });
  const env = storeGetEnvironment(binding.agentId);
  return c.json({ ...binding, agentName: env?.name ?? null }, 201);
});

app.delete("/channels/bindings/:id", sessionAuth, async (c) => {
  const id = c.req.param("id")!;
  const deleted = await deleteBinding(id);
  if (!deleted) {
    return c.json({ error: { type: "NOT_FOUND", message: "绑定不存在" } }, 404);
  }
  return c.json({ success: true }, 200);
});

app.patch("/channels/bindings/:id", sessionAuth, async (c) => {
  const id = c.req.param("id")!;
  const body = await c.req.json();
  const updated = await updateBinding(id, body);
  if (!updated) {
    return c.json({ error: { type: "NOT_FOUND", message: "绑定不存在" } }, 404);
  }
  const env = storeGetEnvironment(updated.agentId);
  return c.json({ ...updated, agentName: env?.name ?? null }, 200);
});

export default app;
