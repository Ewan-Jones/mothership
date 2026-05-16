import { eventService } from "../services/event-service";
import { v4 as uuid } from "uuid";

/**
 * Session 管理已下沉到 Agent 进程（acp-link）。
 * 此文件仅保留 RCS 侧 SSE/EventBus 所需的最小接口，
 * 以及向后兼容的轻量存根供 legacy 路由使用。
 * Session 元数据（list/get/create）由 ACP 协议通过 relay 透传。
 */

// ────────────────────────────────────────────
// EventBus 相关（核心保留）
// ────────────────────────────────────────────

export async function updateSessionStatus(sessionId: string, status: string) {
  const bus = eventService.getAllBuses().get(sessionId);
  if (!bus) return;
  bus.publish({
    id: uuid(),
    sessionId,
    type: "session_status",
    payload: { status },
    direction: "inbound",
  });
}

export async function archiveSession(sessionId: string) {
  await updateSessionStatus(sessionId, "archived");
  eventService.removeBus(sessionId);
}

// ────────────────────────────────────────────
// 向后兼容存根（legacy v1/v2 路由）
// Session 元数据由 Agent 管理，RCS 不再持久化
// ────────────────────────────────────────────

interface LightweightSession {
  id: string;
  environment_id: string | null;
  agent_name: string | null;
  title: string | null;
  status: string;
  source: string;
  permission_mode: string | null;
  worker_epoch: number;
  username: string | null;
  created_at: number;
  updated_at: number;
}

/** @deprecated Session 由 Agent 管理，此函数仅检查 EventBus 是否活跃 */
export async function getSession(sessionId: string): Promise<LightweightSession | null> {
  const bus = eventService.getAllBuses().get(sessionId);
  if (!bus) return null;
  const now = Date.now() / 1000;
  return {
    id: sessionId,
    environment_id: null,
    agent_name: null,
    title: null,
    status: "active",
    source: "acp",
    permission_mode: null,
    worker_epoch: 0,
    username: null,
    created_at: now,
    updated_at: now,
  };
}

/** @deprecated Session 由 Agent 管理，直接返回 sessionId */
export async function resolveExistingSessionId(sessionId: string): Promise<string | null> {
  const bus = eventService.getAllBuses().get(sessionId);
  return bus ? sessionId : null;
}

/** @deprecated 兼容旧调用路径 */
export async function resolveExistingWebSessionId(sessionId: string): Promise<string | null> {
  return resolveExistingSessionId(sessionId);
}

/** @deprecated 兼容旧调用路径 — 不再验证 ownership */
export async function resolveOwnedWebSessionId(sessionId: string, _uuid: string): Promise<string | null> {
  return resolveExistingSessionId(sessionId);
}

/** @deprecated Session 不再由 RCS 创建，返回轻量存根 */
export async function createSession(req: Record<string, unknown>): Promise<LightweightSession> {
  const id = `session_${uuid().replace(/-/g, "")}`;
  const now = Date.now() / 1000;
  return {
    id,
    environment_id: (req.environment_id as string) ?? null,
    agent_name: null,
    title: (req.title as string) ?? null,
    status: "idle",
    source: (req.source as string) ?? "acp",
    permission_mode: (req.permission_mode as string) ?? null,
    worker_epoch: 0,
    username: (req.username as string) ?? null,
    created_at: now,
    updated_at: now,
  };
}

/** @deprecated Session 不再由 RCS 创建，返回轻量存根 */
export async function createCodeSession(req: Record<string, unknown>): Promise<LightweightSession> {
  return createSession({ ...req, source: "code" });
}

/** @deprecated No-op — title 由 Agent 管理 */
export async function updateSessionTitle(_sessionId: string, _title: string): Promise<void> {}

/** @deprecated No-op — epoch 由 Agent 管理 */
export async function incrementEpoch(sessionId: string): Promise<number> {
  return 0;
}

/** @deprecated No-op — touch 不再需要 */
export async function touchSession(_sessionId: string): Promise<void> {}

/** @deprecated 始终返回 false — Session 不再有 closed 状态 */
export function isSessionClosedStatus(_status: string | null | undefined): boolean {
  return false;
}

/** @deprecated Passthrough — Session ID 不再需要转换 */
export function toWebSessionId(sessionId: string): string {
  return sessionId;
}

/** @deprecated Passthrough */
export async function toWebSessionResponse(session: LightweightSession): Promise<LightweightSession> {
  return session;
}

/** @deprecated 返回空列表 — Session 列表由 ACP session/list 获取 */
export async function listWebSessionsByOwnerUuid(_uuid: string): Promise<LightweightSession[]> {
  return [];
}

/** @deprecated 返回空列表 */
export async function listSessions(): Promise<LightweightSession[]> {
  return [];
}

/** @deprecated 返回空列表 */
export async function listSessionSummaries(): Promise<Array<{ id: string; title: string | null; status: string; username: string | null; updated_at: number }>> {
  return [];
}

/** @deprecated 返回空列表 */
export async function listSessionSummariesByOwnerUuid(_uuid: string): Promise<Array<{ id: string; title: string | null; status: string; username: string | null; updated_at: number }>> {
  return [];
}

/** @deprecated 返回空列表 */
export async function listSessionSummariesByUsername(_username: string): Promise<Array<{ id: string; title: string | null; status: string; username: string | null; updated_at: number }>> {
  return [];
}

/** @deprecated 返回空列表 */
export async function listSessionsByEnvironment(_envId: string): Promise<LightweightSession[]> {
  return [];
}
