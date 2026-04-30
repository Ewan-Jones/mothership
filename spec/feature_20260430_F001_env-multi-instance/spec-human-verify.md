# 环境多实例支持 人工验收清单

**生成时间:** 2026-04-30 18:00
**关联计划:** spec/feature_20260430_F001_env-multi-instance/spec-plan.md
**关联设计:** spec/feature_20260430_F001_env-multi-instance/spec-design.md

---

## 验收前准备

### 环境要求
- [x] [AUTO] 检查 Bun 版本: `bun --version`
- [x] [AUTO] 运行后端测试套件: `bun test src/__tests__/instance-service.test.ts src/__tests__/instance-routes.test.ts src/__tests__/web-environments.test.ts`
- [x] [AUTO] 类型检查: `bun run typecheck`
- [x] [AUTO] 构建前端: `bun run build:web`
- [x] [AUTO/SERVICE] 启动后端服务: `bun run dev` (port: 3000)

### 测试数据准备
- [ ] 确保至少有一个已创建的环境（通过 Dashboard 创建或 API）

---

## 验收项目

### 场景 1：后端测试与构建

#### - [x] 1.1 instance-service 测试全部通过
- **来源:** spec-plan.md Task 1 + Task 5
- **目的:** 验证数据模型和多实例逻辑正确
- **操作步骤:**
  1. [A] `bun test src/__tests__/instance-service.test.ts 2>&1 | tail -5` → 期望包含: `0 fail`

#### - [x] 1.2 instance-routes 测试全部通过
- **来源:** spec-plan.md Task 2 + Task 5
- **目的:** 验证实例路由包含 instance_number
- **操作步骤:**
  1. [A] `bun test src/__tests__/instance-routes.test.ts 2>&1 | tail -5` → 期望包含: `0 fail`

#### - [x] 1.3 web-environments 测试全部通过
- **来源:** spec-plan.md Task 2 + Task 5
- **目的:** 验证环境路由多实例 API 正确
- **操作步骤:**
  1. [A] `bun test src/__tests__/web-environments.test.ts 2>&1 | tail -5` → 期望包含: `0 fail`

#### - [x] 1.4 类型检查通过
- **来源:** spec-plan.md Task 2 检查步骤
- **目的:** 前后端类型一致
- **操作步骤:**
  1. [A] `bun run typecheck 2>&1 | tail -5` → 期望包含: `tsc --noEmit`

#### - [x] 1.5 前端构建成功
- **来源:** spec-plan.md Task 4 + Task 5
- **目的:** 前端代码无编译错误
- **操作步骤:**
  1. [A] `bun run build:web 2>&1 | tail -3` → 期望包含: `built in`

---

### 场景 2：多实例 API 行为

#### - [x] 2.1 连续创建多个实例编号递增
- **来源:** spec-plan.md Task 1 + Task 5 / spec-design.md 编号分配规则
- **目的:** 验证实例编号严格递增
- **操作步骤:**
  1. [A] 创建实例 1: `curl -s -X POST http://localhost:3000/web/instances/from-environment -H 'Content-Type: application/json' -d '{"environmentId":"ENV_ID"}' -b cookie | jq '.instance_number'` → 期望精确: `1`
  2. [A] 创建实例 2: 再次执行相同命令 → 期望精确: `2`

#### - [x] 2.2 实例列表 API 返回活跃实例
- **来源:** spec-plan.md Task 2 / spec-design.md GET /:id/instances
- **目的:** 验证实例列表查询正确
- **操作步骤:**
  1. [A] `curl -s http://localhost:3000/web/environments/ENV_ID/instances -b cookie | jq '.instances | length'` → 期望包含: `2`
  2. [A] `curl -s http://localhost:3000/web/environments/ENV_ID/instances -b cookie | jq '.instances[0].instance_number'` → 期望精确: `1`
  3. [A] `curl -s http://localhost:3000/web/environments/ENV_ID/instances -b cookie | jq '.instances[1].instance_number'` → 期望精确: `2`

#### - [x] 2.3 按编号进入指定实例
- **来源:** spec-plan.md Task 2 / spec-design.md POST /:id/enter
- **目的:** 验证 instance_number 参数正确路由
- **操作步骤:**
  1. [A] 进入实例 2: `curl -s -X POST http://localhost:3000/web/environments/ENV_ID/enter -H 'Content-Type: application/json' -d '{"instance_number":2}' -b cookie | jq '.instance_number'` → 期望精确: `2`
  2. [A] 进入不存在的实例: `curl -s -X POST http://localhost:3000/web/environments/ENV_ID/enter -H 'Content-Type: application/json' -d '{"instance_number":99}' -b cookie | jq '.error.type'` → 期望精确: `"NOT_FOUND"`

#### - [x] 2.4 环境列表返回 instances 数组和兼容字段
- **来源:** spec-plan.md Task 2 检查步骤
- **目的:** 验证 GET /environments 新旧字段并存
- **操作步骤:**
  1. [A] `curl -s http://localhost:3000/web/environments -b cookie | jq '.[0].instances_count'` → 期望包含: `2`
  2. [A] `curl -s http://localhost:3000/web/environments -b cookie | jq '.[0].instance_status'` → 期望包含: `running`

---

### 场景 3：前端 UI 交互

#### - [x] 3.1 环境在线时显示 Split Button 下拉箭头
- **来源:** spec-plan.md Task 4 / spec-design.md 前端 UI 设计
- **目的:** 确认在线环境卡片按钮右侧有下拉箭头
- **操作步骤:**
  1. [H] 打开 http://localhost:3000/ctrl/ 并登录，进入智能体页面 → 是/否

#### - [x] 3.2 下拉菜单展示活跃实例和新建选项
- **来源:** spec-plan.md Task 4 / spec-design.md 下拉菜单内容
- **目的:** 确认下拉菜单内容正确
- **操作步骤:**
  1. [H] 点击在线环境卡片的下拉箭头，查看菜单 → 是/否（包含"实例 1 running"、"实例 2 running"和"+ 新建实例"）

#### - [x] 3.3 单实例时点击主体按钮直接进入
- **来源:** spec-design.md 交互规则
- **目的:** 单实例行为与改造前一致
- **操作步骤:**
  1. [H] 对只有单个实例的环境，点击"进入对话"主体按钮 → 是/否（直接进入对话页面，不弹出下拉）

#### - [x] 3.4 实例数量标签显示
- **来源:** spec-plan.md Task 4 / spec-design.md 环境卡片改造
- **目的:** 多实例环境卡片头部显示"实例 xN"
- **操作步骤:**
  1. [H] 查看有 2 个实例的环境卡片头部 → 是/否（显示"实例 x2"标签）

---

### 场景 4：实例隔离与停止

#### - [x] 4.1 停止单个实例不影响其他实例
- **来源:** spec-plan.md Task 5 / spec-design.md 验收标准
- **目的:** 验证实例独立性
- **操作步骤:**
  1. [A] 停止实例 1: `curl -s -X DELETE http://localhost:3000/web/instances/INST_1_ID -b cookie | jq '.ok'` → 期望精确: `true`
  2. [A] 检查实例 2 仍运行: `curl -s http://localhost:3000/web/environments/ENV_ID/instances -b cookie | jq '.instances | length'` → 期望包含: `1`

#### - [x] 4.2 实例 session 完全隔离
- **来源:** spec-design.md 验收标准 / spec-plan.md Task 1 测试
- **目的:** 不同实例对话历史不混合
- **操作步骤:**
  1. [H] 分别进入实例 1 和实例 2 的对话，在各自发送不同消息后切换查看 → 是/否（对话历史各自独立，不串扰）

---

### 场景 5：边界与回归

#### - [x] 5.1 无实例时"启动并进入"按钮正常
- **来源:** spec-design.md 交互规则
- **目的:** 离线环境行为不变
- **操作步骤:**
  1. [H] 对没有运行实例的环境，查看按钮文本 → 是/否（显示"启动并进入"而非"进入对话"）

#### - [x] 5.2 实例编号不回收
- **来源:** spec-plan.md Task 1 测试 / spec-design.md 编号分配规则
- **目的:** 停止实例后新实例编号继续递增
- **操作步骤:**
  1. [A] `bun test src/__tests__/instance-service.test.ts 2>&1 | grep "编号不回收"` → 期望包含: `pass`

#### - [x] 5.3 GET /:id/instances 对不存在环境返回 404
- **来源:** spec-plan.md Task 2 测试
- **目的:** 验证错误处理正确
- **操作步骤:**
  1. [A] `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/web/environments/env_noexist/instances -b cookie` → 期望精确: `404`

---

## 验收后清理

- [ ] [AUTO] 终止后台服务 dev server: `kill $(lsof -ti:3000) 2>/dev/null; true`

---

## 验收结果汇总

| 场景 | 序号 | 验收项 | [A] | [H] | 结果 |
|------|------|--------|-----|-----|------|
| 场景 1 | 1.1 | instance-service 测试 | 1 | 0 | ✅ |
| 场景 1 | 1.2 | instance-routes 测试 | 1 | 0 | ✅ |
| 场景 1 | 1.3 | web-environments 测试 | 1 | 0 | ✅ |
| 场景 1 | 1.4 | 类型检查 | 1 | 0 | ✅ |
| 场景 1 | 1.5 | 前端构建 | 1 | 0 | ✅ |
| 场景 2 | 2.1 | 编号递增 | 2 | 0 | ✅ |
| 场景 2 | 2.2 | 实例列表 API | 3 | 0 | ✅ |
| 场景 2 | 2.3 | 按编号进入 | 2 | 0 | ✅ |
| 场景 2 | 2.4 | 环境列表兼容字段 | 2 | 0 | ✅ |
| 场景 3 | 3.1 | Split Button 下拉箭头 | 0 | 1 | ✅ |
| 场景 3 | 3.2 | 下拉菜单内容 | 0 | 1 | ✅ |
| 场景 3 | 3.3 | 单实例直接进入 | 0 | 1 | ✅ |
| 场景 3 | 3.4 | 实例数量标签 | 0 | 1 | ✅ |
| 场景 4 | 4.1 | 停止独立性 | 2 | 0 | ✅ |
| 场景 4 | 4.2 | Session 隔离 | 0 | 1 | ✅ |
| 场景 5 | 5.1 | 离线按钮文本 | 0 | 1 | ✅ |
| 场景 5 | 5.2 | 编号不回收 | 1 | 0 | ✅ |
| 场景 5 | 5.3 | 404 错误处理 | 1 | 0 | ✅ |

**验收结论:** ✅ 全部通过
