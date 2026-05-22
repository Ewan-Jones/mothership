import { BaseApi } from "../base";
import type { ApiResult } from "../result";
import type {
  ChannelProviderListResponse,
  HermesStatus,
  ChannelBindingListResponse,
  ChannelBinding,
  CreateChannelBindingRequest,
  CreateChannelBindingResponse,
  DeleteChannelBindingResponse,
  UpdateChannelBindingResponse,
} from "../types/schemas";

export class ChannelApi extends BaseApi {
  async listProviders(): Promise<ApiResult<ChannelProviderListResponse>> {
    return this.get<ChannelProviderListResponse>("/web/channels/providers");
  }
  async hermesStatus(): Promise<ApiResult<HermesStatus>> {
    return this.get<HermesStatus>("/web/channels/hermes/status");
  }
  async listBindings(): Promise<ApiResult<ChannelBindingListResponse>> {
    return this.get<ChannelBindingListResponse>("/web/channels/bindings");
  }
  async createBinding(body: CreateChannelBindingRequest): Promise<ApiResult<CreateChannelBindingResponse>> {
    return this.post<CreateChannelBindingResponse>("/web/channels/bindings", body);
  }
  async deleteBinding(params: { id: string }): Promise<ApiResult<DeleteChannelBindingResponse>> {
    return this.del<DeleteChannelBindingResponse>("/web/channels/bindings/:id", { params });
  }
  async updateBinding(params: { id: string }, body: Partial<Pick<ChannelBinding, "platform" | "chatId" | "agentId" | "enabled">>): Promise<ApiResult<UpdateChannelBindingResponse>> {
    return this.patch<UpdateChannelBindingResponse>("/web/channels/bindings/:id", body, { params });
  }
}
