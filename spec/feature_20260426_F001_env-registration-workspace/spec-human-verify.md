# 环境注册与 Workspace 管理 人工验收清单

**生成时间:** 2026-04-26
**关联计划:** spec/feature_20260426_F001_env-registration-workspace/spec-plan.md
**关联设计:** spec/feature_20260426_F001_env-registration-workspace/spec-design.md

---

## 验收前准备

### 环境要求
- [ ] [AUTO] 检查 Bun 运行时: `bun --version`
- [ ] [AUTO] 编译前端: `bun run build:web`
- [ ] [AUTO] 类型检查: `bun run typecheck`
- [ ] [AUTO/SERVICE] 启动后端开发服务器: `bun run dev` (port: 3000)

### 测试数据准备
- [ ] 需要一个已注册的 better-auth 用户（通过前端注册或 API 直接创建），记录其 `session_token` cookie 值为 `YOUR_TOKEN`
- [ ] 记录注册成功后返回的 `ENV_ID` 和 `ENV_SECRET`，用于后续验收项

---

## 验收项目

### 场景 1：基础构建与类型检查

#### - [ ] 1.1 后端类型检查通过
- **来源:** spec-plan.md Task 6 / Task 1-5 检查步骤
- **目的:** 确认全量类型安全
- **操作步骤:**
  1. [A] `bun run typecheck 2>&1` → 期望包含: 无错误输出

#### - [ ] 1.2 后端全量测试通过
- **来源:** spec-plan.md Task 6 验收步骤 1
- **目的:** 确认无回归
- **操作步骤:**
  1. [A] `bun test src/__tests__/ 2>&1 | tail -20` → 期望包含: `fail` 仅出现在已知的 middleware.test.ts / routes.test.ts mock 隔离问题中，其余全部 pass

#### - [ ] 1.3 前端构建通过
- **来源:** spec-plan.md Task 5 检查步骤
- **目的:** 确认前端可正常构建
- **操作步骤:**
  1. [A] `bun run build:web 2>&1` → 期望包含: `built in`

---

### 场景 2：数据库 Schema 验证

#### - [ ] 2.1 environment 表存在且字段完整
- **来源:** spec-plan.md Task 1 / spec-design.md §数据模型
- **目的:** 确认持久化表结构正确
- **操作步骤:**
  1. [A] `sqlite3 data/rcs.db ".schema environment" 2>/dev/null || echo "DB not found"` → 期望包含: `CREATE TABLE environment` 和 `name TEXT NOT NULL UNIQUE` 和 `secret TEXT NOT NULL`

#### - [ ] 2.2 secret 唯一索引存在
- **来源:** spec-plan.md Task 1 建表语句 / spec-design.md §数据模型
- **目的:** 确认 acp-link token 查找性能
- **操作步骤:**
  1. [A] `sqlite3 data/rcs.db ".schema environment" | grep -c "idx_environment_secret"` → 期望精确: `1`

---

### 场景 3：环境 CRUD API

#### - [ ] 3.1 注册新环境成功
- **来源:** spec-plan.md Task 3 / Task 6 验收步骤 3
- **目的:** 确认环境注册全流程
- **操作步骤:**
  1. [A] `curl -s -X POST http://localhost:3000/web/environments -H 'Content-Type: application/json' -b 'better-auth.session_token=YOUR_TOKEN' -d '{"name":"test-env","workspacePath":"/tmp/test-workspace-verify","description":"验收测试环境"}' | jq .` → 期望包含: `"id"` 和 `"name": "test-env"` 和 `"secret": "env_secret_`
  2. [A] `test -d /tmp/test-workspace-verify && echo "DIR_EXISTS"` → 期望精确: `DIR_EXISTS`

#### - [ ] 3.2 环境列表不含 secret
- **来源:** spec-plan.md Task 6 验收步骤 4 / spec-design.md §API 设计
- **目的:** 确认列表 API 安全性
- **操作步骤:**
  1. [A] `curl -s http://localhost:3000/web/environments -b 'better-auth.session_token=YOUR_TOKEN' | jq '.[0] | has("secret")'` → 期望精确: `false`

#### - [ ] 3.3 环境详情含 secret
- **来源:** spec-plan.md Task 6 验收步骤 5
- **目的:** 确认详情 API 返回完整信息
- **操作步骤:**
  1. [A] `curl -s http://localhost:3000/web/environments/ENV_ID -b 'better-auth.session_token=YOUR_TOKEN' | jq '.secret'` → 期望包含: `env_secret_`

#### - [ ] 3.4 更新环境元数据
- **来源:** spec-plan.md Task 6 验收步骤 8
- **目的:** 确认编辑功能可用
- **操作步骤:**
  1. [A] `curl -s -X PUT http://localhost:3000/web/environments/ENV_ID -H 'Content-Type: application/json' -b 'better-auth.session_token=YOUR_TOKEN' -d '{"description":"更新后的描述"}' | jq '.description'` → 期望精确: `"更新后的描述"`

#### - [ ] 3.5 删除环境
- **来源:** spec-plan.md Task 6 验收步骤 8
- **目的:** 确认删除功能可用
- **操作步骤:**
  1. [A] `curl -s -X DELETE http://localhost:3000/web/environments/ENV_ID -b 'better-auth.session_token=YOUR_TOKEN' | jq '.ok'` → 期望精确: `true`

---

### 场景 4：输入校验

#### - [ ] 4.1 name 重复注册被拒绝
- **来源:** spec-design.md §注册流程 / spec-plan.md Task 3 测试场景
- **目的:** 确认唯一约束生效
- **操作步骤:**
  1. [A] 先注册环境 `test-unique`，再以相同 name 重复注册: `curl -s -X POST http://localhost:3000/web/environments -H 'Content-Type: application/json' -b 'better-auth.session_token=YOUR_TOKEN' -d '{"name":"test-unique","workspacePath":"/tmp/ws1"}' | jq .error.type` → 期望包含: `VALIDATION_ERROR` 或 SQLite 唯一约束错误

#### - [ ] 4.2 系统目录路径被拒绝
- **来源:** spec-plan.md Task 3 validateWorkspacePath / spec-design.md §目录创建机制
- **目的:** 确认安全校验
- **操作步骤:**
  1. [A] `curl -s -X POST http://localhost:3000/web/environments -H 'Content-Type: application/json' -b 'better-auth.session_token=YOUR_TOKEN' -d '{"name":"sys-path","workspacePath":"/etc"}' | jq .error.type` → 期望精确: `"VALIDATION_ERROR"`

#### - [ ] 4.3 相对路径被拒绝
- **来源:** spec-plan.md Task 3 validateWorkspacePath
- **目的:** 确认路径必须为绝对路径
- **操作步骤:**
  1. [A] `curl -s -X POST http://localhost:3000/web/environments -H 'Content-Type: application/json' -b 'better-auth.session_token=YOUR_TOKEN' -d '{"name":"rel-path","workspacePath":"relative/path"}' | jq .error.type` → 期望精确: `"VALIDATION_ERROR"`

#### - [ ] 4.4 不存在的 agentName 被拒绝
- **来源:** spec-plan.md Task 3 POST 路由 / spec-design.md §注册流程
- **目的:** 确认 agent 关联校验
- **操作步骤:**
  1. [A] `curl -s -X POST http://localhost:3000/web/environments -H 'Content-Type: application/json' -b 'better-auth.session_token=YOUR_TOKEN' -d '{"name":"bad-agent","workspacePath":"/tmp/ws2","agentName":"non-existent-agent"}' | jq .error.message` → 期望包含: `不存在`

---

### 场景 5：acp-link Token 匹配与状态流转

#### - [ ] 5.1 acp-link 使用环境 secret 连接后状态变为 active
- **来源:** spec-plan.md Task 4 / Task 6 验收步骤 6
- **目的:** 确认 secret 认证和状态更新
- **操作步骤:**
  1. [A] 先通过 API 注册环境获取 `ENV_SECRET`，使用 websocat 或 wscat 连接: `echo '{"type":"register","agent_name":"test-agent","max_sessions":1}' | websocat -1 "ws://localhost:3000/acp/ws?token=ENV_SECRET"` → 期望包含: `{"type":"registered","agent_id":"env_`
  2. [A] 查询环境状态: `curl -s http://localhost:3000/web/environments/ENV_ID -b 'better-auth.session_token=YOUR_TOKEN' | jq .status` → 期望精确: `"active"`

#### - [ ] 5.2 acp-link 断开后状态恢复为 idle
- **来源:** spec-plan.md Task 4 / Task 6 验收步骤 7 / spec-design.md §acp-link 匹配逻辑
- **目的:** 确认持久化环境断开不删除
- **操作步骤:**
  1. [A] 关闭上一步的 WebSocket 连接后查询: `curl -s http://localhost:3000/web/environments/ENV_ID -b 'better-auth.session_token=YOUR_TOKEN' | jq .status` → 期望精确: `"idle"`

#### - [ ] 5.3 非 secret token 回退到 API Key 认证
- **来源:** spec-plan.md Task 4 / spec-design.md §认证优先级
- **目的:** 确认向后兼容
- **操作步骤:**
  1. [A] `grep -c "storeGetEnvironmentBySecret" src/routes/acp/index.ts` → 期望包含: 输出 ≥ 1（代码存在 secret 匹配逻辑）
  2. [A] `bun test src/__tests__/acp-token-match.test.ts 2>&1 | tail -5` → 期望包含: `pass`

---

### 场景 6：前端环境管理页面

#### - [ ] 6.1 Dashboard 页面可访问且布局正确
- **来源:** spec-plan.md Task 5 / Task 6 验收步骤 9
- **目的:** 确认前端页面正常渲染
- **操作步骤:**
  1. [H] 打开 `http://localhost:3000/code/`，查看页面是否显示"环境管理"标题、DataTable（含"名称"、"Workspace"、"关联Agent"、"状态"列）、"注册环境"按钮 → 是/否

#### - [ ] 6.2 注册环境表单功能
- **来源:** spec-plan.md Task 5 / spec-design.md §前端页面设计
- **目的:** 确认表单交互正确
- **操作步骤:**
  1. [H] 点击"注册环境"按钮，填写名称 `e2e-test`、描述 `端到端测试`、Workspace 路径 `/tmp/e2e-workspace`，提交后是否弹出 Secret 展示对话框，对话框中包含 `env_secret_` 前缀的字符串和"复制"按钮 → 是/否

#### - [ ] 6.3 状态 Badge 颜色正确
- **来源:** spec-plan.md Task 5 Dashboard 列定义 / spec-design.md §前端页面设计
- **目的:** 确认状态视觉反馈
- **操作步骤:**
  1. [H] 在环境列表中，idle 状态的环境显示灰色 Badge，active 状态显示绿色 Badge → 是/否

#### - [ ] 6.4 查看与编辑环境
- **来源:** spec-plan.md Task 5 / spec-design.md §Secret 管理
- **目的:** 确认行操作按钮可用
- **操作步骤:**
  1. [H] 点击某环境的"查看 Secret"按钮，是否弹出包含完整 secret 的对话框 → 是/否
  2. [H] 点击"编辑"按钮，修改描述为 `修改后的描述`，提交后列表中描述是否更新 → 是/否

---

## 验收后清理

- [ ] [AUTO] 终止后台开发服务器: `kill $(lsof -t -i:3000) 2>/dev/null` (对应准备阶段启动的 `bun run dev`)
- [ ] [AUTO] 清理测试数据: `rm -rf /tmp/test-workspace-verify /tmp/e2e-workspace /tmp/ws1 /tmp/ws2`
- [ ] [AUTO] 清理测试环境记录: `sqlite3 data/rcs.db "DELETE FROM environment WHERE name IN ('test-env','test-unique','e2e-test','sys-path','rel-path','bad-agent');"`

---

## 验收结果汇总

| 场景 | 序号 | 验收项 | [A] | [H] | 结果 |
|------|------|--------|-----|-----|------|
| 场景 1 | 1.1 | 后端类型检查通过 | 1 | 0 | ⬜ |
| 场景 1 | 1.2 | 后端全量测试通过 | 1 | 0 | ⬜ |
| 场景 1 | 1.3 | 前端构建通过 | 1 | 0 | ⬜ |
| 场景 2 | 2.1 | environment 表存在且字段完整 | 1 | 0 | ⬜ |
| 场景 2 | 2.2 | secret 唯一索引存在 | 1 | 0 | ⬜ |
| 场景 3 | 3.1 | 注册新环境成功 | 2 | 0 | ⬜ |
| 场景 3 | 3.2 | 环境列表不含 secret | 1 | 0 | ⬜ |
| 场景 3 | 3.3 | 环境详情含 secret | 1 | 0 | ⬜ |
| 场景 3 | 3.4 | 更新环境元数据 | 1 | 0 | ⬜ |
| 场景 3 | 3.5 | 删除环境 | 1 | 0 | ⬜ |
| 场景 4 | 4.1 | name 重复注册被拒绝 | 1 | 0 | ⬜ |
| 场景 4 | 4.2 | 系统目录路径被拒绝 | 1 | 0 | ⬜ |
| 场景 4 | 4.3 | 相对路径被拒绝 | 1 | 0 | ⬜ |
| 场景 4 | 4.4 | 不存在的 agentName 被拒绝 | 1 | 0 | ⬜ |
| 场景 5 | 5.1 | secret 连接后状态变 active | 2 | 0 | ⬜ |
| 场景 5 | 5.2 | 断开后状态恢复 idle | 1 | 0 | ⬜ |
| 场景 5 | 5.3 | API Key 认证向后兼容 | 2 | 0 | ⬜ |
| 场景 6 | 6.1 | Dashboard 页面布局正确 | 0 | 1 | ⬜ |
| 场景 6 | 6.2 | 注册环境表单功能 | 0 | 1 | ⬜ |
| 场景 6 | 6.3 | 状态 Badge 颜色正确 | 0 | 1 | ⬜ |
| 场景 6 | 6.4 | 查看与编辑环境 | 0 | 2 | ⬜ |

**验收结论:** ⬜ 全部通过 / ⬜ 存在问题
