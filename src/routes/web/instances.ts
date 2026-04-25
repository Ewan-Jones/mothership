import { Hono } from "hono";
import { sessionAuth } from "../../auth/middleware";
import { spawnInstance, listInstances, stopInstance } from "../../services/instance";
import type { SpawnedInstance } from "../../services/instance";

const app = new Hono();

function toResponse(inst: SpawnedInstance) {
  return {
    id: inst.id,
    port: inst.port,
    status: inst.status,
    error: inst.error,
    group_id: inst.apiKey,
    created_at: Math.floor(inst.createdAt.getTime() / 1000),
  };
}

app.post("/instances", sessionAuth, async (c) => {
  const user = c.get("user")!;
  try {
    const inst = await spawnInstance(user.id);
    return c.json(toResponse(inst), 201);
  } catch (err: any) {
    return c.json({ error: { type: "spawn_failed", message: err.message } }, 500);
  }
});

app.get("/instances", sessionAuth, async (c) => {
  const user = c.get("user")!;
  const insts = listInstances(user.id);
  return c.json(insts.map(toResponse), 200);
});

app.delete("/instances/:id", sessionAuth, async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id")!;
  const result = stopInstance(id, user.id);
  if (!result.ok) {
    const statusCode = result.error === "Instance not found" ? 404
      : result.error === "Not your instance" ? 403
      : 400;
    return c.json({ error: { type: "bad_request", message: result.error } }, statusCode);
  }
  return c.json({ ok: true });
});

export default app;
