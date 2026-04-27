import { describe, expect, mock, test } from "bun:test";

mock.module("../auth/better-auth", () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: { id: "test-user-1", email: "test@test.com", name: "TestUser" },
        session: { id: "sess-1", userId: "test-user-1", token: "tok-1" },
      }),
    },
  },
}));

const { Hono } = await import("hono");
const webChannels = (await import("../routes/web/channels")).default;

const testApp = new Hono();
testApp.route("/web", webChannels);

describe("channel routes", () => {
  test("GET /web/channels/providers returns disabled providers", async () => {
    const res = await testApp.request("/web/channels/providers");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toEqual([
      { type: "wechat", label: "微信", status: "disabled" },
      { type: "feishu", label: "飞书", status: "disabled" },
    ]);
  });

  test("GET /web/channels returns empty list", async () => {
    const res = await testApp.request("/web/channels");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toEqual([]);
  });

  test("POST /web/channels rejects all create attempts", async () => {
    for (const type of ["wechat", "feishu"]) {
      const res = await testApp.request("/web/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      expect(res.status).toBe(409);
      const body = await res.json() as any;
      expect(body).toEqual({
        error: { type: "FORBIDDEN", message: "当前平台暂未开放" },
      });
    }
  });
});
