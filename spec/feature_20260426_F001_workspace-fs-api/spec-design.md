# Feature: 20260426_F001 - workspace-fs-api

## 需求背景

环境注册（F001）已为每个 environment 绑定了 `workspacePath` 工作空间路径。当前对话中用户无法引用工作空间中的文件，agent 也不感知工作空间上下文。

用户需要在对话输入框中通过 `@` 符号引用 `{workspace}/user/` 目录下的文件，将文件路径作为附件发送给 agent。同时需要一个文件浏览弹窗，支持浏览已有文件和上传新文件。

## 目标

- 提供会话级文件系统 REST API，限定在 `{workspace}/user/` 目录范围内
- 支持文件列表、读取、上传、写入、删除操作
- 前端提供文件选择弹窗（FilePickerDialog），支持浏览目录、上传文件、`@` 引用
- 用户消息可附带文件路径引用，发送给 agent

## 方案设计

### 数据流

```
前端弹窗(@) → REST /web/sessions/:sessionId/files/*
  → session.environmentId → environment.workspacePath
  → path.resolve(workspacePath, "user", relativePath)
  → 校验路径仍在 user/ 下 → 执行文件操作
```

### 安全约束

1. **路径穿越防护**：所有文件路径基于 `{workspace}/user/` 做相对路径解析。使用 `path.resolve(workspaceUserDir, relativePath)` 后校验结果是否以 `workspaceUserDir` 开头，拒绝包含 `../` 的路径逃逸
2. **Session 校验**：session 不存在或未关联 environment 时返回 404
3. **用户归属校验**：通过 `sessionAuth` 中间件确保用户只能访问自己的 session 关联的文件
4. **目录不可删除**：DELETE 操作仅允许删除文件，不允许删除目录，防止误删整个 workspace

### API 设计

路由前缀：`/web/sessions/:sessionId/files`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/web/sessions/:sessionId/files` | 列出 `user/` 目录内容 |
| GET | `/web/sessions/:sessionId/files/*` | 读取/下载文件 |
| POST | `/web/sessions/:sessionId/files/*` | 上传文件（multipart/form-data） |
| PUT | `/web/sessions/:sessionId/files/*` | 写入/覆盖文件 |
| DELETE | `/web/sessions/:sessionId/files/*` | 删除文件 |

#### GET files（列表）

- Query: `?path=subdir/`（可选，默认根目录即 `user/`）
- Response:

```json
{
  "entries": [
    { "name": "readme.md", "path": "user/readme.md", "type": "file", "size": 1024, "modifiedAt": 1714089600000 },
    { "name": "docs", "path": "user/docs/", "type": "dir", "size": 0, "modifiedAt": 1714089600000 }
  ]
}
```

- 仅展开一层（非递归），前端按需展开子目录

#### GET files/*（读取）

- 文本文件（基于扩展名判断）返回 JSON:

```json
{ "name": "readme.md", "path": "user/readme.md", "content": "...", "size": 1024, "encoding": "utf-8" }
```

- 二进制文件返回原始流 + `Content-Disposition: attachment; filename="xxx"` 头
- 文本文件判断逻辑：扩展名白名单（`.txt`, `.md`, `.json`, `.yaml`, `.yml`, `.ts`, `.js`, `.tsx`, `.jsx`, `.py`, `.go`, `.rs`, `.css`, `.html`, `.xml`, `.toml`, `.ini`, `.cfg`, `.sh`, `.bash`, `.zsh`, `.sql`, `.env`）或文件无扩展名且前 8KB 内容均为 UTF-8

#### POST files/*（上传）

- Content-Type: `multipart/form-data`
- 支持单文件或多文件上传
- 上传目标路径通过 URL 路径指定（如 `POST /files/docs/` 上传到 `user/docs/` 下）
- 自动创建不存在的中间目录
- Response:

```json
{
  "files": [
    { "name": "report.pdf", "path": "user/docs/report.pdf", "size": 204800 }
  ]
}
```

#### PUT files/*（写入）

- Body: `{ "content": "文件内容" }`
- 自动创建不存在的中间目录
- Response: `{ "name": "xxx", "path": "user/xxx", "size": 128 }`

#### DELETE files/*（删除）

- 仅删除文件，不允许删除目录
- Response: `{ "ok": true }`

### 后端实现

新增 `src/routes/web/files.ts`，核心逻辑：

```typescript
import { Hono } from "hono";
import { sessionAuth } from "../../auth/middleware";
import { storeGetSession, storeGetEnvironment } from "../../store";
import { resolve, relative, stat, readdir, readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";

const app = new Hono();

// 工具函数：解析并校验文件路径
async function resolveUserPath(sessionId: string, relativePath: string) {
  const session = storeGetSession(sessionId);
  if (!session?.environmentId) return null;
  const env = storeGetEnvironment(session.environmentId);
  if (!env) return null;
  const userDir = join(env.workspacePath, "user");
  // 确保 user/ 目录存在
  await mkdir(userDir, { recursive: true });
  const resolved = resolve(userDir, relativePath);
  // 校验路径仍在 user/ 下
  if (!resolved.startsWith(userDir + "/") && resolved !== userDir) return null;
  return { userDir, resolved };
}
```

路由注册：在 `src/index.ts` 中挂载 `app.route("/web/sessions", fileRoutes)`。

### 前端设计

#### FilePickerDialog 组件

新增 `web/src/components/FilePickerDialog.tsx`：

- 触发方式：用户在聊天输入框输入 `@` 时弹出
- 布局：弹窗顶部搜索框 + 文件列表（名称、类型图标、大小）
- 交互：
  - 点击目录 → 展开子目录（调用 GET files?path=子目录路径）
  - 点击文件 → 选中并关闭弹窗，将 `@filename` 插入输入框
  - 顶部「上传」按钮 → 弹出系统文件选择器 → POST 上传 → 刷新列表
- 懒加载：每次只加载一层目录，点击展开时请求子目录

#### API Client 新增

在 `web/src/api/client.ts` 中新增：

```typescript
export function apiListFiles(sessionId: string, dirPath?: string) {
  const query = dirPath ? `?path=${encodeURIComponent(dirPath)}` : "";
  return api<{ entries: FileInfo[] }>("GET", `/web/sessions/${sessionId}/files${query}`);
}

export function apiReadFile(sessionId: string, filePath: string) {
  return api<FileContent>("GET", `/web/sessions/${sessionId}/files/${encodeURIComponent(filePath)}`);
}

export function apiUploadFile(sessionId: string, dirPath: string, files: File[]) {
  const formData = new FormData();
  files.forEach(f => formData.append("files", f));
  return fetch(`/web/sessions/${sessionId}/files/${encodeURIComponent(dirPath)}`, {
    method: "POST",
    credentials: "include",
    body: formData,
  }).then(r => r.json());
}

export function apiWriteFile(sessionId: string, filePath: string, content: string) {
  return api<{ name: string; path: string; size: number }>("PUT", `/web/sessions/${sessionId}/files/${encodeURIComponent(filePath)}`, { content });
}

export function apiDeleteFile(sessionId: string, filePath: string) {
  return api<{ ok: boolean }>("DELETE", `/web/sessions/${sessionId}/files/${encodeURIComponent(filePath)}`);
}
```

#### 消息发送集成

- 用户输入 `@` → 弹出 FilePickerDialog
- 用户选择文件 → 输入框插入 `@filename` 标记
- 发送消息时，解析输入中的 `@` 引用，在消息 payload 中附带 `attachments` 字段：

```json
{
  "type": "user",
  "content": "请帮我分析 @report.pdf 这个文件",
  "attachments": [
    { "path": "user/report.pdf", "name": "report.pdf" }
  ]
}
```

- Agent 通过 ACP 协议收到消息后，根据 attachment 中的路径自行决定如何处理文件

### 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/routes/web/files.ts` | 新增 | 文件系统 REST API（列表/读取/上传/写入/删除） |
| `src/index.ts` | 修改 | 注册新路由 `app.route("/web/sessions", fileRoutes)` |
| `web/src/api/client.ts` | 修改 | 新增文件操作 API 函数 |
| `web/src/components/FilePickerDialog.tsx` | 新增 | 文件选择弹窗组件 |
| `web/src/types/index.ts` | 修改 | 新增 FileInfo、FileContent 类型定义 |

## 实现要点

1. **路径编码**：URL 中的文件路径需要正确处理中文和特殊字符，使用 `encodeURIComponent` 编码路径段
2. **大文件处理**：上传和下载都应有大小限制（建议上传 50MB，读取响应 100MB），避免内存溢出
3. **user/ 目录初始化**：环境注册时不需要预创建 `user/` 目录，首次文件操作时按需 `mkdir -p`
4. **文件类型推断**：读取文件时，通过扩展名白名单判断是否为文本文件，白名单之外的按二进制流返回
5. **Session 重启丢失**：session 是内存数据，服务重启后丢失。前端应处理 session 不存在的情况（提示用户重新创建会话）

## 验收标准

- [ ] GET `/web/sessions/:sessionId/files` 可列出 `user/` 目录下的文件和子目录
- [ ] GET `/web/sessions/:sessionId/files/*` 可读取文本文件内容（JSON）和下载二进制文件（流）
- [ ] POST `/web/sessions/:sessionId/files/*` 可上传文件到指定子目录
- [ ] PUT `/web/sessions/:sessionId/files/*` 可写入/覆盖文件内容
- [ ] DELETE `/web/sessions/:sessionId/files/*` 可删除文件
- [ ] 路径穿越攻击被拦截（`../` 等路径返回 403）
- [ ] Session 不存在或未关联 environment 时返回 404
- [ ] 前端 FilePickerDialog 可浏览 `user/` 目录、上传文件
- [ ] 用户通过 `@` 选择文件后，消息 payload 包含 attachments 字段
- [ ] 类型检查通过（`bun run typecheck`）
- [ ] 后端测试通过（`bun test src/__tests__`）
