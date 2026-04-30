# RCS UX 升级设计方案 — "Nexus Command Center"

> 明亮科技风 · AI Agent 控制中枢 · 数据驱动可视化 · 清爽专业

---

## 1. 设计理念

### 1.1 核心隐喻

将 RCS 定位为 **"AI Agent 的任务控制中心"**—— 类似 Stripe/Linear 的清爽专业感，注入 AI 产品的生命力。用户打开控制面板的第一眼，应该感受到：

- **清爽感**：白色基底、通透的层次、呼吸般的留白
- **掌控感**：一切状态一目了然，关键操作触手可及
- **高级感**：精致的排版、考究的色彩、克制的动效

### 1.2 设计原则

| 原则 | 说明 |
|------|------|
| **信息密度优先** | 一屏展示尽可能多的有效信息，减少滚动和页面跳转 |
| **状态即视觉** | Agent 状态、会话进度用颜色和动效表达，而非文字标签 |
| **渐进式复杂度** | 默认视图简洁有力，悬停/展开显示深度信息 |
| **克制的动效** | 每个动画都有明确目的（反馈/引导/表达状态），不为炫而炫 |
| **明亮为骨** | 以白色明亮主题为默认设计基准，深色为可选适配 |

### 1.3 视觉关键词

`Clean Tech` · `Bright Studio` · `Data-Clarity` · `Stripe-esque`

---

## 2. 色彩系统重构

### 2.1 主色调

从当前的单色蓝 `#409EFF` 升级为有深度和温度的色板：

```
品牌主色：  Electric Indigo  #6366F1  (indigo-500)
品牌辅色：  Quantum Cyan     #22D3EE  (cyan-400)
危险色：    Ember Red        #EF4444  (red-500)
成功色：    Neon Mint        #34D399  (emerald-400)
警告色：    Solar Amber      #FBBF24  (amber-400)
```

**选择理由**：Indigo 比 Blue 更具科技辨识度，搭配 Cyan 形成冷色系的双色层级，在白色背景上既有活力又不失专业。

### 2.2 明亮主题色板（默认）

```css
/* Surface 层级 — 通透的白色层次 */
--surface-void:     #F8FAFC;   /* 最底层背景 — 极淡灰蓝 */
--surface-base:     #FFFFFF;   /* 主背景 — 纯白 */
--surface-elevated: #FFFFFF;   /* 卡片/面板 — 纯白+微阴影 */
--surface-overlay:  #F1F5F9;   /* 悬浮层 — 淡蓝灰 */
--surface-hover:    #EEF2FF;   /* 悬停态 — 淡靛蓝 */

/* 边框 — 柔和存在 */
--border-subtle:    rgba(0, 0, 0, 0.05);
--border-default:   rgba(0, 0, 0, 0.10);
--border-active:    rgba(99, 102, 241, 0.35);

/* 文字层级 */
--text-bright:      #0F172A;   /* 标题/重点 — 深墨色 */
--text-primary:     #334155;   /* 正文 — 深灰蓝 */
--text-secondary:   #64748B;   /* 次要 — 中灰蓝 */
--text-dim:         #94A3B8;   /* 提示/占位 — 浅灰蓝 */

/* 语义色 */
--status-active:    #10B981;   /* 运行中 — 翠绿 */
--status-idle:      #6366F1;   /* 空闲 — 靛蓝 */
--status-error:     #EF4444;   /* 错误 — 红色 */
--status-warning:   #F59E0B;   /* 警告 — 琥珀 */
```

### 2.3 深色主题色板（可选适配）

```css
--surface-void:     #09090B;
--surface-base:     #0F1117;
--surface-elevated: #181B25;
--surface-overlay:  #1E2230;
--surface-hover:    #252A3A;

--border-subtle:    rgba(255, 255, 255, 0.06);
--border-default:   rgba(255, 255, 255, 0.10);
--border-active:    rgba(99, 102, 241, 0.40);

--text-bright:      #F4F4F5;
--text-primary:     #D4D4D8;
--text-secondary:   #A1A1AA;
--text-dim:         #71717A;
```

### 2.4 状态视觉反馈

Agent 状态通过颜色圆点 + 微妙的阴影变化表达，在白色背景上以柔和阴影代替发光效果：

```css
/* 运行中的 Agent — 柔和绿色阴影 */
.glow-active {
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
  animation: glow-breathe 3s ease-in-out infinite;
}

@keyframes glow-breathe {
  0%, 100% { box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.10); }
  50%      { box-shadow: 0 0 0 5px rgba(16, 185, 129, 0.20); }
}

/* 错误状态 — 红色脉冲 */
.glow-error {
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15);
  animation: glow-alert 1.5s ease-in-out infinite;
}

@keyframes glow-alert {
  0%, 100% { box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.10); }
  50%      { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0.25); }
}
```

---

## 3. 字体系统

### 3.1 字体选择

当前使用 Inter（过于通用），替换为有科技辨识度的组合：

| 用途 | 字体 | 备选 | 理由 |
|------|------|------|------|
| **Display** (标题/品牌) | **Geist Sans** | Plus Jakarta Sans | Vercel 出品，几何感强，辨识度极高 |
| **Body** (正文/UI) | **DM Sans** | Outfit | 清晰易读，比 Inter 更有温度 |
| **Mono** (代码/数据) | **JetBrains Mono** | Fira Code | 维持现状，已有连字支持 |
| **Data** (数字/指标) | **Tabular Nums** | 使用 Mono 字体 | 等宽数字，仪表盘数据对齐 |

```css
--font-display: "Geist Sans", "Plus Jakarta Sans", system-ui, sans-serif;
--font-body:     "DM Sans", "Outfit", system-ui, sans-serif;
--font-mono:     "JetBrains Mono", "Fira Code", monospace;
```

### 3.2 字号层级

```
品牌名:     14px  font-weight: 700  letter-spacing: 0.02em
页面标题:   20px  font-weight: 600  letter-spacing: -0.01em
Section:    14px  font-weight: 600  text-transform: uppercase  letter-spacing: 0.05em  color: text-dim
卡片标题:   14px  font-weight: 500
正文:       13px  font-weight: 400
辅助文字:   12px  font-weight: 400  color: text-secondary
数据指标:   28px  font-weight: 700  font-family: mono  letter-spacing: -0.02em
数据标签:   11px  font-weight: 500  text-transform: uppercase  letter-spacing: 0.06em  color: text-dim
```

---

## 4. 布局重构

### 4.1 整体布局：侧边栏 + 内容区

**当前问题**：双行顶栏导航（品牌 + Tab），8 个 Tab 水平排列，信息密度低，无层级感。

**新布局**：

```
┌──────────────────────────────────────────────────────────────┐
│ ┌──────┐ ┌──────────────────────────────────────────────────┐│
│ │      │ │  [Breadcrumb / Page Title]     [Search] [User]   ││
│ │ LOGO │ ├──────────────────────────────────────────────────┤│
│ │      │ │                                                  ││
│ │──────│ │                                                  ││
│ │ Nav  │ │              Main Content Area                   ││
│ │      │ │                                                  ││
│ │ ○ 智  │ │                                                  ││
│ │   能  │ │                                                  ││
│ │   体  │ │                                                  ││
│ │      │ │                                                  ││
│ │ ○ 模  │ │                                                  ││
│ │   型  │ │                                                  ││
│ │      │ │                                                  ││
│ │ ○ ...│ │                                                  ││
│ │      │ │                                                  ││
│ │──────│ │                                                  ││
│ │实时   │ │                                                  ││
│ │状态栏 │ │                                                  ││
│ └──────┘ └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

#### 侧边栏（240px，可折叠至 60px icon-only 模式）

```css
.sidebar {
  width: 240px;
  background: var(--surface-base);        /* 白色 */
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
}

/* 导航项 */
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  margin: 2px 8px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  transition: all 0.15s ease;
  position: relative;
}

.nav-item:hover {
  background: var(--surface-hover);       /* 淡靛蓝 */
  color: var(--text-primary);
}

.nav-item.active {
  background: rgba(99, 102, 241, 0.08);   /* 极淡靛蓝底 */
  color: var(--brand);
  font-weight: 500;
}

/* 活跃指示器 — 左侧竖线 */
.nav-item.active::before {
  content: '';
  position: absolute;
  left: -8px;
  top: 4px;
  bottom: 4px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--brand);
}
```

#### 侧边栏底部 — 实时状态面板（v2 增强）

侧边栏底部嵌入一个迷你的实时状态区，显示：

```
┌─────────────────────────┐
│ ● 3 Agents 运行中  LIVE │  ← LIVE 脉冲徽章
│ ● 12 活跃会话        12 │  ← 等宽数字
│ ↑ 2.4k events/min  2.4k │  ← 等宽数字
└─────────────────────────┘
```

**v2 增强**：
- 品牌 Logo 区带渐变背景 `linear-gradient(to bottom, #FFFFFF, #F8FAFC)` 和阴影 `box-shadow: 0 2px 8px rgba(99,102,241,0.25)`
- LIVE 徽章：绿色背景 + 脉冲动画 `counter-glow`，表达系统活跃状态
- 等宽数值右对齐，字体 `JetBrains Mono` 600 weight

用小圆点和颜色传达系统脉搏，不需要点击展开就能感知系统状态。

### 4.2 内容区顶部栏

```
[← 返回]  Dashboard / 智能体                    [🔍] [👤 user@email.com]
```

- 面包屑导航
- 全局搜索（Command+K 触发）
- 用户头像（点击展开菜单）

---

## 5. Dashboard 重新设计（核心页面）

### 5.1 页面结构

**布局方案**：三栏命令中心（v2 升级版，已实现在 `design-preview.html`）

```
┌──────────────────────────────────────────────────────────────────┐
│  概览指标栏 (KPI Strip) — 5 张卡片                                │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                   │
│  │  5   │ │  12  │ │  3   │ │ 99.2%│ │ 1.2k │                   │
│  │Agents│ │会话数│ │ 运行 │ │可用率│ │事件  │                   │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘                   │
├───────────┬─────────────────────────┬────────────────────────────┤
│ ACTIVE    │                         │                            │
│ AGENTS    │   Agent 拓扑 (Enhanced)  │   活动时间线 (Compact)      │
│ (260px)   │                         │   (320px)                  │
│           │   [数据粒子漂移动画]       │                            │
│ ┌───────┐ │                         │   ○ agent-prod 完成审查     │
│ │prod   │ │        ┌──────┐          │   ○ agent-dev 请求权限      │
│ │●运行中 │ │    ────┤RCS   ├────     │   ○ agent-build 调用grep   │
│ │4会话  │ │   ╱    │Hub   │    ╲    │   ○ agent-test 超时重试    │
│ │━━━━━━ │ │  ╱     └──────┘     ╲   │                            │
│ └───────┘ │ ●prod  ◉dev  ●build     │                            │
│ ┌───────┐ │                         │                            │
│ │dev    │ │   [节点脉冲光环]          │                            │
│ │●运行中 │ │   [连线渐变粒子]          │                            │
│ │━━━━━━━ │ │                         │                            │
│ └───────┘ │                         │                            │
│ ┌───────┐ │                         │                            │
│ │build  │ │                         │                            │
│ │◉空闲   │ │                         │                            │
│ │━━━━   │ │                         │                            │
│ └───────┘ │                         │                            │
├───────────┴─────────────────────────┴────────────────────────────┤
│  Agent 列表 (Table View / Card View 切换)                        │
│  ┌─ 表格模式 ──────────────────────────────────────────────────┐ │
│  │  名称         状态      会话    最后活动    模型        操作  │ │
│  │  agent-prod   ●运行中    4      3秒前    sonnet-4-6   [→]  │ │
│  │  agent-dev    ◉空闲      2      5分钟前  opus-4-7     [→]  │ │
│  │  agent-build  ●运行中    1      12分钟前 gpt-4o       [→]  │ │
│  │  agent-test   ⚠错误      0      2小时前  deepseek-r1  [↻]  │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌─ 卡片模式 ──────────────────────────────────────────────────┐ │
│  │ [icon] agent-prod   运行中  │ [icon] agent-dev    空闲      │ │
│  │ claude-sonnet-4-6           │ claude-opus-4-7              │ │
│  │  4 会话  │  1.2k Events     │  2 会话  │  890 Events       │ │
│  │  3秒前活跃          [→]     │  5分钟前活跃         [→]     │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

#### 三栏布局设计要点

| 栏位 | 宽度 | 内容 | 交互 |
|------|------|------|------|
| **左栏** — Agent Quick Cards | 260px | 紧凑状态卡，左彩色竖线指示器、会话数/最后活动时间、活跃度进度条 | 悬停右移 shadow lift，点击跳转 Agent 详情 |
| **中栏** — 增强拓扑 | 1fr | 大型 SVG 节点图，数据粒子沿连线漂移、运行中节点脉冲光环、悬停放大 | 点击节点跳转对应 Agent 对话 |
| **右栏** — 活动时间线 | 320px | 6 条最近事件，紧凑排版 (12px)，10s 自动轮播新事件入场 | 自动滚动，8 秒间隔追加新事件 |

#### Agent Quick Cards 规范

```css
/* 每个 Agent 紧凑卡片 */
.agent-quick-card {
  border-left: 3px solid (状态色);
  padding: 12px 14px;
}

/* 状态色映射 */
.running → #10B981 (emerald)
.idle    → #6366F1 (indigo)  
.warning → #F59E0B (amber)
.error   → #EF4444 (red)

/* 底部活跃度进度条 */
.agent-quick-card-bar-fill {
  height: 2px; border-radius: 1px;
}
.running → width: 85%
.idle    → width: 45%
```

#### 增强拓扑动效

- **数据粒子**：沿连线匀速漂移，3 个粒子错峰 (0s / 0.3s / 0.5s 延迟)
- **脉冲光环**：运行中节点外圈 scale(1)→scale(2) 透明度 0.3→0，2s 循环
- **呼吸边框**：glow-breathe 动画 (3s 循环)，节点边框阴影波动
- **悬停放大**：transform: scale(1.05)，0.3s 过渡

### 5.2 KPI 指标条

替换当前简单的 Agent 卡片网格，顶部用数据指标条提供全局感知：

```tsx
// 每个指标卡片
<KPICard
  label="AGENTS"
  value={5}
  icon={<Bot />}
  trend="+2 this week"
  sparkline={[3, 4, 3, 5, 4, 5, 5]}  // 迷你趋势线
  color="brand"
/>
```

**视觉规格**：

```css
.kpi-card {
  background: var(--surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 16px 20px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

/* 数值 — 大号等宽字体 */
.kpi-value {
  font-family: var(--font-mono);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1;
  color: var(--text-bright);
}

/* 标签 — 微型大写 */
.kpi-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-dim);
  margin-top: 4px;
}

/* 迷你趋势线 — 底部装饰 */
.kpi-sparkline {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 24px;
  opacity: 0.15;
}
```

### 5.3 Agent 拓扑/状态可视化

用简洁的节点图展示 Agent 之间的拓扑关系和实时状态。这不是完整的 3D 可视化，而是一个轻量的 2D 节点图：

```
         ┌──────────┐
         │  RCS Hub  │
         └────┬─────┘
        ┌─────┼─────┐
   ┌────┴──┐ ┌┴────┐ ┌────┴──┐
   │Agent-A│ │Agent-B│ │Agent-C│
   │ ● 运行 │ │ ○ 空闲│ │ ● 运行 │
   └───────┘ └──────┘ └───────┘
```

**实现方案**：使用纯 CSS + SVG 的节点图（不需要引入重量级库如 D3），节点用 `motion.div` 做呼吸动画。

每个节点：

- 圆角矩形，内含 Agent 名称 + 状态指示灯
- 运行中的节点有 `glow-breathe` 动画
- 节点之间的连线用 SVG `<line>` 或 `<path>`
- 点击节点进入 Agent 对话

### 5.4 活动时间线

右侧面板展示最近的事件流，用时间线形式：

```css
.timeline-item {
  display: flex;
  gap: 12px;
  padding: 8px 0;
  font-size: 13px;
  
}

/* 时间线圆点 */
.timeline-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 5px;
  flex-shrink: 0;
}

/* 新事件入场动画 */
.timeline-item {
  animation: timeline-enter 0.4s ease-out;
}

@keyframes timeline-enter {
  from { opacity: 0; transform: translateX(-12px); }
  to   { opacity: 1; transform: translateX(0); }
}
```

### 5.5 Agent 列表

底部用数据表替代纯卡片视图（可切换 Card/Table 视图）：

- 表格行有微妙的悬停高亮（`surface-hover` 背景色渐变）
- 状态列用发光圆点 + 状态文字
- 最后活动时间用相对时间（"3秒前"），实时更新
- 操作列在悬停时才显示，减少视觉噪音

---

## 6. 会话详情页升级

### 6.1 布局

```
┌──────────────────────────────────────────────────────────┐
│ [← 返回]  Session: agent-prod / session-abc123           │
│           ● Running · Started 5min ago                    │
├──────────────────────────────────────────────────────────┤
│ ┌ Model │ Tokens  │ Tools │ Duration ──────────────────┐ │
│ │ sonnet │ 4.6k/   │ 21    │ 5m 23s                    │ │
│ │ -4-6   │ 200k    │ calls │                           │ │
│ └──────────────────────────────────────────────────────┘ │
├───────────────────────┬──────────────────────────────────┤
│                       │                                  │
│   Chat 消息流          │   Context Panel (可折叠)    [◀]  │
│                       │                                  │
│   ┌─────────────────┐ │   ┌──────────────────────────┐  │
│   │ User message    │ │   │ Agent Info               │  │
│   └─────────────────┘ │   │ Model: claude-sonnet-4-6 │  │
│                       │   │ Tokens: 1.2k / 3.4k      │  │
│   ┌─────────────────┐ │   │ Duration: 5m 23s          │  │
│   │ Assistant       │ │   │                          │  │
│   │ response        │ │   │ Tools Used               │  │
│   │                 │ │   │ ████████░░ bash (8)      │  │
│   │ [tool_use]      │ │   │ ██████░░░░ edit (6)      │  │
│   │  └ bash (执行中) │ │   │ ███░░░░░░░ grep (3)     │  │
│   │  └ edit (完成)  │ │   │                          │  │
│   │                 │ │   │ Permission Requests      │  │
│   └─────────────────┘ │   │ ● bash: 3 pending        │  │
│                       │   └──────────────────────────┘  │
│   ● ● ● (typing...)   │                                  │
│                       │                                  │
│ ═════════════════════ │                                  │
│ [输入消息...]     [→]  │                                  │
└───────────────────────┴──────────────────────────────────┘
```

#### v2 升级要点

- **会话状态条**：4 个微型数据块横排 (Model / Tokens / Tools / Duration)，替换单独的 meta 文字行
- **Context Panel 折叠**：侧边圆形按钮切换展开/折叠，`grid-template-columns: 1fr 320px` → `1fr 0px`，300ms 平滑过渡
- **打字指示器**：三点弹跳动画 (1.4s 循环，逐级 0.2s 延迟)，Assistant 思考时显示
- **聊天交互**：输入消息后显示 typing indicator → 1.5-2.5s 后助手回复入场 (message-enter 动画)

### 6.2 消息流增强

**当前问题**：消息是静态的卡片，没有节奏感和生命力。

**改进**：

1. **打字机效果**：Assistant 回复时，文字逐字/逐段出现（使用 `motion.div` 的 stagger 动画）
2. **工具调用可视化**：展开时显示工具执行的实时状态

```tsx
// 工具调用卡片 — 三种状态
<ToolCallCard status="running">   // 黄色边框 + 旋转 loading 图标
<ToolCallCard status="success">   // 绿色边框 + 结果摘要
<ToolCallCard status="error">     // 红色边框 + 错误信息
```

1. **代码块增强**：
   - 顶部显示语言标签 + 文件路径
   - 右上角复制按钮，复制成功后显示绿色对勾（而非 toast）
   - diff 格式的代码块用红绿高亮

2. **消息间距节奏**：
   - 同一角色的连续消息间距紧凑（8px）
   - 不同角色切换时间距宽松（20px）
   - 用户消息右对齐，Assistant 左对齐，形成对话节奏

### 6.3 Context Panel（新增）

右侧信息面板（可折叠），展示当前会话的上下文数据：

- **Agent 信息**：模型、温度等配置
- **Token 消耗**：实时更新的 token 计数器 + 环形进度图
- **工具使用统计**：横向条形图，按调用次数排序
- **权限请求队列**：当前等待审批的请求列表

---

## 7. 配置页面升级

### 7.1 统一的配置页面框架

当前各配置页面（Models、Agents、Skills、MCP）各自为政，视觉不统一。

**改进方案**：统一的配置页面框架

```
┌──────────────────────────────────────────────────────────┐
│  模型配置                              [+ 新增] [Import]  │
│                                                          │
│  ┌─ Tabs ─────────────────────────────────────────────┐  │
│  │ Providers │ Models │ 测试                            │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  搜索 / 过滤 / 排序工具栏                           │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  数据表 / 卡片网格                                  │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### 7.2 表格增强

- **行展开动画**：使用 `motion.div` 的 `layout` + `AnimatePresence`，展开/折叠有平滑过渡
- **行悬停**：左侧出现品牌色竖线指示器
- **批量操作栏**：选中行时从底部滑入操作栏（而非固定在顶部）
- **空状态**：有品牌感的空状态插画 + 引导文案

### 7.3 表单体验

- **分步表单**：复杂创建流程拆分为 2-3 步（基本信息 → 高级配置 → 确认）
- **实时校验**：输入时即时反馈，而非提交后才报错
- **表单状态指示**：填写进度条（Step 1/3 → 2/3 → 3/3）

---

## 8. 动效系统

### 8.1 动效层级

| 层级 | 时长 | 缓动 | 场景 |
|------|------|------|------|
| **Micro** | 100-150ms | ease-out | 悬停、聚焦、按下 |
| **Small** | 200-300ms | ease-in-out | 展开/折叠、开关切换 |
| **Medium** | 300-500ms | ease-out | 页面元素入场、弹窗出现 |
| **Large** | 500-800ms | ease-in-out | 页面切换、布局变化 |

### 8.2 关键动效规范

#### 页面入场 — Stagger Fade Up

```tsx
import { motion } from "motion/react";

// 页面容器
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ duration: 0.3 }}
>
  {/* 子元素依次入场 */}
  {items.map((item, i) => (
    <motion.div
      key={item.id}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.05, duration: 0.3 }}
    >
      {item}
    </motion.div>
  ))}
</motion.div>
```

#### Agent 卡片悬停 — Elevate

```css
.agent-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.agent-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04);
}
```

#### 侧边栏折叠 — Smooth Width

```tsx
<motion.aside
  animate={{ width: collapsed ? 60 : 240 }}
  transition={{ type: "spring", stiffness: 300, damping: 30 }}
>
```

#### 数字变化 — Counting Animation

KPI 数字变化时用计数动画（从旧值滚动到新值），使用 `motion` 的 `useSpring`：

```tsx
const animatedValue = useSpring(targetValue, {
  stiffness: 100,
  damping: 20,
});
```

#### 状态变化 — Color Transition

Agent 状态变化时，背景色和发光效果平滑过渡：

```css
.status-indicator {
  transition: background-color 0.5s ease, box-shadow 0.5s ease;
}
```

### 8.3 使用 motion 库的组件清单

| 组件 | 动效类型 | 优先级 |
|------|---------|--------|
| AppShell 侧边栏折叠 | layout animation | P0 |
| Dashboard KPI 卡片 | stagger fadeUp | P0 |
| Dashboard Agent 节点 | presence + pulse | P1 |
| Agent 列表行展开 | AnimatePresence | P1 |
| 消息流新消息入场 | slideIn from bottom | P0 |
| 工具调用状态切换 | layout + color transition | P1 |
| 页面切换 | crossFade | P2 |
| 侧边栏导航 active 指示器 | layoutId 共享元素 | P2 |
| 表单弹窗 | spring scale + fade | P1 |
| Context Panel 展开/折叠 | layout | P1 |

---

## 9. 组件设计规范

### 9.1 卡片组件

```css
/* 标准卡片 */
.card {
  background: var(--surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 20px;
}

/* 可交互卡片 — 悬停提升 */
.card-interactive:hover {
  border-color: var(--border-default);
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.08), 0 1px 4px rgba(0, 0, 0, 0.04);
  transform: translateY(-1px);
}

/* 选中卡片 — 品牌色边框 */
.card-selected {
  border-color: var(--border-active);
  box-shadow: 0 0 0 1px var(--border-active);
}
```

### 9.2 按钮层级

```
Primary:    品牌色填充 (#6366F1) + 白色文字
Secondary:  surface-elevated 填充 + border-subtle 边框
Ghost:      透明背景，悬停时 surface-hover
Danger:     red-500 填充 / ghost + red-500 文字
```

所有按钮的过渡时长 150ms，按下时缩放至 0.98：

```css
.button {
  transition: all 0.15s ease;
}
.button:active {
  transform: scale(0.98);
}
```

### 9.3 输入框

```css
.input {
  background: var(--surface-base);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-primary);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.input:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
  outline: none;
}
```

### 9.4 状态指示器

替代当前的简单圆点，用带柔和阴影的指示器（适合白色背景）：

```tsx
function StatusDot({ status }: { status: string }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      {/* 外圈呼吸光晕 — 仅 running/active 状态 */}
      {(status === "running" || status === "active") && (
        <span className="absolute inset-0 rounded-full bg-emerald-500 animate-pulse opacity-20" />
      )}
      {/* 实心圆点 */}
      <span className={cn(
        "relative rounded-full h-2.5 w-2.5",
        statusColors[status]
      )} />
    </span>
  );
}
```

---

## 10. 需要引入的依赖

### 10.1 新增依赖

| 库 | 版本 | 用途 | 大小影响 |
|----|------|------|---------|
| `recharts` | ^2.x | KPI 迷你趋势线、工具使用统计图表 | ~45kb gzipped |
| `lucide-react` | 已有 | 维持现状 | — |
| `motion` | 已有 (v12) | 全面启用动画 | — |

### 10.2 不建议引入

| 库 | 原因 |
|----|------|
| `three.js` / `react-three-fiber` | 过重，2D 节点图用 CSS/SVG 足够 |
| `d3` | 过于底层，recharts 已覆盖需求 |
| `framer-motion` | 已有 `motion` v12（同一作者的升级版） |

### 10.3 字体加载

```html
<!-- Geist Sans — 从 CDN 或本地部署 -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/geist@1/dist/fonts/geist-sans/style.css" />

<!-- DM Sans — Google Fonts -->
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" />
```

建议将字体文件下载到 `web/public/fonts/` 本地托管，避免 CDN 依赖。

---

## 11. 实施路线图

### Phase 1 — 基础设施（1-2 天）

1. **色彩系统迁移**：更新 `web/src/index.css` 的 `@theme` 变量
2. **字体引入**：加载 Geist Sans + DM Sans，更新 CSS 变量
3. **侧边栏布局**：重构 AppShell，从顶栏 Tab 切换到侧边栏导航
4. **全局组件样式**：更新 Button、Input、Card 等基础组件

### Phase 2 — Dashboard 重构（2-3 天）

1. **KPI 指标条**：新增 `web/src/components/dashboard/KPICard.tsx`
2. **Agent 节点图**：新增 `web/src/components/dashboard/AgentTopology.tsx`
3. **活动时间线**：新增 `web/src/components/dashboard/ActivityTimeline.tsx`
4. **Agent 数据表**：重构 Dashboard 列表视图，支持 Table/Card 切换
5. **实时数据轮询**：接入后端 API，定时刷新指标数据

### Phase 3 — 会话详情页增强（2-3 天）

1. **双栏布局**：Chat + Context Panel
2. **消息流动效**：新消息入场动画、工具调用状态可视化
3. **Context Panel**：Token 统计、工具使用条形图、权限队列
4. **代码块增强**：语言标签、文件路径、diff 高亮

### Phase 4 — 配置页面统一（2-3 天）

1. **配置页框架**：统一 Tabs + Toolbar + Table/Card 切换
2. **表格动效**：行展开动画、批量操作栏滑入
3. **表单优化**：分步表单、实时校验
4. **空状态设计**：每个配置页的空状态插画

### Phase 5 — 全局动效打磨（1-2 天）

1. **页面切换过渡**
2. **侧边栏 `layoutId` 共享动画**
3. **数字计数动画**
4. **加载骨架屏升级**
5. **暗/亮主题切换动画**

---

## 12. 性能注意事项

| 关注点 | 策略 |
|--------|------|
| 动画性能 | 只对 `transform` 和 `opacity` 做动画，避免 layout thrash |
| 字体加载 | 使用 `font-display: swap` + preload 关键字体 |
| 图表渲染 | Recharts 使用 `React.memo` 避免不必要的重绘 |
| 实时数据 | 使用 requestAnimationFrame 节流数字动画 |
| SVG 节点图 | 虚拟化：超过 50 个节点时只渲染视口内的节点 |
| 暗色模式 | 使用 CSS 变量切换，不重新渲染组件。白色主题为默认，深色为可选 |

---

## 13. 无障碍 & 用户体验兜底

- 所有颜色变化有对应的文字说明（不依赖色觉）
- 动画尊重 `prefers-reduced-motion`
- 侧边栏键盘可导航（Tab + Enter）
- 所有图标有 `aria-label`
- 数据表格有正确的 `<th scope>` 和 `<caption>`
- 深色模式下确保 WCAG AA 对比度（4.5:1）

---

## 14. 设计参考

| 产品 | 借鉴点 |
|------|--------|
| **Linear** | 侧边栏交互、键盘快捷键、过渡动画、白色清爽感 |
| **Stripe** | 明亮科技风、品牌色点缀、表格密度、数据卡片 |
| **Notion** | 白色基底、留白节奏、清爽排版 |
| **Vercel Dashboard** | 极简排版、Geist 字体、Indigo 色系 |
| **Raycast** | Command+K 全局搜索、层级导航 |

---

*本方案由 RCS 团队与 Claude 协作制定，作为 UX 升级的指导性文档。各 Phase 可根据实际开发资源灵活调整优先级。*

---

## 15. v2 布局升级记录 (2026-04-30)

### 已变更

| 模块 | 变更内容 | 文件 |
|------|---------|------|
| **Dashboard** | 2 列 → 3 列布局：左栏 Agent Quick Cards (260px) + 中栏增强拓扑 (1fr) + 右栏紧凑时间线 (320px) | `design-preview.html` |
| **Dashboard** | Agent 列表新增表格/卡片双视图切换 (`.agent-card-grid`) | `design-preview.html` |
| **Dashboard** | 拓扑 SVG 增强：数据粒子漂移动画、脉冲光环、悬停放大 | `design-preview.html` |
| **Dashboard** | Agent Quick Cards：状态色左竖线、活跃度进度条、悬停右移效果 | `design-preview.html` |
| **会话详情** | 新增会话状态条 (Model / Tokens / Tools / Duration 横排数据块) | `design-preview.html` |
| **会话详情** | Context Panel 可折叠 (圆形按钮切换，300ms 过渡) | `design-preview.html` |
| **会话详情** | 打字指示器 (三点弹跳动画) + 聊天输入交互 | `design-preview.html` |
| **会话详情** | 消息间距节奏调整：同一角色 4px，角色切换 12px | `design-preview.html` |
| **侧边栏** | 品牌区渐变背景 + Logo 阴影 | `design-preview.html` |
| **侧边栏** | 状态面板新增 LIVE 脉冲徽章和等宽数字 | `design-preview.html` |

### CSS 新增变量

```css
/* 3 列网格 */
.dash-row-3col { grid-template-columns: 260px 1fr 320px; }

/* Agent Quick Card 状态色竖线 */
.agent-quick-card.running::after { background: #10B981; }
.agent-quick-card.idle::after    { background: #6366F1; }
.agent-quick-card.warning::after { background: #F59E0B; }
.agent-quick-card.error::after   { background: #EF4444; }

/* 数据粒子漂移 */
@keyframes particle-drift {
  0%, 100% { opacity: 0.4; transform: translateX(0); }
  50%      { opacity: 1; transform: translateX(8px); }
}

/* 打字弹跳 */
@keyframes typing-bounce {
  0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-3px); }
}

/* Context Panel 折叠过渡 */
.session-layout.panel-collapsed { grid-template-columns: 1fr 0px; }
.context-panel.collapsed { width: 0; opacity: 0; overflow: hidden; }
```
