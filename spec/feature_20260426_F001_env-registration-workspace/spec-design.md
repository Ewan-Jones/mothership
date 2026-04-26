# Feature: 20260426_F001 - env-registration-workspace

## 需求背景

当前 Dashboard 展示 session 列表，环境（Environment）数据全部存储在内存 Map 中（`store.ts`），服务重启后丢失。acp-link 连接时自动创建临时环境记录，缺乏用户侧的管理能力。

用户需要：
- 通过前端手动注册环境，持久化到 SQLite 数据库
- 每个环境绑定一个本地 workspace 目录，用于文件分割管理
- 注册时如果目录不存在，服务端自动创建
- 每个环境关联一个 agent 配置（一对一）
- 每个环境有专属 token，acp-link 连接时自动匹配对应环境

## 目标

- 将环境数据从内存 Map 迁移到 SQLite，全量持久化
- 改造 Dashboard 为环境注册管理面板
- 支持前端表单注册环境（名称、描述、workspace 路径、关联 agent）
- workspace 路径不存在时服务端自动 `mkdir -p` 创建
- acp-link 通过环境专属 token 连接，自动匹配并更新运行时状态

## 方案设计

### 数据模型

SQLite 新增 `environment` 表（Drizzle ORM schema）：

```typescript
export const environment = sqliteTable("environment", {
  id: text("id").primaryKey(),                       // env_xxx
  name: text("name").notNull().unique(),             // 环境名称，用户可读
  description: text("description"),                  // 可选描述
  workspacePath: text("workspace_path").notNull(),    // workspace 根路径
  agentName: text("agent_name"),                     // 关联的 agent 配置名（一对一）
  // 运行时字段
  status: text("status").notNull().default("idle"),  // idle | active | error
  machineName: text("machine_name"),
  branch: text("branch"),
  gitRepoUrl: text("git_repo_url"),
  maxSessions: integer("max_sessions").notNull().default(1),
  workerType: text("worker_type").notNull().default("acp"),
  capabilities: text("capabilities"),                // JSON string
  secret: text("secret").notNull(),                  // 环境专属连接 token
  userId: text("user_id").notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  lastPollAt: integer("last_poll_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
```

关键设计：
- `name` 唯一约束，作为用户可读的环境标识
- `workspacePath` 为服务端本地绝对路径，注册时若不存在则 `mkdir -p`
- `agentName` 引用 `opencode.json` 中的 agent 配置名，外键约束在应用层校验
- `secret` 作为环境专属连接 token，acp-link 通过此 token 匹配环境
- `capabilities` 存 JSON 字符串，acp-link 连接时更新

### API 设计

改造 `/web/environments` 路由为完整 CRUD：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/web/environments` | 列出当前用户的所有环境 |
| POST | `/web/environments` | 注册新环境 |
| GET | `/web/environments/:id` | 获取单个环境详情 |
| PUT | `/web/environments/:id` | 更新环境元数据 |
| DELETE | `/web/environments/:id` | 删除环境 |

#### 注册请求 POST /web/environments

```json
{
  "name": "my-project",
  "description": "项目A开发环境",
  "workspacePath": "/home/user/project-a",
  "agentName": "general"
}
```

注册流程：
1. 校验 `name` 唯一性和 `workspacePath` 合法性（绝对路径、不在系统敏感目录下）
2. 校验 `agentName` 是否存在于 `opencode.json` 的 agents 配置中
3. 如果 `workspacePath` 不存在 → `mkdir -p`（递归创建）
4. 生成 `secret`（UUID 或 `env_secret_xxx` 格式）
5. 写入 SQLite
6. 返回完整环境记录（含 secret）

#### 响应格式

```json
{
  "id": "env_xxx",
  "name": "my-project",
  "description": "项目A开发环境",
  "workspace_path": "/home/user/project-a",
  "agent_name": "general",
  "status": "idle",
  "secret": "env_secret_xxx",
  "machine_name": null,
  "branch": null,
  "created_at": 1714089600
}
```

### acp-link 匹配逻辑

修改 `src/transport/acp-ws-handler.ts` 的认证和注册流程：

1. acp-link 连接 `/acp/ws?token=<env_secret>` 或 `Authorization: Bearer <env_secret>`
2. 服务端通过 token 查询 SQLite `environment` 表的 `secret` 字段
3. 找到匹配环境 → 更新 `status=active`、`lastPollAt=now`、`machineName`、`branch`
4. 未找到 → 回退到现有 per-user API Key 认证（保持兼容）
5. acp-link 断开 → 更新 `status=idle`

认证优先级：
1. `environment.secret` 匹配（新）
2. `api_key` 表 per-user token（现有）
3. `RCS_API_KEYS` 环境变量（现有）

### Store 层改造

`store.ts` 中 environments 相关函数从内存 Map 改为 SQLite 查询：

- `storeCreateEnvironment()` → INSERT INTO environment
- `storeGetEnvironment()` → SELECT FROM environment WHERE id = ?
- `storeUpdateEnvironment()` → UPDATE environment SET ... WHERE id = ?
- `storeListEnvironmentsByUserId()` → SELECT FROM environment WHERE user_id = ?
- `storeDeleteEnvironment()` → DELETE FROM environment WHERE id = ?
- 新增 `storeGetEnvironmentBySecret()` → SELECT FROM environment WHERE secret = ?

sessions 仍保持内存 Map（session 是临时运行时数据）。

### 前端页面设计

改造 Dashboard 为环境管理面板：

**环境列表**：
- 使用 DataTable 组件展示所有已注册环境
- 列：名称、workspace 路径、关联 agent、状态、最后活跃时间
- 状态 Badge：idle（灰色）、active（绿色）、error（红色）
- 行操作：查看 secret、编辑、删除

**注册表单**（FormDialog）：
- 名称（必填，kebab-case 校验）
- 描述（可选）
- Workspace 路径（必填，绝对路径）
- 关联 Agent（Select 下拉，从 opencode.json 获取 agent 列表）
- 注册成功后弹出 secret 显示对话框（仅展示一次，提示用户保存）

**Secret 管理**：
- 注册时展示一次完整 secret
- 提供「查看 Secret」按钮，重新显示（方便用户配置 acp-link）
- Secret 仅在用户主动查看时返回，列表 API 不包含 secret 字段

### 目录创建机制

- 注册时调用 `mkdirSync(workspacePath, { recursive: true })`
- 路径校验：必须是绝对路径、不能是系统目录（`/`, `/etc`, `/usr` 等）
- 如果目录已存在且非空，正常注册（不清理内容）
- 如果创建失败（权限等），返回 `CONFIG_WRITE_ERROR` 错误

## 实现要点

1. **迁移策略**：需要为 SQLite environment 表创建迁移。当前项目无正式迁移系统（better-auth 自动建表），可使用 Drizzle 的 `sql` tag 执行 `CREATE TABLE IF NOT EXISTS`
2. **secret 生成**：使用 `env_secret_${uuid()}` 格式，与现有 `rcs_xxx` API key 格式区分
3. **acp-link 向后兼容**：保留 per-user API key 和全局 API key 认证路径，environment secret 作为最高优先级
4. **并发安全**：workspace 目录创建和 SQLite 写入需要处理并发注册同一路径的情况
5. **数据迁移**：现有的内存 environments Map 中的活跃记录需要迁移策略（建议不迁移，重启后重新注册）

## 验收标准

- [ ] SQLite `environment` 表创建成功，包含所有字段和约束
- [ ] 前端可通过表单注册环境，workspace 目录不存在时自动创建
- [ ] 注册成功后展示环境专属 secret
- [ ] 环境列表展示所有已注册环境，含状态 Badge
- [ ] acp-link 使用环境 secret 连接时自动匹配并更新状态为 active
- [ ] acp-link 断开后环境状态更新为 idle
- [ ] 可编辑环境元数据（名称、描述、workspace、关联 agent）
- [ ] 可删除环境
- [ ] 类型检查通过（`bun run typecheck`）
- [ ] 后端测试通过（`bun test src/__tests__`）
