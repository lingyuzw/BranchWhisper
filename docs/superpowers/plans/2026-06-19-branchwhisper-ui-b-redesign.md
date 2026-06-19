# BranchWhisper B 方案 UI 重构计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 BranchWhisper 的主要页面改造成“一个主任务 + 一个状态摘要 + 一个高级详情入口”的清晰工作台，让用户快速知道每页功能、当前状态和下一步操作。

**Architecture:** 保留现有 Vue 3 + Vite + Pinia + Vue Router 架构，不改后端接口和业务 store。先建立统一视觉 token、页面骨架和可复用工作台组件，再逐页把现有内容迁移到一致的信息层级中。

**Tech Stack:** Vue 3, TypeScript, Pinia, Vue Router, Vite, lucide-vue, CSS variables, existing page-level CSS.

---

## 1. 设计框架

### 1.1 产品定位

BranchWhisper 不是营销站，也不是纯开发者控制台。它应该是“本地语音 AI 机器人工作台”：

- 用户第一需求：能聊天、能接入微信、能让模型服务跑起来。
- 用户第二需求：知道系统哪里坏了、该点什么修复。
- 用户第三需求：配置模型、语音、记忆、素材、工具等高级能力。

因此视觉方向应是：**安静、清晰、温暖的本地 AI 控制台**。不要做大 hero，不要堆装饰卡片，不要让日志和参数成为第一视觉。

### 1.2 B 方案页面原则

每个页面统一成四层：

1. **Page Header**
   显示页面名称、功能一句话、主状态、主操作。

2. **Status Summary**
   只放 2-4 个关键状态，不放长路径、命令、日志、JSON。

3. **Primary Workbench**
   页面真正要完成的主任务。例如对话、启动服务、扫码接入、管理素材。

4. **Advanced / Diagnostics**
   日志、API 参数、命令行、检测结果、长路径全部进入折叠区、抽屉、详情弹窗或右侧辅助栏。

### 1.3 导航框架

保留现有路由，但文案语义更接近用户任务：

- `对话`：和机器人聊天，验证语音体验。
- `服务`：启动和管理本地模型服务。
- `诊断`：检查链路异常并查看修复建议。
- `接入`：连接微信机器人并测试收发。
- `记忆`：查看、添加和清理长期偏好。
- `素材库`：上传、识别、审核和选择表情包。
- `配置`：选择模型、语音、工具和外观。

顶部导航不增加层级。复杂度通过页面内部的“基础 / 高级”分层解决。

---

## 2. 色彩与视觉统一

### 2.1 当前问题

现有浅色界面大量使用米色、棕金、浅边框，所有卡片边界都很明显，导致页面显得“全是框”。深色主题有质感，但浅色主题截图里更像调试面板，层级不够干净。

### 2.2 统一色彩方向

采用“暖灰底 + 低饱和青绿状态 + 琥珀主操作 + 克制红色风险”的色彩系统。

浅色主题建议：

- `--bg`: `#f6f4ef`，页面背景，不要太黄。
- `--bg-elevated`: `#eeebe3`，顶部栏和轻背景。
- `--surface`: `#fffdf8`，主要面板。
- `--surface-muted`: `#f0eee7`，输入框、弱区域。
- `--text`: `#242620`，正文。
- `--text-soft`: `#57594f`，说明。
- `--text-muted`: `#858579`，辅助标签。
- `--border`: `#d8d0c2`，普通边框。
- `--primary`: `#9a6b34`，主按钮。
- `--info`: `#2f7f7b`，信息/链路状态。
- `--success`: `#4e7f53`，正常。
- `--warning`: `#a86c32`，等待/警告。
- `--danger`: `#ad514b`，失败/删除。

深色主题建议：

- `--bg`: `#171913`，柔和墨绿灰。
- `--bg-elevated`: `#202119`。
- `--surface`: `#282820`。
- `--surface-muted`: `#1f211a`。
- `--primary`: `#d4b36a`。
- `--info`: `#75c8bd`。
- 其他状态沿用现有低饱和方案。

### 2.3 色彩使用规则

- 主色只用于主按钮、当前导航、关键数字、当前步骤。
- 青绿色用于“链路、连接、检测、信息状态”。
- 绿色只表示成功或可用。
- 橙色/琥珀只表示等待、注意、主操作，不混用。
- 红色只表示失败、危险删除、不可恢复操作。
- 页面背景不再使用多层强放射光，减少为极淡纹理或单层柔和渐变。
- 同一页面最多出现 1 个强主按钮，其他按钮使用次级样式或图标按钮。

### 2.4 形状、边框、阴影

- 卡片圆角保持 8px 或更小。
- 少用卡片套卡片。页面区块用无边框布局或浅背景带，重复项才用卡片。
- 边框统一 `1px solid var(--border)`，不要每个小元素都画重边框。
- 阴影只用于浮层、抽屉、顶部栏和当前重要面板。
- 日志区域用专属 `--log-bg`，但默认不在首屏抢视觉。

### 2.5 字体层级

- 页面标题：24-28px。
- 分区标题：16-18px。
- 卡片标题：14.5-16px。
- 正文：14-16px。
- 辅助说明：12.5-13.5px。
- 不使用 viewport 动态缩放字体。
- 所有中文按钮避免过长，超过 5-6 个字时改为图标 + tooltip 或放到菜单。

---

## 3. 可复用模块

### 3.1 新增通用组件目录

建议新增：

```text
frontend/src/components/ui/
  PageHeader.vue
  StatusSummary.vue
  StatusMetric.vue
  TaskPanel.vue
  AdvancedDisclosure.vue
  LogDrawer.vue
  StepFlow.vue
  EmptyState.vue
  SectionToolbar.vue
```

不要引入新 UI 框架，继续使用现有 Vue + CSS。

### 3.2 PageHeader.vue

职责：统一所有非对话页顶部结构。

Props：

- `eyebrow: string`
- `title: string`
- `description: string`
- `statusText?: string`
- `statusTone?: "idle" | "ok" | "warning" | "danger" | "running"`

Slots：

- `actions`：主按钮和次级按钮。

使用页面：

- ServicesPage
- DiagnosticsPage
- IntegrationsPage
- MemoryPage
- AssetsPage
- SettingsPage

### 3.3 StatusSummary.vue + StatusMetric.vue

职责：统一 2-4 个关键状态卡。

Metric 数据结构：

```ts
interface StatusMetricItem {
  label: string;
  value: string | number;
  detail?: string;
  tone?: "neutral" | "ok" | "warning" | "danger" | "info";
  icon?: Component;
}
```

规则：

- 每页最多 4 个。
- 不显示长 URL、长路径、完整命令。
- 可以点击的 metric 必须有明确 hover 状态。

### 3.4 TaskPanel.vue

职责：承载每页主任务，不做复杂业务，只提供一致标题、说明、toolbar、body。

Slots：

- `toolbar`
- `default`
- `footer`

使用示例：

- 服务页服务卡区域。
- 接入页扫码/桥接流程。
- 记忆页搜索和记忆列表。
- 素材页图库。

### 3.5 AdvancedDisclosure.vue

职责：统一高级内容折叠。

适合放：

- API URL / Key / Tokens
- 服务命令
- 长路径
- 诊断 JSON
- 衰减清理参数
- 识图和策略测试细节

规则：

- 默认关闭。
- 标题必须是用户能理解的，例如“高级参数”“查看日志”“命令详情”。
- 展开后不改变主任务区的布局宽度。

### 3.6 LogDrawer.vue

职责：统一服务日志、接入日志、诊断日志。

功能：

- 复制
- 清空
- 只看错误
- 暂停滚动
- 下载/导出可后续加

默认策略：

- 服务页可放底部固定区域。
- 诊断页可放右侧辅助栏或抽屉。
- 接入页默认折叠。

### 3.7 StepFlow.vue

职责：统一“步骤式任务”。

使用页面：

- 接入页：新增机器人 -> 扫码登录 -> 启动桥接 -> 测试收发。
- 诊断页：输入 -> VAD -> ASR -> LLM -> TTS -> 播放。
- 素材页：上传 -> 识别 -> 审核 -> 可发送。

Step 数据结构：

```ts
interface StepFlowItem {
  key: string;
  label: string;
  description?: string;
  state: "idle" | "current" | "ok" | "warning" | "failed";
}
```

---

## 4. 页面改造计划

### 4.1 全局骨架

Files：

- Modify: `frontend/src/styles/base.css`
- Modify: `frontend/src/styles/layout.css`
- Modify: `frontend/src/components/layout/AppShell.vue`
- Create: `frontend/src/components/ui/*.vue`
- Create: `frontend/src/styles/ui.css`
- Modify: `frontend/src/styles/main.css`

目标：

- 抽出统一页面宽度：普通工作台 `min(1360px, calc(100vw - 32px))`，诊断宽屏 `min(1440px, calc(100vw - 32px))`。
- 建立 `.workspace-page`、`.workspace-grid`、`.page-section`、`.advanced-region`。
- 减少页面大面积空白和中间窄栏感。
- 保持移动端单列。

验收：

- 7 个页面顶部高度、标题位置、主按钮位置一致。
- 页面在 1440px、1920px 下不再显得挤在中间。
- 760px 以下没有按钮文字溢出。

### 4.2 对话页

Files：

- Modify: `frontend/src/pages/DashboardPage.vue`
- Modify: `frontend/src/components/dashboard/ConversationSidebar.vue`
- Modify: `frontend/src/components/dashboard/RuntimeMetrics.vue`
- Modify: `frontend/src/styles/pages/dashboard.css`

目标：

- 对话内容是绝对主角。
- 左侧栏只放：新建、搜索、会话列表、简化链路状态。
- 当前运行状态从底部多个小框改为一条简洁 pipeline。
- 输入区按钮统一：语音、图片、发送、播放/静音、停止。

页面信息结构：

- Header：顶部导航已有，不再额外加复杂标题。
- Left Rail：会话管理。
- Main：聊天流。
- Composer：输入与语音控制。
- Status：一行 ASR/LLM/TTS/TRACE 状态。

高级内容：

- trace、底层指标、WebSocket 细节默认隐藏。

验收：

- 用户打开首页能直接开始聊天。
- 运行状态不会像调试面板一样抢占注意力。
- 大屏下聊天区视觉中心稳定，消息不会散在过宽区域。

### 4.3 服务页

Files：

- Modify: `frontend/src/pages/ServicesPage.vue`
- Modify: `frontend/src/components/services/ServiceCard.vue`
- Modify: `frontend/src/components/services/ResourceSection.vue`
- Modify: `frontend/src/components/services/ServiceLogsPanel.vue`
- Modify: `frontend/src/styles/pages/services.css`

目标：

- 主任务：启动/停止 ASR、LLM、TTS。
- 首页视觉只回答：资源够不够、服务有没有跑、下一步点哪里。
- 日志和参数进入高级区域。

页面结构：

- PageHeader：服务编排；说明“启动和管理本地语音识别、对话模型、语音合成服务”。
- StatusSummary：CPU、内存、GPU、运行服务数量。
- Primary Workbench：3 个服务卡。
- Advanced：本地服务 Health 检测、运行日志、参数详情。

服务卡只保留：

- 服务名
- 运行状态
- 端口
- 健康
- 主按钮：启动/停止
- 次按钮：重启、详情

移出首屏：

- PID
- cwd
- config path
- log file
- 完整命令
- 长错误堆栈

验收：

- 停止状态下，一眼能看到“一键启动”和每个服务的启动按钮。
- 日志不会占据页面主要高度。
- 资源卡进度条对齐。

### 4.4 接入页

Files：

- Modify: `frontend/src/pages/IntegrationsPage.vue`
- Modify: `frontend/src/components/integrations/IntegrationLoginPanel.vue`
- Modify: `frontend/src/components/integrations/IntegrationProbePanel.vue`
- Modify: `frontend/src/components/integrations/IntegrationSessionsPanel.vue`
- Modify: `frontend/src/components/integrations/IntegrationLogsPanel.vue`
- Modify: `frontend/src/styles/pages/integrations.css`

目标：

- 主任务：把微信机器人接上并验证能收发。
- 改成明确 4 步流程。

页面结构：

- PageHeader：接入管理；主按钮“新增机器人”。
- StepFlow：新增机器人 -> 扫码登录 -> 启动桥接 -> 测试收发。
- Primary Workbench：
  - 左：扫码/登录/桥接控制。
  - 右：当前微信会话卡片。
- Secondary：文字、语音、素材三个测试卡。
- Advanced：运行日志。

文案调整：

- “桥接运行中”旁边加一句：“微信消息会转发给 BranchWhisper 并自动回复。”
- “文本回复链路”改为“测试文字回复”。
- “语音发送链路”改为“测试语音回复”。
- “素材发送链路”改为“测试表情包回复”。

验收：

- 用户知道接入要按 4 步走。
- 日志不是接入页首屏主内容。
- 只有一个接入时，卡片不会被拉得奇怪或裁切。

### 4.5 记忆页

Files：

- Modify: `frontend/src/pages/MemoryPage.vue`
- Modify: `frontend/src/stores/memory.ts`
- Modify: `frontend/src/styles/pages/memory.css`

目标：

- 主任务：查看、搜索、添加稳定记忆。
- 入库测试和衰减清理变成高级工具。

页面结构：

- PageHeader：记忆中心；主按钮“添加记忆”或保留输入内添加。
- StatusSummary：全部、短期、中期、长期。
- Primary Workbench：搜索 + 列表。
- Side Panel：分层筛选。
- Advanced：入库测试、衰减清理。

验收：

- 用户先看到已有记忆，而不是先看到测试工具。
- 删除按钮弱化但清晰。
- 清理参数默认折叠，避免吓到普通用户。

### 4.6 素材库

Files：

- Modify: `frontend/src/pages/AssetsPage.vue`
- Modify: `frontend/src/components/assets/AssetGallery.vue`
- Modify: `frontend/src/components/assets/AssetSidebar.vue`
- Modify: `frontend/src/components/assets/AssetBulkBar.vue`
- Modify: `frontend/src/components/assets/AssetConfigStrip.vue`
- Modify: `frontend/src/components/assets/AssetDetailPanel.vue`
- Modify: `frontend/src/styles/pages/assets.css`

目标：

- 主任务：上传和管理表情包。
- 配置和测试不要夹在上传区和图库之间造成断流。

页面结构：

- PageHeader：素材库；主按钮“上传素材”。
- Upload Dock：压缩高度，支持拖放。
- StatusSummary：当前视图、待审核、已通过、失败。
- Primary Workbench：左筛选 + 右图库。
- Detail Drawer：选中素材后显示 OCR、标签、审核、删除。
- Advanced：识图 API 配置、发送策略测试。

验收：

- 首屏能看到上传入口和图库。
- 配置区域不再把图库挤到下方。
- 批量操作只在选中素材时出现。

### 4.7 配置页

Files：

- Modify: `frontend/src/pages/SettingsPage.vue`
- Modify: `frontend/src/components/settings/*.vue`
- Modify: `frontend/src/styles/pages/settings.css`

目标：

- 默认展示“当前系统怎么配置”。
- 高级 API 参数、命令、Prompt 细节折叠。

页面结构：

- 左侧导航保留，但分组：
  - 基础：外观与身份、对话模型、语音识别、语音合成
  - 能力：联网工具、主动性、Bot 人格、Prompt
  - 高级：服务命令、本地路径、调试参数
- 右侧每个配置区都用 PageHeader 风格的小标题。
- SettingsOverviewBoard 改成“当前运行方案”摘要，而不是堆配置卡。

基础模式默认显示：

- 当前 LLM
- 当前 ASR
- 当前 TTS
- 是否启用工具
- 是否启用记忆
- 保存配置

高级模式显示：

- API URL
- API Key
- Tokens
- temperature
- local model path
- service command

验收：

- 普通用户不需要理解 API URL 才能知道当前用什么模型。
- 保存按钮始终在顶部或底部固定位置容易找到。
- 设置页不再像一张超长参数表。

### 4.8 诊断页

Files：

- Modify: `frontend/src/pages/DiagnosticsPage.vue`
- Modify: `frontend/src/components/diagnostics/DiagnosticCheckList.vue`
- Modify: `frontend/src/components/diagnostics/DialogTracePanel.vue`
- Modify: `frontend/src/styles/pages/diagnostics.css`

目标：

- 主任务：告诉用户哪里坏了，怎么修。
- 日志只是证据，不是主界面。

页面结构：

- PageHeader：运行诊断；主按钮“重新检测”。
- StatusSummary：整体状态、正常项、警告项、错误项。
- StepFlow：麦克风 -> VAD -> ASR -> LLM -> TTS -> 播放。
- Primary Workbench：
  - 左：服务列表。
  - 中：选中项详情和修复建议。
  - 右：日志/Trace/复制报告。

修复建议文案规则：

- 不说“port check failed”。
- 改成“LLM 服务没有响应。先去服务页启动 LLM，或检查 8080 端口是否被占用。”

验收：

- 有异常时，异常卡自动置顶。
- 用户不看日志也能知道下一步。
- 日志可复制，但不会压过修复建议。

---

## 5. 实施阶段

### Phase 1：设计系统与骨架

- [x] 新增 `frontend/src/styles/ui.css`，放通用工作台、状态卡、折叠区、抽屉样式。
- [x] 在 `frontend/src/styles/main.css` 中引入 `ui.css`，位置在 `layout.css` 后、页面 CSS 前。
- [x] 调整 `base.css` 浅色主题 tokens，降低米黄色和棕色占比。
- [x] 新增 `components/ui` 通用组件。
- [x] 让 `PageHeader` 先接入 ServicesPage 和 MemoryPage 验证。
- [x] 运行 `cd frontend && npm run check && npm run check:ui && npm run build`。

### Phase 2：核心使用链路

- [x] 改造 DashboardPage：聊天主视觉、左栏压缩、运行状态简化。
- [x] 改造 ServicesPage：服务卡主任务化、日志折叠。
- [x] 改造 IntegrationsPage：4 步接入流程、日志折叠、测试卡简化。
- [x] 浏览器检查桌面与移动布局。
- [x] 运行前端检查和构建。

### Phase 3：管理页面

- [x] 改造 MemoryPage：列表优先，高级工具折叠。
- [ ] 改造 AssetsPage：图库优先，配置和测试后置。
- [ ] 改造 SettingsPage：基础/高级分层。
- [ ] 删除重复 CSS，把通用样式迁到 `ui.css`。
- [ ] 运行前端检查和构建。

### Phase 4：诊断体验

- [ ] 改造 DiagnosticsPage：问题优先、修复建议优先。
- [ ] 统一 DiagnosticCheckList 的文案层级。
- [ ] 把日志收敛为右侧辅助或抽屉。
- [ ] 验证异常、正常、无数据三种状态。
- [ ] 运行前端检查和构建。

### Phase 5：视觉 QA

- [ ] 逐页检查 1366x768。
- [ ] 逐页检查 1440x900。
- [ ] 逐页检查 1920x1080。
- [ ] 逐页检查 390x844 移动端。
- [ ] 检查按钮文字不溢出。
- [ ] 检查长路径、长 URL、日志不会撑破卡片。
- [ ] 检查首屏是否符合“一个主任务 + 一个状态摘要 + 一个高级入口”。

---

## 6. 复用边界

应该复用：

- 页面头部。
- 状态摘要卡。
- 步骤流程。
- 高级折叠。
- 日志抽屉。
- 空状态。
- 工具栏。

不应该强行复用：

- 聊天气泡。
- 素材卡片。
- 服务卡业务字段。
- 设置页每种 provider 的具体表单。
- 诊断检查项的 domain-specific metadata。

复用原则：

- 视觉结构复用，业务内容保留各页面自己的组件。
- 通用组件只接收展示数据和 slots，不直接 import store。
- 页面负责从 Pinia store 计算展示数据。

---

## 7. 文案规范

### 7.1 标题

标题用用户任务，不用内部名词：

- 用“测试语音回复”，不用“Voice Probe”。
- 用“服务没有响应”，不用“health_url failed”。
- 用“当前模型”，不用“provider profile”。

### 7.2 说明文字

每页说明控制在一句话：

- 服务页：启动本地 ASR、LLM、TTS，让对话和语音回复可用。
- 接入页：连接微信机器人，并测试文字、语音和表情包回复。
- 记忆页：管理机器人会长期记住的偏好和事实。
- 素材库：上传、识别、审核表情包，并配置发送策略。
- 配置页：选择模型、语音、工具和界面偏好。
- 诊断页：检查语音链路和服务状态，定位需要修复的问题。

### 7.3 按钮

主按钮：

- 一键启动
- 新增机器人
- 上传素材
- 重新检测
- 保存配置

次按钮：

- 刷新
- 重启
- 详情
- 复制
- 清空

危险按钮：

- 删除
- 清空日志
- 停止全部

---

## 8. 验收标准

通用验收：

- 每页 3 秒内能看懂：这页做什么、当前是否正常、下一步点哪里。
- 每页首屏最多 1 个主按钮。
- 每页首屏最多 4 个状态卡。
- 日志、命令、长路径、API Key、JSON 默认不展开。
- 页面没有卡片套卡片造成的拥挤感。
- 大屏不窄，小屏不溢出。

自动检查：

```bash
cd frontend
npm run check
npm run check:ui
npm run build
```

人工检查：

- 对话：能直接输入/语音发送。
- 服务：能一眼启动三个本地服务。
- 接入：能按步骤完成微信接入。
- 记忆：能直接搜索、添加、删除记忆。
- 素材：能直接上传并看到图库。
- 配置：能知道当前模型和语音配置。
- 诊断：异常时能看到修复建议。

---

## 9. 风险与控制

风险：一次性改 7 个页面容易引入视觉和交互回归。  
控制：分阶段提交，先共享组件，再每次只改 1-2 个页面。

风险：抽太多组件导致 slot 和 props 复杂。  
控制：通用组件只负责布局和视觉，不接业务 store。

风险：高级信息隐藏后开发调试变慢。  
控制：所有日志、命令、JSON 都保留，只改默认折叠和入口位置。

风险：浅色主题继续显得单调。  
控制：减少米黄色大面积铺底，引入青绿作为状态辅助色，保留琥珀作为主操作。

---

## 10. 建议提交顺序

1. `style: add shared workspace ui system`
2. `refactor: apply shared headers and status summaries`
3. `refactor: simplify dashboard and service workflows`
4. `refactor: restructure integration onboarding flow`
5. `refactor: simplify memory and asset management pages`
6. `refactor: split settings into basic and advanced sections`
7. `refactor: make diagnostics problem-first`
8. `test: update ui structure checks for redesigned pages`
