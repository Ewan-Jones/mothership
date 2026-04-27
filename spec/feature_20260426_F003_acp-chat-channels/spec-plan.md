# ACP 聊天通道执行计划

**目标:** 在控制面新增“通道”入口，并建立可扩展的 Channel Integration 抽象层；首版不实现微信、飞书任何平台接入，只提供统一注册机制、只读 API 和置灰前端页面。

**技术栈:** Bun、Hono、React 19、Vite、TypeScript、Bun test

**设计文档:** `spec/feature_20260426_F003_acp-chat-channels/spec-design.md`

## 改动总览

本次改动分成 4 个功能 Task：Task 1 先建立后端通用的 provider descriptor 与注册表，Task 2 再提供 `web/channels` 的只读和占位 API，Task 3 补前端路由、类型与 API client，Task 4 落通道页和置灰弹窗交互。
经代码分析确认，仓库当前没有任何 `channel` / `wechat` / `feishu` 业务实体，因此首版不应贸然落账号级 `channel` 表、登录状态机和运行时 worker；当前版本只固定抽象层协议，避免引入无用持久化结构。
经代码分析确认，`web/src/App.tsx` 当前通过 `parseConfigView()` 驱动顶部 Tab 页面切换，而 `web/src/api/client.ts` 统一承载前端请求；因此“通道”能力应继续沿用相同模式接入，而不是新造一套路由机制。
经代码分析确认，现有后端路由都通过 `src/index.ts` 中 `app.route("/web", ...)` 挂载，因此 provider 列表与空通道列表接口应作为新的 `web/channels` 子路由进入。

---

### Task 0: 环境准备

**背景:**
本次虽然不实现平台登录和运行时，但会同时改后端路由与前端页面，仍需先确认构建、测试和类型检查链路可用。
当前仓库前端变更仍要求最终执行 `bun run build:web`，避免 `web/dist` 未更新导致结果不可验证。

**执行步骤:**
- [x] 验证类型检查命令可用
  - 位置: 项目根目录 `/Users/liyuan/Work/mothership-beta`
  - 执行 `bun run typecheck`
  - 原因: 本次会同时新增前后端类型定义，先排除 TypeScript 工具链问题
- [x] 验证后端测试命令可用
  - 位置: 项目根目录 `/Users/liyuan/Work/mothership-beta`
  - 执行 `bun test src/__tests__/db-schema.test.ts src/__tests__/web-environments.test.ts`
  - 原因: 首版不会新增复杂运行时，先以现有后端测试文件验证 Bun test 环境正常
- [x] 验证前端构建命令可用
  - 位置: 项目根目录 `/Users/liyuan/Work/mothership-beta`
  - 执行 `bun run build:web`
  - 原因: 后续新增页面和导航后仍需更新静态产物

**检查步骤:**
- [x] 检查类型检查命令执行成功
  - `cd /Users/liyuan/Work/mothership-beta && bun run typecheck`
  - 预期: 命令退出码为 0，无 TypeScript error
- [x] 检查后端测试框架可用
  - `cd /Users/liyuan/Work/mothership-beta && bun test src/__tests__/db-schema.test.ts src/__tests__/web-environments.test.ts`
  - 预期: 测试可执行，不出现 Bun mock / import 配置错误
- [x] 检查前端构建命令可用
  - `cd /Users/liyuan/Work/mothership-beta && bun run build:web`
  - 预期: Vite 构建成功，无 error

---

### Task 1: 建立 Channel Provider 抽象层与注册表

**背景:**
首版核心不是某个平台，而是一套后续平台都要复用的统一 descriptor 和注册机制。
当前代码里没有任何 channel integration 类型定义；如果直接在路由或页面里硬编码微信/飞书文案，后续接真实平台时会继续扩散特例逻辑。
Task 2 的 API 输出和 Task 4 的页面渲染都依赖这里定义的 provider 协议。

**涉及文件:**
- 新建: `src/services/channel-provider.ts`
- 新建: `src/__tests__/channel-provider.test.ts`

**执行步骤:**
- [x] 在 `src/services/channel-provider.ts` 中定义通用 provider 类型
  - 位置: 新文件顶部
  - 新增 `ChannelProviderType`、`ChannelProviderStatus`、`ChannelProviderDescriptor`、`ChannelProvider` 类型
  - `ChannelProviderDescriptor` 只包含：`type`、`label`、`status`
  - 原因: 设计文档要求前后端围绕统一 provider descriptor 工作，而不是围绕平台特例工作
- [x] 在 `src/services/channel-provider.ts` 中实现静态注册表
  - 位置: 类型定义之后
  - 固定声明两个 provider：`wechat` 与 `feishu`
  - 两者 `status` 均为 `"disabled"`
  - 导出 `listChannelProviders()`、`getChannelProvider(type)` 两个函数
  - 原因: 首版优先采用纯代码注册，避免提前引入无用数据库表
- [x] 在 `src/services/channel-provider.ts` 中预留 provider 接口骨架
  - 位置: 注册表实现之后
  - 为 `ChannelProvider` 接口预留后续可实现的方法签名注释或空实现约束，例如 `startLogin`、`getLoginState`、`startRuntime`、`stopRuntime`
  - 首版不要提供真实实现，也不要创建平台实例
  - 原因: 当前版本要固定扩展点，但不引入未使用的运行时代码
- [x] 为 provider 注册表编写单元测试
  - 测试文件: `src/__tests__/channel-provider.test.ts`
  - 测试场景:
    - `listChannelProviders()` 返回 `wechat` 与 `feishu`
    - 两个平台的 `status` 都是 `disabled`
    - `getChannelProvider("wechat")` 返回 descriptor，`getChannelProvider("unknown")` 返回空
  - 运行命令: `cd /Users/liyuan/Work/mothership-beta && bun test src/__tests__/channel-provider.test.ts`
  - 预期: 所有测试通过

**检查步骤:**
- [x] 检查 provider 类型和注册表已存在
  - `cd /Users/liyuan/Work/mothership-beta && rg -n "ChannelProviderDescriptor|listChannelProviders|getChannelProvider" src/services/channel-provider.ts`
  - 预期: 输出包含 descriptor 类型和两个导出函数
- [x] 检查静态 provider 列表包含微信和飞书
  - `cd /Users/liyuan/Work/mothership-beta && rg -n '"wechat"|"feishu"|"disabled"' src/services/channel-provider.ts`
  - 预期: 文件内同时存在 `wechat`、`feishu`、`disabled`
- [x] 检查 Task 1 单元测试通过
  - `cd /Users/liyuan/Work/mothership-beta && bun test src/__tests__/channel-provider.test.ts`
  - 预期: 测试全部通过

---

### Task 2: 提供通道 Provider 列表与空通道列表 API

**背景:**
前端页面不能写死平台状态，必须从后端读取统一 provider 注册信息。
当前仓库没有 `/web/channels` 路由；而设计文档已明确首版只需要 provider 列表、空通道列表和一个拒绝所有创建请求的占位接口。
Task 4 的页面和弹窗状态全部依赖这里的 API 形状。

**涉及文件:**
- 新建: `src/routes/web/channels.ts`
- 修改: `src/index.ts`
- 新建: `src/__tests__/channel-routes.test.ts`

**执行步骤:**
- [x] 在 `src/routes/web/channels.ts` 中新增通道路由
  - 位置: 新文件中创建 `const app = new Hono()`，统一挂 `sessionAuth`
  - 实现 `GET /channels/providers`：调用 `listChannelProviders()` 返回 provider descriptor 数组
  - 实现 `GET /channels`：固定返回空数组 `[]`
  - 实现 `POST /channels`：读取 `type` 请求体，对所有类型统一返回 `409` 或 `400`，错误消息固定为“当前平台暂未开放”
  - 原因: 首版要先固定 API 外形，但不允许真正创建任何平台通道
- [x] 在 `src/index.ts` 中挂载新的 `/web/channels` 路由
  - 位置: 现有 `app.route("/web", webTasks);` 之后、ACP routes 之前
  - 新增 `import webChannels from "./routes/web/channels";` 与 `app.route("/web", webChannels);`
  - 原因: 通道 API 仍属于控制面 `/web` 命名空间
- [x] 在路由返回体中统一字段命名
  - 位置: `src/routes/web/channels.ts`
  - `GET /channels/providers` 直接返回数组对象：`type`、`label`、`status`
  - `GET /channels` 固定返回 `[]`
  - `POST /channels` 返回 `{ error: { type: "FORBIDDEN", message: "当前平台暂未开放" } }`
  - 原因: 首版协议要稳定，后续启用平台时尽量扩展字段而不是改结构
- [x] 为通道路由编写单元测试
  - 测试文件: `src/__tests__/channel-routes.test.ts`
  - 测试场景:
    - `GET /web/channels/providers` 返回 `wechat`、`feishu` 且状态均为 `disabled`
    - `GET /web/channels` 返回空数组
    - `POST /web/channels` 传 `wechat` 或 `feishu` 都返回错误，不创建任何记录
  - 运行命令: `cd /Users/liyuan/Work/mothership-beta && bun test src/__tests__/channel-provider.test.ts src/__tests__/channel-routes.test.ts`
  - 预期: 所有测试通过

**检查步骤:**
- [x] 检查通道路由已挂到 `src/index.ts`
  - `cd /Users/liyuan/Work/mothership-beta && rg -n "webChannels|app.route\\(\"/web\", webChannels\\)" src/index.ts`
  - 预期: 输出包含 import 和 route 挂载
- [x] 检查 provider 列表和空通道列表接口已实现
  - `cd /Users/liyuan/Work/mothership-beta && rg -n "/channels/providers|/channels\"|当前平台暂未开放" src/routes/web/channels.ts`
  - 预期: 输出包含三个接口定义和占位错误文案
- [x] 检查 Task 2 单元测试通过
  - `cd /Users/liyuan/Work/mothership-beta && bun test src/__tests__/channel-provider.test.ts src/__tests__/channel-routes.test.ts`
  - 预期: 测试全部通过，所有创建请求都被拒绝

---

### Task 3: 补前端路由、类型与通道 API client

**背景:**
后端 API 建好后，前端仍需识别 `/code/channels` 路由、展示顶部 Tab，并读取 provider 列表与空通道列表。
当前 `web/src/App.tsx` 的 `parseConfigView()` 不认识 `channels`，`web/src/api/client.ts` 和 `web/src/types/index.ts` 也没有 provider / channel 占位类型。
Task 4 的页面实现依赖这里新增的 route、types 和 client。

**涉及文件:**
- 修改: `web/src/App.tsx`
- 修改: `web/src/api/client.ts`
- 修改: `web/src/types/index.ts`
- 修改: `web/src/__tests__/config-routing.test.ts`
- 修改: `web/src/__tests__/api-client.test.ts`

**执行步骤:**
- [x] 在 `web/src/types/index.ts` 中新增 provider 与通道占位类型
  - 位置: `EnvironmentDetail` 定义之后、`Session` 定义之前
  - 新增 `ChannelProviderStatus`、`ChannelProviderInfo`、`ChannelInfo` 类型
  - `ChannelInfo` 首版可定义为最小结构，但 `apiListChannels()` 当前仍返回空数组
  - 原因: 页面和 API client 需要共享类型，不能在页面内写匿名对象
- [x] 在 `web/src/api/client.ts` 中新增通道 API 函数
  - 位置: `// --- Instances ---` 段之后、`// --- API Keys ---` 段之前
  - 新增 `apiListChannelProviders()`、`apiListChannels()`、`apiCreateChannel(type)`
  - `apiCreateChannel()` 保持调用 `POST /web/channels`，让前端即使点击被禁用后未来也不需要重写请求层
  - 原因: 首版虽然不开放创建，但 API client 先固定函数签名，后续可直接复用
- [x] 在 `web/src/App.tsx` 中把 `channels` 纳入路由解析和导航
  - 位置: `parseConfigView()` 的 `configViews` 数组、`ViewId` 联合类型、`parseRoute()`、`navItems` 和 Suspense 页面分发处
  - 把 `channels` 加入 `configViews`；新增 `const ChannelsPage = lazy(() => import("./pages/ChannelsPage").then(...))`
  - 在 `navItems` 中新增 `id: "channels", label: "通道"` 的 Tab
  - 在页面分发逻辑中新增 `configView === "channels" ? <ChannelsPage />`
  - 原因: 控制面入口必须先进入页面，后续平台开放时才能原位扩展
- [x] 更新前端路由与 API client 测试
  - 测试文件: `web/src/__tests__/config-routing.test.ts`、`web/src/__tests__/api-client.test.ts`
  - 测试场景:
    - `parseConfigView("/code/channels")` → 返回 `"channels"`
    - `apiListChannelProviders()` → GET `/web/channels/providers`
    - `apiListChannels()` → GET `/web/channels`
    - `apiCreateChannel("wechat")` → POST `/web/channels`
  - 运行命令: `cd /Users/liyuan/Work/mothership-beta && bun test web/src/__tests__/config-routing.test.ts web/src/__tests__/api-client.test.ts`
  - 预期: 所有测试通过

**检查步骤:**
- [x] 检查 `parseConfigView()` 已识别 `channels`
  - `cd /Users/liyuan/Work/mothership-beta && rg -n "\"channels\"" web/src/App.tsx web/src/__tests__/config-routing.test.ts`
  - 预期: `App.tsx` 与 routing test 都包含 `channels`
- [x] 检查前端 API client 已暴露通道接口
  - `cd /Users/liyuan/Work/mothership-beta && rg -n "apiListChannelProviders|apiListChannels|apiCreateChannel" web/src/api/client.ts`
  - 预期: 3 个函数均存在并导出
- [x] 检查 Task 3 单元测试通过
  - `cd /Users/liyuan/Work/mothership-beta && bun test web/src/__tests__/config-routing.test.ts web/src/__tests__/api-client.test.ts`
  - 预期: 测试全部通过，无 fetch path 拼写错误

---

### Task 4: 实现通道页面与置灰平台弹窗

**背景:**
首版用户可感知的交付物是“通道”页面和“新增通道”弹窗，但两者都只用于展示抽象层与平台状态，不允许真正创建。
当前控制面没有任何通道页面；新增页面必须清楚表达“当前版本仅完成抽象层”，避免用户误以为微信、飞书已经接入。
这是直接对应设计文档验收标准的 UI Task，依赖 Task 2/3 提供页面路由与 provider 列表 API。

**涉及文件:**
- 新建: `web/src/pages/ChannelsPage.tsx`
- 新建: `web/src/__tests__/channels-page.test.ts`
- 修改: `web/src/App.tsx`

**执行步骤:**
- [x] 在 `web/src/pages/ChannelsPage.tsx` 中实现通道页骨架
  - 位置: 新文件顶部参考 `web/src/pages/TasksPage.tsx` 组织 `useState/useEffect`
  - 页面初始化时调用 `apiListChannelProviders()` 与 `apiListChannels()`；provider 列表来自后端，通道列表首版为空
  - 页面标题固定为“通道接入”，并展示一段说明文案：“当前版本仅完成接入层抽象，平台接入将在后续版本开放”
  - 原因: 页面要明确表达首版范围，避免造成“功能损坏”的误解
- [x] 在 `ChannelsPage` 中渲染 provider 状态列表与空态
  - 位置: 页面主体区域
  - 使用现有表格或卡片样式展示每个平台的 `label`、`status`
  - 当 `apiListChannels()` 返回空数组时，显示“当前暂无已接入通道”
  - 原因: 首版重点是展示抽象层与平台状态，而不是账号列表
- [x] 在 `ChannelsPage` 中实现“新增通道”置灰弹窗
  - 位置: 页面 state 区与 Dialog 区域
  - 点击“新增通道”后弹出包含两个 disabled 选项的弹窗：`微信（暂不支持）`、`飞书（暂不支持）`
  - 两个选项都不调用 `apiCreateChannel()`；可在按钮旁展示“后续版本开放”提示
  - 原因: 用户已明确要求微信、飞书首版都置灰，不实现任何接入
- [x] 在页面中补固定中文文案和状态映射
  - 位置: 页面 helper 区域
  - 新增 `formatProviderStatus()`，把 `disabled` 显示为“未开放”
  - 固定中文文案至少包含：`通道接入`、`新增通道`、`微信（暂不支持）`、`飞书（暂不支持）`、`当前暂无已接入通道`
  - 原因: 现有前端测试大量通过源码文案做断言，通道页也应保持同一习惯
- [x] 为通道页面编写单元测试
  - 测试文件: `web/src/__tests__/channels-page.test.ts`
  - 测试场景:
    - 页面源码包含“通道接入”“新增通道”“微信（暂不支持）”“飞书（暂不支持）”
    - 页面导入并使用 `apiListChannelProviders` 与 `apiListChannels`
    - 页面包含“当前版本仅完成接入层抽象”说明
  - 运行命令: `cd /Users/liyuan/Work/mothership-beta && bun test web/src/__tests__/channels-page.test.ts`
  - 预期: 所有测试通过

**检查步骤:**
- [x] 检查通道页面文件已创建并接入 App
  - `cd /Users/liyuan/Work/mothership-beta && rg -n "ChannelsPage|通道接入|新增通道" web/src/pages/ChannelsPage.tsx web/src/App.tsx`
  - 预期: 页面文件存在，`App.tsx` 已 lazy import 并渲染
- [x] 检查置灰平台弹窗文案存在
  - `cd /Users/liyuan/Work/mothership-beta && rg -n "微信（暂不支持）|飞书（暂不支持）|当前版本仅完成接入层抽象" web/src/pages/ChannelsPage.tsx`
  - 预期: 输出包含三段关键文案
- [x] 检查 Task 4 单元测试通过
  - `cd /Users/liyuan/Work/mothership-beta && bun test web/src/__tests__/channels-page.test.ts`
  - 预期: 测试全部通过，页面只展示占位能力，不包含二维码或绑定逻辑

---

### Task 5: ACP 聊天通道抽象层验收

**前置条件:**
- 启动命令: `cd /Users/liyuan/Work/mothership-beta && bun run start`
- 前端构建: `cd /Users/liyuan/Work/mothership-beta && bun run build:web`
- 账号准备: 一个可登录控制面的 better-auth 用户

**端到端验证:**

1. 运行完整测试套件确保无回归
   - `cd /Users/liyuan/Work/mothership-beta && bun test src/__tests__/channel-provider.test.ts src/__tests__/channel-routes.test.ts web/src/__tests__/config-routing.test.ts web/src/__tests__/api-client.test.ts web/src/__tests__/channels-page.test.ts && bun run typecheck && bun run build:web`
   - 预期: 后端测试、前端测试、类型检查、前端构建全部通过
   - 失败排查: 优先检查 Task 1 ~ Task 4 的测试步骤

2. 验证顶部 Tab 和通道页可访问
   - `cd /Users/liyuan/Work/mothership-beta && rg -n 'label: "通道"|configView === "channels"' web/src/App.tsx && curl -s http://localhost:3000/code/channels | head -20`
   - 预期: `App.tsx` 包含“通道”导航，`/code/channels` 返回前端页面 HTML，而不是 404
   - 失败排查: 检查 Task 3 路由接入与 Task 4 页面挂载

3. 验证 provider 注册表 API
   - `curl -s http://localhost:3000/web/channels/providers -H 'Cookie: <better-auth-session>'`
   - 预期: 返回 `wechat`、`feishu` 两个平台，且 `status` 都为 `disabled`
   - 失败排查: 检查 Task 1 provider 注册表与 Task 2 路由输出

4. 验证空通道列表和拒绝创建行为
   - `curl -s http://localhost:3000/web/channels -H 'Cookie: <better-auth-session>' && curl -s -X POST http://localhost:3000/web/channels -H 'Content-Type: application/json' -H 'Cookie: <better-auth-session>' -d '{"type":"wechat"}'`
   - 预期: `GET /web/channels` 返回 `[]`；`POST /web/channels` 返回“当前平台暂未开放”错误
   - 失败排查: 检查 Task 2 的占位 API 逻辑

5. 验证前端置灰入口
   - `cd /Users/liyuan/Work/mothership-beta && rg -n "微信（暂不支持）|飞书（暂不支持）|当前版本仅完成接入层抽象" web/src/pages/ChannelsPage.tsx`
   - 预期: 页面代码和实际 UI 都只展示置灰入口，不包含二维码登录、Agent 绑定、Environment 创建、Instance 创建逻辑
   - 失败排查: 检查 Task 4 的弹窗和页面文案
