import { describe, expect, test } from "bun:test";

import {
  getChannelProvider,
  listChannelProviders,
} from "../services/channel-provider";

describe("channel provider registry", () => {
  test("listChannelProviders returns wechat and feishu", () => {
    expect(listChannelProviders()).toEqual([
      { type: "wechat", label: "微信", status: "disabled" },
      { type: "feishu", label: "飞书", status: "disabled" },
    ]);
  });

  test("all registered providers are disabled", () => {
    const providers = listChannelProviders();
    expect(providers.every((provider) => provider.status === "disabled")).toBe(true);
  });

  test("getChannelProvider returns descriptor for known type and undefined otherwise", () => {
    expect(getChannelProvider("wechat")).toEqual({
      type: "wechat",
      label: "微信",
      status: "disabled",
    });
    expect(getChannelProvider("unknown")).toBeUndefined();
  });
});
