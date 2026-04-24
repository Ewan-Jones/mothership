import type { Session, Environment, ControlResponse, SessionEvent } from "../types";

const BASE = "";

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  const url = `${BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers,
    credentials: "include", // send cookies for better-auth session
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) {
    const err = data.error || { type: "unknown", message: res.statusText };
    throw new Error(err.message || err.type);
  }
  return data as T;
}

// --- Sessions ---

export function apiFetchAllSessions() {
  return api<Session[]>("GET", "/web/sessions/all");
}

export function apiFetchSession(id: string) {
  return api<Session>("GET", `/web/sessions/${id}`);
}

export function apiFetchSessions() {
  return api<Session[]>("GET", "/web/sessions");
}

// --- Environments ---

export function apiFetchEnvironments() {
  return api<Environment[]>("GET", "/web/environments");
}

// --- Control ---

/** @deprecated Legacy — used by RCS chat adapter for non-ACP sessions */
export function getUuid(): string {
  return "";
}

/** @deprecated Legacy — bind session to current user */
export function apiBind(sessionId: string) {
  return api<void>("POST", "/web/bind", { sessionId });
}

/** @deprecated Legacy — fetch session history */
export function apiFetchSessionHistory(id: string) {
  return api<{ events: SessionEvent[] }>("GET", `/web/sessions/${id}/history`);
}

/** @deprecated Legacy — send event to session */
export function apiSendEvent(sessionId: string, body: Record<string, unknown>) {
  return api<void>("POST", `/web/sessions/${sessionId}/events`, body);
}

export function apiSendControl(sessionId: string, body: ControlResponse) {
  return api<void>("POST", `/web/sessions/${sessionId}/control`, body);
}

export function apiInterrupt(sessionId: string) {
  return api<void>("POST", `/web/sessions/${sessionId}/interrupt`);
}

// --- API Keys ---

export interface ApiKeyInfo {
  id: string;
  label: string;
  keyPrefix: string;
  createdAt: number;
  lastUsedAt: number | null;
}

export interface CreateApiKeyResponse extends ApiKeyInfo {
  full_key: string;
}

export function apiFetchApiKeys() {
  return api<ApiKeyInfo[]>("GET", "/web/api-keys");
}

export function apiCreateApiKey(label: string) {
  return api<CreateApiKeyResponse>("POST", "/web/api-keys", { label });
}

export function apiDeleteApiKey(id: string) {
  return api<{ ok: boolean }>("DELETE", `/web/api-keys/${id}`);
}

export function apiUpdateApiKeyLabel(id: string, label: string) {
  return api<{ ok: boolean }>("PATCH", `/web/api-keys/${id}`, { label });
}
