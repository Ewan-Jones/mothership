import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { skill } from "../../db/schema";
import type { AuthContext } from "../../plugins/auth";

// ────────────────────────────────────────────
// Skill 操作（全局技能库）
// ────────────────────────────────────────────

export async function listSkills(ctx: AuthContext) {
  return db.select().from(skill).where(eq(skill.organizationId, ctx.organizationId));
}

export async function getSkill(ctx: AuthContext, name: string) {
  const rows = await db
    .select()
    .from(skill)
    .where(and(eq(skill.organizationId, ctx.organizationId), eq(skill.name, name)))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertSkill(
  ctx: AuthContext,
  name: string,
  data: {
    description?: string;
    contentPath?: string;
    metadata?: Record<string, unknown>;
  },
) {
  const existing = await db
    .select({ id: skill.id })
    .from(skill)
    .where(and(eq(skill.organizationId, ctx.organizationId), eq(skill.name, name)))
    .limit(1);

  const commonFields = {
    description: data.description,
    contentPath: data.contentPath,
    metadata: data.metadata ?? undefined,
    updatedAt: new Date(),
  };

  if (existing.length > 0) {
    await db.update(skill).set(commonFields).where(eq(skill.id, existing[0].id));
    return existing[0].id;
  }

  const inserted = await db
    .insert(skill)
    .values({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      name,
      ...commonFields,
    })
    .returning({ id: skill.id });
  return inserted[0].id;
}

export async function deleteSkill(ctx: AuthContext, name: string): Promise<boolean> {
  const result = await db
    .delete(skill)
    .where(and(eq(skill.organizationId, ctx.organizationId), eq(skill.name, name)))
    .returning({ id: skill.id });
  return result.length > 0;
}
