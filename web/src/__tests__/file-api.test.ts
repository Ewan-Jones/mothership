import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Mock fetch globally
let mockFetchCalls: Array<{ url: string; method: string; headers?: Record<string, string>; body?: any }> = [];

const originalFetch = globalThis.fetch;

describe("File API Functions", () => {
  beforeEach(() => {
    mockFetchCalls = [];
    globalThis.fetch = async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.toString();
      mockFetchCalls.push({
        url,
        method: init?.method || "GET",
        headers: init?.headers,
        body: init?.body,
      });
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ success: true }),
        text: async () => JSON.stringify({ success: true }),
      } as any;
    };
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  // 测试列出文件不带目录参数
  test("apiListFiles — no dir param", async () => {
    const { apiListFiles } = await import("../api/client");
    await apiListFiles("s1");
    expect(mockFetchCalls.length).toBe(1);
    expect(mockFetchCalls[0].url).toBe("/web/sessions/s1/user");
    expect(mockFetchCalls[0].method).toBe("GET");
  });

  // 测试列出文件带目录参数
  test("apiListFiles — with dir param", async () => {
    const { apiListFiles } = await import("../api/client");
    await apiListFiles("s1", "docs/");
    expect(mockFetchCalls.length).toBe(1);
    expect(mockFetchCalls[0].url).toContain("/web/sessions/s1/user?path=");
    expect(mockFetchCalls[0].url).toContain(encodeURIComponent("docs/"));
  });

  // 测试上传文件使用 FormData 和 POST
  test("apiUploadFile — uses FormData and POST", async () => {
    const { apiUploadFile } = await import("../api/client");
    const file = new File(["content"], "test.txt");
    await apiUploadFile("s1", "docs/", [file]);
    expect(mockFetchCalls.length).toBe(1);
    expect(mockFetchCalls[0].method).toBe("POST");
    expect(mockFetchCalls[0].body).toBeInstanceOf(FormData);
    expect(mockFetchCalls[0].url).toContain("/web/sessions/s1/user/");
  });
});
