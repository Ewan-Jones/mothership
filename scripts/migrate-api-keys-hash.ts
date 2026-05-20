#!/usr/bin/env bun
/**
 * 一次性迁移：将 api_key 表中的明文 key hash 化。
 *
 * 用法：bun run scripts/migrate-api-keys-hash.ts
 *
 * 逻辑：
 * 1. 查询所有 key_hash 为 NULL 的行
 * 2. 计算 SHA-256(key)，更新 key_hash + key_prefix + key
 * 3. 迁移后 validateApiKeyAndGetUser 双路径兼容：
 *    - 新 key：通过 keyHash 列查到
 *    - 旧 key（迁移后 key 列也存了 hash）：通过 key 列查到
 */

import { createHash } from "node:crypto";
import { eq, isNull } from "drizzle-orm";
import { db } from "../src/db";
import { apiKey } from "../src/db/schema";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

async function main() {
  console.log("[migration] 开始 hash 已有 API Key...");

  const rows = await db
    .select({ id: apiKey.id, key: apiKey.key })
    .from(apiKey)
    .where(isNull(apiKey.keyHash));

  console.log(`[migration] 找到 ${rows.length} 条需要迁移的 key`);

  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    const originalKey = row.key;

    // 跳过已经是 hash 的 key（64 hex chars，不以 rcs_ 开头）
    if (!originalKey.startsWith("rcs_")) {
      skipped++;
      continue;
    }

    const keyHash = sha256(originalKey);
    const keyPrefix = originalKey.slice(0, 8) + "..." + originalKey.slice(-4);

    await db
      .update(apiKey)
      .set({ keyHash, keyPrefix, key: keyHash })
      .where(eq(apiKey.id, row.id));

    migrated++;
  }

  console.log(`[migration] 完成：${migrated} 条迁移，${skipped} 条跳过（已是 hash 格式）`);

  const remaining = await db
    .select({ id: apiKey.id })
    .from(apiKey)
    .where(isNull(apiKey.keyHash));

  console.log(`[migration] 剩余未迁移：${remaining.length} 条`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[migration] 失败:", err);
  process.exit(1);
});
