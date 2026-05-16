import { db } from "../../db";
import { agentConfig, provider, skill, mcpServer } from "../../db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";

// ────────────────────────────────────────────
// 批量配置读取（spawn 时一次性获取 Agent 完整配置）
// ────────────────────────────────────────────

export interface AgentFullConfig {
  agentConfig: typeof agentConfig.$inferSelect | null;
  providers: (typeof provider.$inferSelect)[];
  skills: (typeof skill.$inferSelect)[];
  mcpServers: (typeof mcpServer.$inferSelect)[];
}

/** 获取用户全局 skills（environmentId=NULL, agentConfigId=NULL） */
function listGlobalSkills(userId: string) {
  return db.select().from(skill).where(and(
    eq(skill.userId, userId),
    isNull(skill.environmentId),
    isNull(skill.agentConfigId),
  ));
}

export async function getAgentFullConfig(userId: string, agentConfigId: string | null): Promise<AgentFullConfig> {
  if (!agentConfigId) {
    const [providers, mcpServers, skills] = await Promise.all([
      db.select().from(provider).where(eq(provider.userId, userId)),
      db.select().from(mcpServer).where(and(eq(mcpServer.userId, userId), eq(mcpServer.enabled, true))),
      listGlobalSkills(userId),
    ]);
    return { agentConfig: null, providers, skills, mcpServers };
  }

  // 并行拉取 providers、mcpServers、agentConfig（三者无依赖关系）
  const [providers, mcpServers, acRows] = await Promise.all([
    db.select().from(provider).where(eq(provider.userId, userId)),
    db.select().from(mcpServer).where(and(eq(mcpServer.userId, userId), eq(mcpServer.enabled, true))),
    db.select().from(agentConfig)
      .where(and(eq(agentConfig.id, agentConfigId), eq(agentConfig.userId, userId)))
      .limit(1),
  ]);

  const [ac] = acRows;

  if (!ac) {
    // agentConfig 不存在时回退到全局 skills，而非返回空数组
    const skills = await listGlobalSkills(userId);
    return { agentConfig: null, providers, skills, mcpServers };
  }

  const skills = await db.select().from(skill).where(and(
    eq(skill.userId, userId),
    isNull(skill.environmentId),
    sql`(${skill.agentConfigId} IS NULL OR ${skill.agentConfigId} = ${agentConfigId})`,
  ));

  return { agentConfig: ac, providers, skills, mcpServers };
}
