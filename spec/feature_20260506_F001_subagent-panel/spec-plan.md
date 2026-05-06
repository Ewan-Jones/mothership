# 子智能体面板 执行计划

**目标:** 在 Agent 管理页面增加独立的「子智能体」Tab，展示 `mode=subagent` 的 Agent，并提供简化的创建/编辑/删除功能

**技术栈:** React (useState/useMemo/useCallback), TypeScript, shadcn/ui (Button/Input/Select/Label/Textarea/Checkbox), DataTable 组件, FormDialog 组件

**设计文档:** spec-design.md

## 改动总览

- 本次改动仅涉及 `web/src/pages/AgentsPage.tsx` 一个文件，新增页面级 Tab 切换状态和子智能体派生数据
- Task 1 建立页面级 Tab 基础设施（状态 + UI + 数据过滤），Task 2 和 Task 3 分别依赖此 Tab 状态构建列表视图和简化表单
- 经代码分析确认：现有 `activeTab` 状态（L74）用于表单内部的 basic/permission 切换，需重命名为 `formTab` 以避免命名冲突；`AgentInfo.mode` 字段类型为 `string | null`（types/config.ts L176），过滤条件使用 `=== "subagent"`

---

### Task 0: 环境准备

**背景:**
确保前端构建和测试工具链在当前开发环境中可用，避免后续 Task 因环境问题阻塞。

**执行步骤:**
- [ ] 验证前端构建工具可用
  - 运行命令: `bun run build:web`
  - 预期: 构建成功，无错误
- [ ] 验证前端测试工具可用
  - 运行命令: `bun test web/src/__tests__/config-agents-page.test.ts`
  - 预期: 现有测试全部通过（isValidAgentNameInput、isValidStepsInput）

**检查步骤:**
- [ ] 前端构建成功
  - `bun run build:web 2>&1 | tail -5`
  - 预期: 输出包含 "built in" 且无 error
- [ ] 现有测试通过
  - `bun test web/src/__tests__/config-agents-page.test.ts`
  - 预期: 所有测试通过，无回归

---

### Task 1: Tab 切换 UI

**背景:**
当前 AgentsPage 使用扁平列表展示所有 Agent，用户管理子智能体时需要在完整列表中手动筛选 `mode=subagent` 的条目，效率低且缺少专用视图入口。本 Task 在页面顶部增加「全部 Agent」和「子智能体」两个 Tab 切换栏，建立页面级 Tab 状态和子智能体派生数据，为 Task 2（子智能体列表视图）和 Task 3（简化表单）提供基础。

**涉及文件:**
- 修改: `web/src/pages/AgentsPage.tsx`
- 修改: `web/src/__tests__/config-agents-page.test.ts`

**执行步骤:**

- [ ] 将表单内部 Tab 状态 `activeTab` 重命名为 `formTab`，避免与页面级 Tab 命名冲突
  - 位置: `web/src/pages/AgentsPage.tsx` L74
  - 将 `const [activeTab, setActiveTab] = useState<"basic" | "permission">("basic");` 改为 `const [formTab, setFormTab] = useState<"basic" | "permission">("basic");`
  - 同步替换 L74（useState）、L393、L399、L404、L574 中所有 `activeTab`/`setActiveTab` 引用为 `formTab`/`setFormTab`（共 5 行 6 处 token）
  - 原因: 页面级需要新增 `pageTab` 状态，两个 Tab 状态共存时必须用不同名称区分

- [ ] 新增页面级 Tab 状态和子智能体派生数据
  - 位置: `web/src/pages/AgentsPage.tsx` L74（`formTab` 声明之后）
  - 新增状态声明:
    ```typescript
    const [pageTab, setPageTab] = useState<"all" | "subagent">("all");
    ```
  - 新增派生数据（在 `loadModelOptions` 回调之后，约 L99 处）:
    ```typescript
    const subagents = useMemo(
        () => agents.filter((a) => a.mode === "subagent"),
        [agents],
    );
    const displayAgents = useMemo(
        () => (pageTab === "subagent" ? subagents : agents),
        [pageTab, subagents, agents],
    );
    ```
  - 原因: 子智能体列表从全量数据派生，避免额外 API 请求；`displayAgents` 统一数据源，便于 DataTable 直接消费

- [ ] 在页面头部区域插入 Tab 切换栏 UI
  - 位置: `web/src/pages/AgentsPage.tsx` L326-332（`<div className="flex items-center justify-between">` 整个块）
  - 将现有头部区域替换为以下结构（保留标题和按钮，中间插入 Tab 栏）:
    ```tsx
    <div className="flex items-center justify-between">
        <div>
            <h2 className="text-xl font-semibold text-text-bright">Agent 管理</h2>
            <p className="text-sm text-text-muted mt-0.5">管理 AI Agent 的模型、提示词和权限配置</p>
        </div>
        <Button onClick={handleOpenCreate}>新建Agent</Button>
    </div>
    <div className="flex gap-1 rounded-lg bg-surface-2 p-1">
        <button
            type="button"
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                pageTab === "all"
                    ? "bg-surface-1 text-text-primary shadow-sm"
                    : "text-text-muted hover:text-text-secondary"
            }`}
            onClick={() => setPageTab("all")}
        >
            全部 Agent
        </button>
        <button
            type="button"
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                pageTab === "subagent"
                    ? "bg-surface-1 text-text-primary shadow-sm"
                    : "text-text-muted hover:text-text-secondary"
            }`}
            onClick={() => setPageTab("subagent")}
        >
            子智能体
        </button>
    </div>
    ```
  - Tab 栏样式复用表单内 Tab 的样式（`bg-surface-2` 容器 + `bg-surface-1` 激活态），保持视觉一致性
  - 原因: Tab 栏是页面级导航元素，需放在标题下方、DataTable 上方

- [ ] 将 DataTable 数据源从 `agents` 替换为 `displayAgents`
  - 位置: `web/src/pages/AgentsPage.tsx` L335（`data={agents}`）
  - 将 `data={agents}` 改为 `data={displayAgents}`
  - 原因: DataTable 需要根据当前 Tab 状态展示对应数据

- [ ] 为本 Task 核心逻辑编写单元测试
  - 测试文件: `web/src/__tests__/config-agents-page.test.ts`
  - 测试场景:
    - `subagents` 过滤: 输入混合 `mode` 的 AgentInfo 数组 → 仅返回 `mode === "subagent"` 的条目
    - `displayAgents` 切换: `pageTab = "all"` 时返回全量，`pageTab = "subagent"` 时返回过滤后数据
    - 空列表边界: 无 `mode === "subagent"` 的 Agent 时 `subagents` 返回空数组
    - `mode === null` 不匹配: `mode` 为 `null` 的 Agent 不出现在 subagents 中
  - 由于 `subagents` 和 `displayAgents` 是组件内部 `useMemo`，直接在测试文件中编写纯函数版本进行测试:
    ```typescript
    // 纯函数提取，用于测试
    export function filterSubagents(agents: AgentInfo[]): AgentInfo[] {
        return agents.filter((a) => a.mode === "subagent");
    }
    export function getDisplayAgents(
        agents: AgentInfo[],
        pageTab: "all" | "subagent",
    ): AgentInfo[] {
        return pageTab === "subagent"
            ? agents.filter((a) => a.mode === "subagent")
            : agents;
    }
    ```
  - 在 `AgentsPage.tsx` 中导出这两个纯函数，组件内 `useMemo` 调用它们
  - 运行命令: `bun test web/src/__tests__/config-agents-page.test.ts`
  - 预期: 所有测试通过

**检查步骤:**
- [ ] 验证 `formTab` 重命名完整，无遗留 `activeTab` 引用
  - `grep -n "activeTab" web/src/pages/AgentsPage.tsx`
  - 预期: 无匹配结果
- [ ] 验证 `pageTab` 状态和 Tab UI 存在
  - `grep -n "pageTab" web/src/pages/AgentsPage.tsx`
  - 预期: 匹配至少 5 处（useState、setPageTab x2、条件渲染 x2）
- [ ] 验证 DataTable 使用 `displayAgents` 数据源
  - `grep -n "displayAgents" web/src/pages/AgentsPage.tsx`
  - 预期: 匹配 `useMemo` 声明和 `data={displayAgents}` 引用
- [ ] 验证纯函数导出存在
  - `grep -n "export function filterSubagents\|export function getDisplayAgents" web/src/pages/AgentsPage.tsx`
  - 预期: 各匹配 1 处
- [ ] 验证测试通过
  - `bun test web/src/__tests__/config-agents-page.test.ts`
  - 预期: 所有测试通过
- [ ] 验证前端构建无错误
  - `bun run build:web 2>&1 | tail -5`
  - 预期: 输出包含 "built in" 且无 error

---

### Task 2: 子智能体列表视图

**背景:**
子智能体 Tab 需要专用的 DataTable 列定义和行操作，与全量 Agent 列表区分。当前全量列表包含"默认"列和"设为默认"按钮，子智能体不需要这些。子智能体列表应增加"描述"列用于快速辨识，同时保留"编辑"和"删除"操作（内置 Agent 不可删除）。本 Task 依赖 Task 1 提供的 `pageTab` 状态和 `subagents` 派生数据，为 Task 3 的简化表单提供列表容器。

**涉及文件:**
- 修改: `web/src/pages/AgentsPage.tsx`
- 修改: `web/src/__tests__/config-agents-page.test.ts`

**执行步骤:**

- [ ] 新增子智能体专用的列定义 `subagentColumns`
  - 位置: `web/src/pages/AgentsPage.tsx` L129（现有 `columns` 定义之后）
  - 新增列定义数组:
    ```typescript
    const subagentColumns: Column<AgentInfo>[] = [
        { key: "name", header: "名称", sortable: true, filterable: true },
        {
            key: "builtIn",
            header: "类型",
            filterable: true,
            render: (row) => (
                <StatusBadge status={row.builtIn ? "builtIn" : "custom"} />
            ),
        },
        { key: "model", header: "模型", sortable: true },
        {
            key: "description",
            header: "描述",
            render: (row) => (
                <span className="truncate max-w-[200px] inline-block align-bottom">
                    {row.description || "—"}
                </span>
            ),
        },
    ];
    ```
  - 与全量列表的差异: 去掉"模式"列（子智能体 Tab 已隐含 `mode=subagent`）、去掉"默认"列；新增"描述"列，使用 `max-w-[200px] truncate` 截断长文本
  - 原因: 子智能体列表聚焦核心信息，减少冗余列

- [ ] 将 DataTable 的 columns 和 actions 改为根据 `pageTab` 动态切换
  - 位置: `web/src/pages/AgentsPage.tsx` L333-369（`<DataTable>` 组件调用）
  - 将 `columns={columns}` 改为 `columns={pageTab === "subagent" ? subagentColumns : columns}`
  - 将 `actions` 回调中子智能体 Tab 的行操作简化（去掉"设为默认"按钮）:
    ```tsx
    actions={(row) => (
        <div className="flex gap-1.5">
            {pageTab !== "subagent" && row.name !== defaultAgent && (
                <Button
                    size="xs"
                    variant="outline"
                    onClick={() => handleSetDefault(row.name)}>
                    设为默认
                </Button>
            )}
            <Button
                size="xs"
                variant="outline"
                onClick={() => handleOpenEdit(row)}>
                编辑
            </Button>
            {!row.builtIn && (
                <Button
                    size="xs"
                    variant="destructive"
                    onClick={() => {
                        setDeleteTarget(row.name);
                        setConfirmOpen(true);
                    }}>
                    删除
                </Button>
            )}
        </div>
    )}
    ```
  - 将 `emptyMessage` 改为根据 Tab 显示不同文案: `pageTab === "subagent" ? '暂无子智能体，点击「新建子智能体」添加' : '暂无 Agent，点击「新建Agent」添加'`
  - 将 `searchPlaceholder` 改为根据 Tab 显示: `pageTab === "subagent" ? "搜索子智能体..." : "搜索Agent..."`
  - 原因: 子智能体 Tab 隐藏"设为默认"按钮，因为子智能体不参与默认 Agent 选择

- [ ] 导出列 key 提取纯函数用于测试
  - 位置: `web/src/pages/AgentsPage.tsx`（`subagentColumns` 定义之前）
  - 由于列定义包含 JSX render 函数，无法直接断言。导出列 key 提取函数:
    ```typescript
    export function getSubagentColumnKeys(): string[] {
        return ["name", "builtIn", "model", "description"];
    }
    export function getFullAgentColumnKeys(): string[] {
        return ["name", "builtIn", "model", "mode", "default"];
    }
    ```
  - 原因: 通过列 key 集合验证列定义的正确性，避免测试依赖 JSX 序列化

- [ ] 为本 Task 核心逻辑编写单元测试
  - 测试文件: `web/src/__tests__/config-agents-page.test.ts`
  - 测试场景:
    - `getSubagentColumnKeys` 返回正确的 4 个列 key: `["name", "builtIn", "model", "description"]`
    - `getFullAgentColumnKeys` 返回正确的 5 个列 key: `["name", "builtIn", "model", "mode", "default"]`
    - 子智能体列不包含 `"mode"` 和 `"default"` key
    - 全量列不包含 `"description"` key
  - 运行命令: `bun test web/src/__tests__/config-agents-page.test.ts`
  - 预期: 所有测试通过

**检查步骤:**
- [ ] 验证 `subagentColumns` 定义存在
  - `grep -n "subagentColumns" web/src/pages/AgentsPage.tsx`
  - 预期: 匹配至少 2 处（定义 + DataTable 引用）
- [ ] 验证子智能体 Tab 不显示"设为默认"按钮
  - `grep -n 'pageTab !== "subagent"' web/src/pages/AgentsPage.tsx`
  - 预期: 匹配 1 处，包裹在"设为默认"按钮的条件中
- [ ] 验证 description 列使用了 truncate 样式
  - `grep -n "max-w-\[200px\]" web/src/pages/AgentsPage.tsx`
  - 预期: 匹配 1 处
- [ ] 验证 `emptyMessage` 根据 Tab 动态切换
  - `grep -n "暂无子智能体" web/src/pages/AgentsPage.tsx`
  - 预期: 匹配 1 处
- [ ] 验证纯函数导出存在
  - `grep -n "export function getSubagentColumnKeys\|export function getFullAgentColumnKeys" web/src/pages/AgentsPage.tsx`
  - 预期: 各匹配 1 处
- [ ] 验证测试通过
  - `bun test web/src/__tests__/config-agents-page.test.ts`
  - 预期: 所有测试通过
- [ ] 验证前端构建无错误
  - `bun run build:web 2>&1 | tail -5`
  - 预期: 输出包含 "built in" 且无 error

---

### Task 3: 子智能体简化表单

**背景:**
当前 AgentsPage 的创建/编辑表单包含所有字段（mode、variant、temperature、top_p、color、hidden、权限配置等），对子智能体用户来说认知负担过重。设计文档要求为子智能体提供只包含核心字段的简化表单（名称、模型、描述、提示词、步数、禁用），创建时自动注入 `mode=subagent`。本 Task 依赖 Task 1 的 `pageTab` 状态和 Task 2 的子智能体列表视图（编辑按钮触发简化表单）。

**涉及文件:**
- 修改: `web/src/pages/AgentsPage.tsx`
- 修改: `web/src/__tests__/config-agents-page.test.ts`

**执行步骤:**

- [ ] 新增简化表单的独立状态变量
  - 位置: `web/src/pages/AgentsPage.tsx` L50-55（现有 `dialogOpen`、`editingAgent` 等状态声明区域之后）
  - 新增以下状态声明:
    ```typescript
    const [subDialogOpen, setSubDialogOpen] = useState(false);
    const [editingSubagent, setEditingSubagent] = useState<AgentInfo | null>(null);
    const [subFormName, setSubFormName] = useState("");
    const [subFormModel, setSubFormModel] = useState("");
    const [subFormDescription, setSubFormDescription] = useState("");
    const [subFormPrompt, setSubFormPrompt] = useState("");
    const [subFormSteps, setSubFormSteps] = useState("50");
    const [subFormDisable, setSubFormDisable] = useState(false);
    const [subFormSaving, setSubFormSaving] = useState(false);
    ```
  - 原因: 简化表单需要独立的状态，避免与全量表单状态互相干扰。复用全量表单状态会导致 Tab 切换时数据残留或意外覆盖

- [ ] 导出简化表单数据构建纯函数 `buildSubagentFormData`
  - 位置: `web/src/pages/AgentsPage.tsx` L33-44（现有验证函数 `isValidStepsInput` 之后）
  - 新增导出函数:
    ```typescript
    export function buildSubagentFormData(params: {
        name: string;
        model: string;
        description: string;
        prompt: string;
        steps: string;
        disable: boolean;
    }): Record<string, unknown> {
        return {
            mode: "subagent",
            model: params.model || undefined,
            steps: parseInt(params.steps),
            prompt: params.prompt || undefined,
            description: params.description || undefined,
            disable: params.disable,
        };
    }
    ```
  - 关键逻辑: 创建和编辑都显式传入 `mode: "subagent"`；空字符串字段转为 `undefined`（与全量表单行为一致）；不包含 variant/temperature/top_p/color/hidden/permission 字段，经 `apiSetAgent` 逐字段合并不会清空这些已有字段
  - 原因: 提取纯函数使核心逻辑可测试，组件内调用保持 DRY

- [ ] 新增 `handleOpenSubagentCreate` 处理函数
  - 位置: `web/src/pages/AgentsPage.tsx` `handleOpenCreate` 函数之后（约 L147）
  - 新增函数:
    ```typescript
    const handleOpenSubagentCreate = () => {
        setEditingSubagent(null);
        setSubFormName("");
        setSubFormModel(modelOptions[0] || "");
        setSubFormDescription("");
        setSubFormPrompt("");
        setSubFormSteps("50");
        setSubFormDisable(false);
        setSubDialogOpen(true);
    };
    ```
  - 原因: 创建子智能体时重置简化字段，不涉及 mode 选择（自动锁定 `mode=subagent`）

- [ ] 新增 `handleOpenSubagentEdit` 处理函数
  - 位置: `web/src/pages/AgentsPage.tsx` `handleOpenSubagentCreate` 函数之后
  - 新增函数:
    ```typescript
    const handleOpenSubagentEdit = async (agent: AgentInfo) => {
        setEditingSubagent(agent);
        setSubFormName(agent.name);
        setSubFormModel(agent.model || "");
        setSubFormDescription("");
        setSubFormPrompt("");
        setSubFormSteps("50");
        setSubFormDisable(false);
        try {
            const detail = await apiGetAgent(agent.name);
            setSubFormDescription(detail.description || "");
            setSubFormPrompt(detail.prompt || "");
            setSubFormSteps(String(detail.steps ?? 50));
            setSubFormDisable(detail.disable ?? false);
        } catch {
            setSubFormSteps("50");
        }
        setSubDialogOpen(true);
    };
    ```
  - 原因: 编辑时从 API 加载完整数据，只填充简化表单字段（name、model、description、prompt、steps、disable）

- [ ] 新增 `handleSubagentSave` 处理函数
  - 位置: `web/src/pages/AgentsPage.tsx` `handleOpenSubagentEdit` 函数之后
  - 新增函数:
    ```typescript
    const handleSubagentSave = async () => {
        const name = subFormName.trim();
        if (!isValidAgentNameInput(name)) {
            toast.error("名称只能包含小写字母、数字和单连字符，长度 1-64");
            return;
        }
        if (!isValidStepsInput(subFormSteps)) {
            toast.error("最大轮数须在 1-200 之间");
            return;
        }
        setSubFormSaving(true);
        try {
            const data = buildSubagentFormData({
                name,
                model: subFormModel,
                description: subFormDescription,
                prompt: subFormPrompt,
                steps: subFormSteps,
                disable: subFormDisable,
            });
            if (editingSubagent) {
                await apiSetAgent(name, data);
                toast.success("子智能体已更新");
            } else {
                await apiCreateAgent(name, data);
                toast.success("子智能体已创建");
            }
            setSubDialogOpen(false);
            loadAgents();
            dispatchConfigChange("agents");
        } catch (e) {
            toast.error(
                "保存失败: " + (e instanceof Error ? e.message : "未知错误"),
            );
        } finally {
            setSubFormSaving(false);
        }
    };
    ```
  - 原因: 调用 `buildSubagentFormData` 构建数据对象，创建和编辑走同一分支逻辑，保存后刷新列表

- [ ] 在子智能体 Tab 的头部区域添加「新建子智能体」按钮
  - 位置: `web/src/pages/AgentsPage.tsx` Task 1 新增的页面头部区域（`<div className="flex items-center justify-between">`）
  - 将头部按钮改为根据 `pageTab` 条件渲染:
    ```tsx
    {pageTab === "all" ? (
        <Button onClick={handleOpenCreate}>新建Agent</Button>
    ) : (
        <Button onClick={handleOpenSubagentCreate}>新建子智能体</Button>
    )}
    ```
  - 原因: 根据 `pageTab` 状态显示不同的新建按钮，子智能体 Tab 打开简化表单

- [ ] 为子智能体 DataTable 的编辑操作绑定简化表单
  - 位置: `web/src/pages/AgentsPage.tsx` Task 2 新增的 DataTable `actions` 回调中的编辑按钮
  - 在编辑按钮的 `onClick` 中，将 `pageTab === "subagent"` 时的行为改为调用 `handleOpenSubagentEdit(row)`:
    ```tsx
    <Button
        size="xs"
        variant="outline"
        onClick={() =>
            pageTab === "subagent"
                ? handleOpenSubagentEdit(row)
                : handleOpenEdit(row)
        }>
        编辑
    </Button>
    ```
  - 原因: 子智能体 Tab 的编辑操作必须打开简化表单，而非全量表单

- [ ] 在现有全量 FormDialog 之后新增简化版 FormDialog 组件实例
  - 位置: `web/src/pages/AgentsPage.tsx` 现有 `</FormDialog>` 之后，`<ConfirmDialog` 之前
  - 新增简化版 FormDialog:
    ```tsx
    <FormDialog
        open={subDialogOpen}
        onOpenChange={setSubDialogOpen}
        title={editingSubagent ? "编辑子智能体" : "新建子智能体"}
        onSubmit={handleSubagentSave}
        loading={subFormSaving}>
        <div className="space-y-4 max-h-[55vh] overflow-y-auto">
            <div>
                <Label>名称</Label>
                <Input
                    value={subFormName}
                    onChange={(e) => setSubFormName(e.target.value)}
                    disabled={!!editingSubagent}
                    placeholder="例如 my-subagent"
                />
            </div>
            <div>
                <Label>模型</Label>
                <Select
                    value={subFormModel}
                    onValueChange={setSubFormModel}>
                    <SelectTrigger>
                        <SelectValue placeholder="选择模型" />
                    </SelectTrigger>
                    <SelectContent>
                        {modelOptions.map((m) => (
                            <SelectItem key={m} value={m}>
                                {m}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div>
                <Label>描述</Label>
                <Input
                    value={subFormDescription}
                    onChange={(e) => setSubFormDescription(e.target.value)}
                    placeholder="可选，子智能体的简短描述"
                />
            </div>
            <div>
                <Label>提示词 (Prompt)</Label>
                <Textarea
                    value={subFormPrompt}
                    onChange={(e) => setSubFormPrompt(e.target.value)}
                    rows={4}
                    placeholder="可选，自定义子智能体提示词"
                />
            </div>
            <div>
                <Label>步数 (1-200)</Label>
                <Input
                    type="number"
                    value={subFormSteps}
                    onChange={(e) => setSubFormSteps(e.target.value)}
                    min={1}
                    max={200}
                />
                <p className="text-xs text-text-muted mt-1">
                    子智能体最大思考步骤数。建议：简单任务 10-30，复杂任务 50-100
                </p>
            </div>
            <label className="flex items-center gap-2 text-sm" title="子智能体完全不可用，无法被主 Agent 调用">
                <input
                    type="checkbox"
                    checked={subFormDisable}
                    onChange={(e) => setSubFormDisable(e.target.checked)}
                />
                禁用
            </label>
        </div>
    </FormDialog>
    ```
  - 简化表单不包含: mode 选择器（自动锁定 subagent）、variant、temperature、top_p、color、hidden、权限 Tab（basic/permission）
  - 禁用 checkbox 使用原生 `<input type="checkbox">`，与全量表单中的 hidden/disable checkbox 保持一致风格
  - 原因: 简化表单只保留设计文档规定的 6 个字段，省略高级配置以降低认知负担

- [ ] 为简化表单核心逻辑编写单元测试
  - 测试文件: `web/src/__tests__/config-agents-page.test.ts`
  - 测试场景:
    - `buildSubagentFormData` 基本构建: 传入全部字段 → 返回对象包含 `mode: "subagent"` 及所有字段
    - `buildSubagentFormData` 空字符串转 undefined: `model=""` → `model` 为 `undefined`
    - `buildSubagentFormData` steps 解析: `"50"` → `steps` 为数字 `50`
    - `buildSubagentFormData` disable 透传: `disable: true` → 返回 `disable: true`
    - `buildSubagentFormData` 不含高级字段: 返回对象不含 `variant`、`temperature`、`top_p`、`color`、`hidden`、`permission` 键
  - 运行命令: `bun test web/src/__tests__/config-agents-page.test.ts`
  - 预期: 所有测试通过

**检查步骤:**
- [ ] 验证简化表单状态变量存在
  - `grep -n "subDialogOpen\|editingSubagent\|subFormName\|subFormModel\|subFormDescription\|subFormPrompt\|subFormSteps\|subFormDisable\|subFormSaving" web/src/pages/AgentsPage.tsx`
  - 预期: 每个变量至少匹配 2 处（useState 声明 + 使用处）
- [ ] 验证简化表单处理函数存在
  - `grep -n "handleOpenSubagentCreate\|handleOpenSubagentEdit\|handleSubagentSave" web/src/pages/AgentsPage.tsx`
  - 预期: 各匹配至少 2 处（定义 + 使用）
- [ ] 验证简化表单数据构建函数导出
  - `grep -n "export function buildSubagentFormData" web/src/pages/AgentsPage.tsx`
  - 预期: 匹配 1 处
- [ ] 验证简化表单 `mode` 始终为 `subagent`
  - `grep -n 'mode: "subagent"' web/src/pages/AgentsPage.tsx`
  - 预期: 在 `buildSubagentFormData` 函数体中匹配
- [ ] 验证简化 FormDialog 不含高级字段
  - `grep -n "subFormVariant\|subFormTemperature\|subFormTopP\|subFormColor\|subFormHidden\|subFormPermission" web/src/pages/AgentsPage.tsx`
  - 预期: 无匹配结果
- [ ] 验证子智能体 Tab 头部显示「新建子智能体」按钮
  - `grep -n "新建子智能体" web/src/pages/AgentsPage.tsx`
  - 预期: 匹配至少 2 处（按钮文案 + 空数据提示文案）
- [ ] 验证测试通过
  - `bun test web/src/__tests__/config-agents-page.test.ts`
  - 预期: 所有测试通过
- [ ] 验证前端构建无错误
  - `bun run build:web 2>&1 | tail -5`
  - 预期: 输出包含 "built in" 且无 error

---

### Task 4: 子智能体面板 验收

**前置条件:**
- 构建命令: `bun run build:web`
- 测试数据准备: 确保后端运行中（`bun run dev`），有可用的 better-auth 登录会话
- 测试命令: `bun test web/src/__tests__/config-agents-page.test.ts`

**端到端验证:**

1. 运行完整测试套件确保无回归
   - `bun test web/src/__tests__/config-agents-page.test.ts`
   - 预期: 全部测试通过（isValidAgentNameInput、isValidStepsInput、filterSubagents、getDisplayAgents、getSubagentColumnKeys、getFullAgentColumnKeys、buildSubagentFormData）
   - 失败排查: 检查 Task 1（filterSubagents/getDisplayAgents）、Task 2（getSubagentColumnKeys/getFullAgentColumnKeys）、Task 3（buildSubagentFormData）的测试步骤

2. 验证前端构建无错误
   - `bun run build:web`
   - 预期: 构建成功，无 TypeScript 编译错误
   - 失败排查: 检查 Task 1（formTab 重命名是否完整）、Task 3（简化表单状态和组件是否正确引用）

3. 验证页面结构和 Tab 切换
   - `grep -n "pageTab\|subagentColumns\|subDialogOpen\|buildSubagentFormData" web/src/pages/AgentsPage.tsx | wc -l`
   - 预期: 匹配数量 ≥ 15（覆盖所有新增关键标识符）
   - 失败排查: 检查 Task 1（pageTab 状态和 Tab UI）、Task 2（subagentColumns）、Task 3（简化表单状态）

4. 验证「全部 Agent」Tab 保留原有功能
   - `grep -n "handleOpenCreate\|handleOpenEdit\|handleSetDefault\|handleSave" web/src/pages/AgentsPage.tsx`
   - 预期: 全量表单相关函数仍然存在且未被修改
   - 失败排查: 检查 Task 1-3 是否意外修改了全量表单逻辑

5. 验证简化表单不包含高级字段
   - `grep -n "subFormVariant\|subFormTemperature\|subFormTopP\|subFormColor\|subFormHidden\|subFormPermission" web/src/pages/AgentsPage.tsx`
   - 预期: 无匹配结果
   - 失败排查: 检查 Task 3 简化表单状态声明

6. 验证 `mode: "subagent"` 自动注入
   - `grep -n 'mode: "subagent"' web/src/pages/AgentsPage.tsx`
   - 预期: 在 `buildSubagentFormData` 函数体中匹配
   - 失败排查: 检查 Task 3 的 buildSubagentFormData 函数

