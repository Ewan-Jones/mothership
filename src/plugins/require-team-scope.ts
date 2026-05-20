import type { AuthContext } from "./auth";
import { errorResponse } from "./auth";

/**
 * 校验当前认证上下文是否有权访问指定 team 的资源。
 * 返回 undefined 表示通过，否则返回 403 Response。
 *
 * 用法：const denied = requireTeamScope(store.authContext, resourceTeamId);
 *       if (denied) return denied;
 */
export function requireTeamScope(
  authContext: AuthContext | null,
  resourceTeamId: string | null | undefined,
): Response | undefined {
  if (!authContext || !resourceTeamId) {
    return errorResponse(403, { error: { type: "forbidden", message: "Access denied" } });
  }
  if (authContext.teamId !== resourceTeamId) {
    return errorResponse(403, { error: { type: "forbidden", message: "Resource does not belong to your team" } });
  }
  return undefined;
}
