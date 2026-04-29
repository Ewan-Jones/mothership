# skill-folder-upload 人工验收清单

**生成时间:** 2026-04-29 11:04 CST
**关联计划:** `spec/feature_20260429_F001_skill-folder-upload/spec-plan.md`
**关联设计:** `spec/feature_20260429_F001_skill-folder-upload/spec-design.md`

---

## 验收前准备

### 环境要求
- [x] [AUTO] 检查 Bun 版本: `bun --version`
- [x] [AUTO] 执行目标回归与前端构建: `bun test src/__tests__/skill-service.test.ts src/__tests__/config-skills.test.ts web/src/__tests__/config-api-client.test.ts web/src/__tests__/skill-upload.test.ts web/src/__tests__/config-skills-page.test.ts && bun run build:web`
- [x] [AUTO/SERVICE] 启动 RCS 服务: `bun run start > /tmp/skill-folder-upload-verify.log 2>&1 & echo $!` (port: 3000)
- [x] [MANUAL] 使用可登录的测试账号进入控制台，确认可访问 `http://127.0.0.1:3000/ctrl/skills`

### 测试数据准备
- [x] [MANUAL] 准备一个父目录，至少包含 `skill-a/SKILL.md`、`skill-a/references/ref.md`、`skill-b/SKILL.md`
- [x] [MANUAL] 额外准备一个与现有 skill 同名的目录，例如 `existing-skill/SKILL.md`，并确保服务器现有同名 skill 目录中预先存在一个仅旧版本包含的 `legacy.txt`，用于冲突验证
- [x] [MANUAL] 准备一个缺少 `SKILL.md` 的目录，例如 `broken-skill/readme.md`
- [x] [MANUAL] 准备两个同名上传目录样本或一组会触发前端“重复 skill 名”校验的样本

---

## 验收项目

### 场景 1：自动化回归基线

#### - [x] 1.1 功能测试与构建通过
- **来源:** `spec-plan.md` Task 5 / `spec-design.md` 验收标准
- **目的:** 确认功能整体可交付
- **操作步骤:**
  1. [A] `bun test src/__tests__/skill-service.test.ts src/__tests__/config-skills.test.ts web/src/__tests__/config-api-client.test.ts web/src/__tests__/skill-upload.test.ts web/src/__tests__/config-skills-page.test.ts && bun run build:web` → 期望包含: `pass`
  2. [A] `bun test src/__tests__/config-skills.test.ts` → 期望包含: `upload`

#### - [x] 1.2 文本创建与编辑路径未回归
- **来源:** `spec-plan.md` Task 5.2 / `spec-design.md` 目标
- **目的:** 确认现有文本流程保留
- **操作步骤:**
  1. [A] `rg -n '文本创建|set 创建新 skill|set 覆盖已禁用 skill' src/__tests__/config-skills.test.ts web/src/__tests__/config-skills-page.test.ts` → 期望包含: `set 创建新 skill`
  2. [A] `bun test src/__tests__/config-skills.test.ts web/src/__tests__/config-skills-page.test.ts` → 期望包含: `pass`

### 场景 2：文本模式可继续新建与编辑

#### - [x] 2.1 新建弹窗支持文本创建与文件夹上传切换
- **来源:** `spec-design.md` 交互设计 / `spec-plan.md` Task 4
- **目的:** 确认入口模式切换可见
- **操作步骤:**
  1. [H] 打开 `http://127.0.0.1:3000/ctrl/skills`，点击“新建技能”，查看弹窗顶部是否同时出现“文本创建”和“文件夹上传”切换 → 是/否
  2. [H] 在同一弹窗内切回“文本创建”，查看名称、描述、内容编辑区是否正常显示 → 是/否

#### - [x] 2.2 编辑已有 skill 时仍为纯文本模式
- **来源:** `spec-design.md` 前端实现 / `spec-plan.md` Task 4
- **目的:** 确认编辑场景不暴露上传模式
- **操作步骤:**
  1. [H] 在 `http://127.0.0.1:3000/ctrl/skills` 选择任一已有 skill 进入编辑，查看弹窗是否仅保留文本表单且不出现上传切换 → 是/否
  2. [H] 修改内容后保存，返回列表查看该 skill 是否仍可正常显示与再次编辑 → 是/否

### 场景 3：批量上传成功导入

#### - [x] 3.1 多个 skill 文件夹可一次导入
- **来源:** `spec-design.md` 交互设计 / `spec-plan.md` Task 4
- **目的:** 确认批量导入主流程可用
- **操作步骤:**
  1. [H] 打开 `http://127.0.0.1:3000/ctrl/skills`，在“文件夹上传”模式选择包含 `skill-a` 和 `skill-b` 的父目录，查看待导入列表是否展示两个 skill、文件数和 `SKILL.md` 检测状态 → 是/否
  2. [H] 点击“开始导入”后，查看是否出现“已导入 2 个技能”或等价成功提示，弹窗关闭后列表立即出现 `skill-a`、`skill-b` → 是/否

#### - [x] 3.2 导入后保留附属文件
- **来源:** `spec-design.md` 验收标准 / `spec-plan.md` Task 5
- **目的:** 确认目录按原样导入
- **操作步骤:**
  1. [A] `find ~/.agents/skills/skill-a -maxdepth 3 -type f | sort` → 期望包含: `references/ref.md`
  2. [H] 在 `http://127.0.0.1:3000/ctrl/skills` 刷新列表后查看 `skill-a`、`skill-b` 是否仍存在且状态正常 → 是/否

### 场景 4：上传前校验与冲突探测

#### - [x] 4.1 缺少 SKILL.md 时前端阻止提交
- **来源:** `spec-design.md` 前端基础校验 / `spec-plan.md` Task 3
- **目的:** 确认无效目录提前拦截
- **操作步骤:**
  1. [H] 打开 `http://127.0.0.1:3000/ctrl/skills` 的“文件夹上传”模式，选择仅包含 `broken-skill` 的目录，查看列表是否明确标记缺少 `SKILL.md` 且提交按钮不可用或提交后立即提示错误 → 是/否
  2. [A] `bun test web/src/__tests__/skill-upload.test.ts src/__tests__/skill-service.test.ts` → 期望包含: `SKILL.md`

#### - [x] 4.2 上传批次内部重名会失败并提示
- **来源:** `spec-design.md` 验收标准 / `spec-plan.md` Task 3
- **目的:** 确认重复 skill 名被拒绝
- **操作步骤:**
  1. [H] 打开 `http://127.0.0.1:3000/ctrl/skills` 的“文件夹上传”模式，选择会触发重复 skill 名的样本，查看是否出现重复项提示且无法进入正常导入 → 是/否
  2. [A] `bun test web/src/__tests__/skill-upload.test.ts` → 期望包含: `重复`

#### - [x] 4.3 首次检测到同名冲突时不写入任何目录
- **来源:** `spec-design.md` 同名冲突策略 / `spec-plan.md` Task 1, Task 2, Task 5.3
- **目的:** 确认冲突前无副作用
- **操作步骤:**
  1. [H] 打开 `http://127.0.0.1:3000/ctrl/skills` 的“文件夹上传”模式，上传与现有 skill 同名的目录，查看是否出现冲突列表及“忽略/覆盖”处理选项，而不是直接提示导入成功 → 是/否
  2. [A] `bun test src/__tests__/config-skills.test.ts src/__tests__/skill-service.test.ts` → 期望包含: `SKILL_CONFLICT`

### 场景 5：冲突策略处理

#### - [x] 5.1 选择忽略后仅导入非冲突项
- **来源:** `spec-design.md` 同名冲突策略 / `spec-plan.md` Task 4, Task 5.4
- **目的:** 确认部分成功语义正确
- **操作步骤:**
  1. [H] 在冲突弹窗中选择“忽略”，查看成功提示是否同时包含“已导入”和“跳过”信息，返回列表确认非冲突项已新增、冲突项未被替换 → 是/否
  2. [A] `bun test src/__tests__/config-skills.test.ts src/__tests__/skill-service.test.ts web/src/__tests__/config-skills-page.test.ts` → 期望包含: `skipped`

#### - [x] 5.2 选择覆盖前需要二次确认
- **来源:** `spec-design.md` 交互设计 / `spec-plan.md` Task 4
- **目的:** 确认覆盖操作有防误触保护
- **操作步骤:**
  1. [H] 在冲突弹窗中选择“覆盖”，查看是否先弹出二次确认提示，且提示明确说明会替换已启用或已禁用目录中的全部文件 → 是/否
  2. [H] 取消确认后，查看导入是否未继续执行且原列表内容不变 → 是/否

#### - [x] 5.3 确认覆盖后执行整目录替换
- **来源:** `spec-design.md` 同名冲突策略 / `spec-plan.md` Task 1, Task 5.5
- **目的:** 确认旧目录残留被清理
- **操作步骤:**
  1. [H] 再次执行同名上传并确认“覆盖”，查看成功提示后列表是否保留同名 skill 且内容已更新 → 是/否
  2. [A] `test ! -f ~/.agents/skills/existing-skill/legacy.txt && echo OK` → 期望精确: `OK`
  3. [A] `bun test src/__tests__/skill-service.test.ts src/__tests__/config-skills.test.ts` → 期望包含: `overwrite`

---

## 验收后清理

- [ ] [AUTO] 终止后台服务 [RCS]: `kill $PID`

---

## 验收结果汇总

| 场景 | 序号 | 验收项 | [A] | [H] | 结果 |
|------|------|--------|-----|-----|------|
| 场景 1 | 1.1 | 功能测试与构建通过 | 2 | 0 | ✅ |
| 场景 1 | 1.2 | 文本创建与编辑路径未回归 | 2 | 0 | ✅ |
| 场景 2 | 2.1 | 新建弹窗支持文本创建与文件夹上传切换 | 0 | 2 | ✅ |
| 场景 2 | 2.2 | 编辑已有 skill 时仍为纯文本模式 | 0 | 2 | ✅ |
| 场景 3 | 3.1 | 多个 skill 文件夹可一次导入 | 0 | 2 | ✅ |
| 场景 3 | 3.2 | 导入后保留附属文件 | 1 | 1 | ✅ |
| 场景 4 | 4.1 | 缺少 SKILL.md 时前端阻止提交 | 1 | 1 | ✅ |
| 场景 4 | 4.2 | 上传批次内部重名会失败并提示 | 1 | 1 | ✅ |
| 场景 4 | 4.3 | 首次检测到同名冲突时不写入任何目录 | 1 | 1 | ✅ |
| 场景 5 | 5.1 | 选择忽略后仅导入非冲突项 | 1 | 1 | ✅ |
| 场景 5 | 5.2 | 选择覆盖前需要二次确认 | 0 | 2 | ✅ |
| 场景 5 | 5.3 | 确认覆盖后执行整目录替换 | 2 | 1 | ✅ |

**验收结论:** ✅ 全部通过 / ⬜ 存在问题
