# ARCH.md — Remote Control Server 架构设计文档

## 1. 系统总览

RCS 是一个三层架构的 AI Agent 控制面板：

```
┌─────────────────────────────────────────────────────────┐
│                      前端 (React + Vite)                 │
│  Dashboard · SessionDetail · ModelsPage · AgentsPage …   │
└──────────────┬──────────────────────────┬───────────────┘
               │ REST (better-auth cookie)│ WS (/acp/relay/:id)
               ▼                          ▼
┌─────────────────────────────────────────────────────────┐
│                    后端 (Hono + Bun)                      │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐  ┌─────────┐ │
│  │ Routes  │→ │ Services │→ │   Store   │→ │  SQLite  │ │
│  │ v1/web/ │  │ instance │  │ (混合存储) │  │ + 内存   │ │
│  │   acp/  │  │ scheduler│  └───────────┘  └─────────┘ │
│  └────┬────┘  └──────────┘                                │
│       │                                                  │
│  ┌────▼─────────────────────────────────────────────┐    │
│  │              Transport Layer                      │    │
│  │  acp-ws-handler · acp-relay-handler · event-bus  │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────┬──────────────────────────┬───────────────┘
               │ WS (/acp/ws)             │
               ▼                          │
┌──────────────────────────┐              │
│    acp-link (外部进程)    │◄─────────────┘
│  AI Agent 桥接进程        │   REST (/v1/environments/bridge)
└──────────────────────────┘
```

**核心职责**：RCS 作为 acp-link Agent 与前端控制面板之间的中间层，负责连接管理、消息路由、会话管理和配置持久化。

---

## 2. 模块划分与依赖关系

### 2.1 后端模块图

```
src/
├── index.ts              ← 应用入口，路由挂载，生命周期管理
├── config.ts             ← 环境变量配置（只读单例）
├── logger.ts             ← 日志工具
│
├── db/
│   ├── index.ts          ← SQLite 连接 (better-sqlite3 + Drizzle)
│   └── schema.ts         ← Drizzle ORM Schema 定义
│
├── auth/                 ← 认证层
│   ├── better-auth.ts    ← better-auth 实例 (session/cookie)
│   ├── api-key-service.ts← Per-user API Key (SQLite apiKey 表)
│   ├── jwt.ts            ← Worker JWT 签发/验证
│   └── middleware.ts     ← Hono 中间件: sessionAuth, apiKeyAuth, uuidAuth
│
├── store.ts              ← 混合存储层 (SQLite Environment + 内存 Session/WorkItem)
├── types/
│   └── api.ts            ← 跨模块共享的 API 类型定义
│
├── transport/            ← 传输层（核心消息路由）
│   ├── event-bus.ts      ← 进程内事件总线 (pub/sub)
│   ├── acp-ws-handler.ts ← /acp/ws 连接管理（acp-link 注册）
│   ├── acp-relay-handler.ts ← /acp/relay/:id 连接管理（前端中继）
│   └── sse-writer.ts     ← SSE 事件序列化
│
├── services/             ← 业务逻辑层
│   ├── config.ts         ← opencode.json 配置文件读写
│   ├── instance.ts       ← acp-link 子进程管理
│   ├── session.ts        ← Session 状态变更逻辑
│   ├── work-dispatch.ts  ← Work Item 创建与长轮询
│   ├── scheduler.ts      ← 定时任务调度器 (node-schedule)
│   ├── task.ts           ← 定时任务 CRUD
│   ├── disconnect-monitor.ts ← 心跳超时检测
│   ├── skill.ts          ← Skill 文件管理
│   ├── mcp-inspector.ts  ← MCP 服务端检测
│   ├── environment.ts    ← Environment 业务逻辑
│   ├── automationState.ts← 自动化状态机
│   └── transport.ts      ← 传输层辅助工具
│
└── routes/               ← HTTP/WS 路由层
    ├── acp/index.ts      ← /acp/ws, /acp/relay/:id, /acp/agents
    ├── v1/environments.ts← /v1/environments/bridge (REST 注册)
    └── web/              ← /web/* 控制面板 API
        ├── sessions.ts
        ├── environments.ts
        ├── instances.ts
        ├── api-keys.ts
        ├── config.ts
        └── tasks.ts
```

### 2.2 模块依赖图（关键路径）

```
routes/acp ──────→ transport/acp-ws-handler ──→ store
       │                      │                    ↑
       │                      └──→ transport/event-bus
       │                                           │
       └──→ transport/acp-relay-handler ──→ transport/acp-ws-handler
              │
              └──→ transport/event-bus

routes/web/environments ──→ store ──→ db/schema
       │                       ↑
       └──→ services/config    │
                               │
routes/v1/environments ────────┘

services/instance ──→ store + auth/api-key-service
services/scheduler ──→ services/task ──→ db/schema
services/disconnect-monitor ──→ store + services/session

auth/middleware ──→ auth/better-auth + auth/api-key-service + store
```

**依赖方向规则**：`routes → services → store → db`，`transport` 是独立层，仅依赖 `store` 和 `event-bus`。`routes/acp` 直接依赖 `transport`，不经过 `services`。

---

## 3. 核心类型系统

### 3.1 领域模型

```
User (SQLite)          ← better-auth 管理
  │
  ├── EnvironmentRecord (SQLite)    ← Agent 注册信息
  │     ├── id: string              ← "env_" + uuid
  │     ├── name: string            ← kebab-case 唯一名称
  │     ├── workspacePath: string   ← Agent 工作目录
  │     ├── secret: string          ← 连接认证凭据
  │     ├── status: string          ← "active" | "idle" | "disconnected"
  │     ├── workerType: string      ← "acp" (固定值)
  │     ├── capabilities: JSON      ← Agent 能力声明
  │     └── userId → User.id
  │
  ├── SessionRecord (内存 Map)      ← 对话会话
  │     ├── id: string              ← "session_" + uuid
  │     ├── environmentId → EnvironmentRecord.id
  │     ├── status: string          ← "idle" | "running" | "inactive"
  │     └── userId → User.id (nullable)
  │
  ├── SessionWorkerRecord (内存)    ← Worker 心跳状态
  │     ├── sessionId → SessionRecord.id
  │     ├── workerStatus: string
  │     └── lastHeartbeatAt: Date
  │
  ├── WorkItemRecord (内存)         ← 任务分发单元
  │     ├── id: string
  │     ├── environmentId → EnvironmentRecord.id
  │     ├── sessionId → SessionRecord.id
  │     └── state: string           ← "pending" | "dispatched" | "acked" | "completed"
  │
  └── SpawnedInstance (内存)        ← acp-link 子进程
        ├── id: string              ← "inst_" + random
        ├── port: number            ← 8888-8999
        ├── environmentId? → EnvironmentRecord.id
        └── pid: number | null
```

### 3.2 传输层类型

```typescript
// event-bus.ts — 事件总线核心类型
interface SessionEvent {
  id: string;
  sessionId: string;
  type: string;           // "acp_message" | "agent_disconnect" | 业务消息类型
  payload: unknown;       // NDJSON 消息体
  direction: "inbound" | "outbound";  // inbound=acp→server, outbound=server→acp
  seqNum: number;         // 单调递增序号
  createdAt: number;      // 时间戳
}

// acp-ws-handler.ts — 连接状态
interface AcpConnectionEntry {
  agentId: string | null;
  boundEnvId: string | null;   // 通过 environment.secret 绑定的持久环境
  userId: string;
  unsub: (() => void) | null;  // EventBus 订阅取消函数
  ws: WSContext;
  capabilities: Record<string, unknown> | null;
}

// acp-relay-handler.ts — 中继连接状态
interface RelayConnectionEntry {
  agentId: string;
  userId: string;
  unsub: (() => void) | null;
  ws: WSContext;
}
```

### 3.3 认证上下文类型

```typescript
// Hono Context Variable Map (types/api.ts)
declare module "hono" {
  interface ContextVariableMap {
    user: { id: string; email: string; name: string } | null;
    session: { id: string; userId: string; token: string } | null;
    uuid: string | undefined;            // UUID 认证
    username: string | undefined;        // 用户名认证
    authEnvironmentId: string | undefined; // environment.secret 认证
  }
}
```

### 3.4 数据库 Schema

| 表 | 存储引擎 | 用途 |
|---|---|---|
| `user` | SQLite (better-auth) | 用户账号 |
| `session` | SQLite (better-auth) | 浏览器会话 |
| `account` | SQLite (better-auth) | 认证账号（email/password） |
| `verification` | SQLite (better-auth) | 邮箱验证 |
| `api_key` | SQLite | Per-user API Key（`rcs_` 前缀） |
| `environment` | SQLite | Agent 环境持久化 |
| `mcp_tool` | SQLite | MCP 工具缓存 |
| `scheduled_task` | SQLite | 定时任务定义 |
| `task_execution_log` | SQLite | 任务执行日志 |

**纯内存存储**（`src/store.ts` 内的 Map）：
- `sessions` — SessionRecord
- `sessionWorkers` — SessionWorkerRecord
- `workItems` — WorkItemRecord
- `sessionOwners` — Session ↔ UUID 绑定关系
- `tokens` — 遗留 token 存储

---

## 4. 核心数据流

### 4.1 Agent 连接生命周期

```
acp-link                     RCS Server                      Frontend
  │                             │                               │
  │  ① POST /v1/environments/bridge (REST 注册)                │
  │ ─────────────────────────→ │                               │
  │ ←─ { environment_id,       │                               │
  │      environment_secret,   │                               │
  │      session_id }          │                               │
  │                             │                               │
  │  ② GET /acp/ws?token=secret (WebSocket 连接)               │
  │ ════════════════════════→ │                               │
  │       [认证: env.secret → userId → envId]                  │
  │                             │                               │
  │  ③ { type: "register", ... }│                               │
  │ ─────────────────────────→ │                               │
  │ ←─ { type: "registered",   │                               │
  │       agent_id: "env_xxx" } │                               │
  │                             │                               │
  │       [EventBus 订阅建立]    │                               │
  │       [keepalive 定时器启动] │                               │
  │                             │  ④ GET /acp/relay/:agentId   │
  │                             │ ←──────────────────────────── │
  │                             │   [认证: better-auth cookie]  │
  │                             │   [EventBus 订阅建立]         │
  │                             │                               │
  │  ⑤ 业务消息 (双向)          │                               │
  │ ════════════════════════→ │ ──EventBus──→ relay ─────────→ │
  │ ←════════════════════════ │ ←──EventBus── relay ←───────── │
  │                             │                               │
  │  ⑥ WS 断开                  │                               │
  │ ─────────────────────────→ │ → relay: { type: "status",   │
  │                             │            connected: false } │
  │                             │   [持久环境: status → idle]   │
  │                             │   [临时环境: 删除记录]         │
```

### 4.2 消息路由机制

**EventBus** 是消息路由的核心。每个 Agent（`agentId`）对应一个独立的 `EventBus` 实例。

```
                    EventBus (per agentId)
                    ┌──────────────────────┐
 acp-ws-handler ───→│ subscribe(outbound)  │──→ acp-link WS
 (publish inbound)  │                      │
                    │  publish(event)       │
                    │  → 通知所有订阅者      │
                    │                      │
 acp-relay-handler ─→│ subscribe(inbound)  │──→ Frontend WS
 (publish outbound) │                      │
                    └──────────────────────┘

方向约定:
  inbound  = acp-link → server (acp-ws-handler publish, relay subscribe)
  outbound = server → acp-link (relay publish, acp-ws-handler subscribe)
```

**关键约束**：
- `acp-ws-handler` 仅订阅 `outbound` 事件（发给 acp-link 的消息）
- `acp-relay-handler` 仅订阅 `inbound` 事件（来自 acp-link 的消息）
- `agent_disconnect` 是特殊 inbound 事件，触发 relay 向前端推送断连通知

### 4.3 Instance 启动流程

```
Frontend                    RCS Server                      acp-link (child process)
  │                           │                               │
  │ POST /web/instances/      │                               │
  │   from-environment        │                               │
  │ ───────────────────────→ │                               │
  │                           │ ① 创建/复用 Session           │
  │                           │ ② 分配端口 (8888-8999)        │
  │                           │ ③ spawn("acp-link", [...])    │
  │                           │ ──────────────────────────→  │
  │                           │                               │ ④ acp-link 自动
  │                           │                               │    POST /v1/environments/bridge
  │                           │ ←──────────────────────────  │
  │                           │                               │ ⑤ acp-link 自动
  │                           │                               │    GET /acp/ws?token=...
  │                           │ ←══════════════════════════  │
  │                           │                               │
  │ ←─ { id, port, status }  │                               │
  │                           │                               │
```

---

## 5. 认证体系

RCS 存在两条独立的认证路径，服务于不同的客户端：

### 5.1 前端用户认证（better-auth session）

```
Browser → POST /api/auth/sign-in/email → better-auth → Set-Cookie (session)
Browser → GET /web/* (cookie 自动携带) → sessionAuth 中间件 → 验证 session → 注入 user
Browser → GET /acp/relay/:id (cookie 自动携带) → auth.api.getSession → 验证 → 建立 WS
```

### 5.2 acp-link Agent 认证（API Key / Environment Secret）

```
acp-link → 携带 token (Authorization: Bearer xxx 或 ?token=xxx)
  → apiKeyAuth 中间件（三级验证）:
    0. environment.secret 匹配 → 解析为环境所有者 → 设置 authEnvironmentId
    1. Per-user API Key (SQLite) → 解析为特定用户
    2. 全局 API Key (RCS_API_KEYS 环境变量) → 解析为系统用户
```

**权限模型**：所有数据操作基于 `userId` 过滤，确保用户间隔离。acp-link 通过 environment secret 绑定到特定 Environment 时，获得该 Environment 所有者的权限上下文。

---

## 6. 前端架构

### 6.1 页面路由（SPA，History API）

```
/code/                   → Dashboard (环境管理)
/code/:sessionId         → SessionDetail (对话详情)
/code/models             → ModelsPage
/code/agents             → AgentsPage
/code/skills             → SkillsPage
/code/mcp                → McpPage
/code/tasks              → TasksPage (定时任务)
```

路由在 `App.tsx` 中通过 `popstate` 事件和 `pushState` 管理，无第三方路由库。

### 6.2 前端 API 层

```
web/src/api/client.ts          ← 所有后端 API 调用
web/src/lib/auth-client.ts     ← better-auth 客户端 (cookie-based)
web/src/types/index.ts         ← 前端类型定义
web/src/types/config.ts        ← 配置模块类型定义
```

**API 通信模式**：
- REST：`fetch` + `credentials: "include"`（cookie 自动携带）
- WebSocket：`/acp/relay/:agentId`（握手时自动携带 cookie）

### 6.3 前端组件层级

```
App.tsx (认证守卫 + 路由)
  └── AppShell (布局框架)
      ├── Sidebar (导航)
      └── 内容区域 (按路由渲染):
          ├── Dashboard (环境 CRUD + 实例管理)
          ├── SessionDetail (WebSocket 对话)
          ├── ModelsPage / AgentsPage / SkillsPage / McpPage (配置管理)
          └── TasksPage (定时任务管理)
```

配置页面共享通用组件：
- `DataTable` — 通用数据表格（排序/筛选/展开行）
- `FormDialog` — 表单弹窗（react-hook-form + zod）
- `StatusBadge` — 状态标签

---

## 7. 配置管理

### 7.1 双存储策略

| 数据 | 存储位置 | 持久化 |
|---|---|---|
| 用户/会话/API Key | SQLite (`data/db.sqlite`) | 持久化 |
| Agent Environment | SQLite + 内存状态 | 持久化 |
| 运行中 Session | 内存 Map | 非持久化（重启丢失） |
| WorkItem / SessionWorker | 内存 Map | 非持久化 |
| AI 配置 (providers/models/agents/skills/mcp) | 文件系统 (`~/.config/opencode/opencode.json`) | 持久化 |
| Skill 文件 | 文件系统 (`~/.agents/skills/`) | 持久化 |

### 7.2 配置文件服务

`services/config.ts` 通过文件锁（互斥写）+ deep merge 策略管理 `opencode.json`：

```
前端 → POST /web/config/:module { action, ... }
  → config route → services/config.ts → 文件读写锁 → opencode.json
```

子服务（`skill.ts`, `instance.ts`）在配置文件基础上提供更高级的 CRUD 语义。

---

## 8. 定时任务系统

```
web/src/pages/TasksPage.tsx
  → api client → routes/web/tasks.ts
    → services/task.ts (CRUD)
    → services/scheduler.ts (调度)

scheduler.ts:
  - 启动时从 SQLite 加载所有 enabled 任务
  - node-schedule 按 cron 表达式触发
  - 执行 HTTP 请求，记录日志到 task_execution_log 表
  - 支持重试策略（retry_count × retry_interval）
```

---

## 9. 保活与断连检测

### 9.1 保活机制

| 连接 | 方向 | 间隔 | 方式 |
|---|---|---|---|
| Server → acp-link | outbound | 20s (可配) | `keep_alive` NDJSON 帧 |
| acp-link → Server | — | 60s | 无活动超时关闭 |
| Server → Frontend relay | outbound | 20s | `keep_alive` JSON 帧 |
| Bun WS Protocol | 双向 | 255s (可配) | WebSocket Ping/Pong |

### 9.2 断连检测

`disconnect-monitor.ts` 每 60s 扫描一次：
- Environment：`lastPollAt` 超过 `disconnectTimeout`（默认 120s）→ ACP Agent 标记 idle，其他标记 disconnected
- Session：`updatedAt` 超过 `disconnectTimeout × 2` → 标记 inactive

---

## 10. 启动与关闭流程

### 10.1 启动序列

```
1. SQLite 初始化 (better-auth 自动建表)
2. Skills 目录迁移 (旧路径 → 新路径)
3. Scheduler 启动 (加载 enabled 定时任务)
4. Hono 应用创建
   - 挂载中间件 (logger, CORS, 路径规范化)
   - 挂载 better-auth handler (/api/auth/*)
   - 挂载静态文件 (/code/* → web/dist/)
   - 挂载路由 (/v1/*, /web/*, /acp/*)
5. Bun HTTP Server 启动 (config.port, config.host)
```

### 10.2 优雅关闭

```
SIGINT/SIGTERM → gracefulShutdown():
  1. closeAllAcpConnections() — 关闭所有 acp-link WS，清理 Environment 状态
  2. closeAllRelayConnections() — 关闭所有前端 relay WS
  3. stopAllInstances() — SIGTERM 所有 acp-link 子进程
  4. stopScheduler() — 取消所有 cron job
  5. process.exit(0)
```

---

## 11. 关键设计决策

| 决策 | 选择 | 原因 |
|---|---|---|
| Session 存内存、Environment 存 SQLite | 混合存储 | Session 是临时运行状态不需要持久化；Environment 需要跨重启保持（secret 绑定） |
| 每个 Agent 一个 EventBus 实例 | 隔离事件流 | 避免消息广播到不相关的 Agent，天然实现用户间隔离 |
| acp-ws-handler 不经过 services 层 | 减少抽象层 | WS 消息处理是纯粹的转发逻辑，直接操作 store 和 event-bus 更清晰 |
| NDJSON 而非 JSON 帧 | acp-link 兼容 | acp-link 使用 NDJSON 格式，每行一个 JSON + 换行符 |
| 端口范围 8888-8999 | 限制子进程 | acp-link 子进程需要独立端口，限制范围便于管理和防火墙配置 |
| 配置文件用 deep merge | 细粒度更新 | 允许修改嵌套字段而不覆盖整个配置节，但需注意数组不会被 merge |
