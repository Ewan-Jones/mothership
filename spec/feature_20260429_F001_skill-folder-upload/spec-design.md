# Feature: 20260429_F001 - skill-folder-upload

## 需求背景

当前 Skills 页面只能通过文本方式新建 skill：用户填写名称、描述和 Markdown 内容后，由后端生成 `SKILL.md` 并写入 `~/.agents/skills/<name>/`。这条路径适合简单 skill，但不适合已有本地 skill 目录的导入场景，尤其是包含 `SKILL.md`、`references/`、`scripts/` 等配套文件的 skill。

用户希望在保留现有文本创建能力的同时，新增“文件夹上传”方式，并支持一次导入多个 skill 文件夹；如果上传的 skill 与现有 skill 同名，用户可以选择忽略冲突项，或直接覆盖已有 skill。

## 目标

- Skills 新建入口支持 `文本创建` / `文件夹上传` 二选一
- 上传模式支持一次导入多个 skill 文件夹
- 上传时若存在同名 skill，允许用户选择 `忽略` 或 `覆盖`
- 保持现有文本创建、编辑、启用、禁用、删除能力不回归

## 方案设计

### 交互设计

Skills 页面保留现有“新建技能”入口，但弹窗顶部新增创建方式切换：

- `文本创建`：沿用当前表单，填写名称、描述、内容
- `文件夹上传`：隐藏文本内容编辑区，展示上传说明、拖拽区域和文件选择按钮

上传模式提供两种等价入口：

- 拖拽多个 skill 文件夹到上传区域
- 选择一个父目录，父目录下每个一级子目录视为一个 skill

这样可以规避浏览器对“同时选择多个独立文件夹”支持不稳定的问题，同时满足批量导入需求。

上传模式下，前端展示待导入 skill 列表，列表字段至少包含：

- skill 名（取目录名）
- 文件数
- 是否检测到 `SKILL.md`

用户点击“开始导入”前，前端先做基础校验；提交后以后端校验结果为准。

如果后端检测到与现有 skill 同名，前端不直接失败退出，而是展示冲突列表和处理策略选择：

- `忽略`：跳过所有冲突项，仅导入非冲突 skill
- `覆盖`：删除已有同名 skill 后，使用上传内容整体替换

为避免误操作，`覆盖` 选项需要二次确认，明确提示会替换已启用或已禁用目录中的全部文件。

### 前端实现

`web/src/pages/SkillsPage.tsx` 调整如下：

- 新增 `createMode` 状态，取值 `text | upload`
- 创建弹窗根据 `createMode` 条件渲染不同表单
- 文本模式继续使用现有 `formName`、`formDescription`、`formContent`
- 上传模式新增 `uploadItems` 状态，保存本次待上传目录的解析结果
- 新增 `conflicts` 和 `conflictStrategy` 状态，用于展示冲突项并保存用户选择的处理方式
- 编辑已有 skill 时仅保留文本编辑模式；上传模式只用于“新建”

上传模式的浏览器侧目录解析规则：

- 遍历 `FileList` 中每个文件的相对路径
- 取首段目录名作为 skill 名
- 按 skill 名聚合文件
- 忽略根级散文件；只有位于某个目录下的文件才参与导入

前端基础校验：

- 未解析出任何 skill 文件夹时禁止提交
- 任一 skill 文件夹缺少 `SKILL.md` 时禁止提交
- 本次上传批次内出现重复 skill 名时禁止提交
- 与服务器现有 skill 的同名不在前端静态拦截，而是在服务端检测后返回冲突列表，由用户选择忽略或覆盖

前端提交时使用 `FormData`，不走现有 JSON `apiConfigAction()` 封装，而是新增专用 API client：

- `apiUploadSkills(formData: FormData): Promise<{ imported: SkillInfo[] }>`

请求体除文件外，还包含一个 `manifest` JSON 字段，描述每个文件属于哪个 skill 及其相对路径，避免后端依赖浏览器私有字段解析。

上传分两阶段：

1. 首次提交：不带冲突策略，服务端只做校验和冲突检测
2. 若返回冲突：前端让用户选择 `ignore` 或 `overwrite`，再次提交相同文件并附带策略

### 后端接口设计

新增独立端点而不是复用 `POST /web/config/skills` 的 JSON action：

- `POST /web/config/skills/upload`

原因：

- 现有配置路由统一使用 JSON body，上传目录需要 `multipart/form-data`
- 单独端点可以减少对既有 `action` 分发逻辑的侵入

请求格式：

- `multipart/form-data`
- 字段 `manifest`：JSON 数组，元素包含 `skillName`、`path`、`fileName`
- 字段 `files`：实际文件内容，数量可多于 1
- 可选字段 `conflictStrategy`：`ignore | overwrite`

成功响应：

```json
{
  "success": true,
  "data": {
    "imported": [
      { "name": "skill-a", "enabled": true, "description": "..." }
    ],
    "skipped": ["skill-b"]
  }
}
```

冲突响应：

```json
{
  "success": false,
  "error": {
    "code": "SKILL_CONFLICT",
    "message": "以下 skill 已存在: skill-a, skill-b"
  },
  "data": {
    "conflicts": ["skill-a", "skill-b"],
    "allowedStrategies": ["ignore", "overwrite"]
  }
}
```

新增错误码语义：

- `SKILL_CONFLICT`：与现有 skill 重名，等待用户选择忽略或覆盖
- `ALREADY_EXISTS`：上传批次内部重名
- `VALIDATION_ERROR`：缺少 `SKILL.md`、manifest 非法、空上传等
- `CONFIG_WRITE_ERROR`：写入文件失败

### 后端服务设计

在 `src/services/skill.ts` 中新增专用导入能力，不复用当前 `setSkill()`：

- `setSkill()` 仍用于文本创建/编辑，保留“覆盖写入”语义，避免影响现有编辑能力
- 新增 `importSkillDirectories()`，专门处理上传导入

建议新增的数据结构：

```ts
interface UploadSkillFile {
  skillName: string;
  relativePath: string;
  content: Uint8Array;
}
```

`importSkillDirectories()` 的处理流程：

1. 校验输入非空
2. 按 `skillName` 聚合文件
3. 校验每个 skill 至少包含 `SKILL.md`
4. 校验上传批次内部无重名
5. 查询现有 enabled/disabled skill 名称
6. 若存在同名且未传 `conflictStrategy`，返回冲突列表，不写文件
7. 若 `conflictStrategy = ignore`，过滤掉冲突项，仅保留非冲突项
8. 若 `conflictStrategy = overwrite`，先删除同名的 enabled/disabled 目录，再写入上传内容
9. 为本次实际导入的 skill 创建目标目录并写入所有文件
10. 读取新写入的 `SKILL.md` 提取描述，返回导入结果与 skipped 列表

批量导入的一致性按策略区分：

- 基础校验失败时，整个批次失败
- 未选择冲突策略前，只返回冲突信息，不写任何文件
- `ignore` 时，非冲突项允许继续导入，冲突项进入 skipped
- `overwrite` 时，冲突项与非冲突项一起导入；若写入阶段失败，回滚本次已变更目录

如果写入过程中某个 skill 失败，服务层需要回滚本次已写入或已删除替换的目录，避免出现部分成功、部分失败的残留状态。对于 `overwrite`，回滚需要恢复被覆盖前的原目录快照。

### 同名冲突策略

同名判定范围包含：

- `~/.agents/skills/<name>/`
- `~/.agents/skills/_disabled/<name>/`

冲突时不做覆盖、不做合并、不自动跳过，统一返回错误，提示文案固定为：

- 首次检测到冲突时，返回冲突列表，不立即写入
- 用户选择 `忽略` 后，跳过冲突项并继续导入其余项
- 用户选择 `覆盖` 后，先删除现有 skill 目录，再写入上传目录

覆盖为整目录替换，不做文件级 merge。也就是说，旧 skill 目录下未出现在本次上传中的文件会被一并移除。

### Skill 内容约束

上传模式只负责原样导入 skill 目录，不主动改写 `SKILL.md` 内容，也不补写 frontmatter。

最低约束：

- 每个 skill 目录必须包含 `SKILL.md`
- `SKILL.md` 可被现有 `getSkill()` / `listSkills()` 兼容读取

非阻断约束：

- 若 `SKILL.md` 没有合法 frontmatter，仍允许导入；列表页描述显示为空，与当前解析逻辑保持一致

## 实现要点

- 前端需要补一个上传专用 API，不能复用统一 JSON client
- `SkillsPage` 的“新建”和“编辑”要分开处理，避免编辑场景出现上传模式
- 后端需要新增 multipart 解析逻辑，参考现有文件上传路由的 `FormData` 处理方式
- 上传导入必须与文本创建的覆盖语义隔离，避免两套“覆盖”逻辑互相影响
- `ignore` 是部分成功语义，响应中必须返回 `skipped`
- `overwrite` 需要目录级备份与恢复能力，保证失败时可以回滚

## 验收标准

- [ ] Skills 新建弹窗支持 `文本创建` / `文件夹上传` 二选一
- [ ] 文本创建现有流程保持可用，支持新建和编辑 skill
- [ ] 上传模式可一次导入多个 skill 文件夹
- [ ] 上传批次中任一 skill 缺少 `SKILL.md` 时，前后端均会阻止导入并提示错误
- [ ] 上传批次内部出现重复 skill 名时，导入失败并提示重复项
- [ ] 上传 skill 与已启用或已禁用 skill 同名时，前端会展示冲突项并允许选择 `忽略` 或 `覆盖`
- [ ] 选择 `忽略` 后，仅导入非冲突项，并在结果中展示 skipped 列表
- [ ] 选择 `覆盖` 后，同名 skill 会被整目录替换，旧目录残留文件不会保留
- [ ] 同名冲突在用户未选择策略前，不会写入任何新 skill 目录
- [ ] 导入成功后，列表页可立即看到新增 skill，且保留原目录内附属文件
- [ ] 为后端 skills 上传路由、服务层导入逻辑、前端上传模式补充对应测试
