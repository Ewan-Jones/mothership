# skill-folder-upload 执行计划

**目标:** 为 Skills 页面新增批量文件夹导入能力，支持冲突检测、忽略/覆盖策略和目录级回滚，同时不影响现有文本创建与编辑流程。

**技术栈:** Bun、Hono、React、TypeScript、FormData multipart、Bun test

**设计文档:** `spec/feature_20260429_F001_skill-folder-upload/spec-design.md`

## 改动总览

本次改动集中在 `src/services/skill.ts`、`src/routes/web/config/skills.ts`、`web/src/api/client.ts` 和 `web/src/pages/SkillsPage.tsx`，分别承担目录导入事务、上传接口、前端请求封装和页面交互。
Task 1 先在服务层建立稳定的导入数据结构、冲突判定和回滚语义；Task 2 的 multipart 路由直接依赖该服务返回的冲突/导入结果。
Task 3 为前端补齐上传 manifest、冲突响应类型和目录解析辅助函数，作为 Task 4 页面交互的输入层，避免把 `FileList` 解析逻辑塞进 `SkillsPage` 主组件。
经代码确认，当前仓库不存在 `spec/global/` 全局上下文目录；Skills 相关能力全部落在现有服务、路由、API client 和页面文件中，无需新增独立后端模块边界。

---

### Task 0: 环境准备

**背景:**
确保 Bun 构建、类型检查和测试命令在当前仓库可直接执行，避免后续任务写完后才暴露工具链问题。
本仓库前端资源由后端静态挂载 `web/dist/`，因此前端改动除了测试外还必须验证 `bun run build:web`。

**执行步骤:**
- [x] 验证类型检查与前端构建命令可用
  - 位置: 项目根目录 `/Users/liyuan/Work/mothership-beta`
  - 执行 `bun run typecheck` 与 `bun run build:web`，确认 Bun、TypeScript、Vite/Tailwind 构建链完整可用
  - 原因: 后续 Task 会同时修改后端和前端，必须先确认统一工具链可跑通
- [x] 验证后端与前端测试命令可用
  - 位置: 项目根目录 `/Users/liyuan/Work/mothership-beta`
  - 执行 `bun test src/__tests__/skill-service.test.ts` 与 `bun test web/src/__tests__/config-skills-page.test.ts`，确认 Bun test 在两侧目录都能工作
  - 原因: 后续每个功能 Task 都要求新增或扩展单测

**检查步骤:**
- [x] 构建与类型检查成功
  - `bun run typecheck && bun run build:web`
  - 预期: 两个命令均退出 0，输出中不包含 TypeScript error 或 Vite build failed
- [x] Bun test 可执行
  - `bun test src/__tests__/skill-service.test.ts web/src/__tests__/config-skills-page.test.ts`
  - 预期: 测试进程可启动并完成，无测试框架初始化错误

---

### Task 1: Skills 导入服务与回滚事务

**背景:**
用户上传 skill 文件夹后，服务层需要负责目录聚合、`SKILL.md` 校验、冲突识别和覆盖回滚；当前 `setSkill()` 只有单个文本 skill 覆盖写入能力，无法表达批量导入事务。
当前 `src/services/skill.ts` 的上游调用方只有 skills 配置路由；本 Task 产出的 `importSkillDirectories()` 会成为新的上传路由核心依赖，并保持 `setSkill()` 语义不变供文本创建继续复用。

**涉及文件:**
- 修改: `src/services/skill.ts`
- 修改: `src/__tests__/skill-service.test.ts`

**执行步骤:**
- [x] 在 `src/services/skill.ts` 顶部现有导出类型之后新增上传导入数据结构和结果类型
  - 位置: `SkillDetail` 接口之后，`ensureDisabledDir()` 之前（约 L24-L35）
  - 新增 `UploadSkillFile`、`ImportConflictStrategy`、`ImportSkillsResult`、`ImportSkillsConflict` 等类型，明确 `skillName`、`relativePath`、`content`、`imported`、`skipped`、`conflicts` 字段
  - 原因: 路由层和前端都需要稳定的响应契约，避免把未结构化对象在多层之间透传
- [x] 在 `src/services/skill.ts` 中补充目录导入所需的内部辅助函数
  - 位置: `buildSkillMd()` 与 `listSkills()` 之间（约 L74-L86）
  - 新增 `normalizeUploadPath(relativePath)`、`groupUploadFiles(files)`、`snapshotSkillDir(name)`、`restoreSkillDir(snapshot)`、`writeImportedSkill(name, files)` 等内部函数；路径标准化时拒绝空路径、`.`、`..`、绝对路径和 `SKILL.md` 之外的越界路径
  - 原因: 导入事务需要把校验、备份、写入和恢复拆成可复用步骤，否则主流程会失去可读性且难以测试
- [x] 在 `src/services/skill.ts:importSkillDirectories()` 实现批量导入主流程，并保留 `setSkill()` 文本写入语义不变
  - 位置: `setSkill()` 之前插入新导出函数（约 L132 之前）
  - 实现顺序固定为: 校验空输入 → 按 `skillName` 聚合 → 校验每组包含 `SKILL.md` → 校验批次内无重名 → 扫描 `SKILLS_DIR` 与 `DISABLED_DIR` 形成冲突集合 → 未传策略时返回 `conflicts` → `ignore` 过滤冲突并记录 `skipped` → `overwrite` 对冲突项做目录快照、删除 enabled/disabled 目录、写入新目录 → 任一写入失败时恢复所有快照并删除本次新建目录 → 成功后重新读取 `SKILL.md` 生成 `SkillInfo[]`
  - 需要显式复用现有 `parseFrontmatter()` 提取描述，并确保 `overwrite` 不保留旧目录残留文件，`ignore` 只返回非冲突项导入结果
  - 原因: 设计要求“首次冲突只提示不写入”“覆盖时整目录替换”“写入失败必须回滚”，这些都必须在服务层一次性保证
- [x] 在 `src/__tests__/skill-service.test.ts` 末尾补齐导入事务单元测试
  - 测试文件: `src/__tests__/skill-service.test.ts`
  - 测试场景:
    - 冲突探测: 上传 `existing/` 与现有 enabled/disabled skill 同名，未传策略 → 返回 `conflicts` 且磁盘无写入
    - 忽略冲突: 批次包含 `existing` 和 `fresh`，传 `ignore` → 仅导入 `fresh`，`skipped` 返回 `existing`
    - 覆盖冲突: 旧目录有附属文件，传 `overwrite` → 旧目录被整目录替换，残留文件消失
    - 回滚恢复: 模拟第二个 skill 写入失败 → 已覆盖目录和新建目录都恢复到失败前状态
    - 缺少 `SKILL.md`: 任一 skill 目录缺少入口文件 → 抛出/返回 `VALIDATION_ERROR`
  - 运行命令: `bun test src/__tests__/skill-service.test.ts`
  - 预期: 所有测试通过

**检查步骤:**
- [x] 验证导入服务导出存在
  - `rg -n "export async function importSkillDirectories|export interface UploadSkillFile|type ImportConflictStrategy" src/services/skill.ts`
  - 预期: 输出包含新增导出函数和上传契约类型
- [x] 验证服务层测试覆盖核心分支
  - `bun test src/__tests__/skill-service.test.ts`
  - 预期: 包含冲突、忽略、覆盖、回滚、缺少 `SKILL.md` 场景且全部通过

---

### Task 2: Skills 上传路由与 multipart 协议

**背景:**
上传目录必须走 `multipart/form-data`，不能复用现有 `/web/config/skills` 的 JSON action 分发；当前路由只有 `list/get/set/delete/enable/disable` 六个动作，没有文件解析和冲突响应分支。
本 Task 依赖 Task 1 的导入服务和结果类型，输出给 Task 3 的前端 API client 使用；路由只做协议解析、错误码映射和响应整形，不重复实现目录事务。

**涉及文件:**
- 修改: `src/routes/web/config/skills.ts`
- 修改: `src/__tests__/config-skills.test.ts`

**执行步骤:**
- [x] 在 `src/routes/web/config/skills.ts` 引入上传服务并补充统一错误响应结构
  - 位置: 顶部 `services/skill` import 列表与 `errorResponse()` 定义处（约 L2-L18）
  - 新增 `importSkillDirectories` 及相关类型导入；将 `errorResponse()` 扩展为可选 `data` 参数，便于 `SKILL_CONFLICT` 同时返回 `conflicts` 与 `allowedStrategies`
  - 原因: 冲突响应不是纯错误字符串，需要与当前 `{ success, error, data }` 结构兼容
- [x] 在 `src/routes/web/config/skills.ts` 新增 `handleUpload(c)` 并挂载 `POST /config/skills/upload`
  - 位置: 现有 `handleDisable()` 之后、`type SkillBody` 之前新增处理函数；`app.post("/config/skills", ...)` 之前新增 `app.post("/config/skills/upload", sessionAuth, ...)`
  - 按现有 `src/routes/web/files.ts` 的 `c.req.formData()` 模式读取 `manifest`、`files`、`conflictStrategy`；将 `manifest` 解析为数组后，与 `files` 按索引一一对应生成 `UploadSkillFile[]`
  - 对 `manifest` 缺失、JSON 非法、长度与文件数不一致、空上传、未知策略值统一返回 400 `VALIDATION_ERROR`
  - 当服务层返回冲突结果时，返回 409 `SKILL_CONFLICT`，并在 `data` 中写入 `conflicts` 与 `allowedStrategies: ["ignore", "overwrite"]`
  - 成功响应固定为 `{ success: true, data: { imported, skipped } }`
  - 原因: 上传协议必须独立于 JSON action，且冲突重试需要稳定的 HTTP 状态码与响应体
- [x] 保持现有 `POST /config/skills` JSON action 分支不变，仅复用共享响应辅助函数
  - 位置: `app.post("/config/skills", sessionAuth, async (c) => { ... })`（约 L84-L97）
  - 不修改 `handleSet()` 对文本创建/编辑的入参约束，不把上传逻辑塞回 `switch(action)`，避免两种创建语义耦合
  - 原因: 设计明确要求文本创建与上传导入分离，减少对既有接口的侵入
- [x] 在 `src/__tests__/config-skills.test.ts` 新增上传路由测试
  - 测试文件: `src/__tests__/config-skills.test.ts`
  - 测试场景:
    - 成功导入: `multipart/form-data` 上传两个 skill 目录 → 返回 `imported` 数组且磁盘写入完成
    - 冲突重试: 首次上传现有 skill 返回 409 `SKILL_CONFLICT` 与冲突列表；再次携带 `overwrite` 返回成功
    - 忽略策略: 上传冲突项和非冲突项并传 `ignore` → 响应 `skipped` 包含冲突项
    - 非法 manifest: 缺失字段或文件数不匹配 → 返回 400 `VALIDATION_ERROR`
  - 运行命令: `bun test src/__tests__/config-skills.test.ts`
  - 预期: 所有测试通过

**检查步骤:**
- [x] 验证上传路由已挂载
  - `rg -n 'app.post\\("/config/skills/upload"' src/routes/web/config/skills.ts`
  - 预期: 输出新增 multipart 上传路由定义
- [x] 验证冲突响应结构与测试通过
  - `bun test src/__tests__/config-skills.test.ts`
  - 预期: 409 场景断言 `error.code === "SKILL_CONFLICT"`，成功场景断言 `data.imported`/`data.skipped`

---

### Task 3: 前端上传协议、目录解析与校验辅助函数

**背景:**
`SkillsPage` 目前只有 `validateSkillForm()` 和 `buildSkillMetadata()` 两个文本模式辅助函数，既没有上传 API，也没有可测试的目录解析逻辑。
本 Task 为页面交互拆出稳定的上传数据结构和纯函数，供 Task 4 直接复用；这样冲突重试与 `FileList` 解析都能在页面外单测，不让组件状态承担协议细节。

**涉及文件:**
- 修改: `web/src/types/config.ts`
- 修改: `web/src/api/client.ts`
- 新建: `web/src/lib/skill-upload.ts`
- 修改: `web/src/__tests__/config-api-client.test.ts`
- 新建: `web/src/__tests__/skill-upload.test.ts`

**执行步骤:**
- [x] 在 `web/src/types/config.ts` 为 skills 上传新增前端契约类型
  - 位置: 现有 `SkillDetail` 定义之后（约 L185 之后）
  - 新增 `UploadManifestEntry`、`UploadSkillSummary`、`SkillUploadConflictStrategy`、`SkillUploadResponse`、`SkillUploadConflictResponse` 等接口，字段名与后端 `manifest` / `imported` / `skipped` / `conflicts` 保持一致
  - 原因: `apiUploadSkills()` 和 `SkillsPage` 都需要共享这些类型，避免在页面里写匿名对象
- [x] 在 `web/src/api/client.ts` 的 Skills 区域新增 `apiUploadSkills(formData: FormData)`
  - 位置: `apiDisableSkill()` 之后、MCP API 之前（约 L270 附近）
  - 参照 `apiUploadFile()` 的 `fetch + credentials: "include"` 写法，不设置 JSON `Content-Type`；对 409/400 响应继续解析 JSON，并在抛出 `Error` 前把 `code` 和 `data` 挂到错误对象上，供页面区分普通失败与冲突重试
  - 原因: 上传不能走 `apiConfigAction()`，而页面需要从错误对象拿到冲突列表和允许策略
- [x] 新建 `web/src/lib/skill-upload.ts`，实现目录解析与上传前校验纯函数
  - 位置: 新文件，导出 `parseSkillUploadFiles(files: File[])`、`validateUploadBatch(items)`、`buildSkillUploadFormData(items, strategy?)`
  - `parseSkillUploadFiles()` 固定读取 `webkitRelativePath` 或回退到 `name`，仅保留包含至少一级目录的文件；按首段目录名聚合并统计 `fileCount`、`hasSkillMd`、`files`
  - `validateUploadBatch()` 固定返回 “未解析出任何 skill 文件夹”“以下目录缺少 SKILL.md”“本次上传批次包含重复 skill 名”等明确中文错误
  - `buildSkillUploadFormData()` 负责把 manifest JSON 和真实 `File` 以同顺序追加到 `FormData`
  - 原因: 这些逻辑是上传模式的核心输入层，抽离后才能稳定复用和测试
- [x] 为前端协议和解析逻辑补齐单元测试
  - 测试文件: `web/src/__tests__/config-api-client.test.ts`, `web/src/__tests__/skill-upload.test.ts`
  - 测试场景:
    - `apiUploadSkills`: 发送 `POST /web/config/skills/upload`、`body` 为 `FormData`、不显式设置 JSON header、409 时抛出的错误对象保留 `code/data`
    - `parseSkillUploadFiles`: 多个一级目录聚合正确，根级散文件被忽略
    - `validateUploadBatch`: 空批次、缺少 `SKILL.md`、重复 skill 名分别返回预期错误
    - `buildSkillUploadFormData`: 生成的 `manifest` 顺序与 `files` 顺序一致，`conflictStrategy` 仅在传值时追加
  - 运行命令: `bun test web/src/__tests__/config-api-client.test.ts web/src/__tests__/skill-upload.test.ts`
  - 预期: 所有测试通过

**检查步骤:**
- [x] 验证上传 API 已定义
  - `rg -n "export function apiUploadSkills|/web/config/skills/upload" web/src/api/client.ts`
  - 预期: 输出上传 API 封装及目标路径
- [x] 验证上传辅助函数测试通过
  - `bun test web/src/__tests__/config-api-client.test.ts web/src/__tests__/skill-upload.test.ts`
  - 预期: `FormData`、冲突错误透传和目录聚合场景全部通过

---

### Task 4: Skills 页面上传模式与冲突交互

**背景:**
当前 `web/src/pages/SkillsPage.tsx` 仅支持“新建/编辑文本 skill”，弹窗中名称、描述、Markdown 编辑区始终显示，没有上传模式切换、冲突确认或批量导入结果反馈。
本 Task 依赖 Task 3 的解析函数和上传 API；完成后用户可以在同一个“新建技能”入口里切换文本创建与文件夹上传，而编辑场景仍固定保留文本模式。

**涉及文件:**
- 修改: `web/src/pages/SkillsPage.tsx`
- 修改: `web/src/__tests__/config-skills-page.test.ts`

**执行步骤:**
- [x] 重构 `web/src/pages/SkillsPage.tsx` 的状态模型，区分“新建文本”“新建上传”“编辑文本”三种场景
  - 位置: 组件顶部 `useState` 区域与 `handleOpenCreate()` / `handleOpenEdit()`（约 L32-L90）
  - 新增 `createMode`, `uploadItems`, `uploadError`, `conflicts`, `conflictStrategy`, `uploadPending`, `overwriteConfirmOpen` 等状态；`handleOpenCreate()` 默认置 `createMode = "text"` 并清空上传状态，`handleOpenEdit()` 固定锁定文本模式且不展示上传切换
  - 原因: 上传模式只用于新建，不能污染编辑已有 skill 的现有交互
- [x] 在 `SkillsPage` 中新增上传模式 UI 和事件处理
  - 位置: `FormDialog` 内容区（约 L205-L248）
  - 使用 `web/components/ui/tabs.tsx` 渲染 “文本创建 / 文件夹上传” 切换；上传面板内加入说明文本、目录选择 `<Input type="file" webkitdirectory multiple>`、待导入列表和冲突策略展示区
  - 新增 `handleUploadSelection(files)` 调用 `parseSkillUploadFiles()` 与 `validateUploadBatch()`；新增 `handleUploadSubmit(strategy?)` 构造 `FormData` 并调用 `apiUploadSkills()`
  - 首次收到 `SKILL_CONFLICT` 时展示冲突列表并缓存待重试批次；用户选择 “忽略” 直接重提，选择 “覆盖” 先打开 `ConfirmDialog` 二次确认，再以 `overwrite` 重提
  - 导入成功后 toast 展示“已导入 X 个技能，跳过 Y 个”，关闭弹窗并刷新列表
  - 原因: 设计要求把冲突决策留给用户，并且覆盖必须有明确二次确认
- [x] 保持文本创建/编辑路径不回归，并把纯文本校验函数保留为独立导出
  - 位置: `handleSave()` 与顶部导出函数区域（约 L19-L30、L97-L114）
  - `validateSkillForm()`、`buildSkillMetadata()` 继续服务文本模式；新增 `getUploadResultMessage(imported, skipped)` 或类似纯函数用于组合成功提示，避免在组件中手写字符串拼装
  - 原因: 现有文本能力是回归重点，需要在加入上传模式后继续通过原有测试
- [x] 扩展 `web/src/__tests__/config-skills-page.test.ts`，覆盖新增页面辅助逻辑
  - 测试文件: `web/src/__tests__/config-skills-page.test.ts`
  - 测试场景:
    - 文本模式校验: `validateSkillForm()` 继续对空名称/空内容报错
    - 上传结果提示: `getUploadResultMessage()` 对“仅导入”“导入+跳过”两种结果返回固定中文文案
    - 冲突错误提取: 新增纯函数从 `apiUploadSkills` 抛出的错误对象读取 `conflicts` 与 `allowedStrategies`
    - 目录选择摘要: 新增纯函数把 `uploadItems` 转成列表展示文本，缺少 `SKILL.md` 时标记为不可提交
  - 运行命令: `bun test web/src/__tests__/config-skills-page.test.ts`
  - 预期: 所有测试通过

**检查步骤:**
- [x] 验证页面已接入上传模式
  - `rg -n "createMode|apiUploadSkills|parseSkillUploadFiles|conflictStrategy|webkitdirectory" web/src/pages/SkillsPage.tsx`
  - 预期: 输出上传模式状态、文件选择入口和冲突处理逻辑
- [x] 验证前端构建与页面辅助测试通过
  - `bun test web/src/__tests__/config-skills-page.test.ts && bun run build:web`
  - 预期: 页面测试通过，前端构建成功且无类型错误

---

### Task 5: skill-folder-upload 验收

**前置条件:**
- 启动命令: `bun run start`
- 测试数据准备: 在临时目录准备 `skill-a/SKILL.md`、`skill-a/references/ref.md`、`skill-b/SKILL.md`，并额外准备一个与现有 skill 同名的上传目录用于冲突验证
- 其他环境准备: 先执行 Task 0 的工具链检查；前端代码完成后先执行 `bun run build:web`

**端到端验证:**

1. 运行本功能完整回归测试套件
   - `bun test src/__tests__/skill-service.test.ts src/__tests__/config-skills.test.ts web/src/__tests__/config-api-client.test.ts web/src/__tests__/skill-upload.test.ts web/src/__tests__/config-skills-page.test.ts && bun run build:web`
   - 预期: 所有相关测试通过，前端构建成功
   - 失败排查: Task 1 检查导入事务与回滚，Task 2 检查 multipart 路由，Task 3/4 检查前端协议与页面状态

2. 验证文本创建与编辑未回归
   - `rg -n 'test\\("set 创建新 skill"|test\\("set 覆盖已禁用 skill"' src/__tests__/config-skills.test.ts && bun test src/__tests__/config-skills.test.ts`
   - 预期: 路由测试中包含文本创建与编辑覆盖场景，且测试执行通过
   - 失败排查: 检查 Task 2 是否误改 JSON action 路由，Task 4 是否回归文本表单保存路径

3. 验证首次冲突只提示不写入
   - `rg -n 'SKILL_CONFLICT|冲突' src/__tests__/config-skills.test.ts src/__tests__/skill-service.test.ts && bun test src/__tests__/config-skills.test.ts src/__tests__/skill-service.test.ts`
   - 预期: 测试覆盖首次冲突响应和“冲突前不写盘”断言，全部通过
   - 失败排查: 检查 Task 1 冲突前置判定和 Task 2 409 响应映射

4. 验证忽略策略与 skipped 列表
   - `rg -n 'ignore|skipped' src/__tests__/config-skills.test.ts src/__tests__/skill-service.test.ts web/src/__tests__/config-skills-page.test.ts && bun test src/__tests__/config-skills.test.ts src/__tests__/skill-service.test.ts web/src/__tests__/config-skills-page.test.ts`
   - 预期: 服务层、路由层和页面提示均覆盖 `ignore` 语义，`skipped` 断言通过
   - 失败排查: 检查 Task 1 `ignore` 过滤逻辑与 Task 4 成功提示/刷新逻辑

5. 验证覆盖策略整目录替换与附属文件保留
   - `rg -n 'overwrite|整目录替换|残留文件' src/__tests__/skill-service.test.ts src/__tests__/config-skills.test.ts && bun test src/__tests__/skill-service.test.ts src/__tests__/config-skills.test.ts`
   - 预期: 覆盖导入测试明确断言旧残留文件被清理，新上传附属文件保留，测试全部通过
   - 失败排查: 检查 Task 1 快照恢复与整目录写入逻辑，Task 4 覆盖二次确认和重提逻辑
