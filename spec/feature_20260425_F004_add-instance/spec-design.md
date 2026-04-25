# Feature: 20260425_F004 - add-instance

## 需求背景

当前 Dashboard 可以查看已连接的 Agents 和 Sessions，但无法通过 UI 直接新增实例。用户需要手动在终端执行 `client.sh` 脚本来启动新的 `acp-link` 进程，操作不便且无法集中管理。

需要提供一个 Dashboard 上的「新增实例」按钮，点击后服务端自动 spawn 一个 `acp-link` 子进程，该子进程通过 WebSocket 连接回 `/acp/ws`，成为系统中的一个新 Agent。

## 目标

- Dashboard 提供一键新增实例的能力，用户无需手动操作终端
- 服务端自动管理子进程的生命周期（创建、列表、终止）
- 自动分配端口，避免冲突
- 自动获取用户 API Key 用于子进程认证

## 方案设计

### 架构概览

```
Dashboard (前端)                Server (后端)                    acp-link (子进程)
┌──────────────┐               ┌──────────────────────┐         ┌─────────────┐
│ [+ 新增实例] │──POST──────>  │ InstanceService      │──spawn─>│ acp-link    │
│              │               │  ├─ 端口分配          │         │  --group    │
│ Agent 列表   │<──GET───────  │  ├─ spawn 子进程      │<──ws────│  --port     │
│              │               │  └─ 进程注册表        │         │  opencode   │
│ [停止] 按钮  │──DELETE────>  │ routes/web/instances │         └─────────────┘
└──────────────┘               └──────────────────────┘
```

核心流程：用户点击按钮 → 调用 POST API → 服务端分配端口、获取用户 API Key → spawn `acp-link` 子进程 → 子进程通过 WebSocket 连回 `/acp/ws` → 自动注册为 ACP Agent。

### 数据模型

在内存中维护 `SpawnedInstance` 记录（不持久化，重启后需要重新创建）：

```typescript
interface SpawnedInstance {
  id: string;              // 实例唯一 ID (inst_xxx)
  userId: string;          // 所属用户
  port: number;            // 分配的端口
  pid: number | null;      // 子进程 PID
  status: "starting" | "running" | "stopped" | "error";
  command: string;         // 完整启动命令（用于调试）
  error: string | null;    // 错误信息
  createdAt: Date;
}
```

使用 `Map<string, SpawnedInstance>` 存储，放在独立的 `src/services/instance.ts` 中。

### 接口设计

**POST /web/instances** — 新增实例

- Auth: `sessionAuth`
- 逻辑:
  1. 获取当前用户的 API Key（调用 `listApiKeysByUser`，取第一个；若无则自动创建）
  2. 从端口范围 `[8888, 8999]` 中分配一个空闲端口（检查已被 spawned 实例占用的端口）
  3. 构建 acp-link 命令：
     ```
     ACP_RCS_URL=<serverBaseUrl> ACP_RCS_TOKEN=<apiKey> acp-link --group <apiKey> --port <port> opencode -- acp
     ```
  4. `child_process.spawn` 启动子进程
  5. 监听子进程 stdout/stderr 用于日志，监听 `close` 事件更新状态
  6. 返回 `{ id, port, status }`
- Response: `{ id, port, status, created_at }`

**GET /web/instances** — 列出用户的所有实例

- Auth: `sessionAuth`
- Response: `[{ id, port, status, error, created_at }]`

**DELETE /web/instances/:id** — 终止实例

- Auth: `sessionAuth` + 归属检查
- 逻辑: `process.kill(pid)` 终止子进程，更新状态为 `stopped`
- Response: `{ ok: true }`

### 端口分配策略

- 端口范围: `8888 ~ 8999`（最多支持 112 个并发实例）
- 分配方式: 从已有 spawned 实例中收集已占用端口，选择范围内第一个空闲端口
- 冲突检测: spawn 前尝试 `net.createServer` 绑定端口，确认端口确实空闲后关闭测试 server，再执行 spawn

### 子进程生命周期管理

- **启动**: `spawn('acp-link', [...args], { env: { ACP_RCS_URL, ACP_RCS_TOKEN }, stdio: ['pipe', 'pipe', 'pipe'] })`
- **运行中**: 监听 stdout/stderr 输出到 logger，监听 `close` 事件自动将状态更新为 `stopped`
- **停止**: `process.kill(pid, 'SIGTERM')`，若 5 秒后仍未退出则 `SIGKILL`
- **服务器关闭**: 在 graceful shutdown 中遍历所有 spawned 实例并发送 SIGTERM

### 前端设计

在 Dashboard 的 Agents 区域标题旁添加「+ 新增实例」按钮：

```
Agents                    [+ 新增实例]
┌─────────────────────────────────────┐
│ env_xxx  opencode  active  端口 8888│ [停止]
│ env_yyy  opencode  active  端口 8889│ [停止]
└─────────────────────────────────────┘
```

- 按钮点击后调用 `POST /web/instances`
- 按钮在请求期间显示 loading 状态
- 成功后自动刷新 Dashboard 数据（复用现有 `loadDashboard` 刷新逻辑）
- 每个由 spawned 产生的 Agent 显示端口号和「停止」按钮
- 停止按钮调用 `DELETE /web/instances/:id`，成功后刷新列表

### 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/services/instance.ts` | 新增 | InstanceService：端口分配、spawn 管理、进程注册表 |
| `src/routes/web/instances.ts` | 新增 | REST API：POST/GET/DELETE /web/instances |
| `src/index.ts` | 修改 | 注册新路由 `app.route("/web", webInstances)`；graceful shutdown 中终止所有实例 |
| `web/src/api/client.ts` | 修改 | 添加 `apiCreateInstance`、`apiListInstances`、`apiDeleteInstance` |
| `web/src/pages/Dashboard.tsx` | 修改 | Agents 区域添加「+ 新增实例」按钮和停止功能 |
| `web/src/components/EnvironmentList.tsx` | 修改 | 支持 spawned 实例的停止按钮 |

## 实现要点

1. **端口分配的原子性**: 在高并发下可能有两个请求同时分配同一端口。解决方案是在 spawn 请求期间加一个简单的内存锁（Set<string>），请求开始时添加 key，结束时移除。
2. **子进程环境变量**: `ACP_RCS_URL` 应使用 `getBaseUrl()` 获取服务器的实际地址，而不是硬编码 `localhost:3000`。
3. **acp-link 路径**: 假设 `acp-link` 已在系统 PATH 中，直接 spawn 命令名即可。若不在 PATH 中，需考虑配置化。
4. **API Key 自动创建**: 如果用户没有任何 API Key，需要自动创建一个。复用现有的 `createApiKey` 方法。
5. **进程清理**: 子进程应设置 `detached: false`（默认），确保父进程退出时子进程也被终止。

## 验收标准

- [ ] Dashboard Agents 区域有「+ 新增实例」按钮
- [ ] 点击按钮后成功 spawn acp-link 子进程并连接到 /acp/ws
- [ ] 新实例出现在 Agent 列表中，状态为 online
- [ ] 可以通过停止按钮终止实例
- [ ] 端口自动分配，无冲突
- [ ] 用户无 API Key 时自动创建
- [ ] 服务器优雅关闭时所有实例被清理
