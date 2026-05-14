import { treaty } from "@elysiajs/eden";
import type { App } from "@server/index";

export const client = treaty<App>(
  typeof globalThis.window !== "undefined" ? globalThis.window.location.origin : "",
  { fetch: { credentials: "include" } },
);

// --- SSE 辅助函数（Eden 不原生支持 SSE） ---

export function createSessionEventSource(sessionId: string): EventSource {
  return new EventSource(`/web/sessions/${sessionId}/events`, { withCredentials: true });
}

// --- FormData 上传辅助函数 ---

export async function fetchUpload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) {
    const errInfo = data.error || { type: "unknown", message: res.statusText };
    const err = new Error(errInfo.message || errInfo.type) as Error & { code?: string; data?: unknown };
    if (errInfo && typeof errInfo === "object" && "code" in errInfo) {
      err.code = (errInfo as Record<string, unknown>).code as string;
    }
    if (data.data !== undefined) {
      err.data = data.data;
    }
    throw err;
  }
  return data as T;
}

// --- UUID 存储辅助函数 ---

const UUID_KEY = "rcs_uuid";

export function getUuid(): string {
  return localStorage.getItem(UUID_KEY) || "";
}

export function setUuid(uuid: string): void {
  localStorage.setItem(UUID_KEY, uuid);
}

// --- Session 辅助函数（Eden 不方便直接表达的 REST 操作） ---

async function apiFetch<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || res.statusText);
  }
  return data as T;
}

export async function apiCreateSession(body: { title?: string; environment_id?: string }) {
  return apiFetch<any>("POST", "/web/sessions", body);
}

export async function apiFetchSession(sessionId: string) {
  return apiFetch<any>("GET", `/web/sessions/${sessionId}`);
}

export async function apiFetchSessionHistory(sessionId: string) {
  return apiFetch<{ events: any[] }>("GET", `/web/sessions/${sessionId}/history`);
}

export async function apiSendEvent(sessionId: string, payload: unknown) {
  return apiFetch<any>("POST", `/web/sessions/${sessionId}/events`, payload);
}

export async function apiSendControl(sessionId: string, payload: unknown) {
  return apiFetch<any>("POST", `/web/sessions/${sessionId}/control`, payload);
}

export async function apiInterrupt(sessionId: string) {
  return apiFetch<any>("POST", `/web/sessions/${sessionId}/control`, {
    type: "interrupt",
  });
}

export async function apiListFiles(sessionId: string, path?: string) {
  const params = path ? `?path=${encodeURIComponent(path)}` : "";
  return apiFetch<{ entries: any[] }>("GET", `/web/sessions/${sessionId}/user${params}`);
}

export async function apiUploadFile(sessionId: string, dir: string, files: File[]) {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }
  return fetchUpload<{ files: any[] }>(`/web/sessions/${sessionId}/user/${dir}`, formData);
}
