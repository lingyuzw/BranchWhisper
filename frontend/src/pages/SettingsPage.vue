<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import {
  Bot,
  Cloud,
  Cpu,
  FolderOpen,
  Globe2,
  HardDrive,
  MessageSquareText,
  MicVocal,
  Palette,
  RefreshCw,
  Save,
  Sparkles,
  Terminal,
  Volume2,
  X,
} from "@lucide/vue";
import { uploadAvatar } from "@/api/assets";
import { runAsrApiDiagnostic, runLlmApiDiagnostic, runLocalModelsDiagnostic, runTtsApiDiagnostic, runTtsVoicePreview } from "@/api/diagnostics";
import { useAppStore } from "@/stores/app";
import { listModelFiles, uploadVoiceSample, type ModelFileEntry, type ModelFilesResponse, type PublicConfig } from "@/api/config";
import AppearanceSettingsPanel from "@/components/settings/AppearanceSettingsPanel.vue";
import AsrProviderPanel from "@/components/settings/AsrProviderPanel.vue";
import BotProfilesPanel from "@/components/settings/BotProfilesPanel.vue";
import DialogModelPanel from "@/components/settings/DialogModelPanel.vue";
import ProactiveSettingsPanel from "@/components/settings/ProactiveSettingsPanel.vue";
import PromptSettingsPanel from "@/components/settings/PromptSettingsPanel.vue";
import ServiceCommandPanel from "@/components/settings/ServiceCommandPanel.vue";
import SettingsOverviewBoard from "@/components/settings/SettingsOverviewBoard.vue";
import ToolSettingsPanel from "@/components/settings/ToolSettingsPanel.vue";
import TtsProviderPanel from "@/components/settings/TtsProviderPanel.vue";
import type { ServiceDraft } from "@/components/settings/types";
import VadSettingsPanel from "@/components/settings/VadSettingsPanel.vue";
import PageHeader from "@/components/ui/PageHeader.vue";
import StatusSummary from "@/components/ui/StatusSummary.vue";
import type { ServiceSummary } from "@/api/services";
import { PROVIDER_FIELDS, PROVIDER_LABELS, useToolsStore } from "@/stores/tools";
import { useEngagementStore } from "@/stores/engagement";
import { useProfilesStore } from "@/stores/profiles";
import { useServicesStore } from "@/stores/services";
import { useUiStore, type ToastKind } from "@/stores/ui";
import { fileToDataUrl } from "@/utils/files";

const app = useAppStore();
const router = useRouter();
const tools = useToolsStore();
const engagement = useEngagementStore();
const profiles = useProfilesStore();
const services = useServicesStore();
const ui = useUiStore();
const form = reactive<Partial<PublicConfig>>({});
const userAvatarInput = ref<HTMLInputElement | null>(null);
const assistantAvatarInput = ref<HTMLInputElement | null>(null);
const theme = ref<"dark" | "light">("dark");
const modelFileModalOpen = ref(false);
const modelFileRoot = ref("");
const modelFileQuery = ref("");
const modelFileResult = ref<ModelFilesResponse | null>(null);
const modelFileLoading = ref(false);
const modelFileError = ref("");
const modelFilePath = ref("");
const settingsMessage = ref("");
const settingsHydrating = ref(false);
const settingsSaving = ref(false);
const formBaseline = ref<Partial<PublicConfig>>({});
const ttsPreviewText = ref("你好，今天过得怎么样。");
const ttsPreviewUrl = ref("");
const ttsPreviewLoading = ref(false);
const ttsPreviewStatus = ref("");
const proactiveEventsExpanded = ref(false);
const commandsExpanded = ref<Record<string, boolean>>({});
const selectedToolKey = ref("weather");
type ProbeStatus = "idle" | "running" | "ok" | "failed" | "warning";
const probeState = reactive<Record<string, { status: ProbeStatus; text: string; detail: string }>>({
  llmApi: { status: "idle", text: "未检测", detail: "" },
  asrApi: { status: "idle", text: "未检测", detail: "" },
  ttsApi: { status: "idle", text: "未检测", detail: "" },
  localModels: { status: "idle", text: "未检测", detail: "" },
  proactive: { status: "idle", text: "未检测", detail: "" },
});
const serviceDrafts = reactive<Record<string, ServiceDraft>>({});
const serviceDraftDirty = reactive<Record<string, boolean>>({});
const serviceSaving = reactive<Record<string, boolean>>({});
const providerKeys = Object.keys(PROVIDER_FIELDS);
interface ToolGridItem {
  key: string;
  label: string;
  summary: string;
  badge: string;
  fields: string[];
}
type MetricTone = "neutral" | "ok" | "warning" | "danger" | "info";
interface StatusMetricItem {
  label: string;
  value: string | number;
  detail?: string;
  tone?: MetricTone;
}
const pendingReminders = computed(() => engagement.pendingReminders.slice(0, 8));
const recentEvents = computed(() => engagement.recentEvents);
const visibleRecentEvents = computed(() => (proactiveEventsExpanded.value ? recentEvents.value : recentEvents.value.slice(0, 3)));
const hiddenRecentEventCount = computed(() => Math.max(0, recentEvents.value.length - visibleRecentEvents.value.length));
const recommendedBooleanDefaults: Partial<PublicConfig> = {
  tts_enabled: true,
  tools_enabled: true,
  tools_auto_call: true,
  vision_enabled: true,
  sticker_vision_enabled: true,
  stickers_enabled: true,
  context_compaction_enabled: true,
};
const DASHSCOPE_CHAT_COMPLETIONS_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const DEEPSEEK_CHAT_COMPLETIONS_URL = "https://api.deepseek.com/chat/completions";
const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENAI_ASR_URL = "https://api.openai.com/v1/audio/transcriptions";
const GROQ_ASR_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const DEEPGRAM_ASR_URL = "https://api.deepgram.com/v1/listen";
const DASHSCOPE_ASR_URL = DASHSCOPE_CHAT_COMPLETIONS_URL;
const OPENAI_TTS_URL = "https://api.openai.com/v1/audio/speech";
const ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const DASHSCOPE_TTS_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
const DEFAULT_API_MODEL = "qwen-plus";
const DEFAULT_VISION_MODEL = "qwen3-vl-plus";
interface ApiModelPreset {
  id: string;
  label: string;
  summary: string;
  url: string;
  model: string;
}
const API_MODEL_PRESETS: ApiModelPreset[] = [
  {
    id: "dashscope",
    label: "百炼 Qwen",
    summary: "阿里云百炼 OpenAI 兼容接口",
    url: DASHSCOPE_CHAT_COMPLETIONS_URL,
    model: DEFAULT_API_MODEL,
  },
  {
    id: "openai",
    label: "OpenAI",
    summary: "官方 Chat Completions",
    url: OPENAI_CHAT_COMPLETIONS_URL,
    model: "gpt-4o-mini",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    summary: "DeepSeek 官方兼容接口",
    url: DEEPSEEK_CHAT_COMPLETIONS_URL,
    model: "deepseek-chat",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    summary: "多模型聚合兼容接口",
    url: OPENROUTER_CHAT_COMPLETIONS_URL,
    model: "openai/gpt-4o-mini",
  },
];
const API_MODEL_PRESET_URLS = API_MODEL_PRESETS.map((preset) => preset.url);
const localDisabled = computed(() => form.dialog_mode === "api");
const apiDisabled = computed(() => form.dialog_mode === "local");
const asrApiDisabled = computed(() => form.asr_provider_mode !== "api");
const ttsApiDisabled = computed(() => form.tts_provider_mode !== "api");
interface AudioPreset {
  id: string;
  provider: string;
  label: string;
  summary: string;
  url: string;
  model: string;
  language?: string;
  voice?: string;
  voiceMode?: "builtin" | "manual" | "cloned";
  format?: "pcm" | "wav" | "mp3";
  latency?: "quality" | "balanced" | "fast";
  cloneSupport?: boolean;
}
const ASR_API_PRESETS: AudioPreset[] = [
  { id: "openai-gpt4o", provider: "openai", label: "OpenAI 高精度", summary: "gpt-4o-transcribe，适合通用转写", url: OPENAI_ASR_URL, model: "gpt-4o-transcribe", language: "zh" },
  { id: "openai-mini", provider: "openai", label: "OpenAI 轻量", summary: "gpt-4o-mini-transcribe，成本和延迟更低", url: OPENAI_ASR_URL, model: "gpt-4o-mini-transcribe", language: "zh" },
  { id: "groq-whisper", provider: "groq", label: "Groq Whisper", summary: "whisper-large-v3-turbo，偏极速", url: GROQ_ASR_URL, model: "whisper-large-v3-turbo", language: "zh" },
  { id: "deepgram-nova", provider: "deepgram", label: "Deepgram Nova-3", summary: "实时语音识别服务，英文生态成熟", url: DEEPGRAM_ASR_URL, model: "nova-3", language: "zh" },
  { id: "dashscope-qwen-asr", provider: "dashscope", label: "百炼 Qwen-ASR", summary: "qwen3-asr-flash，同步识别，适合实时对话", url: DASHSCOPE_ASR_URL, model: "qwen3-asr-flash", language: "zh" },
];
const TTS_API_PRESETS: AudioPreset[] = [
  { id: "openai-mini", provider: "openai", label: "OpenAI 自然音色", summary: "gpt-4o-mini-tts，预置 voice + 指令", url: OPENAI_TTS_URL, model: "gpt-4o-mini-tts", voice: "coral", voiceMode: "builtin", format: "pcm", latency: "balanced", cloneSupport: false },
  { id: "eleven-flash", provider: "elevenlabs", label: "ElevenLabs 极速", summary: "eleven_flash_v2_5，支持 Instant Voice Cloning", url: ELEVENLABS_TTS_URL, model: "eleven_flash_v2_5", voiceMode: "manual", format: "pcm", latency: "fast", cloneSupport: true },
  { id: "eleven-turbo", provider: "elevenlabs", label: "ElevenLabs Turbo", summary: "eleven_turbo_v2_5，质量和延迟均衡", url: ELEVENLABS_TTS_URL, model: "eleven_turbo_v2_5", voiceMode: "manual", format: "pcm", latency: "balanced", cloneSupport: true },
  { id: "dashscope-qwen-tts", provider: "dashscope", label: "百炼 Qwen-TTS", summary: "Qwen 系列语音合成，返回 WAV 后内部转 PCM", url: DASHSCOPE_TTS_URL, model: "qwen-tts", voice: "Cherry", voiceMode: "builtin", format: "wav", latency: "balanced", cloneSupport: false },
  { id: "dashscope-cosyvoice", provider: "dashscope", label: "百炼 CosyVoice", summary: "中文语音合成，音色复刻需远程 voice_id", url: DASHSCOPE_TTS_URL, model: "cosyvoice-v2", voiceMode: "manual", format: "wav", latency: "balanced", cloneSupport: true },
];
const recommendedStringDefaults: Partial<PublicConfig> = {
  api_llm_url: DASHSCOPE_CHAT_COMPLETIONS_URL,
  api_llm_model: DEFAULT_API_MODEL,
  sticker_vision_url: DASHSCOPE_CHAT_COMPLETIONS_URL,
  sticker_vision_model: DEFAULT_VISION_MODEL,
  asr_provider_mode: "local",
  api_asr_provider: "openai",
  api_asr_url: OPENAI_ASR_URL,
  api_asr_model: "gpt-4o-mini-transcribe",
  api_asr_language: "zh",
  tts_provider_mode: "local",
  tts_model: "cosyvoice",
  api_tts_provider: "openai",
  api_tts_url: OPENAI_TTS_URL,
  api_tts_model: "gpt-4o-mini-tts",
  api_tts_voice_mode: "builtin",
  api_tts_voice: "coral",
  api_tts_format: "pcm",
  api_tts_latency_mode: "balanced",
  api_tts_instructions: "自然、亲近、像微信语音，不要播音腔。",
};
const SECRET_CONFIG_KEYS = new Set(["llm_api_key", "api_llm_api_key", "sticker_vision_api_key", "api_asr_api_key", "api_tts_api_key"]);
const SKIPPED_CONFIG_KEYS = new Set(["llm_model_file"]);
const TOOL_CONFIG_KEYS = new Set(["tools_enabled", "tools_auto_call", "tools_timeout", "tools_max_result_chars"]);
const TTS_CONFIG_KEYS = new Set([
  "tts_enabled",
  "tts_provider_mode",
  "tts_model",
  "tts_url",
  "tts_speed",
  "tts_seed",
  "tts_volume",
  "tts_fade_ms",
  "tts_sample_rate",
  "api_tts_provider",
  "api_tts_url",
  "api_tts_model",
  "api_tts_api_key",
  "api_tts_voice_mode",
  "api_tts_voice",
  "api_tts_voice_id",
  "api_tts_voice_name",
  "api_tts_voice_profile_id",
  "api_tts_instructions",
  "api_tts_format",
  "api_tts_sample_rate",
  "api_tts_speed",
  "api_tts_latency_mode",
]);
const PROVIDER_BASE_URL_PRESETS: Record<string, Record<string, string>> = {
  weather: {
    gaode: "https://restapi.amap.com/v3/weather/weatherInfo",
    wttr: "https://wttr.in",
  },
  search: {
    gaode: "https://restapi.amap.com/v3/place/text",
    duckduckgo: "https://duckduckgo.com/html/",
  },
  news: {
    google_rss: "https://news.google.com/rss",
    search: "",
  },
  map: {
    gaode: "https://restapi.amap.com/v3/direction/driving",
  },
  finance: {
    search: "",
  },
};
type SettingsSectionId =
  | "appearance"
  | "engine"
  | "asr"
  | "tools"
  | "proactive"
  | "botProfiles"
  | "prompt"
  | "tts"
  | "vad"
  | "commands";
const activeSettingsSection = ref<SettingsSectionId>("engine");
const toolsConfigDirty = computed(() => Object.keys(buildConfigPatch(TOOL_CONFIG_KEYS)).length > 0);
const toolsAnyDirty = computed(() => tools.dirty || toolsConfigDirty.value);
const toolGridItems = computed<ToolGridItem[]>(() => {
  const summaries: Record<string, string> = {
    weather: `默认地区：${tools.config.weather?.default_location || "漳州"}`,
    search: "网页搜索和地点搜索共用这张卡",
    news: "新闻 RSS 或搜索兜底",
    finance: "股票、汇率、价格类问题",
    map: "地址、路线、附近地点",
    url_fetch: "读取用户给出的网页链接",
    reminder: "Web 和微信提醒通道",
    system_time: "本机时间、日期和星期",
    direct_answer: "工具解析后的直接回复",
  };
  const badges: Record<string, string> = {
    weather: "外部 API",
    search: "外部 API",
    news: "外部 API",
    finance: "搜索兜底",
    map: "外部 API",
    url_fetch: "本地",
    reminder: "本地",
    system_time: "本地",
    direct_answer: "本地",
  };
  const ordered = ["weather", "search", "news", "finance", "map", "url_fetch", "reminder", "system_time", "direct_answer"];
  return ordered.map((key) => ({
    key,
    label: PROVIDER_LABELS[key] || key,
    summary: summaries[key] || "按当前配置执行最小调用",
    badge: badges[key] || "工具",
    fields: PROVIDER_FIELDS[key] || [],
  }));
});
const selectedToolItem = computed(() => toolGridItems.value.find((item) => item.key === selectedToolKey.value) || toolGridItems.value[0]);
const settingsSections = computed(() => [
  {
    id: "appearance" as SettingsSectionId,
    icon: Palette,
    eyebrow: "显示",
    title: "外观与身份",
    summary: "主题、头像、字号",
    status: theme.value === "light" ? "浅色主题" : "深色主题",
  },
  {
    id: "engine" as SettingsSectionId,
    icon: Cpu,
    eyebrow: "模型",
    title: "对话模型",
    summary: "LLM、本地/API、模型文件",
    status: form.dialog_mode === "api" ? "API 模式" : "本地模式",
  },
  {
    id: "asr" as SettingsSectionId,
    icon: MicVocal,
    eyebrow: "识别",
    title: "语音识别",
    summary: "ASR、本地/API、识别回路测试",
    status: form.asr_provider_mode === "api" ? "API 模式" : "本地模式",
  },
  {
    id: "tools" as SettingsSectionId,
    icon: Globe2,
    eyebrow: "工具",
    title: "联网工具",
    summary: "搜索、天气、新闻、地图",
    status: form.tools_enabled ? "工具启用" : "工具关闭",
  },
  {
    id: "proactive" as SettingsSectionId,
    icon: Sparkles,
    eyebrow: "主动",
    title: "主动性",
    summary: "问候、提醒、追问和触发器",
    status: engagement.config.enabled ? "主动消息启用" : "主动消息关闭",
  },
  {
    id: "botProfiles" as SettingsSectionId,
    icon: Bot,
    eyebrow: "人格",
    title: "Bot 人格",
    summary: "多人格、头像、工具权限和风格",
    status: `${profiles.profiles.length || 0} 个配置`,
  },
  {
    id: "prompt" as SettingsSectionId,
    icon: MessageSquareText,
    eyebrow: "提示词",
    title: "Prompt 配置",
    summary: "系统提示词与角色边界",
    status: form.system ? "已配置" : "未配置",
  },
  {
    id: "tts" as SettingsSectionId,
    icon: Volume2,
    eyebrow: "语音",
    title: "语音合成",
    summary: "TTS、本地/接口、默认音色",
    status: form.tts_enabled ? "TTS 启用" : "TTS 关闭",
  },
  {
    id: "vad" as SettingsSectionId,
    icon: MicVocal,
    eyebrow: "检测",
    title: "语音检测",
    summary: "VAD 阈值、静默和语音时长",
    status: `阈值 ${form.vad_threshold ?? "--"}`,
  },
  {
    id: "commands" as SettingsSectionId,
    icon: Terminal,
    eyebrow: "服务",
    title: "服务命令",
    summary: "工作目录、启动命令、健康检查地址",
    status: `${services.services.length || 0} 个服务`,
  },
]);
const settingsNavGroups = computed(() => [
  {
    label: "基础",
    items: settingsSections.value.filter((section) => ["appearance", "engine", "asr", "tts"].includes(section.id)),
  },
  {
    label: "能力",
    items: settingsSections.value.filter((section) => ["tools", "proactive", "botProfiles", "prompt", "vad"].includes(section.id)),
  },
  {
    label: "高级",
    items: settingsSections.value.filter((section) => ["commands"].includes(section.id)),
  },
]);
const activeSection = computed(() => settingsSections.value.find((section) => section.id === activeSettingsSection.value) || settingsSections.value[0]);
const settingsHeaderStatus = computed(() => {
  if (settingsSaving.value) return "保存中";
  if (settingsHydrating.value) return "读取中";
  return formHasDirtyChanges() || tools.dirty ? "有未保存修改" : "配置已同步";
});
const settingsHeaderTone = computed(() => {
  if (settingsSaving.value || settingsHydrating.value) return "running";
  return formHasDirtyChanges() || tools.dirty ? "warning" : "ok";
});
const settingsSummaryItems = computed<StatusMetricItem[]>(() => [
  {
    label: "当前 LLM",
    value: form.dialog_mode === "api" ? String(form.api_llm_model || "--") : String(form.llm_model || "--"),
    detail: form.dialog_mode === "api" ? "API 对话模型" : "本地对话模型",
    tone: form.dialog_mode === "api" ? "info" : "ok",
  },
  {
    label: "当前 ASR",
    value: form.asr_provider_mode === "api" ? String(form.api_asr_model || "--") : String(form.asr_model || "--"),
    detail: form.asr_provider_mode === "api" ? "API 语音识别" : "本地语音识别",
    tone: form.asr_provider_mode === "api" ? "info" : "ok",
  },
  {
    label: "当前 TTS",
    value: form.tts_enabled ? (form.tts_provider_mode === "api" ? String(form.api_tts_model || "--") : String(form.tts_model || "--")) : "关闭",
    detail: form.tts_enabled ? (form.tts_provider_mode === "api" ? "API 语音合成" : "本地语音合成") : "不会自动播报",
    tone: form.tts_enabled ? "ok" : "neutral",
  },
  {
    label: "能力开关",
    value: `${form.tools_enabled ? "工具" : "无工具"} / ${form.context_compaction_enabled ? "记忆" : "无记忆"}`,
    detail: "联网工具和上下文压缩状态",
    tone: form.tools_enabled || form.context_compaction_enabled ? "info" : "neutral",
  },
]);
const runtimeChainItems = computed(() => [
  {
    id: "llm",
    icon: form.dialog_mode === "api" ? Cloud : HardDrive,
    title: "对话",
    mode: form.dialog_mode === "api" ? "API" : "本地",
    model: form.dialog_mode === "api" ? String(form.api_llm_model || "--") : String(form.llm_model || "--"),
    endpoint: form.dialog_mode === "api" ? String(form.api_llm_url || "--") : String(form.llm_url || "--"),
    section: "engine" as SettingsSectionId,
  },
  {
    id: "asr",
    icon: form.asr_provider_mode === "api" ? Cloud : HardDrive,
    title: "识别",
    mode: form.asr_provider_mode === "api" ? "API" : "本地",
    model: form.asr_provider_mode === "api" ? String(form.api_asr_model || "--") : String(form.asr_model || "--"),
    endpoint: form.asr_provider_mode === "api" ? String(form.api_asr_url || "--") : String(form.asr_url || "--"),
    section: "asr" as SettingsSectionId,
  },
  {
    id: "tts",
    icon: form.tts_provider_mode === "api" ? Cloud : HardDrive,
    title: "合成",
    mode: form.tts_provider_mode === "api" ? "API" : "本地",
    model: form.tts_provider_mode === "api" ? String(form.api_tts_model || "--") : String(form.tts_model || "--"),
    endpoint: form.tts_provider_mode === "api" ? activeTtsVoiceLabel() : String(form.tts_url || "--"),
    section: "tts" as SettingsSectionId,
  },
]);
const serviceDraftList = computed(() =>
  services.services
    .map((service) => ({ service, draft: serviceDrafts[service.id] }))
    .filter((item): item is { service: ServiceSummary; draft: ServiceDraft } => Boolean(item.draft)),
);

onMounted(() => {
  theme.value = window.localStorage.getItem("branchwhisper:theme") === "light" ? "light" : "dark";
  applyTheme(theme.value);
  void hydrateSettings();
});

onBeforeUnmount(() => {
  document.body.classList.remove("settings-modal-open");
  revokeTtsPreviewUrl();
});

watch(
  () => app.config,
  (config) => {
    if (!config) return;
    hydrateConfigForm(config);
  },
  { immediate: true },
);

watch(
  () => services.services,
  () => {
    syncServiceDrafts();
  },
  { immediate: true, deep: true },
);

function announceSettings(message: string, type: ToastKind = "info", timeoutMs?: number) {
  settingsMessage.value = message;
  ui.toast(message, type, timeoutMs);
}

function cloneConfig(value: Partial<PublicConfig>): Partial<PublicConfig> {
  return JSON.parse(JSON.stringify(value || {}));
}

function applyRecommendedDefaults(config: PublicConfig): Partial<PublicConfig> {
  const next: Partial<PublicConfig> = { ...config };
  for (const [key, value] of Object.entries(recommendedBooleanDefaults)) {
    if (next[key] === undefined || next[key] === null) next[key] = value;
  }
  for (const [key, value] of Object.entries(recommendedStringDefaults)) {
    if (!String(next[key] || "").trim()) next[key] = value;
  }
  return next;
}

function replaceForm(next: Partial<PublicConfig>) {
  for (const key of Object.keys(form)) delete form[key];
  Object.assign(form, next);
  formBaseline.value = cloneConfig(next);
}

function hydrateConfigForm(config: PublicConfig, force = false) {
  if (!force && Object.keys(formBaseline.value).length && formHasDirtyChanges()) return;
  replaceForm(applyRecommendedDefaults(config));
}

function normalizeConfigValue(value: unknown) {
  if (value === undefined || value === null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? value : "";
  return value;
}

function isSameConfigValue(left: unknown, right: unknown) {
  return JSON.stringify(normalizeConfigValue(left)) === JSON.stringify(normalizeConfigValue(right));
}

function buildConfigPatch(allowedKeys?: Set<string>): Partial<PublicConfig> {
  const patch: Partial<PublicConfig> = {};
  for (const key of Object.keys(form)) {
    if (allowedKeys && !allowedKeys.has(key)) continue;
    if (SKIPPED_CONFIG_KEYS.has(key) || key.endsWith("_masked") || key.endsWith("_set")) continue;
    const value = form[key];
    if (SECRET_CONFIG_KEYS.has(key)) {
      const text = String(value || "").trim();
      if (!text || text.includes("*")) continue;
    }
    if (!isSameConfigValue(value, formBaseline.value[key])) {
      (patch as Record<string, unknown>)[key] = value;
    }
  }
  return patch;
}

function formHasDirtyChanges() {
  return Object.keys(buildConfigPatch()).length > 0;
}

function absorbSavedConfigKeys(config: PublicConfig, keys: Set<string>) {
  const next = applyRecommendedDefaults(config);
  const baseline = cloneConfig(formBaseline.value);
  for (const key of keys) {
    form[key] = next[key];
    baseline[key] = next[key];
  }
  formBaseline.value = baseline;
}

function applyApiModelPreset(preset: ApiModelPreset, force = true) {
  if (apiDisabled.value) return;
  if (force) {
    form.api_llm_url = preset.url;
  }
  if (force || !String(form.api_llm_model || "").trim() || form.api_llm_model === "qwen3") {
    form.api_llm_model = preset.model;
  }
  announceSettings(`已填入 ${preset.label} 对话模型预设`, "success", 1800);
}

function selectedApiPresetId() {
  const preset = API_MODEL_PRESETS.find((item) => form.api_llm_url === item.url && form.api_llm_model === item.model);
  return preset?.id || "custom";
}

function selectedAsrPresetId() {
  const preset = ASR_API_PRESETS.find((item) => form.api_asr_provider === item.provider && form.api_asr_model === item.model);
  return preset?.id || "custom";
}

function selectedTtsPresetId() {
  const preset = TTS_API_PRESETS.find((item) => form.api_tts_provider === item.provider && form.api_tts_model === item.model);
  return preset?.id || "custom";
}

function onApiPresetChange(event: Event) {
  const id = (event.target as HTMLSelectElement).value;
  const preset = API_MODEL_PRESETS.find((item) => item.id === id);
  if (preset) applyApiModelPreset(preset, true);
}

function onAsrPresetChange(id: string) {
  const preset = ASR_API_PRESETS.find((item) => item.id === id);
  if (preset) applyAsrPreset(preset);
}

function onTtsPresetChange(id: string) {
  const preset = TTS_API_PRESETS.find((item) => item.id === id);
  if (preset) applyTtsPreset(preset);
}

function setAsrMode(mode: "local" | "api") {
  form.asr_provider_mode = mode;
  if (mode === "api" && !String(form.api_asr_model || "").trim()) applyAsrPreset(ASR_API_PRESETS[1]);
}

function setTtsMode(mode: "local" | "api") {
  form.tts_provider_mode = mode;
  if (mode === "api" && !String(form.api_tts_model || "").trim()) applyTtsPreset(TTS_API_PRESETS[0]);
}

function applyAsrPreset(preset: AudioPreset) {
  form.asr_provider_mode = "api";
  form.api_asr_provider = preset.provider;
  form.api_asr_url = preset.url;
  form.api_asr_model = preset.model;
  if (preset.language) form.api_asr_language = preset.language;
  announceSettings(`已填入 ${preset.label} ASR 预设`, "success", 1600);
}

function applyTtsPreset(preset: AudioPreset) {
  form.tts_provider_mode = "api";
  form.api_tts_provider = preset.provider;
  form.api_tts_url = preset.url;
  form.api_tts_model = preset.model;
  if (preset.voice) form.api_tts_voice = preset.voice;
  if (preset.voiceMode) form.api_tts_voice_mode = preset.voiceMode;
  if (preset.format) form.api_tts_format = preset.format;
  if (preset.latency) form.api_tts_latency_mode = preset.latency;
  announceSettings(`已填入 ${preset.label} TTS 预设`, "success", 1600);
}

function activeTtsVoiceLabel() {
  if (form.tts_provider_mode !== "api") return String(form.tts_url || "--");
  const mode = String(form.api_tts_voice_mode || "builtin");
  const voice = String(form.api_tts_voice || "").trim();
  const voiceId = String(form.api_tts_voice_id || "").trim();
  if ((mode === "manual" || mode === "cloned") && voiceId) return "远程 Voice ID 已填写";
  if (mode === "cloned") return `参考音频已保存 · 当前用 ${voice || "内置音色"}`;
  if (mode === "manual") return "等待 Voice ID";
  return voice ? `内置音色 ${voice}` : "内置音色";
}

function ttsVoiceStateText() {
  if (form.tts_provider_mode !== "api") return "本地音色";
  const mode = String(form.api_tts_voice_mode || "builtin");
  const voiceId = String(form.api_tts_voice_id || "").trim();
  if (mode === "cloned" && voiceId) return "复刻音色已绑定";
  if (mode === "cloned") return "参考音频待绑定";
  if (mode === "manual") return voiceId ? "远程音色已绑定" : "等待 Voice ID";
  return "内置音色";
}

function ttsVoiceHintText() {
  const mode = String(form.api_tts_voice_mode || "builtin");
  if (mode === "cloned" && !String(form.api_tts_voice_id || "").trim()) {
    return "参考音频已保存在本地，但当前服务商还没有返回远程 Voice ID；生成语音时会先使用内置 Voice。";
  }
  if (mode === "manual" && !String(form.api_tts_voice_id || "").trim()) {
    return "手动音色需要填写服务商的远程 Voice ID。";
  }
  if (mode === "cloned") return "后续生成会使用已绑定的远程复刻音色。";
  return "当前使用服务商内置音色。";
}

function revokeTtsPreviewUrl() {
  if (!ttsPreviewUrl.value) return;
  URL.revokeObjectURL(ttsPreviewUrl.value);
  ttsPreviewUrl.value = "";
}

async function saveTtsConfigOnly() {
  const patch = buildConfigPatch(TTS_CONFIG_KEYS);
  if (!Object.keys(patch).length) return;
  await app.saveConfig(patch);
  if (app.config) absorbSavedConfigKeys(app.config, TTS_CONFIG_KEYS);
}

async function runTtsPreview() {
  if (ttsPreviewLoading.value) return;
  ttsPreviewLoading.value = true;
  ttsPreviewStatus.value = "正在生成试听...";
  try {
    await saveTtsConfigOnly();
    const blob = await runTtsVoicePreview(ttsPreviewText.value || "你好，今天过得怎么样。");
    revokeTtsPreviewUrl();
    ttsPreviewUrl.value = URL.createObjectURL(blob);
    ttsPreviewStatus.value = `试听已生成 · ${Math.round(blob.size / 1024)} KB`;
    announceSettings("试听音频已生成，可以直接播放", "success", 1600);
  } catch (error) {
    ttsPreviewStatus.value = error instanceof Error ? error.message : String(error);
    announceSettings(`试听生成失败：${ttsPreviewStatus.value}`, "error");
  } finally {
    ttsPreviewLoading.value = false;
  }
}

async function saveAll() {
  if (settingsSaving.value) {
    ui.info("正在保存中，请稍候", 1200);
    return;
  }
  if (Object.values(serviceSaving).some(Boolean)) {
    announceSettings("服务参数正在保存，请稍后再应用全部配置", "warning");
    return;
  }
  settingsSaving.value = true;
  settingsMessage.value = "正在保存配置...";
  ui.info("正在保存配置...", 1600);
  try {
    syncModelFileToServiceCommand();
    const configPatch = buildConfigPatch();
    if (Object.keys(configPatch).length) {
      await app.saveConfig(configPatch);
      if (app.config) hydrateConfigForm(app.config, true);
    }
    if (tools.dirty) await tools.save();
    await engagement.save();
    await profiles.saveAll();
    await Promise.all(Object.keys(serviceDrafts).filter((serviceId) => serviceDraftDirty[serviceId]).map((serviceId) => saveServiceDraft(serviceId, true)));
    await Promise.allSettled([tools.reload(), engagement.reload(), profiles.reload()]);
    syncServiceDrafts({ force: true });
    syncModelFilePath();
    announceSettings("配置已保存并应用", "success");
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const hint = rawMessage.includes("502")
      ? "。如果是 127.0.0.1 返回 502，多半是系统代理拦截了本地 API，请把 localhost/127.0.0.1 加入代理直连。"
      : "";
    announceSettings(`保存失败：${rawMessage}${hint}`, "error");
  } finally {
    settingsSaving.value = false;
  }
}

async function openServices() {
  closeSettingsSection();
  await router.push({ name: "services" });
}

function formatProbeDetail(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function describeAudioDiagnostic(result: { provider_mode?: string; provider?: string; model?: string; url?: string; latency_ms?: number | null; hint?: string; error?: string; message?: string }, label: string) {
  const mode = result.provider_mode === "api" ? "API" : "本地";
  const provider = result.provider || (mode === "API" ? "未选择服务商" : "local");
  const model = result.model || "未配置模型";
  const latency = result.latency_ms === null || result.latency_ms === undefined ? "" : ` · ${result.latency_ms}ms`;
  if (!result.error && !result.hint) return `${label} 正常 · 实际生效：${mode} / ${provider} / ${model}${latency}`;
  return result.hint || result.error || result.message || `${label} 调用失败`;
}

async function copyProbeDetail(key: keyof typeof probeState) {
  const detail = probeState[key]?.detail || "";
  if (!detail.trim()) {
    announceSettings("没有可复制的检测结果", "warning", 1200);
    return;
  }
  try {
    await navigator.clipboard.writeText(detail);
    announceSettings("检测结果已复制", "success", 1200);
  } catch (error) {
    announceSettings(`复制失败：${error instanceof Error ? error.message : String(error)}`, "error");
  }
}

async function runSettingsProbe(kind: keyof typeof probeState) {
  probeState[kind] = { status: "running", text: "检测中", detail: "" };
  try {
    if (kind === "llmApi") {
      const result = await runLlmApiDiagnostic();
      probeState[kind] = {
        status: result.ok ? "ok" : "failed",
        text: result.ok ? `API 正常 · ${result.latency_ms ?? "--"}ms` : result.error || "调用失败",
        detail: formatProbeDetail(result),
      };
      return;
    }
    if (kind === "asrApi") {
      const result = await runAsrApiDiagnostic();
      probeState[kind] = {
        status: result.ok ? "ok" : "failed",
        text: describeAudioDiagnostic(result, "ASR"),
        detail: formatProbeDetail(result),
      };
      return;
    }
    if (kind === "ttsApi") {
      const result = await runTtsApiDiagnostic();
      const bytes = (result.response as { audio_bytes?: number } | undefined)?.audio_bytes;
      probeState[kind] = {
        status: result.ok ? "ok" : "failed",
        text: result.ok ? `${describeAudioDiagnostic(result, "TTS")} · ${bytes ?? "--"} bytes` : describeAudioDiagnostic(result, "TTS"),
        detail: formatProbeDetail(result),
      };
      return;
    }
    if (kind === "proactive") {
      await engagement.runTest();
      const latest = engagement.events[0] || {};
      probeState[kind] = {
        status: String(latest.status || "").includes("failed") ? "warning" : "ok",
        text: latest.status ? `已生成事件 · ${latest.status}` : "主动消息测试已创建",
        detail: formatProbeDetail(latest),
      };
      return;
    }
    const result = await runLocalModelsDiagnostic();
    const failed = (result.checks || []).filter((item) => !item.ok);
    probeState[kind] = {
      status: failed.length ? "failed" : "ok",
      text: failed.length ? `${failed.length} 项异常` : `${result.checks.length} 项正常`,
      detail: formatProbeDetail(result),
    };
  } catch (error) {
    probeState[kind] = { status: "failed", text: error instanceof Error ? error.message : String(error), detail: "" };
  }
}

function toolProbeStatus(providerKey: string): ProbeStatus {
  const text = tools.testResults[providerKey] || "";
  if (!text) return "idle";
  if (text === "测试中...") return "running";
  if (text.startsWith("测试失败") || text.includes('"ok": false') || text.includes('"error"')) return "failed";
  return "ok";
}

function toolProbeText(providerKey: string) {
  const text = tools.testResults[providerKey] || "";
  if (!text) return "未检测";
  if (text === "测试中...") return "检测中";
  if (toolProbeStatus(providerKey) === "failed") return "调用异常";
  return "调用正常";
}

async function runToolProbe(providerKey: string) {
  if (providerKey === "direct_answer") {
    tools.testResults[providerKey] = "测试中...";
    try {
      await tools.runResolve();
      tools.testResults[providerKey] = formatProbeDetail(tools.resolveResult || {});
    } catch (error) {
      tools.testResults[providerKey] = `测试失败：${error instanceof Error ? error.message : String(error)}`;
    }
  } else {
    await tools.runProviderTest(providerKey);
  }
  if (toolProbeStatus(providerKey) === "ok") {
    announceSettings(`${PROVIDER_LABELS[providerKey] || providerKey} 调用正常`, "success", 1400);
  } else if (toolProbeStatus(providerKey) === "failed") {
    announceSettings(`${PROVIDER_LABELS[providerKey] || providerKey} 调用异常`, "warning");
  }
}

async function copyToolProbeDetail(providerKey: string) {
  const detail = tools.testResults[providerKey] || "";
  if (!detail.trim()) {
    announceSettings("没有可复制的工具测试结果", "warning", 1200);
    return;
  }
  try {
    await navigator.clipboard.writeText(detail);
    announceSettings("工具测试结果已复制", "success", 1200);
  } catch (error) {
    announceSettings(`复制失败：${error instanceof Error ? error.message : String(error)}`, "error");
  }
}

async function addProfile() {
  try {
    await profiles.add(String(form.system || ""));
    announceSettings("人格已新增", "success");
  } catch (error) {
    announceSettings(`新增人格失败：${error instanceof Error ? error.message : String(error)}`, "error");
  }
}

async function removeProfile(profileId: string, profileName?: string) {
  const confirmed = await ui.confirmAction({
    title: "删除人格",
    message: `确定删除「${profileName || profileId}」？默认人格不会被删除。`,
    confirmText: "删除",
    tone: "error",
  });
  if (!confirmed) return;
  try {
    await profiles.remove(profileId);
    announceSettings("人格已删除", "success");
  } catch (error) {
    announceSettings(`删除人格失败：${error instanceof Error ? error.message : String(error)}`, "error");
  }
}

async function createReminder() {
  if (!engagement.reminderTitle.trim() || !engagement.reminderDueAt.trim()) {
    announceSettings("请填写提醒标题和时间", "warning");
    return;
  }
  try {
    await engagement.createReminder();
    announceSettings("提醒已添加", "success");
  } catch (error) {
    announceSettings(`添加提醒失败：${error instanceof Error ? error.message : String(error)}`, "error");
  }
}

async function removeReminder(reminderId: string, title?: string) {
  const confirmed = await ui.confirmAction({
    title: "删除提醒",
    message: `确定删除提醒「${title || reminderId}」？`,
    confirmText: "删除",
    tone: "error",
  });
  if (!confirmed) return;
  try {
    await engagement.removeReminder(reminderId);
    announceSettings("提醒已删除", "success");
  } catch (error) {
    announceSettings(`删除提醒失败：${error instanceof Error ? error.message : String(error)}`, "error");
  }
}

async function dismissEvent(eventId: string) {
  try {
    await engagement.dismissEvent(eventId);
    announceSettings("主动事件已忽略", "success");
  } catch (error) {
    announceSettings(`忽略事件失败：${error instanceof Error ? error.message : String(error)}`, "error");
  }
}

async function deleteEvent(eventId: string, title?: string) {
  const confirmed = await ui.confirmAction({
    title: "删除最近事件",
    message: `确定删除「${title || eventId}」？这会从最近事件记录里移除。`,
    confirmText: "删除",
    tone: "error",
  });
  if (!confirmed) return;
  try {
    await engagement.deleteEvent(eventId);
    announceSettings("最近事件已删除", "success");
  } catch (error) {
    announceSettings(`删除事件失败：${error instanceof Error ? error.message : String(error)}`, "error");
  }
}

async function clearVisibleEvents() {
  if (!visibleRecentEvents.value.length) return;
  const confirmed = await ui.confirmAction({
    title: "清理最近事件",
    message: `确定删除当前显示的 ${visibleRecentEvents.value.length} 条最近事件？`,
    confirmText: "删除",
    tone: "error",
  });
  if (!confirmed) return;
  try {
    await Promise.all(visibleRecentEvents.value.map((event) => engagement.deleteEvent(event.id)));
    await engagement.reload();
    announceSettings("已清理当前显示的最近事件", "success");
  } catch (error) {
    announceSettings(`清理事件失败：${error instanceof Error ? error.message : String(error)}`, "error");
  }
}

function setMode(mode: "local" | "api") {
  form.dialog_mode = mode;
}

function applyTheme(nextTheme: "dark" | "light") {
  theme.value = nextTheme;
  window.localStorage.setItem("branchwhisper:theme", nextTheme);
  document.documentElement.classList.toggle("theme-light", nextTheme === "light");
  document.documentElement.classList.toggle("theme-dark", nextTheme === "dark");
}

async function hydrateSettings() {
  settingsHydrating.value = true;
  try {
    await Promise.allSettled([tools.reload(), engagement.reload(), profiles.reload(), services.reload(true)]);
    syncServiceDrafts({ force: true });
    syncModelFilePath();
  } finally {
    settingsHydrating.value = false;
  }
}

function openSettingsSection(id: SettingsSectionId) {
  if (id === "commands") {
    syncServiceDrafts();
    if (!services.services.length) void services.reload(true);
  }
  activeSettingsSection.value = id;
}

function openOverviewSection(id: string) {
  openSettingsSection(id as SettingsSectionId);
}

function closeSettingsSection() {
  activeSettingsSection.value = "engine";
}

async function handleAvatarSelected(event: Event, target: "user" | "assistant") {
  const input = event.target as HTMLInputElement;
  const file = Array.from(input.files || []).find((item) => item.type.startsWith("image/"));
  input.value = "";
  if (!file) return;
  try {
    announceSettings("正在上传头像...", "info", 1600);
    const dataUrl = await fileToDataUrl(file);
    const result = await uploadAvatar(dataUrl);
    const url = result.asset.url || "";
    if (target === "user") form.web_user_avatar_url = url;
    else form.web_assistant_avatar_url = url;
    await saveAll();
  } catch (error) {
    announceSettings(`头像上传失败：${error instanceof Error ? error.message : String(error)}`, "error");
  }
}

async function clearAvatar(target: "user" | "assistant") {
  if (target === "user") form.web_user_avatar_url = "";
  else form.web_assistant_avatar_url = "";
  await saveAll();
}

async function handleVoiceSampleSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = Array.from(input.files || []).find((item) => item.type.startsWith("audio/"));
  input.value = "";
  if (!file) {
    announceSettings("请选择音频文件", "warning", 1200);
    return;
  }
  try {
    announceSettings("正在上传参考音频...", "info", 1600);
    const dataUrl = await fileToDataUrl(file);
    const result = await uploadVoiceSample({
      data_url: dataUrl,
      name: file.name,
      provider: String(form.api_tts_provider || "openai"),
    });
    form.api_tts_voice_mode = "cloned";
    form.api_tts_voice_profile_id = result.profile.id;
    form.api_tts_voice_name = file.name;
    if (result.profile.remote_voice_id) form.api_tts_voice_id = result.profile.remote_voice_id;
    announceSettings(result.profile.remote_voice_id ? "音色复刻已生成" : "参考音频已保存，当前服务商需要后续创建远程音色", "success");
  } catch (error) {
    announceSettings(`参考音频上传失败：${error instanceof Error ? error.message : String(error)}`, "error");
  }
}

function parseProviderValue(field: string, value: string) {
  if (field === "enabled" || field.endsWith("_enabled")) return value === "true";
  if (["limit", "max_chars"].includes(field)) return Number(value || 0);
  return value;
}

function setProviderField(providerKey: string, field: string, value: string) {
  const currentProvider = tools.config[providerKey] || {};
  const parsed = parseProviderValue(field, value);
  tools.setProviderField(providerKey, field, parsed);
  if (field !== "provider") return;
  const preset = PROVIDER_BASE_URL_PRESETS[providerKey]?.[String(parsed)];
  if (preset === undefined) return;
  const currentBaseUrl = String(currentProvider.base_url || "");
  const knownUrls = Object.values(PROVIDER_BASE_URL_PRESETS[providerKey] || {});
  if (!currentBaseUrl.trim() || knownUrls.includes(currentBaseUrl)) {
    tools.setProviderField(providerKey, "base_url", preset);
  }
}

async function saveToolsOnly() {
  const toolConfigPatch = buildConfigPatch(TOOL_CONFIG_KEYS);
  if (!tools.dirty && !Object.keys(toolConfigPatch).length) {
    announceSettings("联网工具没有未保存修改", "info", 1400);
    return;
  }
  try {
    announceSettings("正在保存联网工具...", "info", 1600);
    if (Object.keys(toolConfigPatch).length) {
      await app.saveConfig(toolConfigPatch);
      if (app.config) absorbSavedConfigKeys(app.config, TOOL_CONFIG_KEYS);
    }
    await tools.save();
    announceSettings("联网工具配置已保存", "success");
  } catch (error) {
    announceSettings(`联网工具保存失败：${error instanceof Error ? error.message : String(error)}`, "error");
  }
}

function selectTool(providerKey: string) {
  selectedToolKey.value = providerKey;
}

function toggleCommandExpanded(serviceId: string) {
  commandsExpanded.value = { ...commandsExpanded.value, [serviceId]: !commandsExpanded.value[serviceId] };
}

function llmService() {
  return services.services.find((item) => item.id === "llm") || null;
}

function llmDraft() {
  return serviceDrafts.llm || null;
}

function syncModelFilePath() {
  const explicit = String((form.llm_model_file as string) || "").trim();
  modelFilePath.value = explicit || extractCommandModelPath(llmDraft()?.command || llmService()?.command || "");
}

function syncModelFileToServiceCommand() {
  const path = modelFilePath.value.trim();
  if (!path) return;
  const draft = llmDraft();
  if (!draft) return;
  draft.command = replaceCommandModelPath(draft.command || "", path);
  markServiceDraftDirty(draft.id);
  (form as Record<string, unknown>).llm_model_file = path;
}

function openModelPicker() {
  syncModelFilePath();
  modelFileRoot.value = parentPath(modelFilePath.value) || llmDraft()?.cwd || llmService()?.cwd || "";
  modelFileQuery.value = "";
  modelFileModalOpen.value = true;
  void refreshModelFiles();
}

function makeServiceDraft(service: ServiceSummary): ServiceDraft {
  return {
    id: service.id,
    cwd: String(service.cwd || ""),
    health_url: String(service.health_url || ""),
    startup_wait_sec: Number(service.startup_wait_sec || 0),
    command: String(service.configured_command || service.command || ""),
  };
}

function syncServiceDrafts(options: { force?: boolean } = {}) {
  const serviceIds = new Set(services.services.map((service) => service.id));
  for (const service of services.services) {
    if (!options.force && serviceDraftDirty[service.id] && serviceDrafts[service.id]) continue;
    serviceDrafts[service.id] = makeServiceDraft(service);
    serviceDraftDirty[service.id] = false;
  }
  for (const serviceId of Object.keys(serviceDrafts)) {
    if (serviceIds.has(serviceId)) continue;
    delete serviceDrafts[serviceId];
    delete serviceDraftDirty[serviceId];
    delete serviceSaving[serviceId];
  }
}

function markServiceDraftDirty(serviceId: string) {
  serviceDraftDirty[serviceId] = true;
}

function serviceRuntimeLabel(service: ServiceSummary) {
  const state = String(service.state || service.status || (service.running ? "running" : "stopped"));
  return {
    starting: "启动中",
    warming: "预热中",
    ready: "就绪",
    running: "运行中",
    failed: "失败",
    error: "异常",
    stopped: "已停止",
  }[state] || state || "--";
}

async function saveServiceDraft(serviceId: string, quiet = false) {
  const draft = serviceDrafts[serviceId];
  if (!draft) return;
  if (serviceSaving[serviceId]) return;
  serviceSaving[serviceId] = true;
  if (!quiet) {
    settingsMessage.value = `正在保存 ${serviceId} 服务参数...`;
    ui.info(`正在保存 ${serviceId} 服务参数...`, 1600);
  }
  try {
    const savedService = await services.updateConfig({
      id: draft.id,
      cwd: draft.cwd,
      health_url: draft.health_url,
      startup_wait_sec: Number(draft.startup_wait_sec || 0),
      command: draft.command,
    } as ServiceSummary);
    serviceDraftDirty[serviceId] = false;
    if (savedService) {
      serviceDrafts[serviceId] = makeServiceDraft(savedService);
      serviceDraftDirty[serviceId] = false;
    }
    if (!quiet) {
      announceSettings(`${serviceId} 服务参数已保存`, "success");
    }
  } catch (error) {
    if (!quiet) {
      announceSettings(`保存 ${serviceId} 失败：${error instanceof Error ? error.message : String(error)}`, "error");
    }
    throw error;
  } finally {
    serviceSaving[serviceId] = false;
  }
}

async function refreshModelFiles() {
  modelFileLoading.value = true;
  modelFileError.value = "";
  try {
    modelFileResult.value = await listModelFiles(modelFileRoot.value, modelFileQuery.value);
    modelFileRoot.value = modelFileResult.value.root || modelFileRoot.value;
  } catch (error) {
    modelFileError.value = error instanceof Error ? error.message : String(error);
  } finally {
    modelFileLoading.value = false;
  }
}

function chooseModelDirectory(entry: ModelFileEntry) {
  modelFileRoot.value = entry.path;
  void refreshModelFiles();
}

function goModelParent() {
  if (!modelFileResult.value?.parent) return;
  modelFileRoot.value = modelFileResult.value.parent;
  void refreshModelFiles();
}

function chooseModelFile(entry: ModelFileEntry) {
  modelFilePath.value = entry.path;
  syncModelFileToServiceCommand();
  modelFileModalOpen.value = false;
  announceSettings("模型文件已写入 LLM 启动参数，记得保存配置", "success");
}

async function copyServiceCommand(command = "") {
  if (!command.trim()) {
    announceSettings("没有可复制的启动命令", "warning");
    return;
  }
  try {
    await navigator.clipboard.writeText(command);
    announceSettings("启动命令已复制", "success");
  } catch {
    announceSettings("复制启动命令失败", "error");
  }
}

function extractCommandModelPath(command: string) {
  const match = String(command || "").match(/(?:^|\s)(?:-m|--model)\s+("[^"]+"|'[^']+'|\S+)|(?:^|\s)--model=("[^"]+"|'[^']+'|\S+)/);
  const raw = match?.[1] || match?.[2] || "";
  return raw.replace(/^["']|["']$/g, "");
}

function replaceCommandModelPath(command: string, path: string) {
  const quoted = shellQuote(path);
  const text = String(command || "").trim();
  if (!text) return `--model ${quoted}`;
  if (/(^|\s)(-m|--model)\s+("[^"]+"|'[^']+'|\S+)/.test(text)) {
    return text.replace(/(^|\s)(-m|--model)\s+("[^"]+"|'[^']+'|\S+)/, `$1$2 ${quoted}`);
  }
  if (/(^|\s)--model=("[^"]+"|'[^']+'|\S+)/.test(text)) {
    return text.replace(/(^|\s)--model=("[^"]+"|'[^']+'|\S+)/, `$1--model=${quoted}`);
  }
  return `${text} --model ${quoted}`;
}

function parentPath(path: string) {
  const text = String(path || "").trim().replace(/\\/g, "/");
  if (!text || !text.includes("/")) return "";
  return text.slice(0, text.lastIndexOf("/"));
}

function shellQuote(path: string) {
  const text = String(path || "").trim();
  if (!text) return '""';
  return /\s/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
}

function formatFileSize(size?: number) {
  let value = Number(size || 0);
  const units = ["B", "KB", "MB", "GB"];
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
}

function formatTime(value?: string) {
  return value ? value.replace("T", " ").slice(0, 16) : "--";
}
</script>

<template>
  <main class="page-view">
    <div class="settings-page">
      <aside class="settings-nav">
        <p class="eyebrow">BranchWhisper</p>
        <h1>配置中心</h1>
        <div v-for="group in settingsNavGroups" :key="group.label" class="settings-nav-group">
          <span class="settings-nav-group-title">{{ group.label }}</span>
          <button
            v-for="section in group.items"
            :key="section.id"
            class="settings-nav-item"
            :class="{ active: activeSettingsSection === section.id }"
            type="button"
            @click="openSettingsSection(section.id)"
          >
            <component :is="section.icon" :size="16" />
            <span>{{ section.title }}</span>
          </button>
        </div>
        <button class="primary-action full settings-save-main" type="button" :disabled="settingsSaving" @click="saveAll">
          <Save :size="16" /> {{ settingsSaving ? "保存中..." : "应用全部配置" }}
        </button>
      </aside>

      <section class="settings-content settings-workspace">
        <PageHeader
          eyebrow="Settings"
          title="配置中心"
          description="先确认当前 LLM、ASR、TTS 和能力开关，再进入对应分区调整高级参数。"
          :status-text="settingsHeaderStatus"
          :status-tone="settingsHeaderTone"
        >
          <template #actions>
            <button class="primary-action" type="button" :disabled="settingsSaving" @click="saveAll">
              <Save :size="16" /> {{ settingsSaving ? "保存中..." : "应用全部配置" }}
            </button>
          </template>
        </PageHeader>

        <StatusSummary :items="settingsSummaryItems" />

        <SettingsOverviewBoard
          :active-section="activeSection"
          :runtime-chain-items="runtimeChainItems"
          :form="form"
          :engagement-config="engagement.config"
          :settings-message="settingsMessage"
          :settings-saving="settingsSaving"
          @open-section="openOverviewSection"
          @save-all="saveAll"
        />
        <AppearanceSettingsPanel
          v-show="activeSettingsSection === 'appearance'"
          :form="form"
          :theme="theme"
          @apply-theme="applyTheme"
          @select-avatar="(target) => (target === 'user' ? userAvatarInput : assistantAvatarInput)?.click()"
          @clear-avatar="clearAvatar"
        />

        <DialogModelPanel
          v-show="activeSettingsSection === 'engine'"
          :form="form"
          :local-disabled="localDisabled"
          :api-disabled="apiDisabled"
          :llm-api-probe="probeState.llmApi"
          :local-models-probe="probeState.localModels"
          :presets="API_MODEL_PRESETS"
          :selected-preset-id="selectedApiPresetId()"
          :model-file-path="modelFilePath"
          @set-mode="setMode"
          @run-llm-probe="runSettingsProbe('llmApi')"
          @copy-llm-probe="copyProbeDetail('llmApi')"
          @run-local-probe="runSettingsProbe('localModels')"
          @copy-local-probe="copyProbeDetail('localModels')"
          @update-model-file-path="modelFilePath = $event"
          @sync-model-file="syncModelFileToServiceCommand"
          @open-model-picker="openModelPicker"
          @preset-change="onApiPresetChange"
        />

        <AsrProviderPanel
          v-show="activeSettingsSection === 'asr'"
          :form="form"
          :asr-api-disabled="asrApiDisabled"
          :asr-probe="probeState.asrApi"
          :local-probe="probeState.localModels"
          :presets="ASR_API_PRESETS"
          :selected-preset-id="selectedAsrPresetId()"
          @set-mode="setAsrMode"
          @preset-change="onAsrPresetChange"
          @run-asr-probe="runSettingsProbe('asrApi')"
          @copy-asr-probe="copyProbeDetail('asrApi')"
          @run-local-probe="runSettingsProbe('localModels')"
          @copy-local-probe="copyProbeDetail('localModels')"
        />

        <ToolSettingsPanel
          v-show="activeSettingsSection === 'tools'"
          :form="form"
          :tools-config="tools.config"
          :tools-loading="tools.loading"
          :tools-saving="tools.saving"
          :tools-any-dirty="toolsAnyDirty"
          :tool-grid-items="toolGridItems"
          :selected-tool-key="selectedToolKey"
          :selected-tool-item="selectedToolItem"
          :test-results="tools.testResults"
          :resolve-result="tools.resolveResult"
          :tools-error="tools.error"
          @save-tools="saveToolsOnly"
          @select-tool="selectTool"
          @set-provider-field="setProviderField"
          @run-tool-probe="runToolProbe"
          @copy-tool-probe="copyToolProbeDetail"
          @run-resolve="tools.runResolve"
        />

        <ProactiveSettingsPanel
          v-show="activeSettingsSection === 'proactive'"
          :engagement="engagement"
          :probe="probeState.proactive"
          :pending-reminders="pendingReminders"
          :recent-events="recentEvents"
          :visible-recent-events="visibleRecentEvents"
          :hidden-recent-event-count="hiddenRecentEventCount"
          :events-expanded="proactiveEventsExpanded"
          :format-time="formatTime"
          @run-probe="runSettingsProbe('proactive')"
          @copy-probe="copyProbeDetail('proactive')"
          @create-reminder="createReminder"
          @remove-reminder="removeReminder"
          @toggle-events-expanded="proactiveEventsExpanded = !proactiveEventsExpanded"
          @clear-visible-events="clearVisibleEvents"
          @dismiss-event="dismissEvent"
          @delete-event="deleteEvent"
        />

        <BotProfilesPanel v-show="activeSettingsSection === 'botProfiles'" :profiles="profiles.profiles" :error="profiles.error" @add-profile="addProfile" @remove-profile="removeProfile" />

        <PromptSettingsPanel v-show="activeSettingsSection === 'prompt'" :form="form" />

        <TtsProviderPanel
          v-show="activeSettingsSection === 'tts'"
          :form="form"
          :tts-api-disabled="ttsApiDisabled"
          :tts-probe="probeState.ttsApi"
          :presets="TTS_API_PRESETS"
          :selected-preset-id="selectedTtsPresetId()"
          :active-voice-label="activeTtsVoiceLabel()"
          :voice-state-text="ttsVoiceStateText()"
          :voice-hint-text="ttsVoiceHintText()"
          :preview-text="ttsPreviewText"
          :preview-url="ttsPreviewUrl"
          :preview-loading="ttsPreviewLoading"
          :preview-status="ttsPreviewStatus"
          @set-mode="setTtsMode"
          @preset-change="onTtsPresetChange"
          @run-tts-probe="runSettingsProbe('ttsApi')"
          @copy-tts-probe="copyProbeDetail('ttsApi')"
          @voice-sample-selected="handleVoiceSampleSelected"
          @update-preview-text="ttsPreviewText = $event"
          @run-preview="runTtsPreview"
        />

        <VadSettingsPanel v-show="activeSettingsSection === 'vad'" :form="form" />

        <ServiceCommandPanel
          v-show="activeSettingsSection === 'commands'"
          :service-draft-list="serviceDraftList"
          :service-draft-dirty="serviceDraftDirty"
          :service-saving="serviceSaving"
          :commands-expanded="commandsExpanded"
          :settings-saving="settingsSaving"
          :settings-hydrating="settingsHydrating"
          :service-runtime-label="serviceRuntimeLabel"
          @open-services="openServices"
          @toggle-expanded="toggleCommandExpanded"
          @mark-dirty="markServiceDraftDirty"
          @save-service="saveServiceDraft"
          @copy-command="copyServiceCommand"
        />
      </section>
    </div>

    <div v-if="modelFileModalOpen" class="modal-overlay" @click.self="modelFileModalOpen = false">
      <section class="modal-panel model-file-modal-panel" role="dialog" aria-modal="true" aria-label="选择模型文件">
        <div class="modal-head">
          <div>
            <p class="eyebrow">Model Files</p>
            <h2>选择 LLM 模型文件</h2>
          </div>
          <button class="icon-button modal-close" type="button" title="关闭" @click="modelFileModalOpen = false"><X :size="16" /></button>
        </div>
        <div class="modal-body">
          <div class="model-file-toolbar">
            <input v-model="modelFileRoot" placeholder="模型目录" @keyup.enter="refreshModelFiles" />
            <input v-model="modelFileQuery" placeholder="搜索 .gguf / .safetensors" @keyup.enter="refreshModelFiles" />
            <button class="secondary-action" type="button" @click="refreshModelFiles"><RefreshCw :size="15" />刷新</button>
          </div>
          <p v-if="modelFileError" class="muted-copy">{{ modelFileError }}</p>
          <div class="model-file-list">
            <button v-if="modelFileResult?.parent" class="model-file-item directory" type="button" @click="goModelParent">
              <FolderOpen :size="16" />
              <span><strong>上级目录</strong><span>{{ modelFileResult.parent }}</span></span>
            </button>
            <button v-for="directory in modelFileResult?.directories || []" :key="directory.path" class="model-file-item directory" type="button" @click="chooseModelDirectory(directory)">
              <FolderOpen :size="16" />
              <span><strong>{{ directory.name }}</strong><span>{{ directory.path }}</span></span>
            </button>
            <button v-for="file in modelFileResult?.files || []" :key="file.path" class="model-file-item" type="button" @click="chooseModelFile(file)">
              <HardDrive :size="16" />
              <span><strong>{{ file.name }}</strong><span>{{ formatFileSize(file.size) }} · {{ formatTime(file.modified_at) }}</span></span>
            </button>
            <div v-if="!modelFileLoading && !(modelFileResult?.directories?.length || modelFileResult?.files?.length)" class="model-file-empty">没有找到可用模型文件</div>
            <div v-if="modelFileLoading" class="model-file-empty">正在扫描模型目录...</div>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>

