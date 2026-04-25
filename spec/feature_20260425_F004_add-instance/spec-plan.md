# 新增实例管理 执行计划

**目标:** 在 Dashboard 提供一键新增 acp-link 实例的能力，服务端自动管理子进程生命周期（创建、列表、终止），前端展示实例状态和停止按钮。

**技术栈:** Hono (后端路由), Bun (运行时 + child_process.spawn), React + TypeScript (前端), Bun test (测试框架)

**设计文档:** spec/feature_20260425_F004_add-instance/spec-design.md

## 改动总览

- 后端新增 `src/services/instance.ts`（服务层）和 `src/routes/web/instances.ts`（API 路由），修改 `src/index.ts` 注册路由和 graceful shutdown 清理；前端修改 `web/src/api/client.ts`（API 函数）、`web/src/pages/Dashboard.tsx` 和 `web/src/components/EnvironmentList.tsx`（UI 组件）
- 依赖关系：Task 1（服务层）→ Task 2（路由）→ Task 3（注册）为顺序依赖；Task 4（前端 API）依赖 Task 2 的接口；Task 5（UI）依赖 Task 4 的函数
- 关键设计决策：每次 spawn 创建专用 API Key（因 `listApiKeysByUser` 返回 sanitized record 不含完整 key）；instances 与 environments 通过 `channel_group_id` 在前端关联；端口探测使用 `net.createServer` 确认空闲

---

### Task 0: 环境准备

**背景:**
确保构建和测试工具链在当前开发环境中可用，避免后续 Task 因环境问题阻塞。

**执行步骤:**
- [x] 验证构建工具可用
  - `cd /Users/konghayao/code/pazhou/remote-control-server && bunx tsc --noEmit 2>&1 | tail -3`
  - 预期: 无 TypeScript 编译错误
- [x] 验证测试工具可用
  - `bun test --help 2>&1 | head -3`
  - 预期: 显示 bun test 帮助信息
- [x] 验证前端构建工具可用
  - `cd web && bunx vite build 2>&1 | tail -3`
  - 预期: 构建成功

**检查步骤:**
- [x] TypeScript 编译无错误
  - `bunx tsc --noEmit 2>&1 | tail -5`
  - 预期: 无错误输出
- [x] Bun test 可执行
  - `bun test src/__tests__/routes.test.ts 2>&1 | tail -5`
  - 预期: 测试框架可用，至少一个测试通过

---

### Task 1: InstanceService 实例服务层

**背景:**
本 Task 实现新增实例功能的核心服务层——端口分配、子进程 spawn/停止、进程注册表。当前系统没有实例管理能力，所有逻辑从零构建。本 Task 的输出是 Task 2（REST API 路由）和 Task 3（graceful shutdown）的直接依赖。

**涉及文件:**
- 新建: `src/services/instance.ts`
- 新建: `src/__tests__/instance-service.test.ts`

**执行步骤:**

- [x] 定义 SpawnedInstance 接口和 InstanceService 模块
  - 位置: `src/services/instance.ts`（新建文件）
  - 定义 `SpawnedInstance` 接口: `{ id: string; userId: string; port: number; pid: number | null; status: "starting" | "running" | "stopped" | "error"; command: string; error: string | null; apiKey: string; createdAt: Date; }`
  - `apiKey` 字段存储 spawn 时使用的 API Key（即 `--group` 参数值），用于前端通过 `env.channel_group_id` 匹配实例
  - 定义模块级常量: `PORT_MIN = 8888`, `PORT_MAX = 8999`
  - 定义模块级状态: `instances = new Map<string, SpawnedInstance>()`, `allocatingPorts = new Set<number>()`
  - 导出函数签名:
    - `spawnInstance(userId: string): Promise<SpawnedInstance>` — 创建实例
    - `listInstances(userId: string): SpawnedInstance[]` — 列出用户实例
    - `getInstance(id: string): SpawnedInstance | undefined` — 获取单个实例
    - `stopInstance(id: string, userId: string): { ok: boolean; error?: string }` — 停止实例
    - `stopAllInstances(): void` — 停止所有实例（shutdown 用）
  - 原因: 接口和导出签名先行确定，后续步骤填充实现

- [x] 实现 `allocatePort()` 端口分配函数
  - 位置: `src/services/instance.ts`，作为模块内部函数（不导出）
  - 逻辑:
    ```
    function allocatePort(): number | null
      // 1. 收集 instances Map 中所有已占用端口的 Set
      // 2. 收集 allocatingPorts 中的端口
      // 3. occupied = 已占用 ∝ allocatingPorts
      // 4. for (let port = PORT_MIN; port <= PORT_MAX; port++)
      //      if (!occupied.has(port)) return port
      // 5. return null（无可用端口）
    ```
  - 原因: 简单遍历即可，无需复杂算法；最多 112 个端口，线性扫描足够

- [x] 实现 `probePort(port: number): Promise<boolean>` 端口探测函数
  - 位置: `src/services/instance.ts`，模块内部函数
  - 逻辑:
    ```
    function probePort(port: number): Promise<boolean>
      return new Promise((resolve) => {
        const server = net.createServer();
        server.listen(port, () => {
          server.close(() => resolve(true));  // 端口空闲
        });
        server.on("error", () => resolve(false));  // 端口被占用
      });
    ```
  - 原因: spec-design.md 要求 spawn 前确认端口确实空闲，防止与外部进程冲突

- [x] 实现 `spawnInstance(userId: string)` 完整逻辑
  - 位置: `src/services/instance.ts`
  - 逻辑:
    ```
    export async function spawnInstance(userId: string): Promise<SpawnedInstance>
      // 1. 创建专用 API Key（经代码确认 listApiKeysByUser 返回 ApiKeySanitized，只有 keyPrefix，无法拿到完整 key）
      const { fullKey } = await createApiKey(userId, `instance-${Date.now()}`);
      const apiKey = fullKey;

      // 2. 分配端口（带并发锁）
      const port = allocatePort();
      if (!port) throw new Error("No available port");
      allocatingPorts.add(port);
      try {
        const available = await probePort(port);
        if (!available) throw new Error(`Port ${port} is in use`);

        // 3. 创建 SpawnedInstance 记录
        const id = `inst_${randomBytes(8).toString("hex")}`;
        const baseUrl = getBaseUrl();
        const command = `ACP_RCS_URL=${baseUrl} ACP_RCS_TOKEN=${apiKey} acp-link --group "${apiKey}" --port ${port} opencode -- acp`;
        const instance: SpawnedInstance = {
          id, userId, port, pid: null,
          status: "starting", command, error: null, apiKey,
          createdAt: new Date(),
        };
        instances.set(id, instance);

        // 4. spawn 子进程
        const proc = spawn("acp-link", [
          "--group", apiKey,
          "--port", String(port),
          "opencode", "--", "acp",
        ], {
          env: { ...process.env, ACP_RCS_URL: baseUrl, ACP_RCS_TOKEN: apiKey },
          stdio: ["pipe", "pipe", "pipe"],
        });
        instance.pid = proc.pid;
        instance.status = "running";

        // 5. 监听事件
        proc.stdout?.on("data", (data) => console.log(`[instance:${id}] ${data}`));
        proc.stderr?.on("data", (data) => console.error(`[instance:${id}] stderr: ${data}`));
        proc.on("close", (code) => {
          instance.status = "stopped";
          if (code !== 0 && code !== null) {
            instance.error = `Process exited with code ${code}`;
          }
          allocatingPorts.delete(port);
        });
        proc.on("error", (err) => {
          instance.status = "error";
          instance.error = err.message;
          allocatingPorts.delete(port);
        });

        return instance;
      } catch (err) {
        allocatingPorts.delete(port);
        throw err;
      }
    ```
  - 注意: `createApiKey` 来自 `../../auth/api-key-service`，`getBaseUrl` 来自 `../config`，`spawn` 来自 `node:child_process`，`randomBytes` 来自 `node:crypto`，`net` 来自 `node:net`

- [x] 实现 `listInstances` 和 `getInstance`
  - 位置: `src/services/instance.ts`
  - `listInstances(userId)`: `Array.from(instances.values()).filter(i => i.userId === userId)`
  - `getInstance(id)`: `instances.get(id)`

- [x] 实现 `stopInstance(id, userId)`
  - 位置: `src/services/instance.ts`
  - 逻辑:
    ```
    export function stopInstance(id: string, userId: string): { ok: boolean; error?: string }
      const inst = instances.get(id);
      if (!inst) return { ok: false, error: "Instance not found" };
      if (inst.userId !== userId) return { ok: false, error: "Not your instance" };
      if (inst.status === "stopped") return { ok: false, error: "Already stopped" };
      if (!inst.pid) { inst.status = "stopped"; return { ok: true }; }
      try {
        process.kill(inst.pid, "SIGTERM");
        // 5 秒后若仍未退出则 SIGKILL
        setTimeout(() => {
          try { process.kill(inst.pid!, "SIGKILL"); } catch {}
        }, 5000);
        return { ok: true };
      } catch (err: any) {
        // 进程可能已退出
        inst.status = "stopped";
        return { ok: true };
      }
    ```

- [x] 实现 `stopAllInstances()`
  - 位置: `src/services/instance.ts`
  - 逻辑: `for (const inst of instances.values()) { if (inst.pid && inst.status !== "stopped") { try { process.kill(inst.pid, "SIGTERM"); } catch {} } }`
  - 原因: Task 3 的 graceful shutdown 会调用此函数

- [x] 为 InstanceService 核心逻辑编写单元测试
  - 测试文件: `src/__tests__/instance-service.test.ts`
  - 测试场景:
    - `allocatePort`: instances 为空时返回 PORT_MIN (8888)
    - `allocatePort`: 已占用端口 8888 时返回 8889
    - `allocatePort`: 所有端口被占用时返回 null
    - `listInstances(userId)`: 只返回属于该用户的实例
    - `stopInstance`: 归属检查，不属于自己的实例返回 error
    - `stopInstance`: 停止已停止的实例返回 error
    - `stopAllInstances`: 遍历所有实例发送 SIGTERM
  - 注意: 测试需要 mock `child_process.spawn`、`net.createServer`、`createApiKey`、`listApiKeysByUser`、`getBaseUrl`。参考 `src/__tests__/routes.test.ts` 中的 mock 模式: `mock.module("../config", () => ({ ... }))`
  - 运行命令: `bun test src/__tests__/instance-service.test.ts`
  - 预期: 所有测试通过

**检查步骤:**

- [x] 验证 instance.ts 文件存在且导出所有公共函数
  - `grep -c "export function" src/services/instance.ts`
  - 预期: 输出 5（spawnInstance, listInstances, getInstance, stopInstance, stopAllInstances）

- [x] 验证测试文件存在且测试通过
  - `bun test src/__tests__/instance-service.test.ts 2>&1 | tail -5`
  - 预期: 输出包含 "all tests passed" 或类似成功信息

- [x] 验证 TypeScript 类型无错误
  - `bunx tsc --noEmit src/services/instance.ts 2>&1 | tail -3`
  - 预期: 无类型错误


---

### Task 2: Instances REST API 路由

**背景:**
本 Task 实现实例管理的 HTTP 接口层，将 Task 1 的 InstanceService 暴露为 REST API。当前系统没有实例相关的路由，需要新建完整的 CRUD 端点。本 Task 的输出是 Task 3（路由注册）和 Task 4（前端 API 客户端）的直接依赖。

**涉及文件:**
- 新建: `src/routes/web/instances.ts`
- 新建: `src/__tests__/instance-routes.test.ts`

**执行步骤:**

- [x] 创建 `src/routes/web/instances.ts` 路由文件
  - 位置: `src/routes/web/instances.ts`（新建文件）
  - 参考模式: `src/routes/web/api-keys.ts`（同目录下的 sessionAuth 路由）
  - 文件结构:
    ```typescript
    import { Hono } from "hono";
    import { sessionAuth } from "../../auth/middleware";
    import { spawnInstance, listInstances, stopInstance } from "../../services/instance";
    import type { SpawnedInstance } from "../../services/instance";

    const app = new Hono();

    /** 将 SpawnedInstance 序列化为 API 响应 */
    function toResponse(inst: SpawnedInstance) {
      return {
        id: inst.id,
        port: inst.port,
        status: inst.status,
        error: inst.error,
        group_id: inst.apiKey,  // 用于前端匹配 environment.channel_group_id（--group 参数值）
        created_at: Math.floor(inst.createdAt.getTime() / 1000),
      };
    }
    ```
  - 原因: 统一响应格式，隐藏内部字段（userId, pid, command），时间戳转为 Unix 秒。`group_id` 对应 `--group` 参数值，前端通过此字段与 `env.channel_group_id` 匹配

- [x] 实现 POST /instances — 新增实例
  - 位置: `src/routes/web/instances.ts`，在 toResponse 函数之后
  - 逻辑:
    ```typescript
    app.post("/instances", sessionAuth, async (c) => {
      const user = c.get("user")!;
      try {
        const inst = await spawnInstance(user.id);
        return c.json(toResponse(inst), 201);
      } catch (err: any) {
        return c.json({ error: { type: "spawn_failed", message: err.message } }, 500);
      }
    });
    ```
  - 原因: spawnInstance 内部处理 API Key 创建和端口分配，路由层只负责认证和错误响应

- [x] 实现 GET /instances — 列出用户实例
  - 位置: `src/routes/web/instances.ts`，POST 路由之后
  - 逻辑:
    ```typescript
    app.get("/instances", sessionAuth, async (c) => {
      const user = c.get("user")!;
      const insts = listInstances(user.id);
      return c.json(insts.map(toResponse), 200);
    });
    ```
  - 原因: listInstances 已按 userId 过滤，路由层直接映射为响应

- [x] 实现 DELETE /instances/:id — 终止实例
  - 位置: `src/routes/web/instances.ts`，GET 路由之后
  - 逻辑:
    ```typescript
    app.delete("/instances/:id", sessionAuth, async (c) => {
      const user = c.get("user")!;
      const id = c.req.param("id")!;
      const result = stopInstance(id, user.id);
      if (!result.ok) {
        const statusCode = result.error === "Instance not found" ? 404
          : result.error === "Not your instance" ? 403
          : 400;
        return c.json({ error: { type: "bad_request", message: result.error } }, statusCode);
      }
      return c.json({ ok: true });
    });

    export default app;
    ```
  - 原因: stopInstance 内部处理归属检查，路由层根据错误类型映射 HTTP 状态码

- [x] 为 instances 路由编写单元测试
  - 测试文件: `src/__tests__/instance-routes.test.ts`
  - Mock 策略: mock `../../services/instance` 模块，mock `../../auth/middleware` 的 sessionAuth（参考 `src/__tests__/routes.test.ts` 的 mock 模式: `mock.module("../auth/middleware", () => ({ sessionAuth: async (c, next) => { c.set("user", { id: "test-user-id", email: "test@test.com", name: "Test" }); await next(); } }))`)
  - 测试场景:
    - `POST /instances` 成功: mock `spawnInstance` 返回 `SpawnedInstance` → 响应 201，body 含 `{ id, port, status, created_at }`
    - `POST /instances` spawn 失败: mock `spawnInstance` 抛出 Error("No available port") → 响应 500，body 含 `{ error: { type: "spawn_failed" } }`
    - `GET /instances` 成功: mock `listInstances` 返回 2 个实例 → 响应 200，body 为数组长度 2
    - `GET /instances` 无实例: mock `listInstances` 返回空数组 → 响应 200，body 为 `[]`
    - `DELETE /instances/:id` 成功: mock `stopInstance` 返回 `{ ok: true }` → 响应 200，body 含 `{ ok: true }`
    - `DELETE /instances/:id` 未找到: mock `stopInstance` 返回 `{ ok: false, error: "Instance not found" }` → 响应 404
    - `DELETE /instances/:id` 非本人: mock `stopInstance` 返回 `{ ok: false, error: "Not your instance" }` → 响应 403
  - 运行命令: `bun test src/__tests__/instance-routes.test.ts`
  - 预期: 所有测试通过

**检查步骤:**

- [x] 验证 instances.ts 文件存在且导出 default app
  - `grep -c "export default app" src/routes/web/instances.ts`
  - 预期: 输出 1

- [x] 验证路由定义完整（POST + GET + DELETE）
  - `grep -E "app\.(post|get|delete)" src/routes/web/instances.ts | wc -l`
  - 预期: 输出 3

- [x] 验证测试通过
  - `bun test src/__tests__/instance-routes.test.ts 2>&1 | tail -5`
  - 预期: 输出包含 "all tests passed" 或类似成功信息

---

### Task 3: 路由注册与 Graceful Shutdown

**背景:**
本 Task 将 Task 2 创建的 instances 路由注册到应用主路由，并在 graceful shutdown 流程中调用 `stopAllInstances()` 清理所有 spawn 的子进程。当前 `src/index.ts` 已有 4 个 `/web` 路由（sessions, environments, api-keys, config）和 graceful shutdown 函数，需要在对应位置追加代码。本 Task 的输出使实例 API 可被前端调用，并确保服务器关闭时子进程被正确终止。

**涉及文件:**
- 修改: `src/index.ts`

**执行步骤:**

- [x] 在导入区域添加 `webInstances` 和 `stopAllInstances` 导入
  - 位置: `src/index.ts` L18（`import webConfig from "./routes/web/config";` 之后）
  - 追加导入:
    ```typescript
    import webInstances from "./routes/web/instances";
    import { stopAllInstances } from "./services/instance";
    ```
  - 原因: 路由注册和 shutdown 清理均需要这两个导入

- [x] 在路由注册区域添加 `/web` instances 路由
  - 位置: `src/index.ts` L72（`app.route("/web", webConfig);` 之后）
  - 追加一行:
    ```typescript
    app.route("/web", webInstances);
    ```
  - 原因: 使 POST/GET/DELETE /web/instances 端点生效

- [x] 在 graceful shutdown 中调用 `stopAllInstances()`
  - 位置: `src/index.ts` L101（`closeAllRelayConnections();` 之后、`process.exit(0);` 之前）
  - 追加一行:
    ```typescript
    stopAllInstances();
    ```
  - 最终 gracefulShutdown 函数:
    ```typescript
    async function gracefulShutdown(signal: string) {
      console.log(`\n[RCS] Received ${signal}, shutting down...`);
      closeAllAcpConnections();
      closeAllRelayConnections();
      stopAllInstances();
      process.exit(0);
    }
    ```
  - 原因: 服务器关闭时必须终止所有 spawn 的子进程，否则它们会成为孤儿进程

- [x] 为路由注册和 shutdown 逻辑编写集成验证测试
  - 测试文件: `src/__tests__/instance-routes.test.ts`（Task 2 已创建此文件）
  - 在现有测试文件末尾追加测试场景:
    - `注册验证`: 创建 Hono app 并注册 `app.route("/web", webInstances)`，对 `POST /web/instances` 发送请求（不带认证）→ 响应 401（sessionAuth 拦截），确认路由已注册
  - 运行命令: `bun test src/__tests__/instance-routes.test.ts`
  - 预期: 所有测试通过（含新增场景）
  - 原因: 虽然 `src/index.ts` 本身不适合单元测试（它是入口文件），但通过测试路由是否在 `/web` 前缀下可访问来间接验证注册正确性

**检查步骤:**

- [x] 验证 `src/index.ts` 包含 webInstances 导入和路由注册
  - `grep "webInstances" src/index.ts`
  - 预期: 输出包含 `import webInstances` 和 `app.route("/web", webInstances)` 两行

- [x] 验证 `src/index.ts` 在 graceful shutdown 中调用 stopAllInstances
  - `grep -A3 "closeAllRelayConnections" src/index.ts`
  - 预期: 输出包含 `stopAllInstances()` 在 `closeAllRelayConnections()` 之后、`process.exit(0)` 之前

- [x] 验证 TypeScript 编译无错误（index.ts 修改后）
  - `bunx tsc --noEmit 2>&1 | grep -i "index.ts" | head -5`
  - 预期: 无输出（无类型错误）

---

### Task 4: 前端 API 客户端

**背景:**
本 Task 在前端 API 客户端层添加实例管理相关的三个 API 调用函数，供 Task 5 的 Dashboard UI 组件使用。当前 `web/src/api/client.ts` 已有 Sessions、Environments、API Keys、Config 等模块的 API 函数，实例管理函数遵循相同的 `api<T>()` 封装模式，使用 cookie 认证（`credentials: "include"`）。

**涉及文件:**
- 修改: `web/src/api/client.ts`

**执行步骤:**

- [x] 定义 InstanceInfo 和 CreateInstanceResponse 接口
  - 位置: `web/src/api/client.ts`，在 `ApiKeyInfo` 接口区域（~L79-L89）之前插入
  - 内容:
    ```typescript
    // --- Instances ---

    export interface InstanceInfo {
      id: string;
      port: number;
      status: "starting" | "running" | "stopped" | "error";
      error: string | null;
      group_id: string;  // 用于匹配 environment.channel_group_id
      created_at: number;
    }

    export interface CreateInstanceResponse {
      id: string;
      port: number;
      status: string;
      created_at: number;
    }
    ```
  - 原因: 为 API 函数提供类型安全，字段与 Task 2 的 `toResponse()` 返回结构一一对应

- [x] 添加 `apiCreateInstance` 函数
  - 位置: `web/src/api/client.ts`，在接口定义之后、`apiFetchApiKeys` 函数（~L91）之前
  - 内容:
    ```typescript
    export function apiCreateInstance() {
      return api<CreateInstanceResponse>("POST", "/web/instances");
    }
    ```
  - 原因: POST /web/instances 不需要请求体，服务端从 session 中获取 userId 并自动处理 API Key 和端口分配

- [x] 添加 `apiListInstances` 函数
  - 位置: 紧接 `apiCreateInstance` 之后
  - 内容:
    ```typescript
    export function apiListInstances() {
      return api<InstanceInfo[]>("GET", "/web/instances");
    }
    ```
  - 原因: GET /web/instances 返回当前用户的所有 spawned 实例列表

- [x] 添加 `apiDeleteInstance` 函数
  - 位置: 紧接 `apiListInstances` 之后
  - 内容:
    ```typescript
    export function apiDeleteInstance(id: string) {
      return api<{ ok: boolean }>("DELETE", `/web/instances/${id}`);
    }
    ```
  - 原因: DELETE /web/instances/:id 终止指定实例，服务端内部校验归属

- [x] 为前端 API 客户端编写单元测试
  - 测试文件: `web/src/__tests__/api-client.test.ts`（新建）
  - 注意: 前端测试需验证函数签名和导出正确性。由于 `api()` 函数依赖 `fetch`，测试通过 mock global fetch 来验证请求参数
  - 测试场景:
    - `apiCreateInstance()`: mock fetch 返回 `{ ok: true, json: () => ({ id: "inst_xxx", port: 8888, status: "running", created_at: 1000 }) }` → 验证调用 `fetch` 时 method 为 "POST"、path 为 "/web/instances"
    - `apiListInstances()`: mock fetch 返回数组 → 验证 method 为 "GET"、path 为 "/web/instances"
    - `apiDeleteInstance("inst_123")`: mock fetch 返回 `{ ok: true }` → 验证 method 为 "DELETE"、path 为 "/web/instances/inst_123"
  - 运行命令: `cd web && bunx vitest run src/__tests__/api-client.test.ts`
  - 预期: 所有测试通过
  - 注意: 经检查 `web/package.json` 确认前端使用 vite + bun，测试运行命令为 `bunx vitest run`。若无 vitest 配置，可直接用 Bun test: `bun test web/src/__tests__/api-client.test.ts`

**检查步骤:**

- [x] 验证三个实例 API 函数已导出
  - `grep -E "export function api(Create|List|Delete)Instance" web/src/api/client.ts`
  - 预期: 输出 3 行，分别对应 apiCreateInstance、apiListInstances、apiDeleteInstance

- [x] 验证 InstanceInfo 和 CreateInstanceResponse 接口已定义
  - `grep -E "export interface (InstanceInfo|CreateInstanceResponse)" web/src/api/client.ts`
  - 预期: 输出 2 行

- [x] 验证前端 TypeScript 编译无错误
  - `cd web && bunx tsc --noEmit 2>&1 | tail -5`
  - 预期: 无类型错误

---

### Task 5: Dashboard UI

**背景:**
本 Task 在 Dashboard 页面实现「新增实例」按钮和实例停止功能，是用户可感知的最终交付物。当前 Dashboard 的 Agents 区域仅展示 environment 列表，无任何管理操作能力。需要：(1) 在 Agents 标题旁添加「+ 新增实例」按钮；(2) 同时加载 instances 数据与 environments 数据合并展示；(3) 为每个 spawned 实例显示端口号和「停止」按钮。依赖 Task 4 的三个 API 客户端函数。

**涉及文件:**
- 修改: `web/src/pages/Dashboard.tsx`
- 修改: `web/src/components/EnvironmentList.tsx`

**执行步骤:**

- [x] 修改 Dashboard.tsx — 导入 instances API 和状态
  - 位置: `web/src/pages/Dashboard.tsx` L2（导入行）
  - 将现有导入:
    ```typescript
    import { apiFetchAllSessions, apiFetchEnvironments } from "../api/client";
    ```
    替换为:
    ```typescript
    import { apiFetchAllSessions, apiFetchEnvironments, apiCreateInstance, apiListInstances, apiDeleteInstance } from "../api/client";
    import type { InstanceInfo } from "../api/client";
    ```

- [x] 修改 Dashboard.tsx — 添加 instances 状态和 creatingInstance 状态
  - 位置: `web/src/pages/Dashboard.tsx` L13（`const [environments, ...]` 之后）
  - 追加:
    ```typescript
    const [instances, setInstances] = useState<InstanceInfo[]>([]);
    const [creatingInstance, setCreatingInstance] = useState(false);
    ```

- [x] 修改 Dashboard.tsx — 扩展 loadDashboard 同时加载 instances
  - 位置: `web/src/pages/Dashboard.tsx` L16-20（`loadDashboard` 函数内部）
  - 将:
    ```typescript
    const [sess, envs] = await Promise.all([apiFetchAllSessions(), apiFetchEnvironments()]);
    setSessions(sess || []);
    setEnvironments(envs || []);
    ```
    替换为:
    ```typescript
    const [sess, envs, insts] = await Promise.all([
      apiFetchAllSessions(),
      apiFetchEnvironments(),
      apiListInstances().catch(() => [] as InstanceInfo[]),
    ]);
    setSessions(sess || []);
    setEnvironments(envs || []);
    setInstances(insts || []);
    ```
  - 原因: instances 接口失败不应阻塞 Dashboard 整体加载，因此 catch 降级为空数组

- [x] 修改 Dashboard.tsx — 添加 handleCreateInstance 和 handleStopInstance 回调
  - 位置: `web/src/pages/Dashboard.tsx`，在 `handleSelectSession` 回调（~L40）之后
  - 追加:
    ```typescript
    const handleCreateInstance = useCallback(async () => {
      setCreatingInstance(true);
      try {
        await apiCreateInstance();
        await loadDashboard();
      } catch (err) {
        console.error("Failed to create instance:", err);
      } finally {
        setCreatingInstance(false);
      }
    }, [loadDashboard]);

    const handleStopInstance = useCallback(async (instanceId: string) => {
      try {
        await apiDeleteInstance(instanceId);
        await loadDashboard();
      } catch (err) {
        console.error("Failed to stop instance:", err);
      }
    }, [loadDashboard]);
    ```
  - 原因: 两个回调分别处理创建和停止，成功后调用 `loadDashboard()` 刷新全部数据

- [x] 修改 Dashboard.tsx — Agents 区域添加「+ 新增实例」按钮和 props 传递
  - 位置: `web/src/pages/Dashboard.tsx`，Agents section（~L67-69）
  - 将:
    ```tsx
    <section className="mb-8">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">Agents</h2>
      <EnvironmentList environments={environments} onSelectEnvironment={handleSelectEnvironment} />
    </section>
    ```
    替换为:
    ```tsx
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">Agents</h2>
        <button
          type="button"
          onClick={handleCreateInstance}
          disabled={creatingInstance}
          className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-brand/80 disabled:opacity-50"
        >
          {creatingInstance ? "Creating..." : "+ 新增实例"}
        </button>
      </div>
      <EnvironmentList
        environments={environments}
        instances={instances}
        onSelectEnvironment={handleSelectEnvironment}
        onStopInstance={handleStopInstance}
      />
    </section>
    ```

- [x] 修改 EnvironmentList.tsx — 扩展 props 接口接收 instances 和 onStopInstance
  - 位置: `web/src/components/EnvironmentList.tsx` L6-9（interface 定义）
  - 将:
    ```typescript
    interface EnvironmentListProps {
      environments: Environment[];
      onSelectEnvironment?: (env: Environment) => void;
    }
    ```
    替换为:
    ```typescript
    import type { InstanceInfo } from "../api/client";

    interface EnvironmentListProps {
      environments: Environment[];
      instances: InstanceInfo[];
      onSelectEnvironment?: (env: Environment) => void;
      onStopInstance?: (instanceId: string) => void;
    }
    ```
  - 在组件参数解构中添加 `instances` 和 `onStopInstance`:
    ```typescript
    export function EnvironmentList({ environments, instances, onSelectEnvironment, onStopInstance }: EnvironmentListProps) {
    ```

- [x] 修改 EnvironmentList.tsx — 构建 instance 查找映射，在每行渲染中添加端口和停止按钮
  - 位置: `web/src/components/EnvironmentList.tsx`，组件函数体开头（empty state 检查之前）
  - 在 `if (!environments || environments.length === 0)` 之前插入:
    ```typescript
    // 构造 group_id→instance 映射，用于通过 env.channel_group_id 关联 environment 和 spawned instance
    const instanceMap = new Map<string, InstanceInfo>();
    for (const inst of instances) {
      instanceMap.set(inst.group_id, inst);
    }
    ```
  - 在每个 environment 渲染的按钮内部（`<div className="text-right ml-4">` 区域），在 `StatusBadge` 之后追加端口和停止按钮:
    ```tsx
    {/* 端口和停止按钮 */}
    {(() => {
      const isAcp = env.worker_type === "acp";
      if (!isAcp) return null;
      // 通过 channel_group_id 匹配：acp-link --group 参数值（apiKey）作为 instance.group_id
      const inst = instanceMap.get(env.channel_group_id || "");
      if (!inst) return null;
      return (
        <>
          <div className="mt-0.5 text-xs text-text-muted">端口 {inst.port}</div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onStopInstance?.(inst.id); }}
            className="mt-1 rounded px-2 py-0.5 text-[10px] font-medium text-status-error hover:bg-status-error/10 transition-colors"
          >
            停止
          </button>
        </>
      );
    })()}
    ```
  - 原因: ACP agent 的 `channel_group_id` 存储了 `--group` 参数值（即 apiKey），与 instance 的 `group_id` 字段一致。对非 ACP 环境不显示端口和停止按钮。停止按钮的 `e.stopPropagation()` 防止触发父级 button 的导航事件。

- [x] 为 Dashboard UI 编写前端构建验证测试
  - 测试方式: 前端组件测试在此项目中尚未建立基础设施，以 TypeScript 编译 + Vite 构建作为验证手段
  - 验证命令:
    - TypeScript 检查: `cd web && bunx tsc --noEmit 2>&1 | tail -5`
    - Vite 构建: `cd web && bunx vite build 2>&1 | tail -5`
  - 预期: 两条命令均无错误，Vite 构建输出包含 "built in" 字样
  - 原因: TypeScript 编译确保类型正确（props 接口匹配），Vite 构建确保导入链完整（api/client 导出、组件导入无断裂）

**检查步骤:**

- [x] 验证 Dashboard.tsx 导入 instances API 函数
  - `grep "apiCreateInstance\|apiListInstances\|apiDeleteInstance" web/src/pages/Dashboard.tsx`
  - 预期: 输出包含 3 个函数名的导入行

- [x] 验证 EnvironmentList.tsx 接收新 props
  - `grep "instances\|onStopInstance" web/src/components/EnvironmentList.tsx | head -5`
  - 预期: 输出包含 props 解构中的 `instances` 和 `onStopInstance`

- [x] 验证「新增实例」按钮存在
  - `grep "新增实例" web/src/pages/Dashboard.tsx`
  - 预期: 输出 1 行

- [x] 验证「停止」按钮存在
  - `grep "停止" web/src/components/EnvironmentList.tsx`
  - 预期: 输出包含停止按钮文本

- [x] 验证前端 TypeScript 编译和构建无错误
  - `cd web && bunx tsc --noEmit 2>&1 | tail -3`
  - 预期: 无错误输出

---

### Task 6: 新增实例管理 验收

**前置条件:**
- 启动命令: `bun run src/index.ts`
- 确保系统中已安装 `acp-link` 且在 PATH 中
- 确保已通过 Web UI 登录（better-auth session 有效）

**端到端验证:**

1. 运行完整测试套件确保无回归
   - `bun test 2>&1 | tail -10`
   - 预期: 全部测试通过
   - 失败排查: 检查 Task 1（instance-service.test.ts）、Task 2（instance-routes.test.ts）

2. 验证实例 API 端点已注册且需认证
   - `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/web/instances`
   - 预期: 返回 401（未认证）
   - 失败排查: 检查 Task 3 路由注册是否正确

3. 验证 POST /web/instances 创建实例成功
   - `curl -s -X POST http://localhost:3000/web/instances -H 'Cookie: better-auth.session_token=YOUR_TOKEN' | jq '{id, port, status}'`
   - 预期: 返回 `{ id: "inst_xxx", port: 8888, status: "running" }`（或类似）
   - 失败排查: 检查 Task 1 的 spawnInstance 逻辑（acp-link 是否在 PATH 中、端口是否可用）

4. 验证 GET /web/instances 列出实例
   - `curl -s http://localhost:3000/web/instances -H 'Cookie: better-auth.session_token=YOUR_TOKEN' | jq '.[0].port'`
   - 预期: 返回上一步创建的实例端口号
   - 失败排查: 检查 Task 1 的 listInstances、Task 2 的 GET 路由

5. 验证 DELETE /web/instances/:id 终止实例
   - `curl -s -X DELETE http://localhost:3000/web/instances/INST_ID -H 'Cookie: better-auth.session_token=YOUR_TOKEN' | jq .ok`
   - 预期: 返回 `true`
   - 失败排查: 检查 Task 1 的 stopInstance、Task 2 的 DELETE 路由

6. 验证前端构建无错误
   - `cd web && bunx vite build 2>&1 | tail -5`
   - 预期: 输出包含 "built in" 且无 error
   - 失败排查: 检查 Task 4/5 的导入链是否完整

7. 验证 Dashboard UI「新增实例」按钮可见
   - 浏览器访问 `/code`，检查 Agents 区域标题旁是否有「+ 新增实例」按钮
   - 预期: 按钮可见且可点击
   - 失败排查: 检查 Task 5 的 Dashboard.tsx 修改

8. 验证 Graceful Shutdown 清理实例
   - 创建一个实例后，发送 SIGINT 给服务器进程
   - 预期: 日志中出现实例被终止的信息，子进程不再运行
   - 失败排查: 检查 Task 3 的 stopAllInstances 调用
