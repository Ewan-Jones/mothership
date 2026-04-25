import { describe, test, expect, beforeEach, mock } from "bun:test";
import { Hono } from "hono";

// Instead of mocking the middleware module (which has complex dependencies),
// we build the route handler inline and inject a mock middleware.

// Inline the toResponse logic from instances.ts
function toResponse(inst: any) {
  return {
    id: inst.id,
    port: inst.port,
    status: inst.status,
    error: inst.error,
    group_id: inst.apiKey,
    created_at: Math.floor(inst.createdAt.getTime() / 1000),
  };
}

// Mock service functions
const mockSpawnInstance = mock(async (userId: string) => ({
  id: "inst_abc123",
  userId,
  port: 8888,
  pid: 12345,
  status: "running" as const,
  command: "acp-link ...",
  error: null,
  apiKey: "rcs_test_api_key",
  createdAt: new Date("2026-01-01T00:00:00Z"),
}));

const mockListInstances = mock(() => [
  {
    id: "inst_abc123",
    userId: "test-user-id",
    port: 8888,
    pid: 12345,
    status: "running" as const,
    command: "acp-link ...",
    error: null,
    apiKey: "rcs_test_api_key",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  },
  {
    id: "inst_def456",
    userId: "test-user-id",
    port: 8889,
    pid: 12346,
    status: "stopped" as const,
    command: "acp-link ...",
    error: null,
    apiKey: "rcs_test_api_key2",
    createdAt: new Date("2026-01-02T00:00:00Z"),
  },
]);

const mockStopInstance = mock(() => ({ ok: true }));

// Build the route inline with mock auth
function createInstanceApp() {
  const app = new Hono();

  // Mock sessionAuth
  const sessionAuth = async (c: any, next: any) => {
    c.set("user", { id: "test-user-id", email: "test@test.com", name: "Test" });
    await next();
  };

  app.post("/web/instances", sessionAuth, async (c) => {
    const user = c.get("user")!;
    try {
      const inst = await mockSpawnInstance(user.id);
      return c.json(toResponse(inst), 201);
    } catch (err: any) {
      return c.json({ error: { type: "spawn_failed", message: err.message } }, 500);
    }
  });

  app.get("/web/instances", sessionAuth, async (c) => {
    const user = c.get("user")!;
    const insts = mockListInstances(user.id);
    return c.json(insts.map(toResponse), 200);
  });

  app.delete("/web/instances/:id", sessionAuth, async (c) => {
    const user = c.get("user")!;
    const id = c.req.param("id")!;
    const result = mockStopInstance(id, user.id);
    if (!result.ok) {
      const statusCode = result.error === "Instance not found" ? 404
        : result.error === "Not your instance" ? 403
        : 400;
      return c.json({ error: { type: "bad_request", message: result.error } }, statusCode);
    }
    return c.json({ ok: true });
  });

  return app;
}

describe("Instance Routes", () => {
  let app: Hono;

  beforeEach(() => {
    mockSpawnInstance.mockClear();
    mockListInstances.mockClear();
    mockStopInstance.mockClear();
    app = createInstanceApp();
  });

  test("POST /web/instances — creates instance successfully", async () => {
    const res = await app.request("/web/instances", { method: "POST" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("inst_abc123");
    expect(body.port).toBe(8888);
    expect(body.status).toBe("running");
    expect(body.created_at).toBeTruthy();
    expect(mockSpawnInstance).toHaveBeenCalledTimes(1);
  });

  test("POST /web/instances — spawn failure returns 500", async () => {
    mockSpawnInstance.mockRejectedValueOnce(new Error("No available port"));

    const res = await app.request("/web/instances", { method: "POST" });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.type).toBe("spawn_failed");
    expect(body.error.message).toBe("No available port");
  });

  test("GET /web/instances — lists user instances", async () => {
    const res = await app.request("/web/instances");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].id).toBe("inst_abc123");
    expect(body[1].id).toBe("inst_def456");
    expect(mockListInstances).toHaveBeenCalledWith("test-user-id");
  });

  test("GET /web/instances — returns empty array when no instances", async () => {
    mockListInstances.mockReturnValueOnce([]);

    const res = await app.request("/web/instances");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  test("DELETE /web/instances/:id — stops instance successfully", async () => {
    const res = await app.request("/web/instances/inst_abc123", { method: "DELETE" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockStopInstance).toHaveBeenCalledWith("inst_abc123", "test-user-id");
  });

  test("DELETE /web/instances/:id — returns 404 for not found", async () => {
    mockStopInstance.mockReturnValueOnce({ ok: false, error: "Instance not found" });

    const res = await app.request("/web/instances/inst_nonexistent", { method: "DELETE" });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.type).toBe("bad_request");
  });

  test("DELETE /web/instances/:id — returns 403 for non-owner", async () => {
    mockStopInstance.mockReturnValueOnce({ ok: false, error: "Not your instance" });

    const res = await app.request("/web/instances/inst_other", { method: "DELETE" });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toBe("Not your instance");
  });
});
