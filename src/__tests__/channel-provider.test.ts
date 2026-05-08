import { describe, expect, mock, test } from "bun:test";

describe("channel provider registry", () => {
  test("listChannelProviders 无 Hermes 时返回全部 disabled", async () => {
    mock.module("../services/hermes-client", () => ({
      getHermesClient: () => null,
    }));

    const { listChannelProviders } = await import("../services/channel-provider");
    const providers = listChannelProviders();
    expect(providers.every((provider) => provider.status === "disabled")).toBe(true);
    expect(providers).toHaveLength(2);
  });

  test("getChannelProvider returns descriptor for known type and undefined otherwise", async () => {
    const { getChannelProvider } = await import("../services/channel-provider");
    expect(getChannelProvider("wechat")).toBeDefined();
    expect(getChannelProvider("unknown")).toBeUndefined();
  });
});

describe("channel provider with Hermes connected", () => {
  test("Hermes 已连接时对应平台为 enabled", async () => {
    mock.module("../services/hermes-client", () => ({
      getHermesClient: () => ({
        getStatus: () => ({
          connected: true,
          url: "ws://127.0.0.1:8642/messaging",
          platforms: ["feishu"],
          reconnecting: false,
          lastConnectedAt: 1715184000000,
        }),
      }),
    }));

    const { listChannelProviders } = await import("../services/channel-provider");
    const providers = listChannelProviders();
    const wechat = providers.find((p) => p.type === "wechat");
    const feishu = providers.find((p) => p.type === "feishu");
    expect(wechat?.status).toBe("disabled");
    expect(feishu?.status).toBe("enabled");
  });
});
