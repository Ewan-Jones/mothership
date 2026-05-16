/**
 * environment-core — 共享常量、类型、工具函数
 *
 * 从 environment.ts 拆分出的基础模块，被 environment-web 和 environment-acp 共同依赖。
 */
import { randomBytes } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { mkdirSync, realpathSync } from "node:fs";
import { environmentRepo } from "../repositories";
import type { EnvironmentRecord } from "../repositories";
import { NotFoundError } from "../errors";

// ────────────────────────────────────────────
// 常量
// ────────────────────────────────────────────

/** 禁止作为 workspace 的系统目录 */
export const BLOCKED_PATHS = [
  "/", "/etc", "/usr", "/bin", "/sbin", "/var", "/sys", "/proc",
  "/dev", "/boot", "/lib", "/root",
];

/** kebab-case 名称校验正则 */
export const KEBAB_CASE_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

// ────────────────────────────────────────────
// 工具函数
// ────────────────────────────────────────────

/** 校验 workspace 路径是否安全（不在系统目录下） */
export function validateWorkspacePath(p: string): string | null {
  if (!isAbsolute(p)) return "workspace 路径必须是绝对路径";
  const normalized = resolve(p);
  if (BLOCKED_PATHS.includes(normalized))
    return `不允许使用系统目录: ${normalized}`;
  for (const blocked of BLOCKED_PATHS) {
    if (blocked !== "/" && normalized.startsWith(blocked + "/")) {
      return `不允许使用系统目录下的路径: ${normalized}`;
    }
  }
  return null;
}

/** 确保 workspace 目录存在，返回真实路径 */
export function ensureWorkspaceDir(workspacePath: string): string {
  mkdirSync(workspacePath, { recursive: true });
  return realpathSync(workspacePath);
}

/** 生成 Web 控制面板 Environment 的 secret */
export function generateEnvSecret(): string {
  return `env_secret_${randomBytes(24).toString("hex")}`;
}

// ────────────────────────────────────────────
// v1 格式响应转换
// ────────────────────────────────────────────

import type { EnvironmentResponse } from "../types/api";

/** 将 EnvironmentRecord 转为 v1 API 响应格式 */
export function toResponse(row: EnvironmentRecord): EnvironmentResponse {
  return {
    id: row.id,
    machine_name: row.machineName,
    directory: row.directory,
    branch: row.branch,
    status: row.status,
    username: row.username,
    last_poll_at: row.lastPollAt ? row.lastPollAt.getTime() / 1000 : null,
    worker_type: row.workerType,
    capabilities: row.capabilities,
  };
}

// ────────────────────────────────────────────
// Web 格式响应转换
// ────────────────────────────────────────────

/** 将 EnvironmentRecord 转为 Web 控制面板 API 响应格式 */
export function sanitizeResponse(row: EnvironmentRecord) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    workspace_path: row.workspacePath,
    agent_name: row.agentName ?? null,
    agent_config_id: row.agentConfigId ?? null,
    status: row.status,
    machine_name: row.machineName ?? null,
    branch: row.branch ?? null,
    auto_start: row.autoStart ?? false,
    last_poll_at: row.lastPollAt
      ? Math.floor(new Date(row.lastPollAt).getTime() / 1000)
      : null,
    created_at: Math.floor(new Date(row.createdAt).getTime() / 1000),
    updated_at: Math.floor(new Date(row.updatedAt).getTime() / 1000),
  };
}

// ────────────────────────────────────────────
// 共享所有权校验 & 删除
// ────────────────────────────────────────────

/** 获取 Environment 并验证归属，未找到或不属于该用户时抛出 NotFoundError */
export async function getOwnedEnvironment(envId: string, userId: string) {
  const env = await environmentRepo.getById(envId);
  if (!env || env.userId !== userId) {
    throw new NotFoundError("环境不存在");
  }
  return env;
}

/** 删除 Environment */
export async function deleteEnvironment(envId: string): Promise<boolean> {
  return environmentRepo.delete(envId);
}

// ────────────────────────────────────────────
// 共享类型
// ────────────────────────────────────────────

/** 创建 Web 控制面板 Environment 的参数 */
export interface CreateWebEnvironmentParams {
  name: string;
  description?: string;
  agentConfigId?: string;
  workspacePath: string;
  autoStart?: boolean;
  userId: string;
}

/** 更新 Web 控制面板 Environment 的参数 */
export interface UpdateWebEnvironmentParams {
  name?: string;
  description?: string | null;
  workspacePath?: string;
  agentConfigId?: string | null;
  autoStart?: boolean;
}
