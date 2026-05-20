import { describe, expect, test } from "bun:test";
import { requireTeamScope } from "../plugins/require-team-scope";
import type { AuthContext } from "../plugins/auth";

const makeAuthCtx = (teamId: string): AuthContext => ({
  teamId,
  userId: "user-1",
  role: "owner",
});

describe("requireTeamScope", () => {
  // teamId 匹配时通过
  test("teamId 匹配时通过", () => {
    const result = requireTeamScope(makeAuthCtx("team-1"), "team-1");
    expect(result).toBeUndefined();
  });

  // teamId 不匹配时返回 403
  test("teamId 不匹配时返回 403 响应", () => {
    const result = requireTeamScope(makeAuthCtx("team-1"), "team-2");
    expect(result).toBeDefined();
    expect((result as Response).status).toBe(403);
  });

  // authContext 为 null 时返回 403
  test("authContext 为 null 时返回 403", () => {
    const result = requireTeamScope(null as any, "team-1");
    expect(result).toBeDefined();
    expect((result as Response).status).toBe(403);
  });

  // resourceTeamId 为 null 时返回 403
  test("resourceTeamId 为 null 时返回 403", () => {
    const result = requireTeamScope(makeAuthCtx("team-1"), null as any);
    expect(result).toBeDefined();
    expect((result as Response).status).toBe(403);
  });

  // resourceTeamId 为 undefined 时返回 403
  test("resourceTeamId 为 undefined 时返回 403", () => {
    const result = requireTeamScope(makeAuthCtx("team-1"), undefined);
    expect(result).toBeDefined();
    expect((result as Response).status).toBe(403);
  });
});
