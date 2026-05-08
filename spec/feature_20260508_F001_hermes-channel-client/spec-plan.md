# Hermes Channel Client 执行计划

**目标:** 将 RCS 作为 Hermes Gateway 的 WebSocket 客户端接入，实现外部平台消息与 Agent 的双向转发

**技术栈:** TypeScript, Bun, Hono, WebSocket (native), React, Tailwind CSS v4

**设计文档:** spec-design.md

## 改动总览

- 新建 2 个后端服务模块（`hermes-client.ts` WebSocket 客户端、`channel-binding.ts` 绑定 CRUD），修改 5 个现有文件（channels 路由、channel-provider、index.ts、前端 types/api/页面），新增 1 个 acp-relay-handler 导出函数
- Task 依赖链：Task 1（数据层）→ Task 2（通信层，依赖 Task 1 的匹配函数）→ Task 3（API 层，依赖 Task 1+2）→ Task 4（前端数据层）→ Task 5（前端 UI）
- 关键设计决策：绑定数据存储在 `opencode.json` 的 `channels.bindings` 段，复用 config.ts 的 `modifySection` 原子写入；消息路由复用 instance local WS 和 `sendToAgentWs` 两条现有路径；出站消息通过 ACP EventBus 订阅捕获 Agent 回复

---

### Task 0: 环境准备

**背景:**
确保构建和测试工具链在当前开发环境中可用，避免后续 Task 因环境问题阻塞。

**执行步骤:**
- [ ] 验证后端构建工具可用
  - `bun run typecheck`
  - 确认 TypeScript 类型检查通过
- [ ] 验证测试工具可用
  - `bun test src/__tests__/channel-provider.test.ts`
  - 确认现有 channel 测试通过
- [ ] 验证前端构建工具可用
  - `bun run build:web`
  - 确认前端构建成功

**检查步骤:**
- [ ] 后端类型检查通过
  - `bun run typecheck`
  - 预期: 无类型错误
- [ ] 现有测试通过
  - `bun test src/__tests__/channel-provider.test.ts src/__tests__/channel-routes.test.ts`
  - 预期: 所有测试通过

---

### Task 1: Channel Binding Service

**背景:**
[业务语境] 实现 Hermes 通道与 Agent 的绑定关系管理，是外部平台消息路由到 Agent 的核心查找层。用户通过前端配置"飞书消息 → Agent A"这类绑定后，入站消息才能被正确分发。
[修改原因] 当前 `opencode.json` 中无 `channels` 段，无绑定数据模型，消息无法路由。需新建 `channel-binding.ts` 提供绑定 CRUD 和消息匹配能力。
[上下游影响] 本 Task 是 Task 2（Hermes Client 消息入站匹配）和 Task 3（后端 API 端点）的前置依赖。Task 2 调用 `findBindingForMessage()` 路由消息，Task 3 调用 CRUD 函数暴露 HTTP API。本 Task 不依赖任何前置 Task。

**涉及文件:**
- 新建: `src/services/channel-binding.ts`
- 新建: `src/__tests__/channel-binding.test.ts`

**执行步骤:**

- [ ] 定义 ChannelBinding 类型和数据结构
  - 位置: `src/services/channel-binding.ts` 文件顶部
  - 定义 `ChannelBinding` 接口，字段: `id: string`, `platform: string`, `chatId: string | null`, `agentId: string`, `enabled: boolean`
  - 定义 `CreateBindingInput` 接口（不含 `id`），字段: `platform`, `chatId?`, `agentId`, `enabled?`（`enabled` 默认 `true`）
  - 定义 `ChannelsConfig` 接口: `{ hermesUrl?: string; bindings: ChannelBinding[] }`
  - 定义 `BindingMatchResult` 接口: `{ binding: ChannelBinding; matchType: "exact" | "wildcard" }`
  - 原因: 统一类型约束，避免散落在各处的内联类型定义

- [ ] 实现 ID 生成工具函数
  - 位置: `src/services/channel-binding.ts`，类型定义之后
  - 函数签名: `function generateBindingId(): string`
  - 伪代码:
    ```
    const uuid = crypto.randomUUID();
    return "bind_" + uuid.replace(/-/g, "");
    ```
  - 原因: 绑定 ID 格式 `bind_` + 无连字符 UUID，与项目中 `env_`、`ses_` 前缀风格一致

- [ ] 实现 `listBindings()`
  - 位置: `src/services/channel-binding.ts`，ID 生成之后
  - 函数签名: `async function listBindings(): Promise<ChannelBinding[]>`
  - 伪代码:
    ```
    import { getSection } from "./config";
    const channels = await getSection<ChannelsConfig>("channels");
    return channels?.bindings ?? [];
    ```
  - 原因: 纯读取操作，使用 `getSection` 无需加锁；`channels` 段可能不存在，需 fallback 到空数组

- [ ] 实现 `getBinding(id)`
  - 位置: `src/services/channel-binding.ts`，`listBindings` 之后
  - 函数签名: `async function getBinding(id: string): Promise<ChannelBinding | undefined>`
  - 伪代码:
    ```
    const bindings = await listBindings();
    return bindings.find(b => b.id === id);
    ```
  - 原因: 复用 `listBindings`，单条查找逻辑简单

- [ ] 实现 `createBinding(data)`
  - 位置: `src/services/channel-binding.ts`，`getBinding` 之后
  - 函数签名: `async function createBinding(data: CreateBindingInput): Promise<ChannelBinding>`
  - 伪代码:
    ```
    import { modifySection } from "./config";
    const newBinding: ChannelBinding = {
      id: generateBindingId(),
      platform: data.platform,
      chatId: data.chatId ?? null,
      agentId: data.agentId,
      enabled: data.enabled ?? true,
    };
    await modifySection<ChannelsConfig>("channels", (current) => ({
      hermesUrl: current?.hermesUrl,
      bindings: [...(current?.bindings ?? []), newBinding],
    }));
    return newBinding;
    ```
  - 原因: 使用 `modifySection` 确保原子性 read-modify-write，利用 config.ts 内置的写入互斥锁

- [ ] 实现 `deleteBinding(id)`
  - 位置: `src/services/channel-binding.ts`，`createBinding` 之后
  - 函数签名: `async function deleteBinding(id: string): Promise<boolean>`
  - 伪代码:
    ```
    let deleted = false;
    await modifySection<ChannelsConfig>("channels", (current) => {
      const bindings = current?.bindings ?? [];
      const idx = bindings.findIndex(b => b.id === id);
      if (idx === -1) return current ?? { bindings: [] };
      deleted = true;
      const filtered = bindings.filter(b => b.id !== id);
      return { hermesUrl: current?.hermesUrl, bindings: filtered };
    });
    return deleted;
    ```
  - 原因: `modifySection` 的 modifier 中执行过滤，保证原子性；通过闭包变量 `deleted` 返回操作结果

- [ ] 实现 `updateBinding(id, data)`
  - 位置: `src/services/channel-binding.ts`，`deleteBinding` 之后
  - 函数签名: `async function updateBinding(id: string, data: Partial<Pick<ChannelBinding, "platform" | "chatId" | "agentId" | "enabled">>): Promise<ChannelBinding | undefined>`
  - 伪代码:
    ```
    let updated: ChannelBinding | undefined;
    await modifySection<ChannelsConfig>("channels", (current) => {
      const bindings = current?.bindings ?? [];
      const idx = bindings.findIndex(b => b.id === id);
      if (idx === -1) return current ?? { bindings: [] };
      updated = { ...bindings[idx], ...data };
      const newBindings = [...bindings];
      newBindings[idx] = updated;
      return { hermesUrl: current?.hermesUrl, bindings: newBindings };
    });
    return updated;
    ```
  - 原因: Task 3 的 `PATCH /channels/bindings/:id` 端点需要更新绑定（如启用/禁用），本函数提前提供支持

- [ ] 实现 `findBindingForMessage(platform, chatId)`
  - 位置: `src/services/channel-binding.ts`，`updateBinding` 之后
  - 函数签名: `async function findBindingForMessage(platform: string, chatId: string): Promise<BindingMatchResult | undefined>`
  - 伪代码:
    ```
    const bindings = await listBindings();
    const enabledBindings = bindings.filter(b => b.enabled && b.platform === platform);
    // 优先精确匹配
    const exact = enabledBindings.find(b => b.chatId === chatId);
    if (exact) return { binding: exact, matchType: "exact" };
    // 其次通配匹配
    const wildcard = enabledBindings.find(b => b.chatId === null);
    if (wildcard) return { binding: wildcard, matchType: "wildcard" };
    return undefined;
    ```
  - 原因: 这是消息路由的核心匹配逻辑，严格按 spec 设计的优先级实现：精确匹配 > 通配 > 无匹配

- [ ] 导出所有公共函数
  - 位置: `src/services/channel-binding.ts` 文件末尾
  - export 列表: `listBindings`, `getBinding`, `createBinding`, `deleteBinding`, `updateBinding`, `findBindingForMessage`
  - export 类型: `ChannelBinding`, `CreateBindingInput`, `ChannelsConfig`, `BindingMatchResult`
  - 原因: Task 2 和 Task 3 需要按需导入

- [ ] 为 Channel Binding Service 编写单元测试
  - 测试文件: `src/__tests__/channel-binding.test.ts`
  - 测试方式: 使用临时目录 + `mock.module` 替换 `CONFIG_PATH`，参照 `config-service.test.ts` 模式。创建临时 `opencode.json` 文件写入测试数据，每个测试后清理
  - mock 设置（文件顶部，import 之前）:
    ```
    import { mock } from "bun:test";
    const tempDir = ...; // 在 beforeAll 中创建
    mock.module("../services/config", () => ({
      CONFIG_PATH: join(tempDir, "opencode.json"),
      getSection: (await import("../services/config")).getSection,
      setSection: (await import("../services/config")).setSection,
      modifySection: (await import("../services/config")).modifySection,
    }));
    ```
    注意: 需在 `beforeAll` 中写入初始的 `{"channels": {}}` 到临时文件，确保 `channels` 段存在
  - 测试场景:
    - `listBindings 空配置返回空数组`: 无 bindings 时返回 `[]`
    - `createBinding 创建并返回绑定`: 传入 `{platform: "feishu", agentId: "env_001"}`，验证返回对象含 `id`（`bind_` 前缀）、`chatId: null`、`enabled: true`，验证 opencode.json 已写入
    - `createBinding 重复调用不冲突`: 连续创建两条绑定，验证各自 ID 不同
    - `getBinding 存在时返回绑定`: 创建后按 ID 查找，验证返回完整对象
    - `getBinding 不存在时返回 undefined`: 查找随机 ID，验证返回 `undefined`
    - `deleteBinding 删除存在的绑定`: 创建后删除，验证 `listBindings` 不再包含该绑定，验证返回 `true`
    - `deleteBinding 删除不存在的绑定返回 false`: 验证返回 `false`
    - `updateBinding 更新绑定字段`: 创建后更新 `enabled` 为 `false`，验证 `getBinding` 返回更新后的值
    - `updateBinding 不存在的绑定返回 undefined`: 验证返回 `undefined`
    - `findBindingForMessage 精确匹配优先`: 创建 `platform=feishu, chatId=chat1` 和 `platform=feishu, chatId=null` 两条绑定，查找 `("feishu", "chat1")`，验证返回精确匹配且 `matchType === "exact"`
    - `findBindingForMessage 通配匹配兜底`: 查找 `("feishu", "chat_other")`，验证返回通配绑定且 `matchType === "wildcard"`
    - `findBindingForMessage 无匹配返回 undefined`: 查找 `("telegram", "any")`，验证返回 `undefined`
    - `findBindingForMessage 跳过 disabled 绑定`: 创建 `platform=feishu, chatId=null, enabled=false`，查找 `("feishu", "any")`，验证返回 `undefined`
    - `findBindingForMessage platform 不匹配时忽略`: 跨平台查找，验证返回 `undefined`
  - 运行命令: `bun test src/__tests__/channel-binding.test.ts`
  - 预期: 所有测试通过

**检查步骤:**
- [ ] 验证 channel-binding.ts 文件存在且导出所有公共函数
  - `grep -c "export.*function\|export.*type\|export.*interface" src/services/channel-binding.ts`
  - 预期: 输出 >= 10（5 个函数 + 4 个类型）
- [ ] 验证 findBindingForMessage 匹配逻辑中精确匹配在通配之前
  - `grep -A 5 "精确匹配" src/services/channel-binding.ts | grep -c "return"`
  - 预期: 输出 >= 1（精确匹配有独立 return）
- [ ] 验证所有写入操作使用 modifySection
  - `grep -c "modifySection" src/services/channel-binding.ts`
  - 预期: 输出 >= 3（create、delete、update 各至少一处）
- [ ] 验证单元测试通过
  - `bun test src/__tests__/channel-binding.test.ts`
  - 预期: 所有测试通过，无报错
- [ ] 验证类型检查通过
  - `bun run typecheck`
  - 预期: 无类型错误

---

### Task 2: Hermes Client

**背景:**
[业务语境] 实现 RCS 与 Hermes Gateway 之间的 WebSocket 持久连接，负责双向消息转发：入站（外部平台 → Agent）和出站（Agent → 外部平台）
[修改原因] 当前项目不存在任何与 Hermes Gateway 通信的模块，需从零新建 WebSocket 客户端，包含连接管理、心跳保活、指数退避重连、消息路由等能力
[上下游影响] 本 Task 产出 `HermesClient` 类和单例获取器 `getHermesClient()`，被 Task 3（后端集成）的路由端点和 index.ts 调用。入站消息路由依赖 Task 1 的 `findBindingForMessage()` 查找绑定关系。出站消息通过 EventBus 订阅捕获 Agent 回复

**涉及文件:**
- 新建: `src/services/hermes-client.ts`
- 新建: `src/__tests__/hermes-client.test.ts`
- 修改: `src/transport/acp-relay-handler.ts`（新增 `sendToInstanceLocalWs` 导出函数）

**执行步骤:**

- [ ] 创建 HermesClient 类骨架和类型定义
  - 位置: `src/services/hermes-client.ts` 文件顶部
  - 导出类型 `HermesStatus`：`{ connected: boolean; url: string; platforms: string[]; reconnecting: boolean; lastConnectedAt: number | null }`
  - 内部接口 `HermesInboundMessage`（type: "message"，含 data.source.platform/chat_id/user_id/user_name、data.text、data.message_id）
  - 内部接口 `HermesOutboundSend`（type: "send"，含 platform/chat_id/text/reply_to?）
  - `HermesClient` 类，构造函数接收 `url: string`，从 `process.env.HERMES_PLATFORMS` 解析平台列表（逗号分隔，默认空数组表示全部）
  - 私有字段：`ws`、`status`、`reconnectTimer`、`pingTimer`、`pongTimeout`、`statusListeners`、`stopped`、`reconnectAttempts`、`bindingUnsubs: Map<string, () => void>`
  - 原因: 所有类型定义集中在模块顶部，便于后续步骤引用

- [ ] 实现 `start()` — 建立 WebSocket 连接并发送 subscribe
  - 位置: `HermesClient.start()` 方法
  - 设置 `stopped = false`，调用内部 `connect()` 方法
  - `connect()` 创建 `new WebSocket(this.url)`，绑定 onopen/onmessage/onclose/onerror
  - `onopen`：更新 `status`（connected=true, reconnecting=false, lastConnectedAt=Date.now()），发送 `{ type: "subscribe", platforms: this.platforms }`，启动心跳，通知状态变更
  - `onmessage`：按 `\n` 分割 NDJSON，每行 JSON.parse 后交给 `handleMessage(msg)` 处理
  - `onclose`：清理心跳，如果 `!stopped` 则调用 `scheduleReconnect()`
  - `onerror`：仅记录日志
  - 原因: 遵循 spec 连接生命周期

- [ ] 实现 `stop()` — 优雅关闭
  - 位置: `HermesClient.stop()` 方法
  - 设置 `stopped = true`，清除重连定时器
  - 如果 `ws.readyState === 1`，发送 `{ type: "unsubscribe" }` 后调用 `ws.close(1000, "shutdown")`
  - 清理心跳，更新 status，通知状态变更，清理所有 bindingUnsubs
  - 原因: spec 要求优雅关闭时先发 unsubscribe 再断开

- [ ] 实现心跳机制 — ping/pong 保活
  - 位置: `HermesClient` 私有方法 `startHeartbeat()` / `stopHeartbeat()`
  - `startHeartbeat()`：每 30s 发送 `{ type: "ping" }`，同时设置 60s 的 pong 超时定时器
  - `stopHeartbeat()`：清除 pingTimer 和 pongTimeout
  - `handleMessage()` 中 `type === "pong"` 分支：清除 pongTimeout
  - pong 超时触发：记录日志，调用 `ws.close()` 触发重连
  - 原因: spec 要求 30s ping、60s pong 超时

- [ ] 实现指数退避重连
  - 位置: `HermesClient` 私有方法 `scheduleReconnect()`
  - 延迟计算：`Math.min(2000 * Math.pow(2, reconnectAttempts), 60000)`
  - 更新 `status.reconnecting = true`，通知状态变更，`setTimeout` 后调用 `connect()`
  - `connect()` 成功后重置 `reconnectAttempts = 0`
  - 原因: spec 要求指数退避重连，最大 60s

- [ ] 实现入站消息处理 — Hermes → Agent 路由
  - 位置: `HermesClient` 私有方法 `handleMessage(msg)`
  - `type === "message"`：提取 `msg.data.source.platform` 和 `msg.data.source.chat_id`
  - 调用 `findBindingForMessage(platform, chatId)`（从 `./channel-binding` 导入，Task 1 产出）
  - 无匹配：记录日志 `[Hermes] No binding for ...`，忽略
  - 匹配成功：调用 `routeToAgent(binding.agentId, msg)` 私有方法
  - `type === "platform_status"`：更新 `status.platforms`，通知状态变更
  - `type === "error"`：记录日志
  - 原因: 入站消息按绑定规则路由到 Agent

- [ ] 实现 `routeToAgent()` — 消息注入 Agent
  - 位置: `HermesClient` 私有方法 `routeToAgent(agentId, hermesMsg)`
  - 构造 ACP 格式 user message：
    ```typescript
    const acpMsg = {
      type: "user",
      content: hermesMsg.data.text,
      source: "hermes",
      platform: hermesMsg.data.source.platform,
      chat_id: hermesMsg.data.source.chat_id,
      user_id: hermesMsg.data.source.user_id,
      user_name: hermesMsg.data.source.user_name,
      message_id: hermesMsg.data.message_id,
    };
    ```
  - 优先查找 spawned instance：`findRunningInstanceByEnvironment(agentId)`（从 `./instance` 导入）
  - 有 instance：调用 `sendToInstanceLocalWs(instance.id, JSON.stringify(acpMsg))`（从 `../transport/acp-relay-handler` 导入，下一步新增）
  - 无 instance：调用 `sendToAgentWs(agentId, acpMsg)`（从 `../transport/acp-ws-handler` 导入），返回 false 则记录日志
  - 路由成功后，如果 `bindingUnsubs` 中没有该 binding 的订阅，调用 `setupOutboundRouting(binding)`
  - 原因: 复用 instance local WS 和 ACP 直连两条路径

- [ ] 在 acp-relay-handler.ts 新增 `sendToInstanceLocalWs()` 导出函数
  - 位置: `src/transport/acp-relay-handler.ts` 文件末尾，`closeInstanceLocalWs()` 之后
  - 函数签名：`export function sendToInstanceLocalWs(instanceId: string, data: string): boolean`
  - 逻辑：从 `agentLocalWsMap` 获取 instanceId 对应的 `AgentLocalConn`，检查 `ws.readyState === 1`，发送 `data`，返回 `true`；否则返回 `false`
  - 原因: `agentLocalWsMap` 按 instanceId 做 key，HermesClient 需要通过此函数向 instance 发消息

- [ ] 实现出站消息处理 — Agent → Hermes 路由
  - 位置: `HermesClient` 私有方法 `setupOutboundRouting(binding)` / `teardownOutboundRouting(bindingId)`
  - 维护 `bindingUnsubs: Map<string, () => void>`
  - `setupOutboundRouting(binding)`：
    - 调用 `getAcpEventBus(binding.agentId)` 获取 EventBus（从 `../transport/event-bus` 导入）
    - 订阅 EventBus，过滤 `direction === "inbound"` 且 `type === "assistant"` 且 payload 包含 text
    - 提取 text 内容，调用 `this.send(binding.platform, binding.chatId ?? "", text)` 发回 Hermes
    - 将 unsubscribe 存入 bindingUnsubs
  - `teardownOutboundRouting(bindingId)`：取出 unsubscribe 并调用，删除 map 条目
  - 原因: 每个活跃绑定需独立管理订阅生命周期

- [ ] 实现 `send()` — 向 Hermes Gateway 发送消息
  - 位置: `HermesClient.send(platform, chatId, text)` 方法
  - `ws.readyState !== 1`：直接返回（不抛错）
  - 构造 `{ type: "send", platform, chat_id: chatId, text }`，调用 `ws.send(JSON.stringify(...))`
  - 原因: 向 Hermes 发送消息的唯一出口

- [ ] 实现 `getStatus()` / `onStatusChange()` 和单例获取器
  - 位置: `HermesClient` 类方法和模块级导出
  - `getStatus()`：返回 `{ ...this.status }`
  - `onStatusChange(cb)`：加入 `statusListeners` Set，返回 `() => statusListeners.delete(cb)`
  - `notifyStatusChange()`：遍历 listeners 传入当前 status
  - 模块级单例：`let hermesClientInstance: HermesClient | null = null`，导出 `getHermesClient()` 返回单例，导出 `initHermesClient(url)` 创建并启动单例
  - 原因: Task 3 通过 `getHermesClient()` 访问客户端实例

- [ ] 为 HermesClient 编写单元测试
  - 测试文件: `src/__tests__/hermes-client.test.ts`
  - Mock 策略：mock 全局 WebSocket 构造函数为 mock 对象 `{ send, close, readyState, onopen, onclose, onerror, onmessage }`
  - mock.module `../services/channel-binding` 的 `findBindingForMessage`
  - mock.module `../services/instance` 的 `findRunningInstanceByEnvironment`
  - mock.module `../transport/acp-ws-handler` 的 `sendToAgentWs`
  - mock.module `../transport/acp-relay-handler` 的 `sendToInstanceLocalWs`
  - mock.module `../transport/event-bus` 的 `getAcpEventBus`
  - 测试场景:
    - `start() 连接成功并发送 subscribe`: 验证 onopen 后 ws.send 被调用且参数含 `{ type: "subscribe" }`
    - `start() 连接失败触发重连`: 触发 onclose，验证 reconnecting=true，验证退避递增
    - `stop() 优雅关闭`: 验证发送 unsubscribe 后调用 ws.close()
    - `心跳 ping/pong`: 验证 30s 后发送 ping，收到 pong 清除超时，60s 无 pong 触发 close
    - `handleMessage 入站路由`: 发送 type:message 消息，mock findBindingForMessage 返回绑定，验证 sendToAgentWs 被调用且消息格式正确
    - `handleMessage 无匹配绑定`: mock 返回 null，验证不调用 sendToAgentWs
    - `handleMessage platform_status 更新平台列表`: 验证 status.platforms 被更新
    - `send() 出站消息`: 验证 ws.send 格式正确
    - `send() 连接断开时不报错`: readyState !== 1 时不抛异常
    - `getStatus() 返回状态快照`: 验证返回对象是 status 拷贝
    - `onStatusChange 注册和取消`: 验证回调被调用，取消后不再调用
    - `出站路由 EventBus 订阅`: mock EventBus 发布 assistant 事件，验证 send() 被调用
  - 运行命令: `bun test src/__tests__/hermes-client.test.ts`
  - 预期: 所有测试通过

**检查步骤:**
- [ ] 验证 hermes-client.ts 导出 HermesClient 类和 HermesStatus 类型
  - `grep -c "export class HermesClient\|export interface HermesStatus\|export function getHermesClient\|export function initHermesClient" src/services/hermes-client.ts`
  - 预期: 输出 >= 3
- [ ] 验证 acp-relay-handler.ts 新增了 sendToInstanceLocalWs
  - `grep -c "export function sendToInstanceLocalWs" src/transport/acp-relay-handler.ts`
  - 预期: 输出 1
- [ ] 验证心跳间隔和超时配置
  - `grep "30000\|60000\|30_000\|60_000" src/services/hermes-client.ts`
  - 预期: 包含 30s ping 间隔和 60s pong 超时
- [ ] 验证单元测试通过
  - `bun test src/__tests__/hermes-client.test.ts`
  - 预期: 所有测试通过
- [ ] 验证类型检查通过
  - `bun run typecheck`
  - 预期: 无类型错误

**认知变更:**
- [ ] [CLAUDE.md] HermesClient 的出站路由通过订阅 ACP EventBus（`direction === "inbound"` + `type === "assistant"`）捕获 Agent 回复，每个绑定需独立管理订阅生命周期，绑定删除时必须调用 `teardownOutboundRouting()`
- [ ] [CLAUDE.md] `agentLocalWsMap`（在 `acp-relay-handler.ts` 中）按 instanceId 做 key，不是 agentId。HermesClient 向 instance 发消息需先通过 `findRunningInstanceByEnvironment` 获取 instance，再通过 `sendToInstanceLocalWs(instanceId, data)` 发送

---

### Task 3: Backend Integration — 后端路由与启动集成

**背景:**
[业务语境] 将 Task 1 的绑定 CRUD 和 Task 2 的 Hermes 客户端暴露为 HTTP API，并在 RCS 启动时自动初始化 Hermes 连接，使前端和消息流能实际访问这些能力。
[修改原因] 当前 `channels.ts` 仅有三个占位端点（list providers、空列表、409 禁止创建），缺少 Hermes 状态查询和绑定管理端点。`index.ts` 启动流程中无 Hermes 初始化逻辑，`channel-provider.ts` 的 provider 列表是硬编码的 disabled 状态。
[上下游影响] 本 Task 依赖 Task 1（`channel-binding.ts` 的 CRUD 函数）和 Task 2（`hermes-client.ts` 的 `HermesClient` 类和 `getHermesClient()` 单例获取器）。本 Task 的 API 端点输出被 Task 4（前端数据层）和 Task 5（前端 UI）消费。

**涉及文件:**
- 修改: `src/routes/web/channels.ts`
- 修改: `src/services/channel-provider.ts`
- 修改: `src/index.ts`
- 修改: `src/__tests__/channel-routes.test.ts`
- 修改: `src/__tests__/channel-provider.test.ts`

**执行步骤:**

- [ ] 在 channels.ts 中新增 Hermes 状态查询端点
  - 位置: `src/routes/web/channels.ts`，现有 `app.get("/channels", ...)` 之后
  - 新增 import: `import { getHermesClient } from "../../services/hermes-client";`
  - 新增路由:
    ```typescript
    app.get("/channels/hermes/status", sessionAuth, (c) => {
      const client = getHermesClient();
      if (!client) {
        return c.json({ connected: false, url: "", platforms: [], reconnecting: false, lastConnectedAt: null }, 200);
      }
      return c.json(client.getStatus(), 200);
    });
    ```
  - 原因: `getHermesClient()` 返回单例，未配置时返回 `null`。返回 200 + `connected: false` 而非 404，前端无需处理两种状态码

- [ ] 在 channels.ts 中新增绑定 CRUD 端点
  - 位置: `src/routes/web/channels.ts`，Hermes 状态端点之后
  - 新增 import: `import { listBindings, createBinding, deleteBinding, updateBinding } from "../../services/channel-binding";` 和 `import { storeGetEnvironment } from "../../store";`
  - 新增 `GET /channels/bindings`:
    ```typescript
    app.get("/channels/bindings", sessionAuth, async (c) => {
      const bindings = await listBindings();
      const enriched = bindings.map(b => {
        const env = storeGetEnvironment(b.agentId);
        return { ...b, agentName: env?.name ?? null };
      });
      return c.json(enriched, 200);
    });
    ```
  - 新增 `POST /channels/bindings`:
    ```typescript
    app.post("/channels/bindings", sessionAuth, async (c) => {
      const body = await c.req.json();
      const { platform, chatId, agentId, enabled } = body;
      if (!platform || !agentId) {
        return c.json({ error: { type: "VALIDATION_ERROR", message: "platform 和 agentId 为必填字段" } }, 400);
      }
      const binding = await createBinding({ platform, chatId: chatId ?? null, agentId, enabled });
      const env = storeGetEnvironment(binding.agentId);
      return c.json({ ...binding, agentName: env?.name ?? null }, 201);
    });
    ```
  - 新增 `DELETE /channels/bindings/:id`:
    ```typescript
    app.delete("/channels/bindings/:id", sessionAuth, async (c) => {
      const id = c.req.param("id");
      const deleted = await deleteBinding(id);
      if (!deleted) {
        return c.json({ error: { type: "NOT_FOUND", message: "绑定不存在" } }, 404);
      }
      return c.json({ success: true }, 200);
    });
    ```
  - 新增 `PATCH /channels/bindings/:id`:
    ```typescript
    app.patch("/channels/bindings/:id", sessionAuth, async (c) => {
      const id = c.req.param("id");
      const body = await c.req.json();
      const updated = await updateBinding(id, body);
      if (!updated) {
        return c.json({ error: { type: "NOT_FOUND", message: "绑定不存在" } }, 404);
      }
      const env = storeGetEnvironment(updated.agentId);
      return c.json({ ...updated, agentName: env?.name ?? null }, 200);
    });
    ```
  - 原因: 所有端点遵循现有 `sessionAuth` + JSON 响应模式。绑定响应中通过 `storeGetEnvironment` 补全 `agentName`，前端无需二次查询

- [ ] 扩展 ChannelProviderStatus 类型支持 "enabled"
  - 位置: `src/services/channel-provider.ts`，`ChannelProviderStatus` 类型定义（~L3）
  - 将 `export type ChannelProviderStatus = "disabled";` 改为 `export type ChannelProviderStatus = "disabled" | "enabled";`
  - 同步修改 `web/src/types/index.ts`（~L37）的 `ChannelProviderStatus` 类型为 `"disabled" | "enabled"`
  - 原因: 当前类型仅允许 "disabled"，Hermes 连接后需返回 "enabled" 状态

- [ ] 修改 channel-provider.ts 动态反映 Hermes 连接状态
  - 位置: `src/services/channel-provider.ts`，`listChannelProviders()` 函数
  - 新增 import: `import { getHermesClient } from "./hermes-client";`
  - 修改 `listChannelProviders()` 返回逻辑: 遍历 `CHANNEL_PROVIDERS` 数组时，对每个 provider 检查 Hermes 客户端是否已连接且平台在订阅列表中。若满足则将 `status` 设为 `"enabled"`，否则保持 `"disabled"`
  - 伪代码:
    ```typescript
    const hermesClient = getHermesClient();
    const hermesPlatforms = hermesClient?.getStatus()?.platforms ?? [];
    const hermesConnected = hermesClient?.getStatus()?.connected ?? false;
    return CHANNEL_PROVIDERS.map(p => ({
      ...p,
      status: (hermesConnected && hermesPlatforms.includes(p.type))
        ? "enabled" as const
        : p.status,
    }));
    ```
  - 原因: 前端底部 provider 列表需动态显示 Hermes 已连接的平台为 enabled，而非硬编码 disabled

- [ ] 在 index.ts 中集成 Hermes 客户端启动与优雅关闭
  - 位置: `src/index.ts`，`import` 区域（~L6-35）
  - 新增 import: `import { HermesClient, getHermesClient } from "./services/hermes-client";`
  - 位置: `src/index.ts`，`await startScheduler()` 之后（~L35）
  - 新增 Hermes 初始化逻辑:
    ```typescript
    const hermesUrl = process.env.HERMES_URL ?? config?.channels?.hermesUrl;
    if (hermesUrl) {
      const client = new HermesClient(hermesUrl);
      client.start().catch((err) => {
        console.error("[RCS] Hermes client start failed:", err);
      });
    }
    ```
  - 位置: `src/index.ts`，`gracefulShutdown()` 函数内，`closeAllAcpConnections()` 之前
  - 新增: `const hermesClient = getHermesClient(); await hermesClient?.stop();`
  - 原因: `HERMES_URL` 环境变量优先于配置文件。`start()` 是异步的但不需要阻塞服务器启动，失败只记录日志不中断服务。优雅关闭时先断开 Hermes 再清理其他连接

- [ ] 扩展 channel-routes.test.ts 覆盖新增端点
  - 位置: `src/__tests__/channel-routes.test.ts`
  - 在现有 mock.module 调用之后，新增以下 mock（在 import 之前）:
    ```
    mock.module("../services/hermes-client", () => ({
      getHermesClient: () => ({
        getStatus: () => ({
          connected: true,
          url: "ws://127.0.0.1:8642/messaging",
          platforms: ["feishu", "telegram"],
          reconnecting: false,
          lastConnectedAt: 1715184000000,
        }),
      }),
    }));
    mock.module("../services/channel-binding", () => ({
      listBindings: async () => [
        { id: "bind_001", platform: "feishu", chatId: null, agentId: "env_001", enabled: true },
      ],
      createBinding: async (data: any) => ({ id: "bind_new", ...data, chatId: data.chatId ?? null, enabled: data.enabled ?? true }),
      deleteBinding: async (id: string) => id === "bind_001",
      updateBinding: async (id: string, data: any) => id === "bind_001" ? { id: "bind_001", platform: "feishu", chatId: null, agentId: "env_001", enabled: false, ...data } : undefined,
    }));
    mock.module("../store", () => ({
      storeGetEnvironment: (id: string) => id === "env_001"
        ? { id: "env_001", name: "test-agent", workerType: "acp", status: "active" }
        : undefined,
    }));
    ```
  - 测试场景:
    - `GET /web/channels/hermes/status 返回连接状态`: 请求状态端点，验证返回 `connected: true`、`platforms` 包含 `feishu`
    - `GET /web/channels/bindings 返回补全 agentName 的绑定列表`: 请求绑定列表，验证返回数组长度 1，且 `agentName === "test-agent"`
    - `POST /web/channels/bindings 创建绑定成功`: 请求体 `{platform: "telegram", agentId: "env_001"}`，验证返回 201 且 `id` 以 `bind_` 开头
    - `POST /web/channels/bindings 缺少必填字段返回 400`: 请求体 `{platform: "telegram"}`（无 agentId），验证返回 400 且 error.type 为 `VALIDATION_ERROR`
    - `DELETE /web/channels/bindings/bind_001 删除成功`: 验证返回 200 且 `success: true`
    - `DELETE /web/channels/bindings/nonexist 返回 404`: 验证返回 404 且 error.type 为 `NOT_FOUND`
    - `PATCH /web/channels/bindings/bind_001 更新绑定`: 请求体 `{enabled: false}`，验证返回更新后的绑定
    - `PATCH /web/channels/bindings/nonexist 返回 404`: 验证返回 404
    - `GET /web/channels/hermes/status 无 Hermes 客户端时返回 disconnected`: mock `getHermesClient` 返回 `null`，验证 `connected: false`
  - 运行命令: `bun test src/__tests__/channel-routes.test.ts`
  - 预期: 所有测试通过

- [ ] 扩展 channel-provider.test.ts 覆盖 Hermes 动态状态
  - 位置: `src/__tests__/channel-provider.test.ts`
  - 新增 mock.module（import 之前）:
    ```
    mock.module("../services/hermes-client", () => ({
      getHermesClient: () => null,
    }));
    ```
  - 测试场景:
    - `listChannelProviders 无 Hermes 时返回全部 disabled`: mock `getHermesClient` 返回 `null`，验证所有 provider `status === "disabled"`
    - `listChannelProviders Hermes 已连接时对应平台为 enabled`: mock `getHermesClient` 返回已连接状态且 `platforms: ["feishu"]`，验证 wechat 为 `disabled`、feishu 为 `enabled`
  - 注意: 由于 bun test 的 mock 隔离限制，需确保两个测试使用独立的 describe 块，且 Hermes mock 在对应 describe 内部设置
  - 运行命令: `bun test src/__tests__/channel-provider.test.ts`
  - 预期: 所有测试通过

**检查步骤:**
- [ ] 验证 channels.ts 包含所有新增端点
  - `grep -c "app\.\(get\|post\|delete\|patch\)" src/routes/web/channels.ts`
  - 预期: 输出 >= 7（原有 3 个 + 新增 4 个绑定/Hermes 端点，不含 providers 端点）
- [ ] 验证绑定端点正确导入 channel-binding 服务函数
  - `grep "from.*channel-binding" src/routes/web/channels.ts`
  - 预期: 包含 `listBindings, createBinding, deleteBinding, updateBinding`
- [ ] 验证绑定响应中补全 agentName
  - `grep -c "storeGetEnvironment\|agentName" src/routes/web/channels.ts`
  - 预期: 输出 >= 4（4 个绑定端点各一处）
- [ ] 验证 index.ts 中有 Hermes 初始化和关闭逻辑
  - `grep -c "hermes\|HermesClient" src/index.ts`
  - 预期: 输出 >= 3（import + 初始化 + 关闭）
- [ ] 验证 channel-provider.ts 引用了 hermes-client
  - `grep "hermes-client" src/services/channel-provider.ts`
  - 预期: 包含 import 语句
- [ ] 验证路由单元测试通过
  - `bun test src/__tests__/channel-routes.test.ts`
  - 预期: 所有测试通过
- [ ] 验证 provider 单元测试通过
  - `bun test src/__tests__/channel-provider.test.ts`
  - 预期: 所有测试通过
- [ ] 验证类型检查通过
  - `bun run typecheck`
  - 预期: 无类型错误

---

### Task 4: Frontend Data Layer — 类型和 API 客户端

**背景:**
[业务语境] 为前端通道页面提供 Hermes 状态和绑定管理的类型定义和 API 调用函数，是前端 UI 层与后端 API 之间的桥梁
[修改原因] 当前 `web/src/types/index.ts` 仅有 `ChannelProviderInfo` 和 `ChannelInfo` 类型，缺少 Hermes 状态和绑定相关类型。`web/src/api/client.ts` 仅有三个通道 API 函数，缺少 Hermes 状态查询和绑定 CRUD 函数
[上下游影响] 本 Task 依赖 Task 3（后端 API 端点已就绪），产出被 Task 5（ChannelsPage UI）消费

**涉及文件:**
- 修改: `web/src/types/index.ts`
- 修改: `web/src/api/client.ts`

**执行步骤:**

- [ ] 在 types/index.ts 中新增 Hermes 状态和绑定类型
  - 位置: `web/src/types/index.ts`，在 `ChannelInfo` 接口之后（~L50）
  - 新增类型:
    ```typescript
    export interface HermesStatus {
      connected: boolean;
      url: string;
      platforms: string[];
      reconnecting: boolean;
      lastConnectedAt: number | null;
    }

    export interface ChannelBinding {
      id: string;
      platform: string;
      chatId: string | null;
      agentId: string;
      agentName: string | null;
      enabled: boolean;
    }

    export interface CreateChannelBindingRequest {
      platform: string;
      chatId?: string | null;
      agentId: string;
      enabled?: boolean;
    }
    ```
  - 原因: 与后端 API 响应格式一一对应

- [ ] 在 api/client.ts 中新增 Hermes 状态查询和绑定 CRUD 函数
  - 位置: `web/src/api/client.ts`，在 `apiCreateChannel` 函数之后（~L183）
  - 更新文件顶部的 type import 行，追加 `HermesStatus, ChannelBinding, CreateChannelBindingRequest`
  - 新增 5 个函数: `apiGetHermesStatus()`、`apiListChannelBindings()`、`apiCreateChannelBinding(data)`、`apiDeleteChannelBinding(id)`、`apiUpdateChannelBinding(id, data)`
  - 路径分别对应 `/web/channels/hermes/status`、`/web/channels/bindings`、`/web/channels/bindings/:id`
  - 原因: 完整覆盖后端 Task 3 新增的端点

**检查步骤:**
- [ ] 验证 types/index.ts 包含新增类型
  - `grep -c "HermesStatus\|ChannelBinding\|CreateChannelBindingRequest" web/src/types/index.ts`
  - 预期: 输出 >= 3
- [ ] 验证 api/client.ts 包含新增 API 函数
  - `grep -c "apiGetHermesStatus\|apiListChannelBindings\|apiCreateChannelBinding\|apiDeleteChannelBinding\|apiUpdateChannelBinding" web/src/api/client.ts`
  - 预期: 输出 5

---

### Task 5: Frontend UI — ChannelsPage 改造

**背景:**
[业务语境] 将通道页面从"禁用占位符"改造为三层结构：Hermes 连接状态卡片、Agent 绑定管理表格、原有 provider 列表。用户可查看 Hermes 连接状态、新增/删除/启用/禁用 Agent 绑定
[修改原因] 当前 `ChannelsPage.tsx` 只有 DataTable 展示空 channels 列表和禁用 provider 对话框
[上下游影响] 本 Task 消费 Task 4（类型和 API 函数）和 Task 3（后端 API）。是前端功能的最终交付

**涉及文件:**
- 修改: `web/src/pages/ChannelsPage.tsx`

**执行步骤:**

- [ ] 改造 ChannelsPage 组件状态和导入
  - 位置: `web/src/pages/ChannelsPage.tsx` 文件顶部
  - 替换 import：`apiListChannelProviders, apiListChannels` → `apiGetHermesStatus, apiListChannelBindings, apiCreateChannelBinding, apiDeleteChannelBinding, apiUpdateChannelBinding, apiFetchEnvironments`
  - 替换类型 import：`ChannelInfo, ChannelProviderInfo` → `HermesStatus, ChannelBinding, Environment`
  - 新增状态：`hermesStatus`、`bindings`、`environments`、`formPlatform`、`formChatId`、`formAgentId`、`formSaving`
  - 原因: 原有状态被新的 Hermes/绑定状态替代

- [ ] 实现 Hermes 状态轮询和数据加载
  - 位置: 替换原有 `loadData` 函数
  - 新增 `loadHermesStatus`、`loadBindings`、`loadEnvironments` 三个加载函数
  - useEffect 中并行调用，并设置 5s 间隔轮询 Hermes 状态
  - 原因: spec 要求 5s 间隔轮询连接状态

- [ ] 实现连接状态卡片（页面顶部）
  - 位置: JSX 返回值顶部，替换原有标题区域
  - 内容：状态指示灯（connected 绿 / reconnecting 黄 / 其他灰）、WebSocket 地址脱敏、已订阅平台列表、最后连接时间
  - Tailwind 样式：`rounded-lg border bg-card p-4`
  - 原因: spec 要求展示连接状态

- [ ] 实现绑定管理 DataTable（页面主体）
  - 位置: 连接状态卡片下方
  - 列：platform、chatId（null 显示"全部"）、agentName、enabled（Switch/Badge）、操作列
  - 操作：启用/禁用调用 `apiUpdateChannelBinding`，删除调用 `apiDeleteChannelBinding`
  - 新建按钮打开 FormDialog
  - 原因: spec 要求绑定 CRUD 管理

- [ ] 实现新建绑定 FormDialog
  - 位置: 替换原有 Dialog
  - 字段：平台 Select（从 `hermesStatus.platforms`）、聊天 ID Input（可选）、Agent Select（从 `environments` 筛选 active）
  - 提交：验证必填 → `apiCreateChannelBinding` → 成功关闭刷新 → 失败 toast.error
  - 原因: spec 要求新建弹出表单

- [ ] 前端构建验证
  - 执行 `bun run build:web` 确保构建无错误
  - 原因: 修改前端后必须构建

**检查步骤:**
- [ ] 验证 ChannelsPage.tsx 导入了新的 API 函数
  - `grep "apiGetHermesStatus\|apiListChannelBindings\|apiCreateChannelBinding" web/src/pages/ChannelsPage.tsx`
  - 预期: 包含所有新增 API 函数
- [ ] 验证前端构建成功
  - `bun run build:web`
  - 预期: 构建成功，无错误

---

### Task 6: Hermes Channel Client 验收

**前置条件:**
- 启动命令: `HERMES_URL=ws://127.0.0.1:8642/messaging bun run dev`（需要 Hermes Gateway 运行在本地）
- 不设置 `HERMES_URL` 时: `bun run dev`（验证不影响正常功能）
- 测试数据准备: 通过 API 创建环境（`POST /web/environments`），获取 environment ID 用于绑定

**端到端验证:**

1. 运行完整测试套件确保无回归
   - `bun test src/__tests__/channel-binding.test.ts src/__tests__/hermes-client.test.ts src/__tests__/channel-routes.test.ts src/__tests__/channel-provider.test.ts`
   - 预期: 全部测试通过
   - 失败排查: 检查对应 Task 的测试步骤

2. 不设置 HERMES_URL 时 RCS 正常运行
   - `bun run dev`（无 HERMES_URL 环境变量）
   - 验证 `/web/channels/hermes/status` 返回 `{ connected: false, url: "", platforms: [], reconnecting: false, lastConnectedAt: null }`
   - 验证服务器日志无 Hermes 相关错误
   - 失败排查: 检查 Task 3 index.ts 集成逻辑

3. 设置 HERMES_URL 后自动连接 Hermes Gateway
   - `HERMES_URL=ws://127.0.0.1:8642/messaging bun run dev`
   - 验证 `/web/channels/hermes/status` 返回 `connected: true`
   - 验证 `platforms` 包含 Hermes 支持的平台列表
   - 失败排查: 检查 Task 2 HermesClient 连接逻辑，确认 Hermes Gateway 运行中

4. 前端通道页展示连接状态和绑定管理
   - 打开 `http://localhost:<port>/ctrl/`，导航到通道页面
   - 验证顶部显示 Hermes 连接状态卡片（已连接/未配置）
   - 验证绑定列表表格可显示
   - 点击"新建绑定"弹出表单，选择平台和 Agent，提交后验证绑定出现在列表中
   - 失败排查: 检查 Task 5 ChannelsPage 改造，确认 `bun run build:web` 已执行

5. 绑定后外部平台消息路由到 Agent
   - 通过 Hermes Gateway 模拟发送飞书消息
   - 验证 RCS 日志中出现 `[Hermes] Routing message to agent xxx` 类似日志
   - 验证 Agent 收到 ACP 格式的 user message
   - 失败排查: 检查 Task 2 `routeToAgent` 逻辑和 Task 1 `findBindingForMessage` 匹配

6. Agent 回复自动发回外部平台
   - Agent 回复文本消息后
   - 验证 RCS 日志中出现 `[Hermes] Sending reply to platform xxx chat_id xxx`
   - 验证 Hermes Gateway 收到 `type: "send"` 消息
   - 失败排查: 检查 Task 2 出站路由 EventBus 订阅逻辑

7. 优雅关闭时正确断开 Hermes 连接
   - 发送 SIGTERM 信号
   - 验证日志中出现 `[RCS] Hermes client stopped`
   - 失败排查: 检查 Task 3 index.ts gracefulShutdown 逻辑
