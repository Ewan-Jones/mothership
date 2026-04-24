import { Hono } from "hono";
import { sessionAuth } from "../../auth/middleware";
import { storeListEnvironmentsByUserId } from "../../store";
import type { EnvironmentRecord } from "../../store";

function toResponse(row: EnvironmentRecord) {
  return {
    id: row.id,
    machine_name: row.machineName,
    directory: row.directory,
    branch: row.branch,
    status: row.status,
    username: row.username,
    last_poll_at: row.lastPollAt ? row.lastPollAt.getTime() / 1000 : null,
    worker_type: row.workerType,
    capabilities: row.capabilities,
  };
}

const app = new Hono();

/** GET /web/environments — List active environments for the current user */
app.get("/environments", sessionAuth, async (c) => {
  const user = c.get("user")!;
  const envs = storeListEnvironmentsByUserId(user.id);
  return c.json(envs.map(toResponse), 200);
});

export default app;
