export type ChannelProviderType = "wechat" | "feishu";

export type ChannelProviderStatus = "disabled";

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
  return CHANNEL_PROVIDERS.map((provider) => ({ ...provider }));
}

export function getChannelProvider(
  type: string,
): ChannelProviderDescriptor | undefined {
  const provider = CHANNEL_PROVIDERS.find((item) => item.type === type);
  return provider ? { ...provider } : undefined;
}
