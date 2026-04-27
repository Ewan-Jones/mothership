import { Hono } from "hono";

import { sessionAuth } from "../../auth/middleware";
import { getChannelProvider, listChannelProviders } from "../../services/channel-provider";

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

export default app;
