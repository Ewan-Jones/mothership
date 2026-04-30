import { ACPClient } from "./client";
import type { ACPSettings } from "./types";

/**
 * Build the RCS relay WebSocket URL for a given agent.
 * Uses cookie-based auth (better-auth session).
 */
export function buildRelayUrl(agentId: string, sessionId?: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const base = `${protocol}//${window.location.host}/acp/relay/${agentId}`;
  if (sessionId) {
    return `${base}?sessionId=${encodeURIComponent(sessionId)}`;
  }
  return base;
}

/**
 * Create an ACPClient that connects to an agent through the RCS relay.
 * The relay transparently forwards ACP protocol messages between
 * the frontend and the target acp-link instance.
 * Authentication is handled via cookies (better-auth session).
 */
export function createRelayClient(agentId: string, sessionId?: string): ACPClient {
  const relayUrl = buildRelayUrl(agentId, sessionId);
  const settings: ACPSettings = { proxyUrl: relayUrl };
  return new ACPClient(settings);
}
