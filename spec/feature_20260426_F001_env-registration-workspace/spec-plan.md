# 环境注册与 Workspace 管理执行计划

**目标:** 将环境数据从内存 Map 迁移到 SQLite 持久化，改造 Dashboard 为环境注册管理面板，支持前端表单注册环境、自动创建 workspace 目录、acp-link 通过环境专属 token 连接自动匹配。

**技术栈:** Hono + Bun + Drizzle ORM (SQLite) / React + Vite + Tailwind CSS / react-hook-form + zod

**设计文档:** spec-design.md

## 改动总览

本次改动涉及 3 个模块层：后端数据层（`src/db/schema.ts` 新增 environment 表 + `src/store.ts` 从内存 Map 改为 SQLite + `src/routes/web/environments.ts` 完整 CRUD API）、传输层（`src/transport/acp-ws-handler.ts` 新增 environment.secret 认证 + `src/services/disconnect-monitor.ts` 超时改为 idle 而非删除）、前端页面（`web/src/pages/Dashboard.tsx` 重写为环境管理面板 + API client + types）。

依赖链为线性：Task 1（schema）→ Task 2（store 层 SQLite 改造）→ Task 3（CRUD API）→ Task 4（acp-link token 匹配）/ Task 5（前端页面，依赖 Task 3 的 API）。

关键设计决策：environment 数据从内存 Map 迁移到 SQLite 实现持久化；acp-link 断开时更新状态为 idle 而非删除记录（保留持久化数据）；新增 `boundEnvId` 字段区分持久化环境与临时连接，保持现有 API Key 认证路径完全兼容。

---

### Task 0: 环境准备

**背景:**
确保构建和测试工具链在当前开发环境中可用，避免后续 Task 因环境问题阻塞。

**执行步骤:**
- [x] 验证 Bun 运行时可用
  - 运行命令: `bun --version`
  - 预期: 输出 Bun 版本号（≥ 1.0）
- [x] 验证后端类型检查可用
  - 运行命令: `bun run typecheck`
  - 预期: 无类型错误
- [x] 验证后端测试框架可用
  - 运行命令: `bun test src/__tests__/store.test.ts`
  - 预期: 测试框架正常运行（无论单个测试是否通过）
- [x] 验证前端构建工具可用
  - 运行命令: `bun run build:web`
  - 预期: 构建成功，`web/dist/index.html` 存在

**检查步骤:**
- [x] 后端类型检查通过
  - `bun run typecheck 2>&1 | tail -3`
  - 预期: 无类型错误输出
- [x] 后端测试可运行
  - `bun test src/__tests__/store.test.ts 2>&1 | tail -5`
  - 预期: 测试框架正常启动，输出测试结果

---

### Task 1: 数据模型与迁移

**背景:**
当前环境数据仅存储在 `store.ts` 的内存 Map 中，服务重启即丢失。本 Task 在 SQLite 中新增 `environment` 持久化表，为后续 Task 2（Store 层改造）和 Task 3（CRUD API）提供数据基础。
现有 `src/db/schema.ts` 使用 `drizzle-orm/sqlite-core` 定义表，`src/db/index.ts` 的 `initDb()` 函数负责启动时建表。

**涉及文件:**
- 修改: `src/db/schema.ts`
- 修改: `src/db/index.ts`
- 新建: `src/__tests__/db-schema.test.ts`

**执行步骤:**

- [x] 在 `src/db/schema.ts` 末尾新增 `environment` 表定义
  - 位置: `src/db/schema.ts` 文件末尾（`mcpTool` 表定义之后）
  - 新增以下 Drizzle 表定义：
  ```typescript
  export const environment = sqliteTable("environment", {
    id: text("id").primaryKey(),
    name: text("name").notNull().unique(),
    description: text("description"),
    workspacePath: text("workspace_path").notNull(),
    agentName: text("agent_name"),
    status: text("status").notNull().default("idle"),
    machineName: text("machine_name"),
    branch: text("branch"),
    gitRepoUrl: text("git_repo_url"),
    maxSessions: integer("max_sessions").notNull().default(1),
    workerType: text("worker_type").notNull().default("acp"),
    capabilities: text("capabilities"),
    secret: text("secret").notNull(),
    userId: text("user_id").notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lastPollAt: integer("last_poll_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  });
  ```
  - 原因: 持久化环境数据，`name` 唯一约束保证用户可读标识不重复，`secret` 用于 acp-link token 匹配，`capabilities` 存储 JSON 字符串

- [x] 在 `src/db/index.ts` 的 `initDb()` 函数中追加 environment 建表语句和索引
  - 位置: `src/db/index.ts` 的 `initDb()` 函数内，在最后一个 `CREATE INDEX` 语句之后、闭合反引号 `` ` `` 之前
  - 追加以下 SQL：
  ```sql
  CREATE TABLE IF NOT EXISTS environment (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    workspace_path TEXT NOT NULL,
    agent_name TEXT,
    status TEXT NOT NULL DEFAULT 'idle',
    machine_name TEXT,
    branch TEXT,
    git_repo_url TEXT,
    max_sessions INTEGER NOT NULL DEFAULT 1,
    worker_type TEXT NOT NULL DEFAULT 'acp',
    capabilities TEXT,
    secret TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    last_poll_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_environment_user_id ON environment(user_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_environment_secret ON environment(secret);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_environment_name ON environment(name);
  ```
  - 原因: 启动时自动建表，`secret` 唯一索引用于 acp-link token 快速查找，`name` 唯一索引保证名称约束

- [x] 为 environment 表 schema 编写单元测试
  - 测试文件: `src/__tests__/db-schema.test.ts`
  - 测试场景:
    - environment 表存在且列定义正确: 直接 `SELECT` pragma 查询 `environment` 表的列信息，验证包含 `id`, `name`, `workspace_path`, `secret`, `user_id` 等列
    - name 唯一约束生效: INSERT 两条相同 name 的记录，第二条抛出唯一约束错误
    - secret 唯一约束生效: INSERT 两条相同 secret 的记录，第二条抛出唯一约束错误
    - userId 外键级联删除: 创建 user 和 environment 记录后删除 user，验证 environment 记录被级联删除
  - 运行命令: `bun test src/__tests__/db-schema.test.ts`
  - 预期: 所有测试通过

**检查步骤:**

- [x] 验证 environment 表 schema 已导出
  - `grep -c "export const environment" src/db/schema.ts`
  - 预期: 输出 1

- [x] 验证 initDb 包含 environment 建表语句
  - `grep -c "CREATE TABLE IF NOT EXISTS environment" src/db/index.ts`
  - 预期: 输出 1

- [x] 验证类型检查通过
  - `bun run typecheck`
  - 预期: 无类型错误

- [x] 验证 schema 测试通过
  - `bun test src/__tests__/db-schema.test.ts`
  - 预期: 所有测试通过

---

### Task 2: Store 层 SQLite 改造

**背景:**
当前 `store.ts` 的 `environments` 是内存 Map，服务重启后数据丢失。本 Task 将 environment 相关函数从内存操作改为 Drizzle ORM 的 SQLite 查询，使环境数据持久化。Sessions、WorkItems、SessionWorkers、Tokens 仍保持内存 Map 不变。
Task 1 已创建 `environment` 表和 Drizzle schema，本 Task 依赖其产出。Task 3（CRUD API）、Task 4（acp-link Token 匹配）、`disconnect-monitor.ts`、`acp-ws-handler.ts`、`acp-relay-handler.ts`、`services/environment.ts`、`services/work-dispatch.ts` 等均通过 store 函数间接访问环境数据——保持函数签名兼容是本 Task 的核心约束。

注意: `services/environment.ts` 中的 `toResponse()` 函数仍返回旧格式（不含 `name`、`description`、`workspacePath`、`agentName`），但该函数仅被 v1 API 使用（向后兼容），Web UI 使用 Task 3 新增的路由和 `sanitizeResponse()`，因此无需修改 `services/environment.ts`。

**涉及文件:**
- 修改: `src/store.ts`
- 修改: `src/__tests__/store.test.ts`

**执行步骤:**

- [x] 在 `src/store.ts` 顶部新增 Drizzle ORM 导入
  - 位置: `src/store.ts` 文件顶部（`import { v4 as uuid } from "uuid";` 之后）
  - 新增导入：
  ```typescript
  import { db } from "./db";
  import { environment } from "./db/schema";
  import { eq, and } from "drizzle-orm";
  ```
  - 原因: store 函数改为 SQLite 查询需要 db 实例、schema 定义和 ORM 操作符

- [x] 重写 `EnvironmentRecord` 接口，新增持久化字段
  - 位置: `src/store.ts` 的 `EnvironmentRecord` 接口定义（~L6-L21）
  - 将接口替换为：
  ```typescript
  export interface EnvironmentRecord {
    id: string;
    name: string;
    description: string | null;
    workspacePath: string;
    agentName: string | null;
    secret: string;
    machineName: string | null;
    directory: string | null;
    branch: string | null;
    gitRepoUrl: string | null;
    maxSessions: number;
    workerType: string;
    capabilities: Record<string, unknown> | null;
    status: string;
    username: string | null;
    userId: string | null;
    lastPollAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }
  ```
  - 原因: 新增 `name`、`description`、`workspacePath`、`agentName` 四个持久化字段，保持原有字段兼容

- [x] 删除 `environments` 内存 Map 及其环境相关函数，替换为 SQLite 实现
  - 位置: `src/store.ts` 中 `const environments = new Map<string, EnvironmentRecord>();`（~L39）及其后的所有 environment 相关函数（~L44-L102, ~L247-L276）
  - 删除 `const environments = new Map<...>()` 声明
  - 删除旧函数: `storeCreateEnvironment`, `storeGetEnvironment`, `storeUpdateEnvironment`, `storeListActiveEnvironments`, `storeListEnvironmentsByUserId`, `storeListActiveEnvironmentsByUsername`, `storeDeleteEnvironment`, `storeListAcpAgents`, `storeListAcpAgentsByUserId`, `storeListOnlineAcpAgents`
  - 新增以下函数实现（逐一替换）：

  **`storeCreateEnvironment`**:
  ```typescript
  export function storeCreateEnvironment(req: {
    name?: string;
    description?: string;
    workspacePath?: string;
    agentName?: string;
    secret: string;
    userId: string;
    status?: string;
    machineName?: string;
    directory?: string;
    branch?: string;
    gitRepoUrl?: string;
    maxSessions?: number;
    workerType?: string;
    username?: string;
    capabilities?: Record<string, unknown>;
  }): EnvironmentRecord {
    const id = `env_${uuid().replace(/-/g, "")}`;
    const now = new Date();
    const name = req.name || `env-${id.slice(4, 12)}`;
    const workspacePath = req.workspacePath || req.directory || "/tmp";
    const status = req.status || "active";
    db.insert(environment).values({
      id,
      name,
      description: req.description ?? null,
      workspacePath,
      agentName: req.agentName ?? null,
      secret: req.secret,
      machineName: req.machineName ?? null,
      branch: req.branch ?? null,
      gitRepoUrl: req.gitRepoUrl ?? null,
      maxSessions: req.maxSessions ?? 1,
      workerType: req.workerType ?? "acp",
      capabilities: req.capabilities ? JSON.stringify(req.capabilities) : null,
      status,
      userId: req.userId,
      lastPollAt: now,
      createdAt: now,
      updatedAt: now,
    }).run();
    return {
      id, name, description: req.description ?? null, workspacePath,
      agentName: req.agentName ?? null, secret: req.secret,
      machineName: req.machineName ?? null, directory: req.directory ?? null,
      branch: req.branch ?? null, gitRepoUrl: req.gitRepoUrl ?? null,
      maxSessions: req.maxSessions ?? 1, workerType: req.workerType ?? "acp",
      capabilities: req.capabilities ?? null, status,
      username: req.username ?? null, userId: req.userId,
      lastPollAt: now, createdAt: now, updatedAt: now,
    };
  }
  ```

  **`storeGetEnvironment`**:
  ```typescript
  export function storeGetEnvironment(id: string): EnvironmentRecord | undefined {
    const rows = db.select().from(environment).where(eq(environment.id, id)).limit(1).all();
    return rows[0] ? rowToRecord(rows[0]) : undefined;
  }
  ```

  **`storeGetEnvironmentBySecret`**（新增）:
  ```typescript
  export function storeGetEnvironmentBySecret(secret: string): EnvironmentRecord | undefined {
    const rows = db.select().from(environment).where(eq(environment.secret, secret)).limit(1).all();
    return rows[0] ? rowToRecord(rows[0]) : undefined;
  }
  ```

  **`storeUpdateEnvironment`**:
  ```typescript
  export function storeUpdateEnvironment(id: string, patch: Partial<Pick<EnvironmentRecord, "status" | "lastPollAt" | "updatedAt" | "capabilities" | "machineName" | "maxSessions" | "name" | "description" | "workspacePath" | "agentName" | "branch" | "gitRepoUrl">>): boolean {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.status !== undefined) set.status = patch.status;
    if (patch.lastPollAt !== undefined) set.lastPollAt = patch.lastPollAt;
    if (patch.capabilities !== undefined) set.capabilities = patch.capabilities ? JSON.stringify(patch.capabilities) : null;
    if (patch.machineName !== undefined) set.machineName = patch.machineName;
    if (patch.maxSessions !== undefined) set.maxSessions = patch.maxSessions;
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.description !== undefined) set.description = patch.description;
    if (patch.workspacePath !== undefined) set.workspacePath = patch.workspacePath;
    if (patch.agentName !== undefined) set.agentName = patch.agentName;
    if (patch.branch !== undefined) set.branch = patch.branch;
    if (patch.gitRepoUrl !== undefined) set.gitRepoUrl = patch.gitRepoUrl;
    const result = db.update(environment).set(set).where(eq(environment.id, id)).run();
    return result.changes > 0;
  }
  ```

  **`storeListActiveEnvironments`**:
  ```typescript
  export function storeListActiveEnvironments(): EnvironmentRecord[] {
    return db.select().from(environment).where(eq(environment.status, "active")).all().map(rowToRecord);
  }
  ```

  **`storeListEnvironmentsByUserId`**:
  ```typescript
  export function storeListEnvironmentsByUserId(userId: string): EnvironmentRecord[] {
    return db.select().from(environment).where(eq(environment.userId, userId)).all().map(rowToRecord);
  }
  ```

  **`storeListActiveEnvironmentsByUsername`**:
  ```typescript
  export function storeListActiveEnvironmentsByUsername(username: string): EnvironmentRecord[] {
    return db.select().from(environment).where(and(eq(environment.status, "active"), eq(environment.username, username))).all().map(rowToRecord);
  }
  ```

  **`storeDeleteEnvironment`**:
  ```typescript
  export function storeDeleteEnvironment(id: string): boolean {
    // Delete associated in-memory sessions first
    for (const [sid, s] of sessions) {
      if (s.environmentId === id) sessions.delete(sid);
    }
    const result = db.delete(environment).where(eq(environment.id, id)).run();
    return result.changes > 0;
  }
  ```

  **`storeListAcpAgents`**:
  ```typescript
  export function storeListAcpAgents(): EnvironmentRecord[] {
    return db.select().from(environment).where(eq(environment.workerType, "acp")).all().map(rowToRecord);
  }
  ```

  **`storeListAcpAgentsByUserId`**:
  ```typescript
  export function storeListAcpAgentsByUserId(userId: string): EnvironmentRecord[] {
    return db.select().from(environment).where(and(eq(environment.workerType, "acp"), eq(environment.userId, userId))).all().map(rowToRecord);
  }
  ```

  **`storeListOnlineAcpAgents`**:
  ```typescript
  export function storeListOnlineAcpAgents(): EnvironmentRecord[] {
    return db.select().from(environment).where(and(eq(environment.workerType, "acp"), eq(environment.status, "active"))).all().map(rowToRecord);
  }
  ```

- [x] 新增 `rowToRecord` 辅助函数，将 Drizzle 行转换为 `EnvironmentRecord`
  - 位置: `src/store.ts` 的 environment 函数组之前（`import` 区域之后，首个 `storeCreateEnvironment` 之前）
  ```typescript
  function rowToRecord(row: typeof environment.$inferSelect): EnvironmentRecord {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      workspacePath: row.workspacePath,
      agentName: row.agentName,
      secret: row.secret,
      machineName: row.machineName,
      directory: row.workspacePath,
      branch: row.branch,
      gitRepoUrl: row.gitRepoUrl,
      maxSessions: row.maxSessions,
      workerType: row.workerType,
      capabilities: row.capabilities ? JSON.parse(row.capabilities) : null,
      status: row.status,
      username: null,
      userId: row.userId,
      lastPollAt: row.lastPollAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
  ```
  - 原因: Drizzle 返回的行中 `capabilities` 是 JSON 字符串需要解析，`directory` 字段由 `workspacePath` 映射保持兼容

- [x] 更新 `storeReset` 函数
  - 位置: `src/store.ts` 末尾的 `storeReset()` 函数
  - 保留 `sessions.clear(); sessionWorkers.clear(); tokens.clear();`
  - 删除 `environments.clear();`（environments 已不在内存）
  - 新增 `db.delete(environment).run();` 清空 environment 表
  ```typescript
  export function storeReset() {
    db.delete(environment).run();
    sessions.clear();
    sessionWorkers.clear();
    tokens.clear();
  }
  ```

- [x] 更新 `store.ts` 的导出
  - 位置: 所有 environment 相关函数本身已通过 `export function` 导出
  - 确保新增的 `storeGetEnvironmentBySecret` 也为 `export function`
  - 原因: Task 4 的 acp-link Token 匹配需要调用此函数

- [x] 为 Store 层 SQLite 改造编写单元测试
  - 测试文件: `src/__tests__/store.test.ts`
  - 重写 environment 相关测试为 SQLite 集成测试。每个测试文件需要在 `beforeEach` 中调用 `storeReset()` 清空数据库。测试不再使用内存断言，而是验证实际 SQLite 读写。
  - 测试场景:
    - `storeCreateEnvironment`: 传入 `name`, `workspacePath`, `secret`, `userId` → 返回的 `EnvironmentRecord` 包含正确字段值，`id` 匹配 `env_` 前缀，`status` 为 `"active"`
    - `storeCreateEnvironment` 默认值: 不传 `name` → 自动生成默认名称；不传 `workspacePath` → 默认 `/tmp`
    - `storeGetEnvironment`: 创建后按 id 查询 → 返回相同记录；查询不存在的 id → 返回 `undefined`
    - `storeGetEnvironmentBySecret`: 创建后按 secret 查询 → 返回对应记录；查询不存在的 secret → 返回 `undefined`
    - `storeUpdateEnvironment`: 更新 `status`、`machineName`、`capabilities` → 再次查询验证字段已更新
    - `storeUpdateEnvironment` 不存在 id → 返回 `false`
    - `storeListActiveEnvironments`: 创建 2 个 active 和 1 个 offline → 列表长度为 2
    - `storeListEnvironmentsByUserId`: 创建不同 userId 的记录 → 按用户过滤正确
    - `storeDeleteEnvironment`: 删除后查询返回 `undefined`，关联的内存 session 也被清理
    - `storeListAcpAgents` / `storeListAcpAgentsByUserId` / `storeListOnlineAcpAgents`: 按条件过滤正确
    - `storeReset`: 清空后所有查询返回空
  - 运行命令: `bun test src/__tests__/store.test.ts`
  - 预期: 所有测试通过

**检查步骤:**

- [x] 验证 store.ts 导出了 `storeGetEnvironmentBySecret`
  - `grep -c "export function storeGetEnvironmentBySecret" src/store.ts`
  - 预期: 输出 1

- [x] 验证 store.ts 不再使用 environments 内存 Map
  - `grep -c "environments.get\|environments.set\|environments.delete\|environments.values\|environments.clear" src/store.ts`
  - 预期: 输出 0

- [x] 验证 store.ts 导入了 db 和 environment schema
  - `grep -c "from \"./db\"" src/store.ts && grep -c "from \"./db/schema\"" src/store.ts`
  - 预期: 两项均输出 1

- [x] 验证类型检查通过
  - `bun run typecheck`
  - 预期: 无类型错误（函数签名兼容，所有调用方无需修改）

- [x] 验证 store 测试通过
  - `bun test src/__tests__/store.test.ts`
  - 预期: 所有测试通过


---

### Task 3: 环境 CRUD API

**背景:**
当前 `src/routes/web/environments.ts` 仅有 `GET /environments` 一个路由，从内存 store 读取数据。本 Task 将其改造为完整 CRUD API，支持前端注册、查看、编辑、删除环境。注册时包含 workspace 路径校验与自动创建、agent 名称校验、secret 自动生成。
本 Task 依赖 Task 1（environment 表结构）和 Task 2（Store 层 SQLite 函数）。Task 5（前端页面）将调用本 Task 产出的 API。

**涉及文件:**
- 修改: `src/routes/web/environments.ts`
- 修改: `src/types/api.ts`
- 新建: `src/__tests__/web-environments.test.ts`

**执行步骤:**

- [x] 在 `src/types/api.ts` 中新增环境注册请求和响应类型
  - 位置: `src/types/api.ts` 文件末尾（`ErrorResponse` 接口之前）
  - 新增以下类型定义：
  ```typescript
  // --- Environment Registration (Web UI) ---

  export interface RegisterEnvironmentWebRequest {
    name: string;
    description?: string;
    workspacePath: string;
    agentName?: string;
  }

  export interface UpdateEnvironmentWebRequest {
    name?: string;
    description?: string;
    workspacePath?: string;
    agentName?: string;
  }

  export interface EnvironmentWebResponse {
    id: string;
    name: string;
    description: string | null;
    workspace_path: string;
    agent_name: string | null;
    status: string;
    machine_name: string | null;
    branch: string | null;
    secret?: string;
    last_poll_at: number | null;
    created_at: number;
    updated_at: number;
  }
  ```
  - 原因: 与现有 v1 环境 API 类型（`RegisterEnvironmentRequest`）区分，Web 端注册需要 `name`、`workspacePath` 等新字段

- [x] 重写 `src/routes/web/environments.ts` 为完整 CRUD 路由
  - 位置: 整个文件重写
  - 新增导入：
  ```typescript
  import { Hono } from "hono";
  import { sessionAuth } from "../../auth/middleware";
  import {
    storeCreateEnvironment,
    storeGetEnvironment,
    storeUpdateEnvironment,
    storeListEnvironmentsByUserId,
    storeDeleteEnvironment,
  } from "../../store";
  import { getSection } from "../../services/config";
  import { mkdirSync } from "node:fs";
  import { isAbsolute, resolve } from "node:path";
  import { randomBytes } from "node:crypto";
  ```
  - 实现以下辅助函数和路由：

- [x] 实现 `generateEnvSecret()` 辅助函数
  - 位置: `src/routes/web/environments.ts` 文件内，在路由定义之前
  ```typescript
  function generateEnvSecret(): string {
    return `env_secret_${randomBytes(24).toString("hex")}`;
  }
  ```
  - 原因: 参照 `api-key-service.ts` 的 `generateApiKey()` 模式，使用 `env_secret_` 前缀区分于 `rcs_` API key

- [x] 实现 `validateWorkspacePath()` 校验函数
  - 位置: 紧接 `generateEnvSecret` 之后
  ```typescript
  const BLOCKED_PATHS = ["/", "/etc", "/usr", "/bin", "/sbin", "/var", "/sys", "/proc", "/dev", "/boot", "/lib", "/root"];

  function validateWorkspacePath(p: string): string | null {
    if (!isAbsolute(p)) return "workspace 路径必须是绝对路径";
    const normalized = resolve(p);
    if (BLOCKED_PATHS.includes(normalized)) return `不允许使用系统目录: ${normalized}`;
    for (const blocked of BLOCKED_PATHS) {
      if (blocked !== "/" && normalized.startsWith(blocked + "/")) {
        return `不允许使用系统目录下的路径: ${normalized}`;
      }
    }
    return null;
  }
  ```
  - 原因: 防止用户将 workspace 指向系统敏感目录，必须绝对路径

- [x] 实现 `sanitizeResponse()` 响应格式化函数（不含 secret）
  - 位置: 紧接 `validateWorkspacePath` 之后
  ```typescript
  function sanitizeResponse(row: any) {
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      workspace_path: row.workspacePath,
      agent_name: row.agentName ?? null,
      status: row.status,
      machine_name: row.machineName ?? null,
      branch: row.branch ?? null,
      last_poll_at: row.lastPollAt ? Math.floor(new Date(row.lastPollAt).getTime() / 1000) : null,
      created_at: Math.floor(new Date(row.createdAt).getTime() / 1000),
      updated_at: Math.floor(new Date(row.updatedAt).getTime() / 1000),
    };
  }
  ```
  - 原因: 列表 API 不返回 secret 字段，与设计文档要求一致

- [x] 实现 `GET /environments` — 列出当前用户环境
  - 位置: 路由定义区
  ```typescript
  app.get("/environments", sessionAuth, async (c) => {
    const user = c.get("user")!;
    const envs = storeListEnvironmentsByUserId(user.id);
    return c.json(envs.map(sanitizeResponse), 200);
  });
  ```

- [x] 实现 `POST /environments` — 注册新环境
  - 位置: GET 路由之后
  - 关键逻辑：
  ```typescript
  app.post("/environments", sessionAuth, async (c) => {
    const user = c.get("user")!;
    const body = await c.req.json();
    const { name, description, workspacePath, agentName } = body;

    // 1. 校验 name（非空、kebab-case 格式）
    if (!name || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name)) {
      return c.json({ error: { type: "VALIDATION_ERROR", message: "name 必须为 kebab-case 格式（小写字母、数字、连字符）" } }, 400);
    }

    // 2. 校验 workspacePath
    if (!workspacePath) {
      return c.json({ error: { type: "VALIDATION_ERROR", message: "workspacePath 为必填字段" } }, 400);
    }
    const pathError = validateWorkspacePath(workspacePath);
    if (pathError) {
      return c.json({ error: { type: "VALIDATION_ERROR", message: pathError } }, 400);
    }

    // 3. 校验 agentName（如果提供了）
    if (agentName) {
      const agents = (await getSection<Record<string, unknown>>("agent")) ?? {};
      if (!(agentName in agents)) {
        return c.json({ error: { type: "VALIDATION_ERROR", message: `Agent '${agentName}' 不存在` } }, 400);
      }
    }

    // 4. 创建 workspace 目录（mkdir -p）
    try {
      mkdirSync(workspacePath, { recursive: true });
    } catch (err: any) {
      return c.json({ error: { type: "CONFIG_WRITE_ERROR", message: `无法创建目录: ${err.message}` } }, 500);
    }

    // 5. 生成 secret 并写入 SQLite
    const secret = generateEnvSecret();
    const record = storeCreateEnvironment({
      name,
      description: description ?? null,
      workspacePath,
      agentName: agentName ?? null,
      status: "idle",
      secret,
      userId: user.id,
    });

    // 6. 返回含 secret 的完整记录（仅注册时返回 secret）
    return c.json({
      ...sanitizeResponse(record),
      secret: record.secret,
    }, 201);
  });
  ```

- [x] 实现 `GET /environments/:id` — 获取环境详情（含 secret）
  - 位置: POST 路由之后
  ```typescript
  app.get("/environments/:id", sessionAuth, async (c) => {
    const user = c.get("user")!;
    const envId = c.req.param("id")!;
    const env = storeGetEnvironment(envId);
    if (!env || env.userId !== user.id) {
      return c.json({ error: { type: "NOT_FOUND", message: "环境不存在" } }, 404);
    }
    return c.json({ ...sanitizeResponse(env), secret: env.secret }, 200);
  });
  ```

- [x] 实现 `PUT /environments/:id` — 更新环境元数据
  - 位置: GET :id 路由之后
  - 关键逻辑：校验 name 唯一性（如果修改了 name）、校验 workspacePath（如果修改了）、校验 agentName（如果修改了）、如果 workspacePath 变更则 mkdir-p
  ```typescript
  app.put("/environments/:id", sessionAuth, async (c) => {
    const user = c.get("user")!;
    const envId = c.req.param("id")!;
    const env = storeGetEnvironment(envId);
    if (!env || env.userId !== user.id) {
      return c.json({ error: { type: "NOT_FOUND", message: "环境不存在" } }, 404);
    }

    const body = await c.req.json();
    const patch: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(body.name)) {
        return c.json({ error: { type: "VALIDATION_ERROR", message: "name 必须为 kebab-case 格式" } }, 400);
      }
      patch.name = body.name;
    }
    if (body.workspacePath !== undefined) {
      const pathError = validateWorkspacePath(body.workspacePath);
      if (pathError) {
        return c.json({ error: { type: "VALIDATION_ERROR", message: pathError } }, 400);
      }
      mkdirSync(body.workspacePath, { recursive: true });
      patch.workspacePath = body.workspacePath;
    }
    if (body.agentName !== undefined) {
      if (body.agentName) {
        const agents = (await getSection<Record<string, unknown>>("agent")) ?? {};
        if (!(body.agentName in agents)) {
          return c.json({ error: { type: "VALIDATION_ERROR", message: `Agent '${body.agentName}' 不存在` } }, 400);
        }
      }
      patch.agentName = body.agentName || null;
    }
    if (body.description !== undefined) {
      patch.description = body.description;
    }

    storeUpdateEnvironment(envId, patch);
    const updated = storeGetEnvironment(envId);
    return c.json(sanitizeResponse(updated), 200);
  });
  ```

- [x] 实现 `DELETE /environments/:id` — 删除环境
  - 位置: PUT 路由之后
  ```typescript
  app.delete("/environments/:id", sessionAuth, async (c) => {
    const user = c.get("user")!;
    const envId = c.req.param("id")!;
    const env = storeGetEnvironment(envId);
    if (!env || env.userId !== user.id) {
      return c.json({ error: { type: "NOT_FOUND", message: "环境不存在" } }, 404);
    }
    storeDeleteEnvironment(envId);
    return c.json({ ok: true }, 200);
  });
  ```

- [x] 为环境 CRUD API 编写单元测试
  - 测试文件: `src/__tests__/web-environments.test.ts`
  - 由于现有 `routes.test.ts` 使用 mock.module 隔离 db，本测试采用独立测试文件，mock db 和 config 依赖
  - 测试场景:
    - POST /web/environments 注册成功: 提供合法 name + workspacePath → 返回 201，body 含 id、name、secret
    - POST /web/environments name 重复: 注册同名环境 → 返回 400 错误
    - POST /web/environments workspacePath 非绝对路径: 提供相对路径 → 返回 400 错误
    - POST /web/environments workspacePath 系统目录: 提供路径 "/" → 返回 400 错误
    - POST /web/environments agentName 不存在: 提供不存在的 agent 名称 → 返回 400 错误
    - GET /web/environments 列表: 返回用户环境列表，不含 secret 字段
    - GET /web/environments/:id 详情: 返回含 secret 的环境详情
    - GET /web/environments/:id 不存在: 返回 404
    - PUT /web/environments/:id 更新: 修改 description → 返回 200，body 反映更新
    - DELETE /web/environments/:id 删除: 返回 200，后续 GET 返回 404
  - 运行命令: `bun test src/__tests__/web-environments.test.ts`
  - 预期: 所有测试通过

**检查步骤:**

- [x] 验证路由文件包含所有 5 个 HTTP 方法
  - `grep -cE "app\.(get|post|put|delete)\(.*/environments" src/routes/web/environments.ts`
  - 预期: 输出 5

- [x] 验证新增类型已导出
  - `grep -c "RegisterEnvironmentWebRequest" src/types/api.ts`
  - 预期: 输出 1

- [x] 验证类型检查通过
  - `bun run typecheck`
  - 预期: 无类型错误

- [x] 验证 CRUD API 测试通过
  - `bun test src/__tests__/web-environments.test.ts`
  - 预期: 所有测试通过
---

### Task 4: acp-link Token 匹配

**背景:**
当前 acp-link 通过 per-user API Key 或全局 API Key 认证，连接时创建临时环境记录，断开时直接删除。本 Task 在认证链最前面新增 `environment.secret` 匹配：acp-link 使用环境专属 token 连接时，服务端自动匹配到已注册的环境记录并更新状态，实现持久化环境与运行时连接的关联。
断开后不再删除环境记录，而是更新 `status=idle`，保留持久化数据。本 Task 依赖 Task 2（Store 层提供 `storeGetEnvironmentBySecret` 函数）。

**涉及文件:**
- 修改: `src/routes/acp/index.ts`
- 修改: `src/transport/acp-ws-handler.ts`
- 修改: `src/services/disconnect-monitor.ts`
- 新建: `src/__tests__/acp-token-match.test.ts`

**执行步骤:**

- [x] 修改 `src/routes/acp/index.ts` WS 认证流程，新增 environment.secret 最高优先级匹配
  - 位置: `src/routes/acp/index.ts` WS `/ws` handler 的 `upgradeWebSocket` 回调内部，在 token 提取后、`validateApiKeyAndGetUser` 调用之前（~L103）
  - 新增 environment secret 认证步骤作为第一优先级：
  ```typescript
  // 0. Try environment.secret match (highest priority)
  const { storeGetEnvironmentBySecret } = await import("../../store");
  const envRecord = storeGetEnvironmentBySecret(token);
  if (envRecord) {
    userId = envRecord.userId;
    // 将 environment.id 传入 WS 连接，供后续 handleAcpWsOpen 使用
    // 需要将 envId 一起传入 handleAcpWsOpen
  }
  ```
  - 修改 `handleAcpWsOpen` 函数签名，新增可选参数 `envId?: string`，当 envId 存在时，`AcpConnectionEntry` 记录该 envId，表示此连接已绑定到持久化环境
  - 原因: environment.secret 是新认证路径，优先级最高，匹配到后直接使用该环境的 userId

- [x] 修改 `AcpConnectionEntry` 接口，新增 `boundEnvId` 字段
  - 位置: `src/transport/acp-ws-handler.ts` ~L17，`AcpConnectionEntry` 接口定义
  - 新增字段: `boundEnvId: string | null` — 当通过 environment.secret 认证连接时，存储匹配到的环境 ID，用于断开时更新而非删除
  - 原因: 区分"通过持久化环境 token 连接"和"通过 API Key 临时注册连接"两种模式

- [x] 修改 `handleAcpWsOpen` 函数签名和初始化逻辑
  - 位置: `src/transport/acp-ws-handler.ts` ~L44，`handleAcpWsOpen` 函数
  - 签名变更为: `handleAcpWsOpen(ws: WSContext, wsId: string, userId: string, boundEnvId?: string | null): void`
  - 在 `connections.set(wsId, ...)` 中初始化 `boundEnvId: boundEnvId || null`
  - 当 `boundEnvId` 存在时，立即更新环境状态: `storeUpdateEnvironment(boundEnvId, { status: "active", lastPollAt: new Date() })`
  - 原因: 通过 secret 连接的环境，在 WS 建立时即标记为 active

- [x] 修改 `handleRegister` 函数，支持"已绑定环境"场景
  - 位置: `src/transport/acp-ws-handler.ts` ~L79，`handleRegister` 函数
  - 在函数开头，`entry.agentId` 已存在判断之后，新增 `entry.boundEnvId` 检查:
  ```typescript
  // 如果已通过 environment.secret 认证绑定到持久化环境
  if (entry.boundEnvId) {
    const agentName = (msg.agent_name as string) || "unknown";
    const capabilities = msg.capabilities as Record<string, unknown> | undefined;
    const maxSessions = typeof msg.max_sessions === "number" ? msg.max_sessions : 1;

    // 更新已有环境记录的运行时字段，而非创建新记录
    storeUpdateEnvironment(entry.boundEnvId, {
      status: "active",
      lastPollAt: new Date(),
      capabilities: capabilities || null,
      maxSessions,
    });

    entry.agentId = entry.boundEnvId;
    entry.capabilities = capabilities || null;

    // 订阅 EventBus
    const bus = getAcpEventBus(entry.boundEnvId);
    const unsub = bus.subscribe((event: SessionEvent) => {
      if (entry.ws.readyState !== 1) return;
      if (event.direction !== "outbound") return;
      sendToWs(entry.ws, event.payload as object);
    });
    entry.unsub = unsub;

    sendToWs(entry.ws, {
      type: "registered",
      agent_id: entry.boundEnvId,
    });
    return;
  }
  ```
  - 原因: 通过 secret 认证的环境已有持久化记录，register 消息只需更新运行时状态

- [x] 修改 `handleIdentify` 函数，支持 `boundEnvId` 场景
  - 位置: `src/transport/acp-ws-handler.ts` ~L134，`handleIdentify` 函数
  - 当 `entry.boundEnvId` 存在时，直接使用 `entry.boundEnvId` 作为 agentId，无需从消息中获取
  - 原因: 已通过 secret 绑定的环境，identify 流程使用绑定的 ID

- [x] 修改 `handleAcpWsClose` 函数，区分删除与状态更新
  - 位置: `src/transport/acp-ws-handler.ts` ~L243，`handleAcpWsClose` 函数
  - 替换 `storeDeleteEnvironment(entry.agentId)` 调用（~L259）为条件逻辑:
  ```typescript
  if (entry.agentId) {
    if (entry.boundEnvId) {
      // 持久化环境：断开时仅更新状态为 idle，不删除
      storeUpdateEnvironment(entry.agentId, { status: "idle" });
    } else {
      // 临时环境：断开时删除（保持现有行为）
      storeDeleteEnvironment(entry.agentId);
    }

    // Notify all relay connections
    const bus = getAcpEventBus(entry.agentId);
    bus.publish({
      id: uuid(),
      sessionId: entry.agentId,
      type: "agent_disconnect",
      payload: { agentId: entry.agentId },
      direction: "inbound",
    });
  }
  ```
  - 原因: 持久化环境断开时保留记录，仅更新状态；临时环境保持删除行为

- [x] 修改 `closeAllAcpConnections` 函数中的关闭逻辑
  - 位置: `src/transport/acp-ws-handler.ts` ~L294，`closeAllAcpConnections` 函数
  - 替换 `storeDeleteEnvironment(entry.agentId)` 调用（~L307）为同样的条件逻辑:
  ```typescript
  if (entry.agentId) {
    if (entry.boundEnvId) {
      storeUpdateEnvironment(entry.agentId, { status: "idle" });
    } else {
      storeDeleteEnvironment(entry.agentId);
    }
  }
  ```
  - 原因: 优雅关闭时也需区分持久化环境和临时环境

- [x] 修改 `src/services/disconnect-monitor.ts` 中 ACP agent 超时处理
  - 位置: `src/services/disconnect-monitor.ts` ~L14，`runDisconnectMonitorSweep` 函数内 ACP agent 分支
  - 替换 `storeDeleteEnvironment(env.id)`（~L18）为 `storeUpdateEnvironment(env.id, { status: "idle" })`
  - 原因: 环境数据已持久化到 SQLite，超时时仅标记为 idle 而非删除

- [x] 修改 `src/routes/acp/index.ts` 中 WS handler 调用 `handleAcpWsOpen` 时传入 boundEnvId
  - 位置: `src/routes/acp/index.ts` WS `/ws` handler 的 `onOpen` 回调（~L136）
  - 将 `handleAcpWsOpen(ws, wsId, userId)` 改为 `handleAcpWsOpen(ws, wsId, userId, envId)`
  - 其中 `envId` 在 environment.secret 认证成功时设置为 `envRecord.id`，否则为 `undefined`
  - 原因: 将 secret 匹配结果传递到 WS handler

- [x] 为 acp-link token 匹配流程编写单元测试
  - 测试文件: `src/__tests__/acp-token-match.test.ts`
  - 测试场景:
    - environment.secret 认证优先级高于 API Key: mock `storeGetEnvironmentBySecret` 返回环境记录，验证使用该环境的 userId
    - environment.secret 未匹配时回退到 API Key: mock `storeGetEnvironmentBySecret` 返回 null，验证走原有 API Key 流程
    - 持久化环境断开后状态变为 idle: 创建带 boundEnvId 的 AcpConnectionEntry，调用 handleAcpWsClose，验证 storeUpdateEnvironment 被调用且参数包含 `status: "idle"`
    - 临时环境断开后记录被删除: 创建不带 boundEnvId 的 AcpConnectionEntry，调用 handleAcpWsClose，验证 storeDeleteEnvironment 被调用
    - disconnect monitor ACP agent 超时: 创建 ACP 环境，设置 lastPollAt 为过期时间，调用 runDisconnectMonitorSweep，验证状态变为 idle 而非被删除
  - 运行命令: `bun test src/__tests__/acp-token-match.test.ts`
  - 预期: 所有测试通过

**检查步骤:**

- [x] 验证 handleAcpWsOpen 签名包含 boundEnvId 参数
  - `grep -c "boundEnvId" src/transport/acp-ws-handler.ts`
  - 预期: 输出 ≥ 4（接口定义 + 函数签名 + 初始化 + 使用处）

- [x] 验证 disconnect-monitor 使用 storeUpdateEnvironment 而非 storeDeleteEnvironment 处理 ACP 超时
  - `grep "storeDeleteEnvironment" src/services/disconnect-monitor.ts`
  - 预期: 无输出（ACP 分支不再调用 delete）

- [x] 验证 acp/routes/index.ts 包含 storeGetEnvironmentBySecret 调用
  - `grep -c "storeGetEnvironmentBySecret" src/routes/acp/index.ts`
  - 预期: 输出 ≥ 1

- [x] 验证类型检查通过
  - `bun run typecheck`
  - 预期: 无类型错误

- [x] 验证 token 匹配测试通过
  - `bun test src/__tests__/acp-token-match.test.ts`
  - 预期: 所有测试通过

---

### Task 5: 前端环境管理页面

**背景:**
当前 Dashboard（`web/src/pages/Dashboard.tsx`）仅展示 session 列表和简单统计，无环境注册管理能力。本 Task 将其重写为环境管理面板，使用已有的 `DataTable`、`FormDialog`、`ConfirmDialog`、`StatusBadge` 等组件，配合 Task 3 提供的 CRUD API 实现完整的环境管理功能。
参考 `AgentsPage.tsx` 和 `ApiKeyManager.tsx` 的页面模式：本地 useState + API client + DataTable + FormDialog + ConfirmDialog。

**涉及文件:**
- 修改: `web/src/types/index.ts` — 更新 `Environment` 接口，新增请求/详情类型
- 修改: `web/src/api/client.ts` — 新增环境 CRUD API 函数
- 修改: `web/src/pages/Dashboard.tsx` — 重写为环境管理面板
- 新建: `web/src/__tests__/dashboard-env.test.tsx` — 前端组件测试

**执行步骤:**

- [x] 更新 `web/src/types/index.ts` 中的 `Environment` 接口，新增相关类型
  - 位置: `web/src/types/index.ts` 的 `Environment` 接口（~L1-L10）
  - 将 `Environment` 接口替换为：
  ```typescript
  export interface Environment {
    id: string;
    name: string;
    description: string | null;
    workspace_path: string;
    agent_name: string | null;
    status: string;
    machine_name: string | null;
    branch: string | null;
    last_poll_at: number | null;
    created_at: number;
    updated_at: number;
  }

  export interface EnvironmentDetail extends Environment {
    secret: string;
    capabilities: Record<string, unknown> | null;
    worker_type: string;
    max_sessions: number;
  }

  export interface CreateEnvironmentRequest {
    name: string;
    description?: string;
    workspacePath: string;
    agentName?: string;
  }

  export interface UpdateEnvironmentRequest {
    name?: string;
    description?: string;
    workspacePath?: string;
    agentName?: string;
  }
  ```
  - 原因: 新增 `name`、`description`、`workspace_path`、`agent_name` 等持久化字段；`EnvironmentDetail` 包含 `secret` 用于详情页查看；列表 API 不返回 `secret`

- [x] 在 `web/src/api/client.ts` 新增环境 CRUD API 函数
  - 位置: `web/src/api/client.ts` 的 `// --- Environments ---` 注释区域（~L42-L45）
  - 替换现有的 `apiFetchEnvironments` 函数，新增完整 CRUD 函数组：
  ```typescript
  // --- Environments ---

  export function apiFetchEnvironments() {
    return api<Environment[]>("GET", "/web/environments");
  }

  export function apiGetEnvironment(id: string) {
    return api<EnvironmentDetail>("GET", `/web/environments/${id}`);
  }

  export function apiCreateEnvironment(data: CreateEnvironmentRequest) {
    return api<EnvironmentDetail>("POST", "/web/environments", data);
  }

  export function apiUpdateEnvironment(id: string, data: UpdateEnvironmentRequest) {
    return api<EnvironmentDetail>("PUT", `/web/environments/${id}`, data);
  }

  export function apiDeleteEnvironment(id: string) {
    return api<{ ok: boolean }>("DELETE", `/web/environments/${id}`);
  }
  ```
  - 在文件顶部 import 中追加: `import type { Environment, EnvironmentDetail, CreateEnvironmentRequest, UpdateEnvironmentRequest } from "../types";`
  - 原因: 前端需要调用完整的 CRUD API；`apiCreateEnvironment` 返回含 `secret` 的详情用于一次性展示

- [x] 重写 `web/src/pages/Dashboard.tsx` 为环境管理面板
  - 位置: `web/src/pages/Dashboard.tsx` 全文替换
  - 移除 `SessionList` 导入和 session 相关逻辑（`apiFetchAllSessions`、`apiCreateInstance`、`SessionList` 等）
  - 新增导入: `DataTable`, `type Column` 来自 `@/components/config/DataTable`；`FormDialog` 来自 `@/components/config/FormDialog`；`ConfirmDialog` 来自 `@/components/config/ConfirmDialog`；`Button`, `Input`, `Label` 来自 shadcn；`Select, SelectContent, SelectItem, SelectTrigger, SelectValue` 来自 shadcn；`Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter` 来自 shadcn；环境 API 函数来自 `../api/client`；`apiListAgents` 来自 `../api/client`；`Badge` 来自 `@/components/ui/badge`
  - 组件核心状态：
  ```typescript
  const [envs, setEnvs] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEnv, setEditingEnv] = useState<Environment | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formWorkspacePath, setFormWorkspacePath] = useState("");
  const [formAgentName, setFormAgentName] = useState("");
  const [secretDialogOpen, setSecretDialogOpen] = useState(false);
  const [currentSecret, setCurrentSecret] = useState<string | null>(null);
  const [agentOptions, setAgentOptions] = useState<string[]>([]);
  ```
  - 生命周期：`useEffect` 调用 `apiFetchEnvironments()` 加载环境列表，同时调用 `apiListAgents()` 获取 agent 列表用于表单下拉（提取 `data.agents.map(a => a.name)`）
  - DataTable 列定义：
  ```typescript
  const columns: Column<Environment>[] = [
    { key: "name", header: "名称", sortable: true, filterable: true },
    { key: "workspace_path", header: "Workspace", sortable: true, filterable: true },
    { key: "agent_name", header: "关联Agent", sortable: true },
    {
      key: "status",
      header: "状态",
      filterable: true,
      render: (row) => {
        const colorMap: Record<string, string> = { active: "bg-green-100 text-green-700", idle: "bg-gray-100 text-gray-700", error: "bg-red-100 text-red-700" };
        return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colorMap[row.status] || "bg-gray-100 text-gray-700"}`}>{row.status}</span>;
      },
    },
    {
      key: "last_poll_at",
      header: "最后活跃",
      sortable: true,
      render: (row) => row.last_poll_at ? new Date(row.last_poll_at * 1000).toLocaleString() : "—",
    },
  ];
  ```
  - 行操作按钮区域（`actions` 回调）: 3 个按钮 —— "查看 Secret"（调用 `apiGetEnvironment(row.id)` 获取 secret 后弹窗展示）、"编辑"（打开编辑 FormDialog）、"删除"（打开 ConfirmDialog）
  - 注册表单（FormDialog）: 标题 "注册新环境"，4 个字段 —— 名称（Input, 必填）、描述（Input, 可选）、Workspace 路径（Input, 必填）、关联 Agent（Select 下拉，从 agentOptions 取值）
  - 表单提交逻辑：校验 name 非空且为 kebab-case（`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`）、workspacePath 以 `/` 开头 → 调用 `apiCreateEnvironment` → 成功后设置 `currentSecret = result.secret`、`setSecretDialogOpen(true)` → 关闭 FormDialog
  - 编辑表单：复用同一 FormDialog，预填充 `editingEnv` 的现有值 → 调用 `apiUpdateEnvironment(editingEnv.id, { name, description, workspacePath, agentName })`
  - Secret 展示对话框：使用 Dialog 组件，显示完整 `currentSecret` 字符串 + "复制" 按钮（`navigator.clipboard.writeText(currentSecret)`）+ 提示文字 "请立即保存此 Secret，之后将无法再通过列表查看"
  - 删除确认：使用 ConfirmDialog → 调用 `apiDeleteEnvironment(deleteTarget)`
  - 页面结构：外层 `div.h-full.overflow-y-auto` > 内层 `div.mx-auto.max-w-5xl.px-6.py-6` > 标题行（"环境管理" + "注册环境" 按钮）+ DataTable
  - 原因: 将 Dashboard 从 session 列表转为环境管理面板，是用户注册和管理环境的入口

- [x] 为 Dashboard 环境管理页面编写前端组件测试
  - 测试文件: `web/src/__tests__/dashboard-env.test.tsx`
  - 测试场景:
    - 类型导出验证: 从 `../types` 导入 `Environment`、`EnvironmentDetail`、`CreateEnvironmentRequest`、`UpdateEnvironmentRequest`，验证均为非 undefined
    - API client 函数导出验证: 从 `../api/client` 导入 `apiFetchEnvironments`、`apiGetEnvironment`、`apiCreateEnvironment`、`apiUpdateEnvironment`、`apiDeleteEnvironment`，验证均为函数类型
    - Dashboard 组件导出验证: 从 `../pages/Dashboard` 导入 `Dashboard`，验证为函数组件
  - 运行命令: `bun test web/src/__tests__/dashboard-env.test.tsx`
  - 预期: 所有测试通过

**检查步骤:**

- [x] 验证 Environment 类型已更新（包含 workspace_path）
  - `grep -c "workspace_path" web/src/types/index.ts`
  - 预期: 输出 >= 1

- [x] 验证 API client 导出了 5 个环境函数
  - `grep -c "export function api.*Environment" web/src/api/client.ts`
  - 预期: 输出 5

- [x] 验证 Dashboard 不再导入 SessionList
  - `grep -c "SessionList" web/src/pages/Dashboard.tsx`
  - 预期: 输出 0

- [x] 验证 Dashboard 导入了 DataTable
  - `grep -c "DataTable" web/src/pages/Dashboard.tsx`
  - 预期: 输出 >= 1

- [x] 验证前端测试通过
  - `bun test web/src/__tests__/dashboard-env.test.tsx`
  - 预期: 所有测试通过

- [x] 验证前端构建通过
  - `bun run build:web`
  - 预期: 构建成功，无错误

---

### Task 6: 环境注册与 Workspace 管理 验收

**前置条件:**
- 启动命令: `bun run dev`（后端开发服务器）
- 测试数据准备: 需要一个已注册的 better-auth 用户（通过前端注册或 API 直接创建）
- 前端已构建: `bun run build:web`

**端到端验证:**

1. 运行完整测试套件确保无回归
   - `bun test src/__tests__/ 2>&1 | tail -20`
   - 预期: 全部测试通过（已知的 middleware.test.ts / routes.test.ts mock 隔离问题除外）
   - 失败排查: 检查各 Task 的测试步骤，优先查看 Task 1（schema）和 Task 2（store）是否有数据库初始化问题

2. 验证 environment 表创建成功
   - `sqlite3 data/rcs.db ".schema environment" 2>/dev/null || echo "DB not found — 启动服务后重试"`
   - 预期: 输出包含 `CREATE TABLE environment` 及 `name TEXT NOT NULL UNIQUE`、`secret TEXT NOT NULL` 等字段定义
   - 失败排查: 检查 Task 1 的 `initDb()` 是否被调用

3. 验证前端环境注册 API 可用
   - `curl -s -X POST http://localhost:3000/web/environments -H 'Content-Type: application/json' -b 'cookie: better-auth.session_token=YOUR_TOKEN' -d '{"name":"test-env","workspacePath":"/tmp/test-workspace","description":"测试环境"}' | jq .`
   - 预期: 返回 201，body 含 `id`、`name`、`secret` 字段，`/tmp/test-workspace` 目录已创建
   - 失败排查: 检查 Task 3 路由是否正确挂载（`src/index.ts` 中 `app.route("/web", webEnvironments)`）

4. 验证环境列表 API 不返回 secret
   - `curl -s http://localhost:3000/web/environments -b 'cookie: better-auth.session_token=YOUR_TOKEN' | jq '.[0] | has("secret")'`
   - 预期: 返回 `false`（列表不包含 secret 字段）
   - 失败排查: 检查 Task 3 的 `sanitizeResponse` 函数是否正确过滤

5. 验证环境详情 API 返回 secret
   - `curl -s http://localhost:3000/web/environments/ENV_ID -b 'cookie: better-auth.session_token=YOUR_TOKEN' | jq '.secret'`
   - 预期: 返回 `env_secret_` 前缀的字符串
   - 失败排查: 检查 Task 3 的 GET :id 路由

6. 验证 acp-link secret 认证优先级
   - 使用上一步获取的 secret，通过 WebSocket 连接 `/acp/ws?token=ENV_SECRET`
   - 预期: 连接成功，环境状态从 `idle` 变为 `active`
   - 失败排查: 检查 Task 4 的 `src/routes/acp/index.ts` 认证链

7. 验证 acp-link 断开后环境状态恢复为 idle
   - 关闭上一步的 WebSocket 连接
   - `curl -s http://localhost:3000/web/environments/ENV_ID -b 'cookie: ...' | jq '.status'`
   - 预期: 返回 `"idle"`
   - 失败排查: 检查 Task 4 的 `handleAcpWsClose` 是否使用 `storeUpdateEnvironment` 而非 `storeDeleteEnvironment`

8. 验证环境更新和删除
   - `curl -s -X PUT http://localhost:3000/web/environments/ENV_ID -H 'Content-Type: application/json' -b 'cookie: ...' -d '{"description":"更新后的描述"}' | jq '.description'`
   - 预期: 返回 `"更新后的描述"`
   - `curl -s -X DELETE http://localhost:3000/web/environments/ENV_ID -b 'cookie: ...' | jq .ok`
   - 预期: 返回 `true`
   - 失败排查: 检查 Task 3 的 PUT/DELETE 路由

9. 验证前端环境管理页面可访问
   - 浏览器访问 `http://localhost:3000/code/`
   - 预期: 显示"环境管理"标题、DataTable（含"名称"、"Workspace"、"关联Agent"、"状态"列）、"注册环境"按钮
   - 失败排查: 检查 Task 5 的 Dashboard 组件是否正确替换，`bun run build:web` 是否已执行

10. 验证类型检查无错误
    - `bun run typecheck`
    - 预期: 零错误
    - 失败排查: 逐一检查各 Task 的类型定义和接口兼容性
