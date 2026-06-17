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
const settingsCss = read("src/styles/pages/settings.css");
const memoryStore = read("src/stores/memory.ts");
const integrationsCss = read("src/styles/pages/integrations.css");
const integrationsPage = read("src/pages/IntegrationsPage.vue");
const servicesPage = read("src/pages/ServicesPage.vue");
const servicesCss = read("src/styles/pages/services.css");
const resourceSection = read("src/components/services/ResourceSection.vue");

assert(!settingsPage.includes('"dialogFeatures"'), "配置页不应再保留独立的对话能力 section");
assert(!settingsPage.includes("id=\"dialogFeatures\""), "配置页不应渲染对话能力页面");
assert(!settingsPage.includes("title: \"对话能力\""), "配置页导航不应出现对话能力");
assert(!settingsPage.includes("显示与模式"), "配置页顶部概览不应出现显示与模式中间块");
assert(settingsPage.includes('id: "asr"'), "ASR 需要作为独立配置页存在");
assert(settingsPage.includes("title: \"语音识别\""), "ASR 独立页标题应为语音识别");
assert(settingsPage.includes("context-compaction-card"), "上下文压缩需要并入 TTS 或对话链路区域的独立卡片");
assert(settingsPage.includes("toolGridItems"), "联网工具需要使用统一九宫格数据源");
assert(settingsPage.includes("system_time") && settingsPage.includes("direct_answer"), "联网工具应补足系统时间和直接回答两张本地能力卡");
assert(settingsCss.includes("repeat(3, minmax(0, 1fr))"), "联网工具桌面布局应支持三列网格");
assert(settingsPage.includes("selectedToolKey"), "联网工具应使用九宫格概览加单个详情面板，避免九张卡全部展开");
assert(!settingsPage.includes('class="form-grid compact">\n                <label v-for="field in item.fields"'), "联网工具概览卡内不应直接展开完整配置表单");
assert(settingsPage.includes("commandsExpanded"), "服务命令页需要支持展开/收起");
assert(!memoryStore.includes("我喜欢晚上写代码，猫叫布丁。"), "记忆入库默认测试文本需要换成自然稳定偏好句");
assert(integrationsCss.includes("integration-console-grid"), "接入页需要使用均衡的控制台网格");
assert(!integrationsPage.includes('class="integration-probe-card">\n                <div class="probe-row"'), "接入页探测卡不能把输入行和 InlineProbe 分成错位两块");
assert(!integrationsPage.includes('variant="strip"\n                  title="文本回复链路"'), "接入页三列探测卡应使用 compact 布局，避免状态按钮溢出");
assert(integrationsCss.includes("min-height: 154px") && integrationsCss.includes(".integration-console-accounts .integration-account-list"), "接入页登录框和账号框需要统一高度规则");
assert(integrationsPage.includes("integration-workbench-panel"), "接入页测试和日志应拆成全宽工作区，避免右侧单列过长");
assert(servicesPage.includes("serviceDetailExpanded"), "服务详情需要默认收起命令详情，并支持展开关闭");
assert(resourceSection.includes("resource-platform-badge"), "资源状态平台信息需要独立样式，避免长系统字符串被裁剪");
assert(servicesCss.includes("overflow-wrap: anywhere"), "资源状态长文本需要允许按内容换行");
assert(servicesCss.includes("grid-template-rows: auto auto auto"), "资源卡片需要统一内容行，避免 GPU 进度条和其他卡片错位");

console.log("UI structure checks passed");
