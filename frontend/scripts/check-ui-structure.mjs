import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const settingsPage = read("src/pages/SettingsPage.vue");
const appearanceSettingsPanel = read("src/components/settings/AppearanceSettingsPanel.vue");
const dialogModelPanel = read("src/components/settings/DialogModelPanel.vue");
const settingsCss = read("src/styles/pages/settings.css");
const memoryPage = read("src/pages/MemoryPage.vue");
const memoryCss = read("src/styles/pages/memory.css");
const memoryStore = read("src/stores/memory.ts");
const integrationsCss = read("src/styles/pages/integrations.css");
const integrationsPage = read("src/pages/IntegrationsPage.vue");
const integrationLoginPanel = read("src/components/integrations/IntegrationLoginPanel.vue");
const integrationLogsPanel = read("src/components/integrations/IntegrationLogsPanel.vue");
const integrationSessionsPanel = read("src/components/integrations/IntegrationSessionsPanel.vue");
const servicesPage = read("src/pages/ServicesPage.vue");
const servicesCss = read("src/styles/pages/services.css");
const resourceSection = read("src/components/services/ResourceSection.vue");
const baseCss = read("src/styles/base.css");
const diagnosticsPage = read("src/pages/DiagnosticsPage.vue");
const diagnosticCheckList = read("src/components/diagnostics/DiagnosticCheckList.vue");
const diagnosticsCss = read("src/styles/pages/diagnostics.css");

assert(!settingsPage.includes('"dialogFeatures"'), "配置页不应再保留独立的对话能力 section");
assert(!settingsPage.includes("id=\"dialogFeatures\""), "配置页不应渲染对话能力页面");
assert(!settingsPage.includes("title: \"对话能力\""), "配置页导航不应出现对话能力");
assert(!settingsPage.includes("显示与模式"), "配置页顶部概览不应出现显示与模式中间块");
assert(settingsPage.includes('id: "asr"'), "ASR 需要作为独立配置页存在");
assert(settingsPage.includes("title: \"语音识别\""), "ASR 独立页标题应为语音识别");
assert(dialogModelPanel.includes("context-compaction-card"), "上下文压缩需要并入 TTS 或对话链路区域的独立卡片");
assert(settingsPage.includes("toolGridItems"), "联网工具需要使用统一九宫格数据源");
assert(settingsPage.includes("system_time") && settingsPage.includes("direct_answer"), "联网工具应补足系统时间和直接回答两张本地能力卡");
assert(settingsCss.includes("repeat(3, minmax(0, 1fr))"), "联网工具桌面布局应支持三列网格");
assert(settingsPage.includes("selectedToolKey"), "联网工具应使用九宫格概览加单个详情面板，避免九张卡全部展开");
assert(!settingsPage.includes('class="form-grid compact">\n                <label v-for="field in item.fields"'), "联网工具概览卡内不应直接展开完整配置表单");
assert(settingsPage.includes("commandsExpanded"), "服务命令页需要支持展开/收起");
assert(!memoryStore.includes("我喜欢晚上写代码，猫叫布丁。"), "记忆入库默认测试文本需要换成自然稳定偏好句");
assert(integrationsCss.includes("integration-shell"), "接入页需要保持两栏布局");
assert(integrationsCss.includes("integration-test-column") && integrationsCss.includes("integration-log-column"), "接入页左侧需要放链路测试和运行日志");
assert(integrationsCss.includes("integration-workbench"), "接入页右侧需要保留登录与聊天卡片工作区");
assert(integrationsCss.includes("integration-session-grid") && integrationsCss.includes("grid-template-columns: repeat(2, minmax(0, 1fr))"), "接入页微信聊天需要使用紧凑两列卡片网格");
assert(integrationsCss.includes("overscroll-behavior: contain"), "接入页侧栏需要独立滚动，不能挤压另一侧");
assert(!integrationsPage.includes('class="integration-probe-card">\n                <div class="probe-row"'), "接入页探测卡不能把输入行和 InlineProbe 分成错位两块");
assert(!integrationsPage.includes('variant="strip"\n                  title="文本回复链路"'), "接入页三列探测卡应使用 compact 布局，避免状态按钮溢出");
assert(integrationsCss.includes(".integration-status-card") && integrationsCss.includes("min-height: 96px"), "接入页登录控制里的桥接状态和当前账号需要统一紧凑高度规则");
assert(integrationsPage.includes("integration-test-column") && integrationsPage.includes("IntegrationLogsPanel") && integrationLogsPanel.includes("integration-log-column"), "接入页模板需要把测试和日志放到左栏");
assert(integrationsPage.includes("IntegrationLoginPanel") && integrationLoginPanel.includes("integration-login-panel") && integrationsPage.includes("IntegrationSessionsPanel") && integrationSessionsPanel.includes("integration-sessions-panel"), "接入页右栏需要上方登录控制、下方微信聊天列表");
assert(integrationLoginPanel.includes("integration-step-track") && integrationsCss.includes(".integration-step-track"), "接入页登录状态需要使用紧凑状态轨道");
assert(!integrationsPage.includes("Login & Logs"), "接入页不应再保留重复的登录与日志标题");
assert(integrationLoginPanel.includes("integration-status-grid") && integrationLoginPanel.includes("integration-selected-account-card"), "接入页登录控制需要把桥接状态和当前账号做成等高状态卡，避免错位重叠");
assert(!integrationsPage.includes("integration-console-accounts"), "接入页登录控制不应再嵌入可滚动账号列表，账号列表应只在下方微信聊天区展示");
assert(integrationsCss.includes("grid-template-rows: minmax(0, auto) minmax(320px, 1fr)"), "接入页右栏需要给微信聊天区保留稳定高度，避免卡片被登录区挤压");
assert(integrationsCss.includes("grid-auto-rows: minmax(160px, auto)"), "接入页微信聊天卡片需要使用稳定的自动行高度，避免一张卡也被裁切");
assert(integrationsCss.includes(".integration-card-note"), "接入页微信聊天卡片需要使用单行状态说明，保持紧凑不溢出");
assert(memoryPage.includes("memory-probe-cell memory-probe-text") && memoryPage.includes("memory-probe-cell memory-probe-loop"), "记忆入库测试两侧需要使用统一 cell 结构");
assert(memoryCss.includes(".memory-probe-cell") && memoryCss.includes("grid-template-rows: auto auto minmax(0, 1fr)"), "记忆入库测试两侧需要统一高度和内部行轨道");
assert(memoryPage.includes("memory-admission-card") && memoryPage.includes("memory-admission-action-card"), "记忆入库回路需要使用重新设计的统一工具卡");
assert(!memoryPage.includes("检查当前抽取规则会不会把这句话写入记忆。"), "记忆入库回路说明文案需要更简洁自然，避免当前生硬描述");
assert(memoryCss.includes(".memory-admission-card") && memoryCss.includes(".memory-admission-action-card"), "记忆入库回路新版工具卡需要专用样式");
assert(memoryPage.includes("memory-decay-panel"), "记忆页面需要暴露衰减清理配置面板");
assert(memoryPage.includes("decayOpen") && memoryPage.includes("memory-decay-summary"), "衰减清理条件需要做成可展开关闭的卡片");
assert(memoryStore.includes("decayOptions"), "记忆衰减清理条件需要进入 store 状态并随清理请求提交");
assert(!baseCss.includes("--bg: #0d1013;") && baseCss.includes("--bg: #171912;"), "深色主题背景需要从纯黑感改成柔和墨绿灰底色");
assert(appearanceSettingsPanel.includes('class="theme-preview-button"') && appearanceSettingsPanel.includes("emit('applyTheme', 'dark')") && appearanceSettingsPanel.includes("emit('applyTheme', 'light')"), "深浅色预览必须是可点击按钮并绑定主题切换");
assert(settingsCss.includes(".theme-preview-button"), "深浅色预览按钮需要专用样式");
assert(servicesPage.includes("serviceDetailExpanded"), "服务详情需要默认收起命令详情，并支持展开关闭");
assert(resourceSection.includes("resource-platform-badge"), "资源状态平台信息需要独立样式，避免长系统字符串被裁剪");
assert(servicesCss.includes("overflow-wrap: anywhere"), "资源状态长文本需要允许按内容换行");
assert(servicesCss.includes("grid-template-rows: auto auto minmax(42px, auto) auto"), "资源卡片信息行需要固定轨道，让进度条保持同一水平线");
assert(servicesCss.includes("align-self: end"), "资源卡片进度条需要固定贴底对齐");
assert(diagnosticsPage.includes("DiagnosticCheckList"), "运行诊断页需要把检查项列表交给独立组件渲染");
assert(diagnosticCheckList.includes("diagnostic-check-meta"), "运行诊断检查项需要显示解析目标、解析基准和存在状态");
assert(diagnosticCheckList.includes("checkMetadataRows"), "运行诊断检查项组件需要用统一 helper 渲染 metadata，避免模板硬编码字段漂移");
assert(diagnosticCheckList.includes("raw_target") && diagnosticCheckList.includes("resolved_target") && diagnosticCheckList.includes("resolution_base"), "运行诊断检查项组件需要读取后端 resolved target metadata");
assert(diagnosticsCss.includes(".diagnostic-check-meta"), "运行诊断解析详情需要专用样式");
assert(diagnosticsCss.includes("overflow-wrap: anywhere"), "运行诊断长路径需要允许换行，避免挤出卡片");
assert(diagnosticsCss.includes("--diagnostic-label-col: 88px"), "运行诊断检查项需要使用稳定标签列，避免不同卡片标签错位");
assert(diagnosticsCss.includes("grid-template-columns: var(--diagnostic-label-col) minmax(0, 1fr)"), "运行诊断检查项主行需要固定标签列并左对齐内容");
assert(diagnosticsCss.includes("grid-template-columns: var(--diagnostic-label-col) minmax(0, 1fr)") && !diagnosticsCss.includes("minmax(72px, 0.4fr)"), "运行诊断检查项不能再使用比例标签列");
assert(diagnosticsCss.includes("--trace-label-col: 74px"), "运行诊断 trace 详情需要使用稳定标签列，保持事件列表整齐");
assert(diagnosticCheckList.includes('class="diagnostic-check-kind"'), "运行诊断检查项标签需要有独立 class，避免标签、目标和失败原因互相影响");
assert(diagnosticCheckList.includes('class="diagnostic-check-target"'), "运行诊断检查项目标值需要有独立 class，确保长路径在固定内容列内换行");
assert(diagnosticCheckList.includes('class="diagnostic-check-state"'), "运行诊断检查项状态需要有独立状态列，避免不同文案把标签列顶歪");
assert(diagnosticCheckList.includes('class="diagnostic-check-message"'), "运行诊断失败原因需要占用内容列，不应混在标签列或状态列");
assert(diagnosticsCss.includes("--diagnostic-status-col: 76px"), "运行诊断检查项需要固定状态列，保持每张卡内状态标签对齐");
assert(diagnosticsCss.includes("grid-template-columns: var(--diagnostic-label-col) minmax(0, 1fr) var(--diagnostic-status-col)"), "运行诊断检查项主行需要固定标签列、内容列和状态列");
assert(diagnosticsCss.includes(".diagnostic-check-message"), "运行诊断失败原因需要专用样式，避免页面信息层级割裂");
assert(diagnosticsCss.includes("align-content: start"), "运行诊断卡片内部需要从顶部紧凑排布，避免同一行卡片高度拉伸后内容被推散");

console.log("UI structure checks passed");
