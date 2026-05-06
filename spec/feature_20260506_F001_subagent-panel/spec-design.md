# Feature: 20260506_F001 - subagent-panel

## 需求背景

当前 Agent 管理页面（`AgentsPage.tsx`）使用扁平列表展示所有 Agent，通过 `mode` 字段区分 primary/subagent/all 三种角色。用户在管理子智能体时缺乏专用视图，需要手动在完整列表中筛选 `mode=subagent` 的条目，操作效率低且缺乏针对性的创建流程。

Agent 实例内部已记录与子智能体的调用关系，配置层不需要维护关联。本需求仅需在 UI 层提供独立的子智能体管理视图。

## 目标

- 在 Agent 管理页面增加独立的「子智能体」Tab，展示所有 `mode=subagent` 的 Agent
- 提供简化的子智能体创建表单（只保留名称、模型、描述、提示词等核心字段）
- 支持编辑和删除子智能体
- 复用现有后端 API（`/web/config/agents`），不新增后端接口

## 方案设计

### 数据结构与 API

**决策：复用现有 Agent 配置结构，不新增后端接口。**

子智能体和主 Agent 共享 `opencode.json` 中的 `agent` 配置段，通过 `mode: "subagent"` 标记角色区分。关联关系由 Agent 实例（运行时）内部记录，配置层不维护绑定。

**现有 API 映射**：

| 操作 | API 调用 | 说明 |
|------|----------|------|
| 列表 | `apiListAgents()` | 返回全量列表，前端用 `useMemo` 过滤 `mode === "subagent"` |
| 创建 | `apiCreateAgent(name, { mode: "subagent", ... })` | 自动注入 `mode` |
| 编辑 | `apiSetAgent(name, data)` | 逐字段合并，不覆盖未传字段 |
| 删除 | `apiDeleteAgent(name)` | 复用，内置 Agent 不可删 |
| 详情 | `apiGetAgent(name)` | 加载完整数据填充编辑表单 |

**数据流向**：
```
apiListAgents()
    ↓
agents: AgentInfo[]  (全量)
    ↓ useMemo
subagents: AgentInfo[]  (mode === "subagent")
    ↓
DataTable<AgentInfo>
```

### UI 结构

在 `AgentsPage.tsx` 页面顶部增加 Tab 切换栏，将当前内容拆分为两个 Tab：

```
┌──────────────────────────────────────────────────┐
│  Agent 管理                                      │
│  管理 AI Agent 的模型、提示词和权限配置            │
│                                                  │
│  ┌──────────────┐ ┌──────────────┐               │
│  │  全部 Agent  │ │  子智能体     │   [+ 新建]    │
│  └──────────────┘ └──────────────┘               │
│  ─────────────────────────────────────────────── │
│  DataTable ...                                   │
└──────────────────────────────────────────────────┘
```

- **全部 Agent Tab**：保留现有行为不变，展示所有 Agent
- **子智能体 Tab**：仅展示 `mode === "subagent"` 的 Agent 列表，并提供独立的创建入口

### 子智能体列表

复用现有 `DataTable<AgentInfo>` 组件，展示以下列：

| 列 | 字段 | 说明 |
|----|------|------|
| 名称 | `name` | 可排序、可筛选 |
| 类型 | `builtIn` | 内置/自定义 StatusBadge |
| 模型 | `model` | 可排序 |
| 描述 | `description` | 截断显示 |
| 状态 | `disable`/`hidden` | 显示禁用/隐藏标签 |

行操作：编辑、删除（内置 Agent 不可删除）。

### 创建子智能体表单

新建时自动设置 `mode = "subagent"`，使用简化表单：

| 字段 | 控件 | 必填 | 说明 |
|------|------|------|------|
| 名称 | Input | 是 | kebab-case，创建后不可改 |
| 模型 | Select | 否 | 从已有模型列表选择 |
| 描述 | Input | 否 | 简短描述 |
| 提示词 | Textarea | 否 | Agent 系统提示词 |
| 步数 | Input(number) | 否 | 默认 50，范围 1-200 |
| 禁用 | Checkbox | 否 | 默认关闭 |

省略的字段：variant、temperature、top_p、color、hidden、权限配置（使用全局默认值）。

### 编辑子智能体

编辑时复用简化表单（与创建相同字段集），加载已有数据填充表单。如果用户需要编辑完整字段（权限、温度等），可切换到「全部 Agent」Tab 进行完整编辑。

### 状态管理

无需新增 API，前端通过本地 state 管理：

- `activeTab: "all" | "subagent"` — Tab 切换状态
- `subagents` — 从 `agents` 列表派生（`useMemo` 过滤 `mode === "subagent"`）
- 创建/编辑/删除操作复用现有 `apiCreateAgent` / `apiSetAgent` / `apiDeleteAgent`

### 交互细节

1. Tab 切换时保持搜索和选中状态分离（每个 Tab 独立的 selected 状态）
2. 子智能体 Tab 的「新建」按钮打开简化版表单，自动锁定 `mode = "subagent"`
3. 删除操作使用现有 `ConfirmDialog` 组件
4. 批量操作（多选删除）复用现有 `BatchActionBar`

## 实现要点

- **纯前端改动**：不涉及后端变更，所有操作通过现有 `/web/config/agents` API 完成
- **派生数据**：子智能体列表从全量 Agent 列表通过 `useMemo` 过滤，不额外请求
- **表单简化**：创建子智能体时省略高级字段（variant、temperature 等），减少认知负担
- **编辑一致性**：简化表单的 `apiSetAgent` 调用只传表单包含的字段，不会清空未包含的字段（因为 `handleSet` 是逐字段合并，不是整体覆盖）

### 关键文件

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `web/src/pages/AgentsPage.tsx` | 修改 | 增加 Tab 切换、子智能体列表、简化创建表单 |

## 验收标准

- [ ] Agent 管理页面顶部有「全部 Agent」和「子智能体」两个 Tab
- [ ] 「全部 Agent」Tab 保留现有完整功能不变
- [ ] 「子智能体」Tab 仅展示 `mode=subagent` 的 Agent
- [ ] 子智能体 Tab 有独立的「新建子智能体」按钮，打开简化表单
- [ ] 简化表单创建的 Agent 自动设置 `mode = "subagent"`
- [ ] 可编辑子智能体的核心字段（名称、模型、描述、提示词、步数）
- [ ] 可删除非内置的子智能体
- [ ] Tab 切换不触发额外 API 请求
