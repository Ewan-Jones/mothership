import { describe, test, expect, beforeEach, afterAll, mock } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const srcDir = resolve(__dirname, "..");

// Mock db to prevent side effects
mock.module(resolve(srcDir, "db"), () => ({
  db: {},
  initDb: () => {},
}));

// Mock auth middleware using the path that the route file uses (relative to its own location)
const middlewarePath = resolve(srcDir, "auth", "middleware");
mock.module(middlewarePath, () => ({
  sessionAuth: async (c: any, next: any) => {
    c.set("user", { id: "test-user", email: "test@test.com", name: "Test" });
    await next();
  },
}));

// Mock better-auth to prevent side effects
mock.module(resolve(srcDir, "auth", "better-auth"), () => ({
  auth: { api: { getSession: async () => ({ user: { id: "u", name: "T", email: "t@t" }, session: { id: "s" } }) } },
}));

const storePath = resolve(srcDir, "store");

import { Hono } from "hono";

let workspaceDir: string;
let mockStoreModule: any;

describe("Files Route", () => {
  let app: Hono;
  const sessionId = "session_test123";

  beforeEach(async () => {
    workspaceDir = await mkdtemp(join(tmpdir(), "rcs-files-test-"));
    await mkdir(join(workspaceDir, "user"), { recursive: true });

    // Mock store with fresh workspaceDir
    mock.module(storePath, () => ({
      storeGetSession: () => ({ id: sessionId, environmentId: "env_test" }),
      storeGetEnvironment: () => ({ id: "env_test", workspacePath: workspaceDir }),
    }));

    // Re-import to pick up fresh mock
    const mod = await import("../routes/web/files");
    app = new Hono();
    app.route("/web/sessions", mod.default);
  });

  afterAll(async () => {
    await rm(workspaceDir, { recursive: true, force: true });
  });

  test("GET /:sessionId/files — lists files in directory", async () => {
    await writeFile(join(workspaceDir, "user", "hello.txt"), "Hello World");
    const res = await app.request(`/web/sessions/${sessionId}/files`, {
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toBeDefined();
    expect(body.entries.length).toBeGreaterThanOrEqual(1);
    const helloFile = body.entries.find((e: any) => e.name === "hello.txt");
    expect(helloFile).toBeDefined();
    expect(helloFile.type).toBe("file");
  });

  test("GET /:sessionId/files — 404 for invalid session", async () => {
    mock.module(storePath, () => ({
      storeGetSession: () => undefined,
      storeGetEnvironment: () => undefined,
    }));
    const mod = await import("../routes/web/files");
    const testApp = new Hono();
    testApp.route("/web/sessions", mod.default);

    const res = await testApp.request(`/web/sessions/invalid-session/files`, {
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(404);
  });

  test("PUT /:sessionId/files/* — writes file content", async () => {
    const res = await app.request(`/web/sessions/${sessionId}/files/notes.txt`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Test content" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("notes.txt");
    expect(body.path).toBe("user/notes.txt");

    const { readFile } = await import("node:fs/promises");
    const content = await readFile(join(workspaceDir, "user", "notes.txt"), "utf-8");
    expect(content).toBe("Test content");
  });

  test("GET /:sessionId/files/* — reads written file", async () => {
    await writeFile(join(workspaceDir, "user", "readme.md"), "# Readme");
    const res = await app.request(`/web/sessions/${sessionId}/files/readme.md`, {
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("readme.md");
    expect(body.content).toBe("# Readme");
    expect(body.encoding).toBe("utf-8");
  });

  test("DELETE /:sessionId/files/* — deletes a file", async () => {
    await writeFile(join(workspaceDir, "user", "temp.txt"), "to delete");
    const res = await app.request(`/web/sessions/${sessionId}/files/temp.txt`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const { stat } = await import("node:fs/promises");
    await expect(stat(join(workspaceDir, "user", "temp.txt"))).rejects.toThrow();
  });

  test("DELETE /:sessionId/files/* — 400 when trying to delete directory", async () => {
    await mkdir(join(workspaceDir, "user", "subdir"), { recursive: true });
    const res = await app.request(`/web/sessions/${sessionId}/files/subdir`, {
      method: "DELETE",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("Cannot delete directories");
  });

  test("path traversal — GET with ../ returns 404", async () => {
    const res = await app.request(`/web/sessions/${sessionId}/files?path=../../../etc`, {
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(404);
  });

  test("path traversal — PUT with ../ returns 404", async () => {
    const res = await app.request(`/web/sessions/${sessionId}/files/../../../etc/evil.txt`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "hack" }),
    });
    expect(res.status).toBe(404);
  });

  test("path traversal — DELETE with ../ returns 404", async () => {
    const res = await app.request(`/web/sessions/${sessionId}/files/../../../etc/passwd`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  test("POST /:sessionId/files/* — uploads files", async () => {
    const formData = new FormData();
    formData.append("files", new File(["file content"], "upload.txt"));
    const res = await app.request(`/web/sessions/${sessionId}/files/`, {
      method: "POST",
      body: formData,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.files).toBeDefined();
    expect(body.files.length).toBe(1);
    expect(body.files[0].name).toBe("upload.txt");

    const { readFile } = await import("node:fs/promises");
    const content = await readFile(join(workspaceDir, "user", "upload.txt"), "utf-8");
    expect(content).toBe("file content");
  });
});
