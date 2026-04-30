# Feature: 20260430_F001 - env-multi-instance

## 需求背景

当前 Dashboard 中每个环境（Environment）同一时间只能持有一个运行中的实例（Instance）。用户若需要并行执行多个任务，只能创建多个独立环境，操作繁琐且浪费资源。

实际使用场景中，用户希望在同一个环境下创建多个实例，每个实例独立运行、拥有独立会话，实现并行任务处理。前端需要通过下拉菜单展示和切换多实例。

## 目标

- 一个环境可同时持有多个运行中的实例，无数量限制
- 每个实例拥有独立的会话（session），对话历史完全隔离
- 前端"进入对话"按钮支持多实例下拉选择
- 下拉菜单内可直接新建实例
- 实例使用自动编号标识（"实例 1"、"实例 2"...）

## 方案设计

### 数据模型变更

**SpawnedInstance 接口扩展**（`src/services/instance.ts`）：

```typescript
export interface SpawnedInstance {
  id: string;
  userId: string;
  port: number;
  pid: number | null;
  status: "starting" | "running" | "stopped" | "error";
  command: string;
  error: string | null;
  apiKey: string;
  createdAt: Date;
  environmentId?: string;
  sessionId?: string;
  instanceNumber: number;  // 新增：环境内的实例编号（1, 2, 3...）
}
```

**编号分配规则**：

- 使用内存计数器 `envInstanceCounters: Map<string, number>` 跟踪每个环境的实例编号
- 新增实例时：`counter = envInstanceCounters.get(environmentId) ?? 0`，分配 `counter + 1`
- 编号严格递增，不回收已停止实例的编号（避免混淆）

**核心函数变更**：

| 函数 | 变更 |
|------|------|
| `spawnInstanceFromEnvironment` | 移除 `hasRunningInstance` 单实例检查；新增 `instanceNumber` 赋值 |
| 新增 `listInstancesByEnvironment(envId)` | 返回指定环境的活跃实例（starting/running，不含已停止） |
| 新增 `getRunningInstancesByEnvironment(envId)` | 返回指定环境的运行中实例 |

### 后端 API 设计

#### 修改现有 API

**`POST /web/environments/:id/enter`**

- 无实例时：自动创建实例 1 并进入
- 有实例时：返回第一个运行中实例的 `session_id`（默认行为）
- 新增可选 body 参数 `instance_number`：指定进入哪个编号的实例

```jsonc
// Request
{ "instance_number": 2 }  // 可选

// Response
{ "session_id": "session_xxx", "instance_id": "inst_xxx", "instance_number": 2, "instance_status": "running" }
```

**`POST /web/instances/from-environment`**

- 移除单实例限制检查
- 每次调用均创建新实例（新编号、新端口、新 session）

#### 新增 API

**`GET /web/environments/:id/instances`** — 列出环境的活跃实例（仅 starting/running 状态）

```jsonc
// Response
{
  "environment_id": "env_xxx",
  "instances": [
    {
      "id": "inst_1",
      "instance_number": 1,
      "status": "running",
      "session_id": "session_a",
      "port": 8888,
      "created_at": 1746001200
    },
    {
      "id": "inst_2",
      "instance_number": 2,
      "status": "running",
      "session_id": "session_b",
      "port": 8889,
      "created_at": 1746001500
    }
  ]
}
```

### 前端 UI 设计

#### 环境卡片改造

将单个"进入对话"按钮改造为**组合按钮（Split Button）**：

**单实例时**：按钮外观不变，点击直接进入默认实例。

**多实例时**：按钮右侧出现下拉箭头 `▼`。

```
┌─────────────────────────────────────────┐
│ 🟢 opencode  实例 x2                     │
│ ~/projects/myapp                         │
│                                          │
│  [  进入对话  ▼ ]  [停止实例]             │
└─────────────────────────────────────────┘
```

#### 下拉菜单内容

```
┌──────────────────────────┐
│ ● 实例 1  running        │  ← 点击进入实例 1 的会话
│ ● 实例 2  running        │  ← 点击进入实例 2 的会话
│ ─────────────────────── │
│ + 新建实例               │  ← 创建新实例并进入
└──────────────────────────┘
```

**交互规则**：

- 点击按钮主体 → 进入第一个运行中的实例（等同于当前行为）
- 点击下拉箭头 → 展开菜单选择具体实例
- 菜单项点击 → 调用 `POST /web/environments/:id/enter` 并带 `instance_number` 参数
- "新建实例" → 调用 `POST /web/instances/from-environment`，创建后自动进入
- 下拉菜单仅展示活跃实例（starting/running），不展示已停止的实例
- 环境卡片头部显示实例数量标签"实例 xN"（仅计活跃实例）

**组件选型**：使用 shadcn `DropdownMenu` + `Button` 组合实现 Split Button。

### 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/services/instance.ts` | 修改 | SpawnedInstance 增加 instanceNumber；移除单实例检查；新增 listInstancesByEnvironment、getRunningInstancesByEnvironment |
| `src/routes/web/environments.ts` | 修改 | enter API 支持 instance_number 参数；新增 GET /:id/instances 路由 |
| `src/routes/web/instances.ts` | 修改 | toResponse 新增 instance_number 字段 |
| `web/src/api/client.ts` | 修改 | 新增 apiListEnvironmentInstances；apiEnterEnvironment 支持 instanceNumber 参数；相关接口类型扩展 |
| `web/src/pages/EnvironmentsPage.tsx` | 修改 | "进入对话"按钮改为 Split Button + DropdownMenu |
| `web/src/types/index.ts` | 修改 | Environment 类型增加 instances_count 等字段 |

## 实现要点

1. **编号原子性**：`envInstanceCounters` 的读取和更新应在同一函数调用内完成，避免并发创建时编号重复。由于 Node.js 单线程特性，Map 操作天然原子，无需额外锁。
2. **端口分配不变**：多实例共享端口池（8888-8999），`allocatePort` 已有冲突检测逻辑，无需修改。
3. **Session 独立创建**：`spawnInstanceFromEnvironment` 中每个新实例必须创建新 session（不复用已有 session），确保对话隔离。
4. **graceful shutdown**：`stopAllInstances` 逻辑不变，遍历所有实例发送 SIGTERM。
5. **前端状态刷新**：创建新实例后需同时刷新环境列表（获取新的 instance_count）和实例列表。

## 验收标准

- [ ] 环境卡片单实例时，"进入对话"按钮行为与改造前一致
- [ ] 环境卡片多实例时，按钮右侧出现下拉箭头
- [ ] 下拉菜单正确展示活跃实例（编号 + 状态，不含已停止）
- [ ] 点击下拉菜单中的实例项可进入对应会话
- [ ] 下拉菜单"新建实例"可成功创建新实例并自动进入
- [ ] 每个实例拥有独立的 session 和对话历史
- [ ] 环境卡片头部显示活跃实例数量
- [ ] 停止某个实例不影响其他实例运行
