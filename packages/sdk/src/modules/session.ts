import { BaseApi } from "../base";
import type { ApiResult } from "../result";
import type {
  SessionListResponse,
  SessionResponse,
  SessionHistory,
  SendEventResponse,
  InterruptResponse,
} from "../types/schemas";

export type SessionEventPayload = Record<string, unknown>;

export class SessionApi extends BaseApi {
  async list(): Promise<ApiResult<SessionListResponse>> {
    return this.get<SessionListResponse>("/web/sessions");
  }
  async get(params: { id: string }): Promise<ApiResult<SessionResponse>> {
    return this.get<SessionResponse>("/web/sessions/:id", { params });
  }
  async history(params: { id: string }): Promise<ApiResult<SessionHistory>> {
    return this.get<SessionHistory>("/web/sessions/:id/history", { params });
  }
}

export class ControlApi extends BaseApi {
  async sendEvent(
    params: { id: string },
    payload: SessionEventPayload,
  ): Promise<ApiResult<SendEventResponse>> {
    return this.post<SendEventResponse>("/web/sessions/:id/events", payload, { params });
  }
  async control(
    params: { id: string },
    payload: SessionEventPayload,
  ): Promise<ApiResult<SendEventResponse>> {
    return this.post<SendEventResponse>("/web/sessions/:id/control", payload, { params });
  }
  async interrupt(params: { id: string }): Promise<ApiResult<InterruptResponse>> {
    return this.post<InterruptResponse>("/web/sessions/:id/interrupt", undefined, { params });
  }
}
