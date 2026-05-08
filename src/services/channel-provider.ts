import { getHermesClient } from "./hermes-client";

export type ChannelProviderType = "wechat" | "feishu";

export type ChannelProviderStatus = "disabled" | "enabled";

export interface ChannelProviderDescriptor {
  type: ChannelProviderType;
  label: string;
  status: ChannelProviderStatus;
}

/**
 * Unified contract for future channel integrations.
 * The initial version only defines extension points and does not create instances.
 */
export interface ChannelProvider {
  readonly descriptor: ChannelProviderDescriptor;
  startLogin(): Promise<never>;
  getLoginState(): Promise<never>;
  startRuntime(): Promise<never>;
  stopRuntime(): Promise<never>;
}

const CHANNEL_PROVIDERS: ChannelProviderDescriptor[] = [
  { type: "wechat", label: "微信", status: "disabled" },
  { type: "feishu", label: "飞书", status: "disabled" },
];

export function listChannelProviders(): ChannelProviderDescriptor[] {
  const hermesClient = getHermesClient();
  const hermesStatus = hermesClient?.getStatus();
  const hermesConnected = hermesStatus?.connected ?? false;
  const hermesPlatforms = hermesStatus?.platforms ?? [];

  return CHANNEL_PROVIDERS.map((provider) => ({
    ...provider,
    status: (hermesConnected && hermesPlatforms.includes(provider.type))
      ? "enabled" as const
      : provider.status,
  }));
}

export function getChannelProvider(
  type: string,
): ChannelProviderDescriptor | undefined {
  const provider = CHANNEL_PROVIDERS.find((item) => item.type === type);
  return provider ? { ...provider } : undefined;
}
