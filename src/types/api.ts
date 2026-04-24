/** API 请求/响应类型定义 */

// Hono context variable types
declare module "hono" {
  interface ContextVariableMap {
    user: { id: string; email: string; name: string } | null;
    session: { id: string; userId: string; token: string } | null;
  }
}

// --- Environment ---

export interface EnvironmentResponse {
  id: string;
  machine_name: string | null;
  directory: string | null;
  branch: string | null;
  status: string;
  username: string | null;
  last_poll_at: number | null;
  worker_type?: string;
  capabilities?: Record<string, unknown> | null;
}

export interface SessionSummaryResponse {
  id: string;
  title: string | null;
  status: string;
  username: string | null;
  updated_at: number;
}

export interface SessionResponse {
  id: string;
  environment_id: string | null;
  title: string | null;
  status: string;
  source: string;
  permission_mode: string | null;
  worker_epoch: number;
  username: string | null;
  created_at: number;
  updated_at: number;
}

// --- Error ---

export interface ErrorResponse {
  error: {
    type: string;
    message: string;
  };
}
