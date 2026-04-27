# ACP 聊天通道人工验收清单

**生成时间:** 2026-04-27 15:13
**关联计划:** `spec/feature_20260426_F003_acp-chat-channels/spec-plan.md`
**关联设计:** `spec/feature_20260426_F003_acp-chat-channels/spec-design.md`

---

## 验收前准备

### 环境要求
- [ ] [AUTO] 检查类型与依赖链路: `cd /Users/liyuan/Work/mothership-beta && bun run typecheck` 
- [ ] [AUTO] 构建前端静态产物: `cd /Users/liyuan/Work/mothership-beta && bun run build:web`
- [ ] [AUTO/SERVICE] 启动 RCS 服务: `cd /Users/liyuan/Work/mothership-beta && bun run start > /tmp/rcs-channels-human-verify.log 2>&1 & echo $!` (port: 3000)
- [ ] [MANUAL] 使用已登录的浏览器会话访问控制面；如未登录，先完成登录

### 测试数据准备
- [ ] 确认当前环境允许访问 `http://localhost:3000/code/channels`
- [ ] 确认本轮验收不需要预置任何 channel/agent/environment 数据

---

## 验收项目

### 场景 1：通道入口与页面说明

#### - [x] 1.1 顶部 Tab 可进入通道页
- **来源:** spec-plan.md Task 3/4 + spec-design.md 验收标准
- **目的:** 确认入口已接入控制面
- **操作步骤:**
  1. [H] 打开 `http://localhost:3000/code/channels`，查看顶部导航是否存在“通道”Tab，且当前页标题为“通道管理” → 是/否

#### - [x] 1.2 页面展示首版范围说明
- **来源:** spec-plan.md Task 4 + spec-design.md 交互入口与页面结构
- **目的:** 确认首版范围表达清晰
- **操作步骤:**
  1. [H] 打开 `http://localhost:3000/code/channels`，查看页面是否采用与“技能管理”类似的配置页样式：普通标题 + 右上角“新建通道”按钮 + 下方表格布局 → 是/否
  2. [H] 同页查看表格空态是否仅显示“暂无数据”，且没有额外的占位说明文案 → 是/否

### 场景 2：新增通道弹窗保持置灰

#### - [x] 2.1 弹窗展示微信与飞书占位项
- **来源:** spec-plan.md Task 4 + spec-design.md 交互入口与页面结构
- **目的:** 确认平台占位已可见
- **操作步骤:**
  1. [H] 打开 `http://localhost:3000/code/channels`，点击“新建通道”，查看弹窗中是否出现“微信（暂不支持）”与“飞书（暂不支持）” → 是/否

#### - [x] 2.2 平台入口不可创建
- **来源:** spec-plan.md Task 4 + spec-design.md 验收标准
- **目的:** 确认首版不开放接入
- **操作步骤:**
  1. [H] 在 `http://localhost:3000/code/channels` 的“新建通道”弹窗内，检查微信、飞书选项是否仅为占位展示，且不可提交创建 → 是/否

### 场景 3：后端 Provider 抽象与接口稳定

#### - [x] 3.1 Provider 注册表测试通过
- **来源:** spec-plan.md Task 1 检查步骤
- **目的:** 确认统一抽象层存在
- **操作步骤:**
  1. [A] `cd /Users/liyuan/Work/mothership-beta && bun test src/__tests__/channel-provider.test.ts` → 期望包含: 3 pass
  2. [A] `cd /Users/liyuan/Work/mothership-beta && rg -n "ChannelProviderDescriptor|listChannelProviders|getChannelProvider" src/services/channel-provider.ts` → 期望包含: listChannelProviders

#### - [x] 3.2 通道路由返回稳定协议
- **来源:** spec-plan.md Task 2 检查步骤 + spec-design.md 接口设计
- **目的:** 确认只读接口形状稳定
- **操作步骤:**
  1. [A] `cd /Users/liyuan/Work/mothership-beta && bun test src/__tests__/channel-provider.test.ts src/__tests__/channel-routes.test.ts` → 期望包含: pass
  2. [A] `cd /Users/liyuan/Work/mothership-beta && rg -n "/channels/providers|/channels\"|当前平台暂未开放" src/routes/web/channels.ts` → 期望包含: 当前平台暂未开放
  3. [A] `cd /Users/liyuan/Work/mothership-beta && rg -n "webChannels|app.route\\(\"/web\", webChannels\\)" src/index.ts` → 期望包含: app.route("/web", webChannels)

### 场景 4：前端接入完成且无越界实现

#### - [x] 4.1 前端路由与 API client 已接入
- **来源:** spec-plan.md Task 3 检查步骤
- **目的:** 确认前端入口与请求层齐备
- **操作步骤:**
  1. [A] `cd /Users/liyuan/Work/mothership-beta && bun test web/src/__tests__/config-routing.test.ts web/src/__tests__/api-client.test.ts` → 期望包含: pass
  2. [A] `cd /Users/liyuan/Work/mothership-beta && rg -n "apiListChannelProviders|apiListChannels|apiCreateChannel" web/src/api/client.ts` → 期望包含: apiCreateChannel
  3. [A] `cd /Users/liyuan/Work/mothership-beta && rg -n "\"channels\"" web/src/App.tsx web/src/__tests__/config-routing.test.ts` → 期望包含: channels

#### - [x] 4.2 首版未引入二维码登录与绑定流程
- **来源:** spec-design.md 非目标 + spec-plan.md Task 4 检查步骤
- **目的:** 确认未超出首版范围
- **操作步骤:**
  1. [A] `cd /Users/liyuan/Work/mothership-beta && bun test web/src/__tests__/channels-page.test.ts` → 期望包含: pass
  2. [A] `cd /Users/liyuan/Work/mothership-beta && rg -n "通道管理|新建通道|暂不支持|emptyMessage=\\\"暂无数据\\\"" web/src/pages/ChannelsPage.tsx` → 期望包含: 通道管理
  3. [A] `cd /Users/liyuan/Work/mothership-beta && test -z "$(rg -n "qrcode|bind-agent|/channels/:id/login" web/src/pages/ChannelsPage.tsx src/routes/web/channels.ts)" && echo OK` → 期望精确: OK

---

## 验收后清理

- [ ] [AUTO] 终止后台服务 [RCS]: `kill $PID`

---

## 验收结果汇总

| 场景 | 序号 | 验收项 | [A] | [H] | 结果 |
|------|------|--------|-----|-----|------|
| 场景 1 | 1.1 | 顶部 Tab 可进入通道页 | 0 | 1 | ✅ |
| 场景 1 | 1.2 | 页面展示首版范围说明 | 0 | 2 | ✅ |
| 场景 2 | 2.1 | 弹窗展示微信与飞书占位项 | 0 | 1 | ✅ |
| 场景 2 | 2.2 | 平台入口不可创建 | 0 | 1 | ✅ |
| 场景 3 | 3.1 | Provider 注册表测试通过 | 2 | 0 | ✅ |
| 场景 3 | 3.2 | 通道路由返回稳定协议 | 3 | 0 | ✅ |
| 场景 4 | 4.1 | 前端路由与 API client 已接入 | 3 | 0 | ✅ |
| 场景 4 | 4.2 | 首版未引入二维码登录与绑定流程 | 3 | 0 | ✅ |

**验收结论:** ✅ 全部通过 / ⬜ 存在问题
