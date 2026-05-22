import { BaseApi } from "../base";
import type { ApiResult } from "../result";
import type {
  InstanceInfo,
  InstanceListResponse,
  DeleteInstanceResponse,
  SpawnInstanceFromEnvironmentRequest,
} from "../types/schemas";

export class InstanceApi extends BaseApi {
  async spawn(body: SpawnInstanceFromEnvironmentRequest): Promise<ApiResult<InstanceInfo>> {
    return this.post<InstanceInfo>("/web/instances/from-environment", body);
  }
  async list(): Promise<ApiResult<InstanceListResponse>> {
    return this.get<InstanceListResponse>("/web/instances");
  }
  async delete(params: { id: string }): Promise<ApiResult<DeleteInstanceResponse>> {
    return this.del<DeleteInstanceResponse>("/web/instances/:id", { params });
  }
}
