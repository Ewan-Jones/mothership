import { describe, test, expect, beforeEach, mock } from "bun:test";

// Mock fetch
const fetchMock = { status: 200, body: {} as unknown };
const originalFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock.status = 200;
  fetchMock.body = {};
  globalThis.fetch = mock(() =>
    Promise.resolve(new Response(JSON.stringify(fetchMock.body), { status: fetchMock.status, headers: { "Content-Type": "application/json" } }))
  ) as typeof fetch;
});

describe("config api client", () => {
  test("apiListProviders returns providers array", async () => {
    fetchMock.body = { success: true, data: { providers: [{ name: "openai", configured: true, keyHint: "sk-...abc", baseURL: "" }] } };
    const { apiListProviders } = await import("../api/client");
    const result = await apiListProviders();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("openai");
  });

  test("apiSetProvider sends correct payload", async () => {
    fetchMock.body = { success: true, data: { name: "openai", keyHint: "sk-...abc" } };
    const { apiSetProvider } = await import("../api/client");
    await apiSetProvider("openai", { apiKey: "sk-test" });
    const call = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.action).toBe("set");
    expect(body.name).toBe("openai");
    expect(body.data).toEqual({ apiKey: "sk-test" });
  });

  test("apiTestProvider returns models", async () => {
    fetchMock.body = { success: true, data: { models: ["gpt-4", "gpt-3.5"] } };
    const { apiTestProvider } = await import("../api/client");
    const result = await apiTestProvider("openai");
    expect(result.models).toEqual(["gpt-4", "gpt-3.5"]);
  });

  test("apiGetModels returns ModelConfig", async () => {
    fetchMock.body = { success: true, data: { current: { model: "gpt-4", small_model: null }, available: [] } };
    const { apiGetModels } = await import("../api/client");
    const result = await apiGetModels();
    expect(result.current.model).toBe("gpt-4");
  });

  test("apiCreateAgent sends create action", async () => {
    fetchMock.body = { success: true, data: { name: "my-agent" } };
    const { apiCreateAgent } = await import("../api/client");
    await apiCreateAgent("my-agent", { model: "gpt-4" });
    const call = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.action).toBe("create");
  });

  test("apiDeleteSkill sends delete action", async () => {
    fetchMock.body = { success: true, data: null };
    const { apiDeleteSkill } = await import("../api/client");
    await apiDeleteSkill("my-skill");
    const call = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.action).toBe("delete");
  });

  test("error response throws", async () => {
    fetchMock.body = { success: false, error: { code: "NOT_FOUND", message: "Not found" } };
    const { apiGetProvider } = await import("../api/client");
    expect(apiGetProvider("xxx")).rejects.toThrow("Not found");
  });

  test("apiUploadSkills 发送 FormData 且不设置 JSON header", async () => {
    fetchMock.body = { success: true, data: { imported: [], skipped: [], conflicts: [] } };
    const { apiUploadSkills } = await import("../api/client");
    const formData = new FormData();
    formData.append("manifest", "[]");
    await apiUploadSkills(formData);
    const call = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0];
    expect(call[0]).toBe("/web/config/skills/upload");
    expect(call[1].method).toBe("POST");
    expect(call[1].body).toBe(formData);
    expect(call[1].headers).toBeUndefined();
  });

  test("apiUploadSkills 409 错误保留 code 和 data", async () => {
    fetchMock.status = 409;
    fetchMock.body = {
      success: false,
      error: { code: "SKILL_CONFLICT", message: "检测到同名技能冲突" },
      data: {
        conflicts: [{ name: "existing", enabled: true, path: "/tmp/existing/SKILL.md" }],
        allowedStrategies: ["ignore", "overwrite"],
      },
    };
    const { apiUploadSkills } = await import("../api/client");
    const formData = new FormData();
    formData.append("manifest", "[]");
    try {
      await apiUploadSkills(formData);
      throw new Error("expected apiUploadSkills to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const uploadError = error as Error & { code?: string; data?: { conflicts: unknown[]; allowedStrategies: string[] } };
      expect(uploadError.code).toBe("SKILL_CONFLICT");
      expect(uploadError.data?.conflicts).toHaveLength(1);
      expect(uploadError.data?.allowedStrategies).toEqual(["ignore", "overwrite"]);
    }
  });
});
