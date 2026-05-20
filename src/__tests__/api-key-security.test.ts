import { describe, expect, test } from "bun:test";
import { hashApiKey } from "../auth/api-key-service";
import { requireTeamScope } from "../plugins/require-team-scope";
import type { AuthContext } from "../plugins/auth";

// ---------- Hash 存储验证 ----------

describe("API Key hash 存储", () => {
  // 相同 key 产生相同 hash
  test("相同 key 产生相同 hash", () => {
    const key = "rcs_abcdef1234567890";
    expect(hashApiKey(key)).toBe(hashApiKey(key));
  });

  // 不同 key 产生不同 hash
  test("不同 key 产生不同 hash", () => {
    expect(hashApiKey("rcs_aaa")).not.toBe(hashApiKey("rcs_bbb"));
  });

  // hash 长度 64 hex chars
  test("hash 长度 64 hex chars", () => {
    expect(hashApiKey("rcs_test")).toMatch(/^[0-9a-f]{64}$/);
  });

  // hash 不包含原始 key
  test("hash 不包含原始 key", () => {
    const key = "rcs_super_secret_key_12345";
    const hash = hashApiKey(key);
    expect(hash).not.toContain("rcs_");
    expect(hash).not.toContain("secret");
  });
});

// ---------- requireTeamScope 验证 ----------

describe("requireTeamScope 归属校验", () => {
  const makeAuthCtx = (teamId: string): AuthContext => ({
    teamId,
    userId: "user-1",
    role: "owner",
  });

  // 匹配 teamId — 通过
  test("匹配 teamId — 通过", () => {
    expect(requireTeamScope(makeAuthCtx("team-a"), "team-a")).toBeUndefined();
  });

  // 不匹配 teamId — 拒绝
  test("不匹配 teamId — 拒绝", () => {
    const result = requireTeamScope(makeAuthCtx("team-a"), "team-b");
    expect(result).toBeDefined();
  });

  // null authContext — 拒绝
  test("null authContext — 拒绝", () => {
    const result = requireTeamScope(null as any, "team-a");
    expect(result).toBeDefined();
  });

  // null resourceTeamId — 拒绝
  test("null resourceTeamId — 拒绝", () => {
    const result = requireTeamScope(makeAuthCtx("team-a"), null);
    expect(result).toBeDefined();
  });

  // undefined resourceTeamId — 拒绝
  test("undefined resourceTeamId — 拒绝", () => {
    const result = requireTeamScope(makeAuthCtx("team-a"), undefined);
    expect(result).toBeDefined();
  });
});

// ---------- authContext null guard 概念验证 ----------

describe("apiKeyAuth null guard", () => {
  // 无 teamId 的 API Key 应被 403 拒绝
  test("无 teamId 的 API Key 应被 403 拒绝（概念）", () => {
    const authContext: AuthContext | null = null;
    expect(authContext).toBeNull();
    const result = requireTeamScope(authContext, "any-team");
    expect(result).toBeDefined();
  });
});
