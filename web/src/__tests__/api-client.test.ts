import { describe, test, expect, beforeEach } from "bun:test";

// In-memory localStorage mock
let store: Record<string, string> = {};

beforeEach(() => {
  store = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: () => null,
  };
});

// Mock fetch
const fetchMock = {
  lastUrl: "",
  lastOpts: {} as RequestInit,
  response: { ok: true, status: 200, statusText: "OK" },
  responseData: {} as any,
};

beforeEach(() => {
  fetchMock.lastUrl = "";
  fetchMock.lastOpts = {};
  fetchMock.response = { ok: true, status: 200, statusText: "OK" };
  fetchMock.responseData = {};
});

(globalThis as any).fetch = async (url: string, opts: RequestInit) => {
  fetchMock.lastUrl = url;
  fetchMock.lastOpts = opts;
  return {
    ok: fetchMock.response.ok,
    status: fetchMock.response.status,
    statusText: fetchMock.response.statusText,
    json: async () => fetchMock.responseData,
  } as Response;
};

const client = await import("../api/client");

// =============================================================================
// apiFetch 辅助函数 — 通过导出的包装函数测试
// =============================================================================

describe("session API functions", () => {
  // 测试创建 session 发送 POST 请求
  test("apiCreateSession — POST /web/sessions", async () => {
    fetchMock.responseData = { id: "sess_1", title: "test" };
    await client.apiCreateSession({ title: "test" });
    expect(fetchMock.lastUrl).toBe("/web/sessions");
    expect(fetchMock.lastOpts.method).toBe("POST");
    expect(fetchMock.lastOpts.credentials).toBe("include");
  });

  // 测试获取 session 详情发送 GET 请求
  test("apiFetchSession — GET /web/sessions/:id", async () => {
    fetchMock.responseData = { id: "sess_1", title: "test" };
    await client.apiFetchSession("sess_1");
    expect(fetchMock.lastUrl).toBe("/web/sessions/sess_1");
    expect(fetchMock.lastOpts.method).toBe("GET");
  });

  // 测试获取 session 历史发送 GET 请求
  test("apiFetchSessionHistory — GET /web/sessions/:id/history", async () => {
    fetchMock.responseData = { events: [] };
    await client.apiFetchSessionHistory("sess_1");
    expect(fetchMock.lastUrl).toBe("/web/sessions/sess_1/history");
    expect(fetchMock.lastOpts.method).toBe("GET");
  });

  // 测试发送事件包含 JSON body
  test("apiSendEvent — POST with JSON body", async () => {
    fetchMock.responseData = {};
    await client.apiSendEvent("sess_1", { type: "user", content: "hello" });
    expect(fetchMock.lastUrl).toBe("/web/sessions/sess_1/events");
    expect(fetchMock.lastOpts.method).toBe("POST");
    expect(JSON.parse(fetchMock.lastOpts.body as string)).toEqual({ type: "user", content: "hello" });
  });

  // 测试发送控制命令包含 JSON body
  test("apiSendControl — POST with JSON body", async () => {
    fetchMock.responseData = {};
    await client.apiSendControl("sess_1", { type: "resume" });
    expect(fetchMock.lastUrl).toBe("/web/sessions/sess_1/control");
    expect(fetchMock.lastOpts.method).toBe("POST");
  });

  // 测试中断命令
  test("apiInterrupt — POST interrupt", async () => {
    fetchMock.responseData = {};
    await client.apiInterrupt("sess_1");
    expect(fetchMock.lastUrl).toBe("/web/sessions/sess_1/control");
    expect(JSON.parse(fetchMock.lastOpts.body as string)).toEqual({ type: "interrupt" });
  });
});

// =============================================================================
// File API functions
// =============================================================================

describe("file API functions", () => {
  // 测试列出文件发送 GET 请求
  test("apiListFiles — GET /web/sessions/:id/user", async () => {
    fetchMock.responseData = { entries: [] };
    await client.apiListFiles("s1");
    expect(fetchMock.lastUrl).toBe("/web/sessions/s1/user");
    expect(fetchMock.lastOpts.method).toBe("GET");
  });

  // 测试列出文件带路径参数
  test("apiListFiles — with dir param", async () => {
    fetchMock.responseData = { entries: [] };
    await client.apiListFiles("s1", "docs/");
    expect(fetchMock.lastUrl).toContain("/web/sessions/s1/user?path=");
    expect(fetchMock.lastUrl).toContain(encodeURIComponent("docs/"));
  });

  // 测试上传文件使用 FormData
  test("apiUploadFile — uses FormData and POST", async () => {
    fetchMock.responseData = { files: [] };
    const file = new File(["content"], "test.txt");
    await client.apiUploadFile("s1", "docs/", [file]);
    expect(fetchMock.lastUrl).toBe("/web/sessions/s1/user/docs/");
    expect(fetchMock.lastOpts.method).toBe("POST");
    expect(fetchMock.lastOpts.body).toBeInstanceOf(FormData);
  });
});

// =============================================================================
// Error handling
// =============================================================================

describe("error handling", () => {
  // 测试非 ok 响应抛出错误
  test("throws error on non-ok response", async () => {
    fetchMock.response = { ok: false, status: 401, statusText: "Unauthorized" };
    fetchMock.responseData = { error: { message: "Not authenticated" } };
    await expect(client.apiFetchSession("sess-1")).rejects.toThrow("Not authenticated");
  });

  // 测试缺少错误消息时使用 statusText
  test("throws with statusText when error message is missing", async () => {
    fetchMock.response = { ok: false, status: 500, statusText: "Internal Server Error" };
    fetchMock.responseData = {};
    await expect(client.apiFetchSession("sess-1")).rejects.toThrow("Internal Server Error");
  });
});

// =============================================================================
// UUID helper functions
// =============================================================================

describe("UUID helpers", () => {
  // 测试默认返回空字符串
  test("getUuid returns empty string by default", () => {
    expect(client.getUuid()).toBe("");
  });

  // 测试设置和获取 UUID
  test("setUuid and getUuid roundtrip", () => {
    client.setUuid("test-uuid-123");
    expect(client.getUuid()).toBe("test-uuid-123");
  });
});
