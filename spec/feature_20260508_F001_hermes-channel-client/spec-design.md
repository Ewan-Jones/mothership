# Feature: 20260508_F001 - hermes-channel-client

## 需求背景

RCS 当前通道层（F003）仅建立了抽象骨架——`channel-provider.ts` 中微信和飞书都标记为 `disabled`，没有实际消息收发能力。与此同时，Hermes Gateway 已经作为独立服务运行，支持 21 个平台（飞书、Telegram、微信、Discord 等）的消息收发，通过 WebSocket 暴露统一的收发接口。

本功能将 RCS 作为 Hermes Gateway 的 WebSocket 客户端接入，实现外部平台消息与 Agent 的双向转发。用户在 RCS 控制面配置通道绑定后，外部平台消息自动路由到绑定的 Agent，Agent 回复也自动发回外部平台。

## 目标

- 在 RCS 后端实现 Hermes Gateway WebSocket 客户端，支持持久连接和自动重连
- 实现外部平台消息到 Agent 的路由转发（仅转发已绑定的通道，未绑定则忽略）
- 实现 Agent 回复到外部平台的反向发送
- 在前端通道页面展示 Hermes 连接状态和 Agent 绑定配置
- 全平台支持（通过 Hermes 代理的 21 个平台）

## 非目标

- 不实现 Hermes Gateway 本身的管理（启动/停止/配置）
- 不替代现有的 WeChat MCP 插件（`plugin:weixin:weixin`），两者独立
- 不实现消息持久化存储或历史回放
- 不实现 per-chat 级别的精细路由（首版仅支持 per-platform 绑定，后续可扩展）
- 不实现通道消息的前端实时预览（留待后续版本）

## 方案设计

### 一、架构总览

```
外部平台消息流:

  飞书/Telegram/... → Hermes Gateway → ws://127.0.0.1:8642/messaging
                                            ↓
                                    RCS hermes-client.ts
                                            ↓
                                    查找 channel binding
                                            ↓
                              ┌─────────────┼─────────────┐
                              ↓             ↓             ↓
                        有 instance    有 ACP 直连    未找到(忽略)
                        local WS      sendToAgentWs
                              ↓             ↓
                              Agent 处理并回复
                              ↓
                        EventBus 订阅捕获回复
                              ↓
                        hermes-client → Hermes Gateway → 外部平台
```

**新增文件：**

| 文件 | 用途 |
|------|------|
| `src/services/hermes-client.ts` | WebSocket 客户端，处理连接/重连/心跳/消息收发 |
| `src/services/channel-binding.ts` | 通道绑定 CRUD，读写 opencode.json |

**修改文件：**

| 文件 | 修改内容 |
|------|---------|
| `src/services/channel-provider.ts` | 扩展 provider 描述符，动态反映 Hermes 连接状态 |
| `src/routes/web/channels.ts` | 新增 Hermes 状态和绑定 API 端点 |
| `src/index.ts` | 启动时初始化 Hermes 客户端 |
| `web/src/pages/ChannelsPage.tsx` | 改造为连接状态 + 绑定管理 |
| `web/src/api/client.ts` | 新增通道相关 API 函数 |
| `web/src/types/index.ts` | 新增 Hermes 和绑定类型定义 |

### 二、Hermes 客户端设计

#### 环境变量配置

| 变量 | 用途 | 默认值 |
|------|------|--------|
| `HERMES_URL` | Hermes Gateway WebSocket 地址 | 无（不设置则不启动） |
| `HERMES_PLATFORMS` | 订阅平台列表（逗号分隔） | 全部平台 |

`HERMES_URL` 也可在 `opencode.json` 的 `channels.hermesUrl` 字段配置，环境变量优先级更高。

#### 连接生命周期

1. **启动**：RCS 启动时检测 `HERMES_URL` → 建立连接 → 发送 `subscribe` → 进入消息循环
2. **心跳**：每 30s 发送 `ping`，超时 60s 无 `pong` 触发重连
3. **重连**：指数退避（2s → 4s → 8s → ... → 最大 60s），重连成功后重新 subscribe
4. **优雅关闭**：RCS 关闭时发送 `unsubscribe` 再断开

#### 消息处理

**入站消息（Hermes → Agent）：**

```typescript
// Hermes 协议入站消息格式
interface HermesInboundMessage {
  type: "message";
  data: {
    text: string;
    message_type: string;
    source: {
      platform: string;    // "feishu" | "telegram" | ...
      chat_id: string;
      user_id: string;
      user_name: string;
      chat_type: string;
    };
    message_id: string;
    timestamp: string;
  };
}
```

处理流程：
1. 解析 `platform` + `chat_id`
2. 查找匹配的 binding（优先精确匹配，其次通配）
3. 未匹配 → 忽略并记录日志
4. 匹配成功 → 查找 Agent 活跃连接：
   - 有 spawned instance → 通过 instance local WS 发送
   - 有 ACP 直连 → 通过 `sendToAgentWs()` 发送
   - Agent 离线 → 忽略并记录日志
5. 构造 ACP 格式的 user message 发送给 Agent

**出站消息（Agent → Hermes）：**

订阅 Agent 的 ACP EventBus，捕获 `assistant` 类型回复事件。当收到包含 `text` 内容的回复时，通过 Hermes `send` 发回对应平台和 chat_id。

```typescript
// Hermes 协议出站消息格式
interface HermesOutboundSend {
  type: "send";
  platform: string;
  chat_id: string;
  text: string;
  reply_to?: string;  // 可选：回复原消息
}
```

#### 客户端接口

```typescript
class HermesClient {
  // 连接管理
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): HermesStatus;

  // 消息发送
  send(platform: string, chatId: string, text: string): Promise<void>;

  // 事件回调
  onStatusChange(cb: (status: HermesStatus) => void): () => void;
}
```

### 三、通道绑定设计

#### 数据模型

绑定信息存储在 `opencode.json` 的 `channels.bindings` 段：

```jsonc
{
  "channels": {
    "hermesUrl": "ws://127.0.0.1:8642/messaging",  // 可选，可由 HERMES_URL 覆盖
    "bindings": [
      {
        "id": "bind_001",
        "platform": "feishu",
        "agentId": "env_xxx",
        "enabled": true
      },
      {
        "id": "bind_002",
        "platform": "telegram",
        "agentId": "env_yyy",
        "enabled": true
      }
    ]
  }
}
```

**绑定字段说明：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 绑定唯一标识，自动生成 |
| `platform` | string | 是 | 平台标识（feishu/telegram/wechat 等） |
| `chatId` | string | 否 | 特定聊天 ID，不填则匹配该平台所有消息 |
| `agentId` | string | 是 | 绑定的 Agent environment ID |
| `enabled` | boolean | 是 | 是否启用 |

#### 匹配规则

入站消息按以下优先级匹配绑定：

1. `platform` + `chatId` 精确匹配（最高优先级）
2. `platform` 匹配且 `chatId` 为空（通配绑定）
3. 无匹配 → 忽略消息

同一 platform 可配置多条绑定，按精确度优先。

#### CRUD 操作

通过 `src/services/channel-binding.ts` 提供绑定管理：

- `listBindings()` — 列出所有绑定
- `getBinding(id)` — 获取单个绑定
- `createBinding(data)` — 新增绑定（自动生成 id）
- `deleteBinding(id)` — 删除绑定
- `findBindingForMessage(platform, chatId)` — 查找消息匹配的绑定

写入操作通过 `config.ts` 的 `setSection` deep merge 写入 opencode.json，利用现有的写入互斥锁。

### 四、API 端点设计

在现有 `src/routes/web/channels.ts` 基础上扩展：

| 方法 | 路径 | 用途 |
|------|------|------|
| `GET` | `/channels/hermes/status` | 获取 Hermes 连接状态 |
| `GET` | `/channels/bindings` | 列出所有绑定 |
| `POST` | `/channels/bindings` | 新增绑定 |
| `DELETE` | `/channels/bindings/:id` | 删除绑定 |
| `PATCH` | `/channels/bindings/:id` | 更新绑定（启用/禁用） |

所有端点需要 `sessionAuth` 认证。

**Hermes 状态响应：**

```jsonc
{
  "connected": true,
  "url": "ws://127.0.0.1:8642/messaging",
  "platforms": ["feishu", "telegram"],
  "reconnecting": false,
  "lastConnectedAt": 1715184000000
}
```

**绑定响应：**

```jsonc
{
  "id": "bind_001",
  "platform": "feishu",
  "chatId": null,
  "agentId": "env_xxx",
  "agentName": "my-agent",  // 从 environment 记录中补全
  "enabled": true
}
```

### 五、前端 UI 改造

#### 通道页面结构（`ChannelsPage.tsx`）

现有页面只有禁用的 provider 占位符。改造为三层结构：

**1. 连接状态卡片（顶部）**

- 显示 Hermes Gateway 连接状态：已连接（绿色）/ 重连中（黄色）/ 未配置（灰色）
- 显示 WebSocket 地址（脱敏）
- 显示已订阅平台数量和列表
- 状态通过 `GET /channels/hermes/status` 轮询获取（5s 间隔）

**2. Agent 绑定管理（主体）**

- 使用 DataTable 展示绑定列表
- 列：平台、聊天 ID（或"全部"）、绑定 Agent、启用状态、操作
- 操作列：启用/禁用切换、删除
- 新建按钮：弹出 FormDialog，字段为：
  - 平台选择（Select，从 Hermes 状态中获取已订阅平台）
  - 聊天 ID（可选 Input，留空表示全部）
  - Agent 选择（Select，从 `/web/environments` 获取在线 Agent 列表）

**3. 原有 provider 列表保留**

保留底部的平台适配器列表展示，但状态改为动态读取（当 Hermes 连接时显示为 `enabled`）。

#### 类型更新（`web/src/types/index.ts`）

```typescript
interface HermesStatus {
  connected: boolean;
  url: string;
  platforms: string[];
  reconnecting: boolean;
  lastConnectedAt: number | null;
}

interface ChannelBinding {
  id: string;
  platform: string;
  chatId: string | null;
  agentId: string;
  agentName: string | null;
  enabled: boolean;
}
```

#### API Client 新增（`web/src/api/client.ts`）

```typescript
apiGetHermesStatus(): Promise<HermesStatus>
apiListChannelBindings(): Promise<ChannelBinding[]>
apiCreateChannelBinding(data: CreateBindingRequest): Promise<ChannelBinding>
apiDeleteChannelBinding(id: string): Promise<void>
apiUpdateChannelBinding(id: string, data: Partial<ChannelBinding>): Promise<ChannelBinding>
```

### 六、启动集成

在 `src/index.ts` 中：

1. RCS 启动时检测 `HERMES_URL` 环境变量或 `opencode.json` 中的 `channels.hermesUrl`
2. 如果有配置 → 创建 `HermesClient` 实例 → 调用 `start()`
3. 将实例存入全局变量供路由和事件处理使用
4. 优雅关闭时调用 `stop()`

```typescript
// src/index.ts 启动流程（伪代码）
const hermesUrl = process.env.HERMES_URL ?? config.channels?.hermesUrl;
let hermesClient: HermesClient | null = null;
if (hermesUrl) {
  hermesClient = new HermesClient(hermesUrl);
  hermesClient.start();
}

// 优雅关闭
process.on("SIGTERM", async () => {
  await hermesClient?.stop();
  // ... 其他清理
});
```

## 实现要点

1. **复用现有连接路径**：消息注入复用 relay 的 instance local WS 或 ACP `sendToAgentWs()`，不新建独立的通信通道
2. **写入互斥锁**：绑定写入通过 `config.ts` 的 `setSection` deep merge，利用现有互斥锁防止并发写入损坏
3. **EventBus 订阅管理**：每个活跃绑定需订阅对应 Agent 的 ACP EventBus 捕获回复，需在绑定创建/删除时正确管理订阅生命周期
4. **Agent 离线处理**：Agent 离线时入站消息只记录日志不缓存，避免消息积压。Agent 上线后需重新触发订阅
5. **Hermes 协议兼容**：客户端需处理 Hermes 的 `result`、`error`、`platform_status` 等消息类型，`platform_status` 可用于动态更新平台列表
6. **多 binding 匹配**：同一 platform 可有多条绑定，按精确度优先匹配（chatId 精确 > chatId 通配）

## 验收标准

- [ ] RCS 启动时设置 `HERMES_URL` 环境变量后自动连接 Hermes Gateway
- [ ] 连接断开后自动重连（指数退避），前端状态页实时反映连接状态
- [ ] 前端通道页展示 Hermes 连接状态（已连接/重连中/未配置）
- [ ] 前端通道页支持新增/删除 Agent 绑定
- [ ] 配置绑定后，外部平台消息能自动转发到绑定的 Agent
- [ ] Agent 回复能自动发回外部平台
- [ ] 未绑定平台的消息被忽略（不报错，有日志）
- [ ] Agent 离线时入站消息被忽略（有日志）
- [ ] RCS 优雅关闭时正确断开 Hermes 连接
- [ ] 不设置 `HERMES_URL` 时 RCS 正常运行，不受影响
