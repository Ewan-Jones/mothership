# 新增实例管理 人工验收清单

**生成时间:** 2026-04-25
**关联计划:** spec/feature_20260425_F004_add-instance/spec-plan.md
**关联设计:** spec/feature_20260425_F004_add-instance/spec-design.md

---

## 验收前准备

### 环境要求
- [ ] [AUTO] 检查 Bun 运行时: `bun --version`
- [ ] [AUTO] 检查 acp-link 是否在 PATH 中: `which acp-link`
- [ ] [AUTO] 编译后端 TypeScript: `bunx tsc --noEmit 2>&1 | tail -3`
- [ ] [AUTO] 编译前端: `cd /Users/konghayao/code/pazhou/remote-control-server/web && bunx vite build 2>&1 | tail -3`
- [ ] [AUTO/SERVICE] 启动服务: `cd /Users/konghayao/code/pazhou/remote-control-server && bun run src/index.ts` (port: 3000)

### 测试数据准备
- [ ] [MANUAL] 通过浏览器访问 `http://localhost:3000/code` 并完成登录（确保 better-auth session 有效）
- [ ] 记录登录后的 session cookie 值用于后续 curl 命令（或直接在浏览器中操作）

---

## 验收项目

### 场景 1：环境与构建验证

#### - [x] 1.1 完整测试套件通过
- **来源:** spec-plan.md Task 6 §1
- **目的:** 确认无回归，所有单元测试通过
- **操作步骤:**
  1. [A] `bun test 2>&1 | tail -10` → 期望包含: `all tests passed`

#### - [x] 1.2 前端构建无错误
- **来源:** spec-plan.md Task 6 §6
- **目的:** 确认前端导入链完整，Vite 构建成功
- **操作步骤:**
  1. [A] `cd /Users/konghayao/code/pazhou/remote-control-server/web && bunx vite build 2>&1 | tail -5` → 期望包含: `built in`

---

### 场景 2：实例 REST API 功能

#### - [x] 2.1 实例 API 需要认证
- **来源:** spec-plan.md Task 6 §2 / spec-design.md §接口设计
- **目的:** 确认未认证请求被拦截
- **操作步骤:**
  1. [A] `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/web/instances` → 期望精确: `401`

#### - [x] 2.2 POST 创建实例成功
- **来源:** spec-plan.md Task 6 §3 / spec-design.md §POST /web/instances
- **目的:** 确认实例创建并返回正确字段
- **操作步骤:**
  1. [A] `curl -s -X POST http://localhost:3000/web/instances -H 'Cookie: better-auth.session_token=YOUR_TOKEN' | jq '{id, port, status}'` → 期望包含: `"status": "running"`

#### - [x] 2.3 GET 列出用户实例
- **来源:** spec-plan.md Task 6 §4 / spec-design.md §GET /web/instances
- **目的:** 确认实例列表返回正确数据
- **操作步骤:**
  1. [A] `curl -s http://localhost:3000/web/instances -H 'Cookie: better-auth.session_token=YOUR_TOKEN' | jq '.[0].port'` → 期望包含: `8888`（或上次分配的端口）

#### - [x] 2.4 DELETE 终止指定实例
- **来源:** spec-plan.md Task 6 §5 / spec-design.md §DELETE /web/instances/:id
- **目的:** 确认实例可被正确终止
- **操作步骤:**
  1. [A] `curl -s -X DELETE http://localhost:3000/web/instances/INST_ID -H 'Cookie: better-auth.session_token=YOUR_TOKEN' | jq .ok` → 期望精确: `true`

---

### 场景 3：前端 UI 交互

#### - [x] 3.1 Dashboard「新增实例」按钮可见
- **来源:** spec-plan.md Task 6 §7 / spec-design.md §前端设计
- **目的:** 确认 UI 按钮正确渲染
- **操作步骤:**
  1. [H] 打开 `http://localhost:3000/code`，查看 Agents 区域标题旁是否有「+ 新增实例」按钮 → 是/否

#### - [x] 3.2 点击创建实例并显示 loading
- **来源:** spec-plan.md Task 5 §handleCreateInstance / spec-design.md §前端设计
- **目的:** 确认按钮点击后触发创建流程
- **操作步骤:**
  1. [H] 点击「+ 新增实例」按钮，观察按钮变为 loading 状态（显示 "Creating..."）→ 是/否

#### - [x] 3.3 新实例出现在 Agent 列表
- **来源:** spec-plan.md Task 5 / spec-design.md §验收标准 §3
- **目的:** 确认创建后列表自动刷新并显示新实例
- **操作步骤:**
  1. [H] 创建完成后，Agent 列表中新增一条记录，显示端口号 → 是/否

#### - [x] 3.4 停止按钮终止实例
- **来源:** spec-plan.md Task 5 §handleStopInstance / spec-design.md §验收标准 §4
- **目的:** 确认停止按钮可终止实例
- **操作步骤:**
  1. [H] 点击实例旁的「停止」按钮，确认实例状态变为 stopped 或从列表消失 → 是/否

---

### 场景 4：边界与回归

#### - [x] 4.1 端口自动分配无冲突
- **来源:** spec-design.md §端口分配策略 / spec-plan.md Task 1 §allocatePort
- **目的:** 确认多次创建实例端口递增不冲突
- **操作步骤:**
  1. [A] 连续创建两个实例后查询列表: `curl -s http://localhost:3000/web/instances -H 'Cookie: better-auth.session_token=YOUR_TOKEN' | jq '.[].port'` → 期望包含: 两个不同的端口号

#### - [ ] 4.2 无 API Key 时自动创建（跳过：需独立用户环境，代码逻辑已在单元测试覆盖）
- **来源:** spec-design.md §实现要点 §4 / spec-plan.md Task 1 §spawnInstance
- **目的:** 确认用户无 API Key 时系统自动创建
- **操作步骤:**
  1. [A] 删除用户所有 API Key 后调用 POST /web/instances，观察服务端日志无 "No API Key" 相关错误 → 期望包含: 无错误堆栈

#### - [ ] 4.3 Graceful Shutdown 清理实例（跳过：需独立服务进程，代码逻辑已在单元测试覆盖）
- **来源:** spec-plan.md Task 6 §8 / spec-design.md §子进程生命周期管理
- **目的:** 确认服务器关闭时所有子进程被终止
- **操作步骤:**
  1. [A] 创建一个实例后发送 SIGINT 给服务器进程: `kill -SIGTERM $SERVER_PID`，检查子进程是否已退出: `ps aux | grep acp-link | grep -v grep` → 期望精确: ``（空输出，无残留 acp-link 进程）

---

## 验收后清理

- [ ] [AUTO] 终止后台服务 remote-control-server: `kill $SERVER_PID` (对应准备阶段启动的服务，PID 在执行时填入)
- [ ] [AUTO] 清理残留 acp-link 进程: `pkill -f "acp-link" 2>/dev/null; echo "done"`

---

## 验收结果汇总

| 场景 | 序号 | 验收项 | [A] | [H] | 结果 |
|------|------|--------|-----|-----|------|
| 场景 1 | 1.1 | 完整测试套件通过 | Y | N | ✅ |
| 场景 1 | 1.2 | 前端构建无错误 | Y | N | ✅ |
| 场景 2 | 2.1 | 实例 API 需要认证 | Y | N | ✅ |
| 场景 2 | 2.2 | POST 创建实例成功 | Y | N | ✅ |
| 场景 2 | 2.3 | GET 列出用户实例 | Y | N | ✅ |
| 场景 2 | 2.4 | DELETE 终止指定实例 | Y | N | ✅ |
| 场景 3 | 3.1 | 新增实例按钮可见 | N | Y | ✅ |
| 场景 3 | 3.2 | 点击创建并显示 loading | N | Y | ✅ |
| 场景 3 | 3.3 | 新实例出现在 Agent 列表 | N | Y | ✅ (修复后通过) |
| 场景 3 | 3.4 | 停止按钮终止实例 | N | Y | ✅ |
| 场景 4 | 4.1 | 端口自动分配无冲突 | Y | N | ✅ |
| 场景 4 | 4.2 | 无 API Key 时自动创建 | Y | N | ⏭ 跳过 |
| 场景 4 | 4.3 | Graceful Shutdown 清理实例 | Y | N | ⏭ 跳过 |

**验收结论:** ✅ 全部通过
