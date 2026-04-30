# 环境多实例支持 执行计划

**目标:** 改造环境与实例的一对一关系为一对多，支持每个环境同时持有多个运行中的实例，每个实例拥有独立会话，前端通过下拉菜单切换和创建实例。

**技术栈:** Hono (后端路由), Bun test (后端测试), React + shadcn/ui DropdownMenu (前端)

**设计文档:** spec/feature_20260430_F001_env-multi-instance/spec-design.md

## 改动总览

- 本次改动涉及后端实例服务层（`src/services/instance.ts`）、后端路由层（`environments.ts`、`instances.ts`）、前端 API 客户端（`web/src/api/client.ts`）、前端类型定义（`web/src/types/index.ts`）和前端 EnvironmentsPage 页面（`web/src/pages/EnvironmentsPage.tsx`），共 5 个源文件修改 + 3 个测试文件修改（`instance-service.test.ts`、`web-environments.test.ts`、`instance-routes.test.ts`）
- Task 1 扩展数据模型（无外部依赖），Task 2 修改后端路由（依赖 Task 1 的新函数），Task 3 扩展前端 API 和类型（可与 Task 1-2 并行），Task 4 改造前端 UI（依赖 Task 1-3）
- 关键设计决策：使用内存计数器 `envInstanceCounters` 分配递增编号，`DropdownMenu` 组件已存在于 `web/components/ui/dropdown-menu.tsx`，无需新建

---

### Task 0: 环境准备

**背景:**
确保构建和测试工具链在当前开发环境中可用，避免后续 Task 因环境问题阻塞。

**执行步骤:**

- [ ] 验证后端构建和测试可用
  - 运行命令: `bun test src/__tests__/instance-service.test.ts --dry-run 2>&1 || true && bun test src/__tests__/instance-service.test.ts 2>&1 | tail -5`
  - 预期: 测试框架可用，无配置错误

- [ ] 验证前端构建可用
  - 运行命令: `bun run build:web 2>&1 | tail -5`
  - 预期: 构建成功，输出包含 "built in"

**检查步骤:**

- [ ] 后端测试框架可用
  - `bun test src/__tests__/instance-service.test.ts 2>&1 | tail -5`
  - 预期: 测试完成（pass 或 fail 均可，不应报框架错误）

- [ ] 前端构建成功
  - `bun run build:web 2>&1 | tail -5`
  - 预期: 构建成功，输出包含 "built in"

---

### Task 1: Instance 数据模型扩展

**背景:**
当前 `SpawnedInstance` 接口不含环境内编号字段，`spawnInstanceFromEnvironment` 内部有硬编码的单实例检查（`hasRunningInstance`）阻止同一环境创建多个实例。本 Task 扩展数据模型并解除单实例限制，为 Task 2（后端 API）提供 `listInstancesByEnvironment` / `getRunningInstancesByEnvironment` 等新查询函数。本 Task 无外部依赖，是后续所有 Task 的基础。

**涉及文件:**
- 修改: `src/services/instance.ts`
- 修改: `src/__tests__/instance-service.test.ts`

**执行步骤:**

- [ ] 在 `SpawnedInstance` 接口中新增 `instanceNumber` 字段
  - 位置: `src/services/instance.ts` ~L12 接口定义内，`sessionId?: string;` 之后
  - 新增字段: `instanceNumber: number;`
  - 原因: 环境内实例编号（1, 2, 3...），用于前端展示"实例 1"、"实例 2"

- [ ] 在模块顶层新增 `envInstanceCounters` 内存计数器
  - 位置: `src/services/instance.ts` ~L30 `const instances = new Map<...>()` 之后
  - 新增代码:
    ```typescript
    const envInstanceCounters = new Map<string, number>();
    ```
  - 原因: 跟踪每个环境的下一个实例编号，保证编号严格递增不回收

- [ ] 新增 `getNextInstanceNumber` 辅助函数
  - 位置: `src/services/instance.ts` ~L33 `allocatePort()` 函数之前
  - 新增代码:
    ```typescript
    function getNextInstanceNumber(environmentId: string): number {
      const current = envInstanceCounters.get(environmentId) ?? 0;
      const next = current + 1;
      envInstanceCounters.set(environmentId, next);
      return next;
    }
    ```
  - 原因: 封装编号分配逻辑，Map 的 get+set 在 Node.js 单线程中天然原子

- [ ] 新增 `listInstancesByEnvironment` 导出函数
  - 位置: `src/services/instance.ts` ~L127 `findRunningInstanceByEnvironment` 函数之后
  - 新增代码:
    ```typescript
    export function listInstancesByEnvironment(environmentId: string): SpawnedInstance[] {
      return Array.from(instances.values()).filter(
        (i) => i.environmentId === environmentId && i.status !== "stopped" && i.status !== "error",
      );
    }
    ```
  - 原因: 返回指定环境的活跃实例（starting/running），供 Task 2 的 `GET /web/environments/:id/instances` 路由使用

- [ ] 新增 `getRunningInstancesByEnvironment` 导出函数
  - 位置: `src/services/instance.ts` 紧接 `listInstancesByEnvironment` 之后
  - 新增代码:
    ```typescript
    export function getRunningInstancesByEnvironment(environmentId: string): SpawnedInstance[] {
      return Array.from(instances.values()).filter(
        (i) => i.environmentId === environmentId && i.status === "running",
      );
    }
    ```
  - 原因: 返回指定环境的运行中实例（仅 status === "running"），供 Task 2 的 enter 路由按 `instance_number` 查找使用

- [ ] 移除 `spawnInstanceFromEnvironment` 中的单实例检查，改为每次创建新 session
  - 位置: `src/services/instance.ts` ~L171-L174（`hasRunningInstance` 检查块）
  - 删除以下 3 行:
    ```typescript
    const hasRunningInstance = Array.from(instances.values()).some(
      (i) => i.environmentId === environmentId && i.status !== "stopped" && i.status !== "error",
    );
    if (hasRunningInstance) throw new Error("Environment already has a running instance");
    ```
  - 原因: 解除单实例限制，允许同一环境创建多个实例

- [ ] 修改 `spawnInstanceFromEnvironment` 的 session 创建逻辑 — 每次都创建新 session
  - 位置: `src/services/instance.ts` ~L177-L189（session 创建块）
  - 将原有"复用已有 session"逻辑替换为始终创建新 session:
    ```typescript
    const session = storeCreateSession({
      environmentId,
      title: env.agentName || env.name,
      source: "acp",
      userId,
    });
    const sessionId = session.id;
    ```
  - 删除原有的 `let sessionId` 声明、`const existing = storeListSessionsByEnvironment(...)` 判断块
  - 原因: 多实例场景下每个实例必须有独立 session，对话历史完全隔离

- [ ] 在 `spawnInstanceFromEnvironment` 的 instance 对象创建处新增 `instanceNumber` 赋值
  - 位置: `src/services/instance.ts` ~L204 instance 字面量构造处
  - 在 instance 对象属性中新增:
    ```typescript
    instanceNumber: getNextInstanceNumber(environmentId),
    ```
  - 完整 instance 构造应为:
    ```typescript
    const instance: SpawnedInstance = {
      id, userId, port, pid: null,
      status: "starting", command, error: null, apiKey: env.secret,
      createdAt: new Date(),
      environmentId,
      sessionId,
      instanceNumber: getNextInstanceNumber(environmentId),
    };
    ```
  - 原因: 每个新实例分配递增编号

- [ ] 在 `spawnInstance` 函数中为非环境实例设置默认 `instanceNumber`
  - 位置: `src/services/instance.ts` ~L77 instance 字面量构造处
  - 新增 `instanceNumber: 1` 字段:
    ```typescript
    const instance: SpawnedInstance = {
      id, userId, port, pid: null,
      status: "starting", command, error: null, apiKey,
      createdAt: new Date(),
      instanceNumber: 1,
    };
    ```
  - 原因: 非环境实例（通过 `spawnInstance` 直接创建）不属于任何环境，设置固定值保证接口一致

- [ ] 为本 Task 核心逻辑编写单元测试
  - 测试文件: `src/__tests__/instance-service.test.ts`
  - 在 `await import("../services/instance")` 的解构导入中新增:
    ```typescript
    listInstancesByEnvironment,
    getRunningInstancesByEnvironment,
    spawnInstanceFromEnvironment,
    ```
  - 在 mock 模块区域新增 `../store` 的 mock（`spawnInstanceFromEnvironment` 依赖 store 函数）:
    ```typescript
    mock.module("../store", () => ({
      storeGetEnvironment: mock((id: string) => ({
        id,
        userId: "test-user",
        agentName: "test-agent",
        name: "test-env",
        workspacePath: process.cwd(),
        secret: "env_secret_test123",
      })),
      storeCreateSession: mock((req: any) => ({
        id: `session_${req.idPrefix || ""}${Date.now()}`,
        environmentId: req.environmentId,
        title: req.title,
        status: "idle",
        source: req.source,
        userId: req.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      storeListSessionsByEnvironment: mock(() => []),
    }));
    ```
  - 新增 mock `../utils/executable`:
    ```typescript
    mock.module("../utils/executable", () => ({
      resolveExecutable: mock(() => "/usr/local/bin/acp-link"),
    }));
    ```
  - 新增测试场景:
    - **多实例创建**: 对同一 `environmentId` 连续调用 `spawnInstanceFromEnvironment` 两次 → 第二次不抛出 "already has a running instance" 错误，返回新实例
    - **编号递增**: 连续创建 3 个实例 → `instanceNumber` 分别为 1、2、3
    - **编号不回收**: 创建实例后停止，再创建新实例 → 新实例编号为 2（不回收已停止实例的编号 1）
    - **listInstancesByEnvironment**: 同一环境创建 2 个实例（均为 running），1 个为 stopped → 仅返回 2 个活跃实例
    - **getRunningInstancesByEnvironment**: 同一环境创建 2 个 running 实例，1 个 starting 实例 → 仅返回 2 个 running 实例
    - **独立 session**: 连续调用 `spawnInstanceFromEnvironment` 两次 → `storeCreateSession` 被调用 2 次（不复用已有 session）
  - 运行命令: `bun test src/__tests__/instance-service.test.ts`
  - 预期: 所有测试通过

**检查步骤:**

- [ ] 验证 `SpawnedInstance` 接口包含 `instanceNumber` 字段
  - `grep -n 'instanceNumber' src/services/instance.ts`
  - 预期: 输出包含接口定义 `instanceNumber: number;` 和 `getNextInstanceNumber` 函数

- [ ] 验证单实例检查已移除
  - `grep -n 'hasRunningInstance\|already has a running instance' src/services/instance.ts`
  - 预期: 无输出（已删除）

- [ ] 验证新导出函数存在
  - `grep -n 'export function listInstancesByEnvironment\|export function getRunningInstancesByEnvironment' src/services/instance.ts`
  - 预期: 输出 2 行，分别匹配两个函数签名

- [ ] 验证 `envInstanceCounters` 和 `getNextInstanceNumber` 存在
  - `grep -n 'envInstanceCounters\|getNextInstanceNumber' src/services/instance.ts`
  - 预期: 输出包含计数器声明和函数定义

- [ ] 运行单元测试
  - `bun test src/__tests__/instance-service.test.ts`
  - 预期: 所有测试通过，无失败

- [ ] 验证 `spawnInstanceFromEnvironment` 每次创建新 session
  - `grep -A2 'storeCreateSession' src/services/instance.ts`
  - 预期: `spawnInstanceFromEnvironment` 中无 `storeListSessionsByEnvironment` 的调用（已删除复用逻辑）

---

### Task 2: 后端 API 改造

**背景:**
当前 `environments.ts` 的 `GET /environments` 返回单个 `instance_id` / `instance_status`，`POST /:id/enter` 自动查找或创建唯一实例。改造后需支持多实例：列表接口返回 `instances` 数组和 `instances_count`，enter 接口支持 `instance_number` body 参数指定进入哪个实例。本 Task 依赖 Task 1 提供的 `listInstancesByEnvironment`、`getRunningInstancesByEnvironment` 函数，以及 `SpawnedInstance.instanceNumber` 字段。本 Task 的输出被 Task 4（前端 Dashboard）依赖。

**涉及文件:**
- 修改: `src/routes/web/environments.ts`
- 修改: `src/routes/web/instances.ts`
- 修改: `src/__tests__/web-environments.test.ts`
- 修改: `src/__tests__/instance-routes.test.ts`

**执行步骤:**

- [ ] 在 `environments.ts` 的 import 语句中新增 `listInstancesByEnvironment` 和 `getRunningInstancesByEnvironment`
  - 位置: `src/routes/web/environments.ts` ~L14-L17 import 块
  - 将现有 import:
    ```typescript
    import {
        findRunningInstanceByEnvironment,
        spawnInstanceFromEnvironment,
    } from "../../services/instance";
    ```
    替换为:
    ```typescript
    import {
        findRunningInstanceByEnvironment,
        spawnInstanceFromEnvironment,
        listInstancesByEnvironment,
        getRunningInstancesByEnvironment,
    } from "../../services/instance";
    ```
  - 原因: 后续 `GET /environments` 和 `POST /:id/enter` 路由需要这些函数

- [ ] 改造 `GET /environments` 返回值 — 将单个 `instance_status` / `instance_id` 替换为 `instances` 数组 + `instances_count`
  - 位置: `src/routes/web/environments.ts` ~L76-L100（`app.get("/environments", ...)` 处理函数）
  - 删除 ~L92-L98 的旧代码:
    ```typescript
    // Check for running instance
    const runningInst = findRunningInstanceByEnvironment(env.id);
    return {
      ...sanitizeResponse(env),
      session_id: sessions[0].id,
      instance_status: runningInst ? runningInst.status : null,
      instance_id: runningInst ? runningInst.id : null,
    };
    ```
  - 替换为:
    ```typescript
    // Get active instances for this environment
    const activeInstances = listInstancesByEnvironment(env.id);
    return {
      ...sanitizeResponse(env),
      session_id: sessions[0].id,
      instances: activeInstances.map((inst) => ({
        id: inst.id,
        instance_number: inst.instanceNumber,
        status: inst.status,
        session_id: inst.sessionId ?? null,
        port: inst.port,
        created_at: Math.floor(inst.createdAt.getTime() / 1000),
      })),
      instances_count: activeInstances.length,
    };
    ```
  - 原因: 前端需要完整实例列表来渲染下拉菜单，`instances_count` 用于卡片头部显示"实例 xN"

- [ ] 改造 `POST /environments/:id/enter` — 支持 `instance_number` body 参数
  - 位置: `src/routes/web/environments.ts` ~L298-L358（`app.post("/environments/:id/enter", ...)` 处理函数）
  - 在 ~L309（环境存在性检查之后、实例查找之前）插入 body 解析:
    ```typescript
    let body: any = {};
    try { body = await c.req.json(); } catch { /* empty body is ok */ }
    const instanceNumber = body.instance_number as number | undefined;
    ```
  - 将 ~L311-L327 的旧逻辑:
    ```typescript
    let inst = findRunningInstanceByEnvironment(envId);
    if (!inst) {
      try {
        inst = await spawnInstanceFromEnvironment(user.id, envId);
      } catch (err: any) {
        if (err.message?.includes("already has a running instance")) {
          inst = findRunningInstanceByEnvironment(envId);
        } else {
          return c.json(
            { error: { type: "CONFIG_WRITE_ERROR", message: err.message } },
            500,
          );
        }
      }
    }
    ```
    替换为:
    ```typescript
    let inst: import("../../services/instance").SpawnedInstance | undefined;

    if (instanceNumber !== undefined) {
      // Find instance by number
      const runningInstances = getRunningInstancesByEnvironment(envId);
      inst = runningInstances.find((i) => i.instanceNumber === instanceNumber);
      if (!inst) {
        return c.json(
          { error: { type: "NOT_FOUND", message: `实例 ${instanceNumber} 不存在或未运行` } },
          404,
        );
      }
    } else {
      // Default: find or spawn first running instance
      const runningInstances = getRunningInstancesByEnvironment(envId);
      if (runningInstances.length > 0) {
        inst = runningInstances[0];
      } else {
        try {
          inst = await spawnInstanceFromEnvironment(user.id, envId);
        } catch (err: any) {
          return c.json(
            { error: { type: "CONFIG_WRITE_ERROR", message: err.message } },
            500,
          );
        }
      }
    }
    ```
  - 原因: `instance_number` 参数允许前端指定进入特定编号的实例；移除旧的 "already has a running instance" race condition 处理（Task 1 已移除单实例限制）

- [ ] 在 enter 路由的响应中新增 `instance_number` 字段
  - 位置: `src/routes/web/environments.ts` ~L352-L358（`return c.json(...)` 处）
  - 将:
    ```typescript
    return c.json({
      session_id: sessionId,
      instance_id: inst.id,
      instance_status: inst.status,
      environment_id: envId,
    }, 200);
    ```
    替换为:
    ```typescript
    return c.json({
      session_id: sessionId,
      instance_id: inst.id,
      instance_number: inst.instanceNumber,
      instance_status: inst.status,
      environment_id: envId,
    }, 200);
    ```
  - 原因: 前端需要 `instance_number` 来在 UI 中展示当前进入的实例编号

- [ ] 新增 `GET /environments/:id/instances` 路由
  - 位置: `src/routes/web/environments.ts`，在 `app.post("/environments/:id/enter", ...)` 路由之后（~L358 之后）插入
  - 新增代码:
    ```typescript
    /** GET /web/environments/:id/instances — List active instances for an environment */
    app.get("/environments/:id/instances", sessionAuth, async (c) => {
      const user = c.get("user")!;
      const envId = c.req.param("id")!;
      const env = storeGetEnvironment(envId);
      if (!env || env.userId !== user.id) {
        return c.json(
          { error: { type: "NOT_FOUND", message: "环境不存在" } },
          404,
        );
      }

      const activeInstances = listInstancesByEnvironment(envId);
      return c.json({
        environment_id: envId,
        instances: activeInstances.map((inst) => ({
          id: inst.id,
          instance_number: inst.instanceNumber,
          status: inst.status,
          session_id: inst.sessionId ?? null,
          port: inst.port,
          created_at: Math.floor(inst.createdAt.getTime() / 1000),
        })),
      }, 200);
    });
    ```
  - 原因: 前端下拉菜单需要按需获取某个环境的活跃实例列表，不必在每次 Dashboard 刷新时加载所有环境的所有实例

- [ ] 在 `instances.ts` 的 `toResponse` 中新增 `instance_number` 字段
  - 位置: `src/routes/web/instances.ts` ~L8-L19（`toResponse` 函数）
  - 在 `created_at` 字段之前新增:
    ```typescript
    instance_number: inst.instanceNumber,
    ```
  - 完整 `toResponse` 应为:
    ```typescript
    function toResponse(inst: SpawnedInstance) {
      return {
        id: inst.id,
        port: inst.port,
        status: inst.status,
        error: inst.error,
        group_id: inst.apiKey,
        environment_id: inst.environmentId ?? null,
        session_id: inst.sessionId ?? null,
        instance_number: inst.instanceNumber,
        created_at: Math.floor(inst.createdAt.getTime() / 1000),
      };
    }
    ```
  - 原因: 前端通过 `POST /instances/from-environment` 创建新实例后，响应中需包含编号信息

- [ ] 为 `environments.ts` 路由改造编写单元测试
  - 测试文件: `src/__tests__/web-environments.test.ts`
  - 在文件顶部 mock 区域新增 `../services/instance` 的 mock（在现有 mock 之后）:
    ```typescript
    mock.module("../services/instance", () => ({
      findRunningInstanceByEnvironment: mock(() => undefined),
      spawnInstanceFromEnvironment: mock(async (_userId: string, _envId: string) => ({
        id: "inst_test_auto",
        userId: _userId,
        port: 8888,
        pid: 12345,
        status: "running",
        command: "acp-link ...",
        error: null,
        apiKey: "test_key",
        createdAt: new Date(),
        environmentId: _envId,
        sessionId: "session_auto_spawned",
        instanceNumber: 1,
      })),
      listInstancesByEnvironment: mock(() => []),
      getRunningInstancesByEnvironment: mock(() => []),
    }));
    ```
  - 新增测试场景:
    - **GET /environments 返回 instances 数组和 instances_count**: 创建环境 → 调用 GET /environments → 响应中每个环境包含 `instances: []` 和 `instances_count: 0`
    - **GET /environments 包含活跃实例数据**: mock `listInstancesByEnvironment` 返回 1 个实例 → GET /environments → 响应的 `instances` 数组长度为 1，包含 `instance_number`、`status`、`session_id`、`port`、`created_at`，`instances_count` 为 1
    - **POST /:id/enter 无 body 自动创建实例**: 环境无运行实例 → POST enter（空 body） → 返回 200，`instance_id` 存在，`instance_number` 为 1
    - **POST /:id/enter 指定 instance_number**: mock `getRunningInstancesByEnvironment` 返回 2 个实例（instanceNumber: 1 和 2）→ POST enter body `{ "instance_number": 2 }` → 返回的 `instance_number` 为 2
    - **POST /:id/enter 指定不存在的 instance_number**: mock `getRunningInstancesByEnvironment` 返回 1 个实例（instanceNumber: 1）→ POST enter body `{ "instance_number": 5 }` → 返回 404
    - **GET /:id/instances 返回活跃实例列表**: mock `listInstancesByEnvironment` 返回 2 个实例 → GET /environments/:id/instances → 返回 200，`instances` 数组长度 2，包含 `instance_number` 字段
    - **GET /:id/instances 对不存在的环境返回 404**: GET /environments/env_noexist/instances → 返回 404
  - 运行命令: `bun test src/__tests__/web-environments.test.ts`
  - 预期: 所有测试通过

- [ ] 为 `instances.ts` 的 `toResponse` 改造编写单元测试
  - 测试文件: `src/__tests__/instance-routes.test.ts`
  - 在现有 mock 对象中新增 `instanceNumber: 1` 字段:
    - `mockSpawnInstance` 返回值 (~L30) 新增 `instanceNumber: 1`
    - `mockListInstances` 返回值 (~L52-L75) 的每个实例新增 `instanceNumber: 1` / `instanceNumber: 2`
  - 注意: `toResponse` 函数在 `src/routes/web/instances.ts` (~L8-L19) 中，不在测试文件中。Task 2 的前序步骤已在该函数中新增了 `instance_number: inst.instanceNumber` 映射。测试文件仅需更新 mock 数据以包含 `instanceNumber` 字段
  - 新增测试场景:
    - **POST /instances 响应包含 instance_number**: POST /web/instances → 响应包含 `instance_number: 1`
    - **GET /instances 响应每个元素包含 instance_number**: GET /web/instances → 响应数组每个元素包含 `instance_number` 字段
  - 运行命令: `bun test src/__tests__/instance-routes.test.ts`
  - 预期: 所有测试通过

**检查步骤:**

- [ ] 验证 `environments.ts` import 包含新增函数
  - `grep -n 'listInstancesByEnvironment\|getRunningInstancesByEnvironment' src/routes/web/environments.ts`
  - 预期: 输出包含 2 个 import 行

- [ ] 验证 `GET /environments` 返回 `instances` 数组而非单个 `instance_id`
  - `grep -n 'instances_count\|instances:' src/routes/web/environments.ts`
  - 预期: 输出包含 `instances_count` 和 `instances:` 字段赋值

- [ ] 验证 `POST /:id/enter` 支持 `instance_number` 参数
  - `grep -n 'instance_number\|instanceNumber' src/routes/web/environments.ts`
  - 预期: 输出包含 body 解析、按编号查找、响应返回 `instance_number` 的代码

- [ ] 验证 `GET /:id/instances` 路由已注册
  - `grep -n 'environments/:id/instances' src/routes/web/environments.ts`
  - 预期: 输出包含 `app.get("/environments/:id/instances", ...)` 路由注册

- [ ] 验证 `instances.ts` 的 `toResponse` 包含 `instance_number`
  - `grep -n 'instance_number' src/routes/web/instances.ts`
  - 预期: 输出包含 `instance_number: inst.instanceNumber`

- [ ] 验证 `GET /environments` 不再返回旧的 `instance_status` 单值字段
  - `grep -n 'instance_status:' src/routes/web/environments.ts | grep -v 'instance_status: inst'`
  - 预期: 旧的 `instance_status: runningInst ? runningInst.status : null` 行已删除，仅保留 enter 路由中的 `instance_status: inst.status`

- [ ] 运行单元测试
  - `bun test src/__tests__/web-environments.test.ts src/__tests__/instance-routes.test.ts`
  - 预期: 所有测试通过，无失败

- [ ] 类型检查通过
  - `bun run typecheck 2>&1 | tail -20`
  - 预期: 无类型错误

---

### Task 3: 前端 API 和类型扩展

**背景:**
前端 Dashboard 需要展示多实例列表并支持按编号进入特定实例，但当前 `web/src/types/index.ts` 的 `Environment` 接口仅有单个 `instance_status` / `instance_id` 字段，`web/src/api/client.ts` 的 `apiEnterEnvironment` 不支持 `instance_number` 参数且缺少查询实例列表的 API 函数。本 Task 扩展前端类型定义和 API 客户端，为 Task 4（前端 Dashboard 按钮改造）提供数据结构和接口调用支持。本 Task 依赖 Task 2 已定义的后端 API 契约（`GET /:id/instances`、`POST /:id/enter` body 参数），无需等待后端实现完成（可先行开发，后端联调时验证）。

**涉及文件:**
- 修改: `web/src/types/index.ts`
- 修改: `web/src/api/client.ts`

**执行步骤:**

- [ ] 在 `web/src/types/index.ts` 中新增 `EnvironmentInstance` 接口
  - 位置: `web/src/types/index.ts` ~L17（`Environment` 接口闭合花括号之后）
  - 新增代码:
    ```typescript
    export interface EnvironmentInstance {
      id: string;
      instance_number: number;
      status: "starting" | "running" | "stopped" | "error";
      session_id: string | null;
      port: number;
      created_at: number;
    }
    ```
  - 原因: 前端需要一个独立的类型来表示环境下的单个实例，对应后端 `GET /environments/:id/instances` 返回的实例对象结构

- [ ] 在 `Environment` 接口中新增 `instances` 和 `instances_count` 字段，保留 `instance_status` / `instance_id` 向后兼容字段
  - 位置: `web/src/types/index.ts` ~L15-L16（`instance_status` 和 `instance_id` 字段之后）
  - 在 `instance_id?: string | null;` 之后新增:
    ```typescript
    instances?: EnvironmentInstance[];
    instances_count?: number;
    ```
  - 完整 `Environment` 接口应为:
    ```typescript
    export interface Environment {
      id: string;
      name: string;
      description: string | null;
      workspace_path: string;
      agent_name: string | null;
      status: string;
      machine_name: string | null;
      branch: string | null;
      auto_start: boolean;
      last_poll_at: number | null;
      created_at: number;
      updated_at: number;
      session_id?: string;
      instance_status?: string | null;
      instance_id?: string | null;
      instances?: EnvironmentInstance[];
      instances_count?: number;
    }
    ```
  - 原因: `instances` 数组供 Dashboard 下拉菜单渲染实例列表，`instances_count` 用于卡片头部显示"实例 xN"；保留旧的 `instance_status` / `instance_id` 避免现有引用处报错

- [ ] 在 `web/src/api/client.ts` 中更新 `EnterEnvironmentResponse` 接口，新增 `instance_number` 字段
  - 位置: `web/src/api/client.ts` ~L67-L72（`EnterEnvironmentResponse` 接口）
  - 在 `instance_status: string;` 之后新增:
    ```typescript
    instance_number: number;
    ```
  - 完整 `EnterEnvironmentResponse` 应为:
    ```typescript
    export interface EnterEnvironmentResponse {
      session_id: string;
      instance_id: string;
      instance_number: number;
      instance_status: string;
      environment_id: string;
    }
    ```
  - 原因: 后端 Task 2 改造后 enter 响应新增 `instance_number` 字段，前端类型需同步更新

- [ ] 修改 `apiEnterEnvironment` 函数签名，支持可选的 `instanceNumber` 参数
  - 位置: `web/src/api/client.ts` ~L74-L76（`apiEnterEnvironment` 函数）
  - 将:
    ```typescript
    export function apiEnterEnvironment(environmentId: string) {
      return api<EnterEnvironmentResponse>("POST", `/web/environments/${environmentId}/enter`);
    }
    ```
    替换为:
    ```typescript
    export function apiEnterEnvironment(environmentId: string, instanceNumber?: number) {
      const body = instanceNumber !== undefined ? { instance_number: instanceNumber } : undefined;
      return api<EnterEnvironmentResponse>("POST", `/web/environments/${environmentId}/enter`, body);
    }
    ```
  - 原因: 后端 Task 2 支持通过 body `instance_number` 指定进入特定编号的实例；不传 `instanceNumber` 时行为与改造前一致（默认进入第一个运行中实例或自动创建）

- [ ] 在 `web/src/api/client.ts` 中新增 `ListEnvironmentInstancesResponse` 接口和 `apiListEnvironmentInstances` 函数
  - 位置: `web/src/api/client.ts` ~L76（`apiEnterEnvironment` 函数之后），在 `// --- Control ---` 注释之前插入
  - 新增代码:
    ```typescript
    export interface ListEnvironmentInstancesResponse {
      environment_id: string;
      instances: EnvironmentInstance[];
    }

    export function apiListEnvironmentInstances(environmentId: string) {
      return api<ListEnvironmentInstancesResponse>("GET", `/web/environments/${environmentId}/instances`);
    }
    ```
  - 原因: 前端下拉菜单打开时按需获取某个环境的活跃实例列表，不必在每次 Dashboard 刷新时加载所有环境的所有实例；对应后端 Task 2 的 `GET /web/environments/:id/instances` 路由

- [ ] 在 `web/src/api/client.ts` 的 import 语句中新增 `EnvironmentInstance` 导入
  - 位置: `web/src/api/client.ts` ~L1（第一行 import 语句）
  - 将:
    ```typescript
    import type { Session, Environment, EnvironmentDetail, CreateEnvironmentRequest, UpdateEnvironmentRequest, ControlResponse, SessionEvent, ChannelProviderInfo, ChannelInfo } from "../types";
    ```
    替换为:
    ```typescript
    import type { Session, Environment, EnvironmentDetail, EnvironmentInstance, CreateEnvironmentRequest, UpdateEnvironmentRequest, ControlResponse, SessionEvent, ChannelProviderInfo, ChannelInfo } from "../types";
    ```
  - 原因: `ListEnvironmentInstancesResponse` 和 `apiListEnvironmentInstances` 使用了 `EnvironmentInstance` 类型

- [ ] 在 `web/src/api/client.ts` 的 `InstanceInfo` 接口中新增 `instance_number` 字段
  - 位置: `web/src/api/client.ts` ~L110-L119（`InstanceInfo` 接口）
  - 在 `session_id: string | null;` 之后、`created_at: number;` 之前新增:
    ```typescript
    instance_number: number;
    ```
  - 完整 `InstanceInfo` 应为:
    ```typescript
    export interface InstanceInfo {
      id: string;
      port: number;
      status: "starting" | "running" | "stopped" | "error";
      error: string | null;
      group_id: string;
      environment_id: string | null;
      session_id: string | null;
      instance_number: number;
      created_at: number;
    }
    ```
  - 原因: 后端 Task 2 在 `instances.ts` 的 `toResponse` 中新增了 `instance_number` 字段，前端类型需同步

- [ ] 在 `web/src/api/client.ts` 的 `CreateInstanceResponse` 接口中新增 `instance_number` 和 `session_id` 字段
  - 位置: `web/src/api/client.ts` ~L121-L126（`CreateInstanceResponse` 接口）
  - 在 `status: string;` 之后、`created_at: number;` 之前新增:
    ```typescript
    instance_number: number;
    session_id: string | null;
    ```
  - 完整 `CreateInstanceResponse` 应为:
    ```typescript
    export interface CreateInstanceResponse {
      id: string;
      port: number;
      status: string;
      instance_number: number;
      session_id: string | null;
      created_at: number;
    }
    ```
  - 原因: 后端 Task 2 的 `toResponse` 改造后 `POST /instances` 和 `POST /instances/from-environment` 响应均包含 `instance_number`；后端 `toResponse` 已包含 `session_id: inst.sessionId ?? null`，前端类型需同步以供 Task 4 的 `handleSpawnNewInstance` 使用 `spawnResult.session_id`

**检查步骤:**

- [ ] 验证 `EnvironmentInstance` 接口已定义
  - `grep -n 'export interface EnvironmentInstance' web/src/types/index.ts`
  - 预期: 输出 1 行，包含 `EnvironmentInstance` 接口定义

- [ ] 验证 `Environment` 接口包含 `instances` 和 `instances_count` 字段
  - `grep -n 'instances_count\|instances?:' web/src/types/index.ts`
  - 预期: 输出包含 `instances?: EnvironmentInstance[]` 和 `instances_count?: number`

- [ ] 验证 `apiEnterEnvironment` 函数接受 `instanceNumber` 参数
  - `grep -n 'apiEnterEnvironment' web/src/api/client.ts`
  - 预期: 输出包含 `instanceNumber?: number` 参数和 `instance_number` body 构造

- [ ] 验证 `apiListEnvironmentInstances` 函数已定义
  - `grep -n 'apiListEnvironmentInstances' web/src/api/client.ts`
  - 预期: 输出包含函数定义

- [ ] 验证 `ListEnvironmentInstancesResponse` 接口已定义
  - `grep -n 'ListEnvironmentInstancesResponse' web/src/api/client.ts`
  - 预期: 输出包含接口定义和使用处

- [ ] 验证 `EnterEnvironmentResponse` 包含 `instance_number`
  - `grep -n 'instance_number' web/src/api/client.ts`
  - 预期: 输出包含 `EnterEnvironmentResponse` 中的 `instance_number: number` 和 `apiEnterEnvironment` 中的 body 构造

- [ ] 验证 `InstanceInfo` 和 `CreateInstanceResponse` 包含 `instance_number`
  - `grep -A15 'interface InstanceInfo' web/src/api/client.ts | grep instance_number`
  - 预期: 输出包含 `instance_number: number`

- [ ] 验证 `CreateInstanceResponse` 包含 `session_id`
  - `grep -A10 'interface CreateInstanceResponse' web/src/api/client.ts | grep session_id`
  - 预期: 输出包含 `session_id: string | null`

- [ ] 验证 `EnvironmentInstance` 已被 `client.ts` 正确导入
  - `grep 'EnvironmentInstance' web/src/api/client.ts | head -3`
  - 预期: 第一行是 import 语句中包含 `EnvironmentInstance`

- [ ] 前端类型检查通过
  - `cd /Users/konghayao/code/pazhou/remote-control-server && bun run typecheck 2>&1 | tail -20`
  - 预期: 无类型错误

- [ ] 前端构建通过
  - `cd /Users/konghayao/code/pazhou/remote-control-server && bun run build:web 2>&1 | tail -10`
  - 预期: 构建成功，输出包含 "built in" 且无 error

---

### Task 4: 前端环境卡片按钮改造（Split Button + DropdownMenu）

**背景:**
当前 `EnvironmentsPage.tsx` 中每个环境卡片的"进入对话"按钮仅支持单实例操作 — 点击后调用 `apiEnterEnvironment(env.id)` 进入默认实例，无法选择或创建新实例。改造后需支持多实例：单实例时按钮外观不变、直接进入；多实例时按钮右侧出现下拉箭头，展开菜单可选择具体实例或新建实例。环境卡片头部需显示活跃实例数量标签"实例 xN"。本 Task 依赖 Task 2（后端 `GET /:id/instances`、`POST /:id/enter` body 参数）和 Task 3（前端 `apiListEnvironmentInstances`、`apiEnterEnvironment(id, number?)`、`apiSpawnInstanceFromEnvironment`、`EnvironmentInstance` 类型）。本 Task 是功能链的末端，无下游依赖。

**涉及文件:**
- 修改: `web/src/pages/EnvironmentsPage.tsx`

**执行步骤:**

- [ ] 在 `EnvironmentsPage.tsx` 的 import 语句中新增 `DropdownMenu` 相关组件、`ChevronDown` 图标、以及 Task 3 新增的 API 函数和类型
  - 位置: `web/src/pages/EnvironmentsPage.tsx` ~L1-L10（import 区域）
  - 在 ~L2 现有 import 中追加 `apiListEnvironmentInstances`、`apiSpawnInstanceFromEnvironment`:
    ```typescript
    import { apiFetchEnvironments, apiGetEnvironment, apiCreateEnvironment, apiUpdateEnvironment, apiDeleteEnvironment, apiListAgents, apiEnterEnvironment, apiDeleteInstance, apiListEnvironmentInstances, apiSpawnInstanceFromEnvironment } from "../api/client";
    ```
  - 在 ~L3 现有 import 中追加 `EnvironmentInstance`:
    ```typescript
    import type { Environment, EnvironmentInstance } from "../types";
    ```
  - 在 ~L9 import 块之后新增 DropdownMenu 组件导入:
    ```typescript
    import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
    ```
  - 在 ~L10 lucide-react import 中追加 `ChevronDown`:
    ```typescript
    import { Bot, Plus, Pencil, Trash2, Loader2, Power, ChevronDown } from "lucide-react";
    ```
  - 原因: Split Button 由 `DropdownMenu` + `Button` 组合实现，下拉箭头使用 `ChevronDown` 图标，新增 API 函数和类型来自 Task 3

- [ ] 在 `EnvironmentsPage` 组件中新增 `instancesMap` state 用于缓存各环境的实例列表
  - 位置: `web/src/pages/EnvironmentsPage.tsx` ~L32（`enteringEnvId` state 声明之后）
  - 新增代码:
    ```typescript
    const [instancesMap, setInstancesMap] = useState<Record<string, EnvironmentInstance[]>>({});
    ```
  - 原因: 下拉菜单需要展示各环境的活跃实例列表，避免每次打开菜单都发起网络请求；`instancesMap` 以 `environmentId` 为 key 存储 `EnvironmentInstance[]`

- [ ] 修改 `loadEnvs` 回调，在加载环境列表后同步刷新实例缓存
  - 位置: `web/src/pages/EnvironmentsPage.tsx` ~L34-L43（`loadEnvs` useCallback 内部）
  - 在 `setEnvs(data || [])` 之后、`finally` 之前新增实例列表加载逻辑:
    ```typescript
    // 加载有活跃实例的环境的实例列表
    const activeEnvs = (data || []).filter(e =>
      e.instances_count !== undefined && e.instances_count > 0
    );
    if (activeEnvs.length > 0) {
      const instanceEntries = await Promise.allSettled(
        activeEnvs.map(env => apiListEnvironmentInstances(env.id))
      );
      const newMap: Record<string, EnvironmentInstance[]> = {};
      activeEnvs.forEach((env, i) => {
        const result = instanceEntries[i];
        if (result.status === "fulfilled") {
          newMap[env.id] = result.value.instances;
        }
      });
      setInstancesMap(prev => ({ ...prev, ...newMap }));
    }
    ```
  - 原因: 后端 `GET /environments` 返回的 `instances_count` 字段标识哪些环境有活跃实例，仅对这些环境请求 `GET /:id/instances` 以减少网络开销

- [ ] 新增 `handleEnterInstance` 回调 — 按编号进入指定实例
  - 位置: `web/src/pages/EnvironmentsPage.tsx` ~L126（`handleEnterAgent` 之后）
  - 新增代码:
    ```typescript
    const handleEnterInstance = useCallback(async (env: Environment, instanceNumber: number) => {
      if (!onNavigateToSession) return;
      setEnteringEnvId(env.id);
      try {
        const result = await apiEnterEnvironment(env.id, instanceNumber);
        onNavigateToSession(result.session_id, { cwd: env.workspace_path });
      } catch (err) {
        alert((err as Error).message);
      } finally {
        setEnteringEnvId(null);
      }
    }, [onNavigateToSession]);
    ```
  - 原因: 下拉菜单点击特定实例时，需调用 `apiEnterEnvironment(id, instanceNumber)` 指定编号进入

- [ ] 新增 `handleSpawnNewInstance` 回调 — 创建新实例并自动进入
  - 位置: `web/src/pages/EnvironmentsPage.tsx` 紧接 `handleEnterInstance` 之后
  - 新增代码:
    ```typescript
    const handleSpawnNewInstance = useCallback(async (env: Environment) => {
      if (!onNavigateToSession) return;
      setEnteringEnvId(env.id);
      try {
        const spawnResult = await apiSpawnInstanceFromEnvironment(env.id);
        // 创建后用新实例的 session 进入
        onNavigateToSession(spawnResult.session_id ?? "", { cwd: env.workspace_path });
        // 刷新环境列表和实例缓存
        await loadEnvs();
      } catch (err) {
        alert((err as Error).message);
      } finally {
        setEnteringEnvId(null);
      }
    }, [onNavigateToSession, loadEnvs]);
    ```
  - 原因: 下拉菜单中"+ 新建实例"项点击后，调用 `apiSpawnInstanceFromEnvironment` 创建新实例，成功后导航到新实例的会话并刷新列表

- [ ] 修改环境卡片头部 — 新增实例数量标签"实例 xN"
  - 位置: `web/src/pages/EnvironmentsPage.tsx` ~L202-L209（卡片 Header 区域，`<div className="mb-3 flex items-start justify-between">` 内部）
  - 在 `env.auto_start` 条件渲染的自启标签之后（~L208 `)}` 闭合处之后），新增实例数量标签:
    ```typescript
    {env.instances_count !== undefined && env.instances_count > 1 && (
      <span className="rounded bg-emerald-500/10 px-1 py-0.5 text-[10px] font-medium text-emerald-600">
        实例 x{env.instances_count}
      </span>
    )}
    ```
  - 原因: 当环境有多个活跃实例时（`instances_count > 1`），在卡片头部显示数量标签，让用户一眼看到多实例状态

- [ ] 替换"进入对话"按钮为 Split Button — 核心改造
  - 位置: `web/src/pages/EnvironmentsPage.tsx` ~L269-L282（`{/* Enter button */}` 区域）
  - 将现有的单个 `<Button>` 替换为以下 Split Button 逻辑:
    ```tsx
    {/* Enter button — Split Button for multi-instance */}
    {(() => {
      const instances = instancesMap[env.id] ?? [];
      const activeInstances = instances.filter(i => i.status === "running" || i.status === "starting");
      const hasMultipleInstances = activeInstances.length > 1 || (activeInstances.length >= 1 && env.instances_count !== undefined && env.instances_count > 1);
      const entering = enteringEnvId === env.id;

      if (!hasMultipleInstances) {
        // 单实例: 外观不变，点击直接进入默认实例
        return (
          <Button
            className="w-full"
            size="sm"
            disabled={entering}
            onClick={() => handleEnterAgent(env)}
          >
            {entering ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                启动中...
              </>
            ) : online ? "进入对话" : "启动并进入"}
          </Button>
        );
      }

      // 多实例: Split Button — 主体按钮 + 下拉箭头
      return (
        <div className="flex w-full">
          <Button
            className="flex-1 rounded-r-none"
            size="sm"
            disabled={entering}
            onClick={() => handleEnterAgent(env)}
          >
            {entering ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                启动中...
              </>
            ) : "进入对话"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="rounded-l-none border-l-0 px-2"
                size="sm"
                disabled={entering}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {activeInstances.map((inst) => (
                <DropdownMenuItem
                  key={inst.id}
                  onClick={() => handleEnterInstance(env, inst.instance_number)}
                >
                  <span className={`inline-block h-2 w-2 rounded-full mr-2 ${
                    inst.status === "running" ? "bg-green-500" : "bg-yellow-500"
                  }`} />
                  <span>实例 {inst.instance_number}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{inst.status}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleSpawnNewInstance(env)}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                <span>新建实例</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    })()}
    ```
  - 原因: 核心改造 — 单实例时按钮外观与改造前完全一致（`w-full`），多实例时右侧出现下拉箭头，菜单展示活跃实例列表（含状态圆点 + 编号 + 状态文本）和"+ 新建实例"项

- [ ] 修改停止实例按钮逻辑 — 从单个 `instance_id` 改为遍历所有活跃实例
  - 位置: `web/src/pages/EnvironmentsPage.tsx` ~L229-L239（停止按钮区域，`env.instance_id && online` 条件块）
  - 将现有:
    ```tsx
    {env.instance_id && online && (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
        onClick={() => handleStopInstance(env.instance_id!)}
        title="停止实例"
      >
        <Power className="h-3.5 w-3.5" />
      </Button>
    )}
    ```
    替换为:
    ```tsx
    {env.instance_id && online && (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
        onClick={() => {
          // 停止第一个活跃实例（多实例场景下点击停止按钮只停一个）
          const instances = instancesMap[env.id] ?? [];
          const active = instances.find(i => i.status === "running" || i.status === "starting");
          if (active) handleStopInstance(active.id);
          else handleStopInstance(env.instance_id!);
        }}
        title="停止实例"
      >
        <Power className="h-3.5 w-3.5" />
      </Button>
    )}
    ```
  - 原因: 多实例场景下 `env.instance_id` 仍指向第一个活跃实例（后端 enter 默认返回的 instance_id），停止按钮优先停止实例缓存中的第一个活跃实例

- [ ] 在 `loadEnvs` 的依赖数组中无需额外变更 — `loadEnvs` 当前依赖为 `[]`，新增的 `apiListEnvironmentInstances` 是模块级函数，不需加入依赖

- [ ] 验证前端构建通过
  - 运行命令: `cd /Users/konghayao/code/pazhou/remote-control-server && bun run build:web`
  - 预期: 构建成功，无编译错误

**检查步骤:**

- [ ] 验证 DropdownMenu 组件已导入
  - `grep -n 'DropdownMenu' web/src/pages/EnvironmentsPage.tsx | head -5`
  - 预期: 输出包含 `import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger }`

- [ ] 验证 `ChevronDown` 图标已导入
  - `grep -n 'ChevronDown' web/src/pages/EnvironmentsPage.tsx`
  - 预期: 输出包含 lucide-react import 中的 `ChevronDown` 和 JSX 中的使用

- [ ] 验证 `apiListEnvironmentInstances` 和 `apiSpawnInstanceFromEnvironment` 已导入
  - `grep -n 'apiListEnvironmentInstances\|apiSpawnInstanceFromEnvironment' web/src/pages/EnvironmentsPage.tsx`
  - 预期: 输出包含 import 行和使用处

- [ ] 验证 `instancesMap` state 已声明
  - `grep -n 'instancesMap' web/src/pages/EnvironmentsPage.tsx`
  - 预期: 输出包含 `useState` 声明和多处使用

- [ ] 验证实例数量标签"实例 xN"已渲染
  - `grep -n 'instances_count' web/src/pages/EnvironmentsPage.tsx`
  - 预期: 输出包含卡片头部的条件渲染 `instances_count > 1` 和标签文本

- [ ] 验证 Split Button 结构存在（`DropdownMenuTrigger` + `ChevronDown`）
  - `grep -n 'DropdownMenuTrigger\|hasMultipleInstances\|rounded-r-none\|rounded-l-none' web/src/pages/EnvironmentsPage.tsx`
  - 预期: 输出包含 Split Button 的主体按钮（`rounded-r-none`）和箭头按钮（`rounded-l-none`）

- [ ] 验证 `handleEnterInstance` 和 `handleSpawnNewInstance` 回调已定义
  - `grep -n 'handleEnterInstance\|handleSpawnNewInstance' web/src/pages/EnvironmentsPage.tsx`
  - 预期: 输出包含两个 useCallback 定义和调用处

- [ ] 验证"新建实例"菜单项存在
  - `grep -n '新建实例' web/src/pages/EnvironmentsPage.tsx`
  - 预期: 输出包含 DropdownMenuItem 内的文本

- [ ] 前端构建无错误
  - `cd /Users/konghayao/code/pazhou/remote-control-server && bun run build:web 2>&1 | tail -10`
  - 预期: 构建成功，输出包含 "built in" 且无 error

- [ ] 类型检查通过
  - `cd /Users/konghayao/code/pazhou/remote-control-server && bun run typecheck 2>&1 | tail -20`
  - 预期: 无类型错误

---

### Task 5: 环境多实例支持 验收

**前置条件:**
- 启动命令: `bun run dev`（后端）+ `bun run dev:web`（前端，或使用 `bun run build:web` 构建后通过后端 serve）
- 后端测试数据：需有至少一个已创建的环境

**端到端验证:**

1. 运行完整后端测试套件确保无回归
   - `bun test src/__tests__/instance-service.test.ts src/__tests__/instance-routes.test.ts src/__tests__/web-environments.test.ts 2>&1 | tail -20`
   - 预期: 所有测试通过
   - 失败排查: 检查 Task 1（instance-service）和 Task 2（routes）的测试步骤

2. 类型检查通过
   - `bun run typecheck 2>&1 | tail -20`
   - 预期: 无类型错误
   - 失败排查: 检查 Task 3（types）和 Task 4（EnvironmentsPage）的类型使用

3. 前端构建成功
   - `bun run build:web 2>&1 | tail -10`
   - 预期: 构建成功，无 error
   - 失败排查: 检查 Task 4 的 JSX 语法和 import 路径

4. 验证多实例 API 行为
   - 启动服务器后，对同一环境连续调用 `POST /web/instances/from-environment` 两次
   - `curl -s -X POST http://localhost:3000/web/instances/from-environment -H 'Content-Type: application/json' -d '{"environmentId":"ENV_ID"}' -b cookie | jq '.id, .instance_number'`
   - 预期: 两次调用均返回 201，`instance_number` 分别为 1 和 2
   - 失败排查: 检查 Task 1（单实例检查移除）和 Task 2（路由处理）

5. 验证实例列表 API
   - `curl -s http://localhost:3000/web/environments/ENV_ID/instances -b cookie | jq '.instances | length'`
   - 预期: 返回活跃实例数量（≥ 2）
   - 失败排查: 检查 Task 1（listInstancesByEnvironment）和 Task 2（GET /:id/instances 路由）

6. 验证前端 Split Button 交互
   - 打开 Dashboard 智能体页面，找到有多个实例的环境卡片
   - 验证：按钮右侧出现下拉箭头、点击箭头展开菜单、菜单显示"实例 1"、"实例 2"和"+ 新建实例"
   - 预期: 多实例卡片显示下拉，单实例卡片外观不变
   - 失败排查: 检查 Task 4（EnvironmentsPage Split Button 实现）

7. 验证停止单个实例不影响其他实例
   - 通过 API 停止实例 1，检查实例 2 是否仍为 running
   - `curl -s -X DELETE http://localhost:3000/web/instances/INST_1_ID -b cookie | jq '.ok'`
   - 预期: 返回 `true`，实例 2 状态不变
   - 失败排查: 检查 Task 1（stopInstance 逻辑）和 Task 2（stop 路由）
