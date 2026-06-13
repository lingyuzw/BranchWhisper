<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import {
  AlarmPlus,
  Bot,
  ClipboardCheck,
  Cloud,
  Copy,
  Cpu,
  FileSearch,
  FolderOpen,
  Globe2,
  HardDrive,
  ImagePlus,
  Library,
  MessageSquareText,
  MicVocal,
  Moon,
  Palette,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Sun,
  Terminal,
  Trash2,
  Volume2,
  X,
} from "@lucide/vue";
import { uploadAvatar } from "@/api/assets";
import { useAppStore } from "@/stores/app";
import { listModelFiles, type ModelFileEntry, type ModelFilesResponse, type PublicConfig } from "@/api/config";
import type { ServiceSummary } from "@/api/services";
import { PROVIDER_FIELDS, PROVIDER_LABELS, PROVIDER_OPTIONS, useToolsStore } from "@/stores/tools";
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
interface ServiceDraft {
  id: string;
  cwd: string;
  health_url: string;
  startup_wait_sec: number;
  command: string;
}
const serviceDrafts = reactive<Record<string, ServiceDraft>>({});
const serviceDraftDirty = reactive<Record<string, boolean>>({});
const serviceSaving = reactive<Record<string, boolean>>({});
const providerKeys = Object.keys(PROVIDER_FIELDS);
interface ToolProviderGroup {
  id: string;
  title: string;
  summary: string;
  keys: string[];
}
const localDisabled = computed(() => form.dialog_mode === "api");
const apiDisabled = computed(() => form.dialog_mode === "local");
const pendingReminders = computed(() => engagement.pendingReminders.slice(0, 8));
const recentEvents = computed(() => engagement.recentEvents);
const recommendedBooleanDefaults: Partial<PublicConfig> = {
  tts_enabled: true,
  tools_enabled: true,
  tools_auto_call: true,
  vision_enabled: true,
  sticker_vision_enabled: true,
  stickers_enabled: true,
  context_compaction_enabled: true,
};
const DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DASHSCOPE_CHAT_COMPLETIONS_URL = `${DASHSCOPE_BASE_URL}/chat/completions`;
const DEFAULT_API_MODEL = "qwen-plus";
const DEFAULT_VISION_MODEL = "qwen3-vl-plus";
const recommendedStringDefaults: Partial<PublicConfig> = {
  api_llm_url: DASHSCOPE_CHAT_COMPLETIONS_URL,
  api_llm_model: DEFAULT_API_MODEL,
  sticker_vision_url: DASHSCOPE_CHAT_COMPLETIONS_URL,
  sticker_vision_model: DEFAULT_VISION_MODEL,
};
const SECRET_CONFIG_KEYS = new Set(["llm_api_key", "api_llm_api_key", "sticker_vision_api_key"]);
const SKIPPED_CONFIG_KEYS = new Set(["llm_model_file"]);
const TOOL_CONFIG_KEYS = new Set(["tools_enabled", "tools_auto_call", "tools_timeout", "tools_max_result_chars"]);
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
  | "tools"
  | "dialogFeatures"
  | "proactive"
  | "botProfiles"
  | "prompt"
  | "tts"
  | "vad"
  | "commands";
const activeSettingsSection = ref<SettingsSectionId | "">("");
const toolsConfigDirty = computed(() => Object.keys(buildConfigPatch(TOOL_CONFIG_KEYS)).length > 0);
const toolsAnyDirty = computed(() => tools.dirty || toolsConfigDirty.value);
const providerGroups = computed<ToolProviderGroup[]>(() => {
  const groups: ToolProviderGroup[] = [
    {
      id: "external",
      title: "外部接口",
      summary: "需要服务商、Base URL 或 API Key 的联网能力",
      keys: ["weather", "search", "news", "finance", "map"].filter((key) => providerKeys.includes(key)),
    },
    {
      id: "builtin",
      title: "内置能力",
      summary: "由本地运行时处理的网页读取、提醒和通道能力",
      keys: ["url_fetch", "reminder"].filter((key) => providerKeys.includes(key)),
    },
  ];
  const groupedKeys = new Set(groups.flatMap((group) => group.keys));
  const extraKeys = providerKeys.filter((key) => !groupedKeys.has(key));
  if (extraKeys.length) {
    groups.push({ id: "custom", title: "其他 Provider", summary: "插件或自定义工具", keys: extraKeys });
  }
  return groups.filter((group) => group.keys.length);
});
const settingsSections = computed(() => [
  {
    id: "appearance" as SettingsSectionId,
    icon: Palette,
    eyebrow: "Appearance",
    title: "外观与身份",
    summary: "主题、头像、字号和对话页身份",
    status: theme.value === "light" ? "浅色主题" : "深色主题",
  },
  {
    id: "engine" as SettingsSectionId,
    icon: Cpu,
    eyebrow: "Model Engine",
    title: "对话模型",
    summary: "本地/API 模型、ASR 与模型文件",
    status: form.dialog_mode === "api" ? "API 模式" : "本地模式",
  },
  {
    id: "tools" as SettingsSectionId,
    icon: Globe2,
    eyebrow: "Network Tools",
    title: "联网工具",
    summary: "搜索、天气、新闻、微信等 Provider",
    status: form.tools_enabled ? "工具启用" : "工具关闭",
  },
  {
    id: "dialogFeatures" as SettingsSectionId,
    icon: Library,
    eyebrow: "Conversation",
    title: "素材与对话能力",
    summary: "图片理解、素材库、上下文压缩",
    status: form.vision_enabled ? "视觉启用" : "视觉关闭",
  },
  {
    id: "proactive" as SettingsSectionId,
    icon: Sparkles,
    eyebrow: "Proactive",
    title: "主动性",
    summary: "问候、提醒、追问和触发器",
    status: engagement.config.enabled ? "主动消息启用" : "主动消息关闭",
  },
  {
    id: "botProfiles" as SettingsSectionId,
    icon: Bot,
    eyebrow: "Profiles",
    title: "Bot 人格",
    summary: "多人格、头像、工具权限和风格",
    status: `${profiles.profiles.length || 0} 个 Profile`,
  },
  {
    id: "prompt" as SettingsSectionId,
    icon: MessageSquareText,
    eyebrow: "Persona",
    title: "Prompt 配置",
    summary: "系统提示词与角色边界",
    status: form.system ? "已配置" : "未配置",
  },
  {
    id: "tts" as SettingsSectionId,
    icon: Volume2,
    eyebrow: "Speech",
    title: "语音合成",
    summary: "TTS 地址、速度、音量和采样率",
    status: form.tts_enabled ? "TTS 启用" : "TTS 关闭",
  },
  {
    id: "vad" as SettingsSectionId,
    icon: MicVocal,
    eyebrow: "Voice Activity",
    title: "语音检测",
    summary: "VAD 阈值、静默和语音时长",
    status: `阈值 ${form.vad_threshold ?? "--"}`,
  },
  {
    id: "commands" as SettingsSectionId,
    icon: Terminal,
    eyebrow: "Services",
    title: "服务命令",
    summary: "工作目录、启动命令、健康检查地址",
    status: `${services.services.length || 0} 个服务`,
  },
]);
const settingsLaunchSections = computed(() => settingsSections.value.filter((item) => item.id !== "appearance"));
const activeSettingsCard = computed(() => settingsSections.value.find((item) => item.id === activeSettingsSection.value));
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

function isDashScopeCompatibleUrl(value: unknown) {
  const text = String(value || "").trim();
  return !text || text === DASHSCOPE_BASE_URL || text === DASHSCOPE_CHAT_COMPLETIONS_URL;
}

function applyDashScopeDefaults(force = false) {
  if (force || isDashScopeCompatibleUrl(form.api_llm_url)) {
    form.api_llm_url = DASHSCOPE_CHAT_COMPLETIONS_URL;
  }
  if (force || !String(form.api_llm_model || "").trim() || form.api_llm_model === "qwen3") {
    form.api_llm_model = DEFAULT_API_MODEL;
  }
  if (force || isDashScopeCompatibleUrl(form.sticker_vision_url)) {
    form.sticker_vision_url = DASHSCOPE_CHAT_COMPLETIONS_URL;
  }
  if (force || !String(form.sticker_vision_model || "").trim() || form.sticker_vision_model === "qwen-vl") {
    form.sticker_vision_model = DEFAULT_VISION_MODEL;
  }
  announceSettings("已填入百炼 OpenAI 兼容预设", "success", 1800);
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
    announceSettings(`保存失败：${error instanceof Error ? error.message : String(error)}`, "error");
  } finally {
    settingsSaving.value = false;
  }
}

async function openAssets() {
  closeSettingsSection();
  await router.push({ name: "assets" });
}

async function openDiagnostics() {
  closeSettingsSection();
  await router.push({ name: "diagnostics" });
}

async function openServices() {
  closeSettingsSection();
  await router.push({ name: "services" });
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

function setMode(mode: "local" | "api") {
  form.dialog_mode = mode;
  if (mode === "api") applyDashScopeDefaults();
}

function applyTheme(nextTheme: "dark" | "light") {
  theme.value = nextTheme;
  window.localStorage.setItem("branchwhisper:theme", nextTheme);
  document.documentElement.classList.toggle("theme-light", nextTheme === "light");
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

function closeSettingsSection() {
  activeSettingsSection.value = "";
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

function eventValue(event: Event) {
  return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
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

function providerFieldValue(providerKey: string, field: string) {
  const value = (tools.config[providerKey] || {})[field];
  if (typeof value === "boolean") return String(value);
  if ((field === "api_key" || field === "webhook_url") && !value && (tools.config[providerKey]?.[`${field}_set`] || tools.config[providerKey]?.[`${field}_masked`])) {
    return "";
  }
  return String(value ?? "");
}

function providerFieldLabel(field: string) {
  return {
    enabled: "启用",
    provider: "服务商",
    base_url: "Base URL",
    api_key: "API Key",
    default_location: "默认地点",
    limit: "数量上限",
    region: "区域",
    user_agent: "User Agent",
    max_chars: "最大字符",
    web_enabled: "Web",
    weixin_enabled: "微信",
    webhook_url: "Webhook",
  }[field] || field;
}

function providerSecretState(providerKey: string) {
  const provider = tools.config[providerKey] || {};
  if (provider.api_key_set || provider.webhook_url_set) return "密钥已保存";
  if (provider.api_key_masked || provider.webhook_url_masked) return provider.api_key_masked || provider.webhook_url_masked;
  return "未配置密钥";
}

function providerInputType(field: string) {
  if (field === "api_key" || field === "webhook_url") return "password";
  if (field === "limit" || field === "max_chars") return "number";
  return "text";
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
        <button
          v-for="section in settingsLaunchSections"
          :key="section.id"
          class="settings-nav-item"
          :class="{ active: activeSettingsSection === section.id }"
          type="button"
          @click="openSettingsSection(section.id)"
        >
          <component :is="section.icon" :size="16" />
          <span>{{ section.title }}</span>
        </button>
        <button class="primary-action full settings-save-main" type="button" :disabled="settingsSaving" @click="saveAll">
          <Save :size="16" /> {{ settingsSaving ? "保存中..." : "应用全部配置" }}
        </button>
      </aside>

      <section class="settings-content">
        <section class="settings-hero">
          <div>
            <p class="eyebrow">Control Room</p>
            <h2>本地模型与对话能力</h2>
            <p>常用开关直接调整，复杂参数进入高级面板，检测和素材管理从这里快速跳转。</p>
          </div>
          <div class="settings-hero-actions">
            <span v-if="settingsMessage" class="soft-badge">{{ settingsMessage }}</span>
            <button class="secondary-action" type="button" @click="openDiagnostics">
              <ClipboardCheck :size="16" /> 检测中心
            </button>
            <button class="secondary-action" type="button" @click="openAssets">
              <Library :size="16" /> 素材库
            </button>
            <button class="primary-action" type="button" :disabled="settingsSaving" @click="saveAll">
              <Save :size="16" /> {{ settingsSaving ? "保存中..." : "保存当前配置" }}
            </button>
          </div>
        </section>

        <section class="settings-quick-console">
          <article class="quick-panel quick-panel-appearance">
            <div class="quick-panel-head">
              <div>
                <p class="eyebrow">Frequent</p>
                <h2>常用配置</h2>
              </div>
              <span class="soft-badge">{{ theme === "light" ? "浅色主题" : "深色主题" }}</span>
            </div>
            <div class="quick-control-grid">
              <section class="quick-control">
                <strong>主题</strong>
                <div class="theme-toggle-group">
                  <button :class="{ active: theme === 'dark' }" type="button" @click="applyTheme('dark')"><Moon :size="15" />深色</button>
                  <button :class="{ active: theme === 'light' }" type="button" @click="applyTheme('light')"><Sun :size="15" />浅色</button>
                </div>
              </section>
              <section class="quick-control">
                <strong>对话模式</strong>
                <div class="theme-toggle-group">
                  <button type="button" :class="{ active: form.dialog_mode !== 'api' }" @click="setMode('local')"><HardDrive :size="15" />本地</button>
                  <button type="button" :class="{ active: form.dialog_mode === 'api' }" @click="setMode('api')"><Cloud :size="15" />API</button>
                </div>
              </section>
              <label class="quick-control"><strong>文字大小</strong><input v-model.number="form.ui_font_scale" type="number" min="0.9" max="1.25" step="0.05" /></label>
              <label class="quick-check"><input v-model="form.thinking_enabled" type="checkbox" />思考模式</label>
            </div>
          </article>

          <article class="quick-panel quick-panel-identity">
            <div class="quick-person">
              <div class="identity-preview">
                <img v-if="form.web_user_avatar_url" :src="form.web_user_avatar_url" alt="我的头像" />
                <span v-else>我</span>
              </div>
              <label><span>我的名称</span><input v-model="form.web_user_name" maxlength="40" /></label>
              <input ref="userAvatarInput" class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="handleAvatarSelected($event, 'user')" />
              <button class="secondary-action" type="button" @click="userAvatarInput?.click()"><ImagePlus :size="15" />头像</button>
              <button class="small-button" type="button" @click="clearAvatar('user')">清除</button>
            </div>
            <div class="quick-person">
              <div class="identity-preview assistant">
                <img v-if="form.web_assistant_avatar_url" :src="form.web_assistant_avatar_url" alt="AI 头像" />
                <span v-else>枝</span>
              </div>
              <label><span>AI 名称</span><input v-model="form.web_assistant_name" maxlength="40" /></label>
              <input ref="assistantAvatarInput" class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="handleAvatarSelected($event, 'assistant')" />
              <button class="secondary-action" type="button" @click="assistantAvatarInput?.click()"><ImagePlus :size="15" />头像</button>
              <button class="small-button" type="button" @click="clearAvatar('assistant')">清除</button>
            </div>
          </article>

          <article class="quick-panel quick-panel-switches">
            <div class="quick-panel-head">
              <div>
                <p class="eyebrow">Capabilities</p>
                <h2>能力开关</h2>
              </div>
              <button class="secondary-action" type="button" @click="openDiagnostics"><ClipboardCheck :size="15" />检测中心</button>
            </div>
            <div class="quick-switch-grid">
              <label><span>TTS</span><select v-model="form.tts_enabled"><option :value="true">启用</option><option :value="false">关闭</option></select></label>
              <label><span>联网工具</span><select v-model="form.tools_enabled"><option :value="true">启用</option><option :value="false">关闭</option></select></label>
              <label><span>图片理解</span><select v-model="form.vision_enabled"><option :value="true">启用</option><option :value="false">关闭</option></select></label>
              <label><span>上下文压缩</span><select v-model="form.context_compaction_enabled"><option :value="true">启用</option><option :value="false">关闭</option></select></label>
              <label><span>主动消息</span><select v-model="engagement.config.enabled"><option :value="true">启用</option><option :value="false">关闭</option></select></label>
              <label><span>表情发送</span><select v-model="form.stickers_enabled"><option :value="true">启用</option><option :value="false">关闭</option></select></label>
            </div>
          </article>
        </section>

        <div class="settings-section-label">
          <div>
            <p class="eyebrow">Advanced Panels</p>
            <h2>高级配置</h2>
          </div>
          <small>参数量大的功能仍然收进面板，日常修改不需要反复打开。</small>
        </div>

        <section class="settings-overview-grid">
          <button
            v-for="(section, index) in settingsLaunchSections"
            :key="section.id"
            class="settings-overview-card settings-launch-card"
            :class="{ 'primary-card': index < 2, active: activeSettingsSection === section.id }"
            type="button"
            @click="openSettingsSection(section.id)"
          >
            <span><component :is="section.icon" :size="15" />{{ section.eyebrow }}</span>
            <strong>{{ section.title }}</strong>
            <small>{{ section.summary }}</small>
            <em>{{ section.status }}</em>
          </button>
        </section>

        <article class="theme-section settings-section-detached" :class="{ 'is-active': activeSettingsSection === 'appearance' }" id="appearance">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Appearance</p>
              <h2>外观与身份</h2>
            </div>
            <span class="soft-badge">Web 对话页生效</span>
          </div>
          <div class="appearance-layout">
            <section class="appearance-block appearance-block--compact">
              <div class="appearance-card-head">
                <strong>界面</strong>
                <small>主题与字号</small>
              </div>
              <div class="theme-toggle-group theme-toggle-group--compact">
                <button :class="{ active: theme === 'dark' }" type="button" @click="applyTheme('dark')"><Moon :size="15" />深色</button>
                <button :class="{ active: theme === 'light' }" type="button" @click="applyTheme('light')"><Sun :size="15" />浅色</button>
              </div>
              <label class="compact-field"><span>页面文字大小</span><input v-model.number="form.ui_font_scale" type="number" min="0.9" max="1.25" step="0.05" /></label>
            </section>
            <section class="appearance-block appearance-identity-card">
              <div class="identity-preview">
                <img v-if="form.web_user_avatar_url" :src="form.web_user_avatar_url" alt="我的头像" />
                <span v-else>我</span>
              </div>
              <div class="identity-form">
                <div class="appearance-card-head">
                  <strong>我的显示</strong>
                  <small>仅 Web 对话页生效</small>
                </div>
                <label><span>显示名称</span><input v-model="form.web_user_name" maxlength="40" /></label>
                <input ref="userAvatarInput" class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="handleAvatarSelected($event, 'user')" />
                <div class="avatar-upload-row">
                  <button class="secondary-action avatar-upload-btn" type="button" @click="userAvatarInput?.click()"><ImagePlus :size="15" />选择头像</button>
                  <button class="small-button avatar-clear-btn" type="button" @click="clearAvatar('user')">清除</button>
                </div>
              </div>
            </section>
            <section class="appearance-block appearance-identity-card">
              <div class="identity-preview">
                <img v-if="form.web_assistant_avatar_url" :src="form.web_assistant_avatar_url" alt="AI 头像" />
                <span v-else>枝</span>
              </div>
              <div class="identity-form">
                <div class="appearance-card-head">
                  <strong>AI 显示</strong>
                  <small>用于 Web 对话气泡</small>
                </div>
                <label><span>显示名称</span><input v-model="form.web_assistant_name" maxlength="40" /></label>
                <input ref="assistantAvatarInput" class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="handleAvatarSelected($event, 'assistant')" />
                <div class="avatar-upload-row">
                  <button class="secondary-action avatar-upload-btn" type="button" @click="assistantAvatarInput?.click()"><ImagePlus :size="15" />选择头像</button>
                  <button class="small-button avatar-clear-btn" type="button" @click="clearAvatar('assistant')">清除</button>
                </div>
              </div>
            </section>
          </div>
        </article>

        <article class="settings-panel settings-section-detached" :class="{ 'is-active': activeSettingsSection === 'engine' }" id="engine">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Model Engine</p>
              <h2>对话模型</h2>
            </div>
            <span class="soft-badge">当前模式：{{ form.dialog_mode || "local" }}</span>
          </div>

          <div class="dialog-mode-panel">
            <div class="dialog-mode-copy">
              <strong>对话模式</strong>
              <small>同一时间只启用一种模型；本地/API 记忆库自动隔离。</small>
            </div>
            <div class="theme-toggle-group dialog-mode-toggle">
              <button type="button" :class="{ active: form.dialog_mode !== 'api' }" @click="setMode('local')"><HardDrive :size="15" />本地模型</button>
              <button type="button" :class="{ active: form.dialog_mode === 'api' }" @click="setMode('api')"><Cloud :size="15" />API 模型</button>
            </div>
            <label class="thinking-toggle"><input v-model="form.thinking_enabled" type="checkbox" /> 启用思考模式，仅输出最终结果</label>
          </div>

          <div class="dialog-feature-card compact-feature-card">
            <div class="appearance-card-head"><strong>ASR 语音识别</strong><small>本地转写或 Chat ASR 兼容接口</small></div>
            <div class="form-grid compact">
              <label><span>ASR Mode</span><select v-model="form.asr_mode"><option value="transcription">transcription</option><option value="chat">chat</option></select></label>
              <label><span>ASR Model</span><input v-model="form.asr_model" /></label>
              <label><span>ASR Timeout</span><input v-model.number="form.asr_timeout" type="number" min="5" max="300" step="1" /></label>
              <label class="wide"><span>ASR URL</span><input v-model="form.asr_url" /></label>
            </div>
          </div>

          <section class="local-engine-card" :class="{ 'model-panel-locked': localDisabled }" data-locked-label="当前使用 API 模型，本地模型参数已锁定">
            <div class="appearance-card-head"><strong>Local Chat Completions</strong><small>仅在本地模型模式下生效</small></div>
            <div class="form-grid compact">
              <label><span>本地模型别名</span><input v-model="form.llm_model" :disabled="localDisabled" /></label>
              <label><span>Temperature</span><input v-model.number="form.temperature" :disabled="localDisabled" type="number" min="0" max="1.5" step="0.01" /></label>
              <label><span>Max Tokens</span><input v-model.number="form.max_tokens" :disabled="localDisabled" type="number" min="32" max="4096" step="1" /></label>
              <label><span>History Turns</span><input v-model.number="form.history_turns" :disabled="localDisabled" type="number" min="1" max="40" step="1" /></label>
              <label class="wide"><span>本地 Chat Completions URL</span><input v-model="form.llm_url" :disabled="localDisabled" /></label>
              <label class="wide model-file-field">
                <span>LLM 模型文件</span>
                <div class="model-file-row">
                  <input v-model="modelFilePath" :disabled="localDisabled" placeholder="选择或粘贴 .gguf / .safetensors / .bin 模型文件路径" @change="syncModelFileToServiceCommand" />
                  <button class="secondary-action" type="button" :disabled="localDisabled" @click="openModelPicker"><FileSearch :size="16" /> 选择</button>
                </div>
              </label>
            </div>
          </section>

          <section class="api-engine-card" :class="{ 'model-panel-locked': apiDisabled }" data-locked-label="当前使用本地模型，API 参数已锁定">
            <div class="appearance-card-head">
              <div><strong>OpenAI-compatible API</strong><small>DeepSeek、通义兼容接口、自建网关都可填这里</small></div>
              <button class="secondary-action" type="button" :disabled="apiDisabled" @click="applyDashScopeDefaults(true)"><Cloud :size="15" />百炼预设</button>
            </div>
            <div class="form-grid compact">
              <label class="wide"><span>API Chat Completions URL</span><input v-model="form.api_llm_url" :disabled="apiDisabled" placeholder="https://api.example.com/v1/chat/completions" /></label>
              <label><span>API Model</span><input v-model="form.api_llm_model" :disabled="apiDisabled" placeholder="model-name" /></label>
              <label><span>API Key</span><input v-model="form.api_llm_api_key" :disabled="apiDisabled" type="password" :placeholder="form.api_llm_api_key_masked || '留空则保留已保存 Key'" /></label>
              <label><span>API Temperature</span><input v-model.number="form.api_temperature" :disabled="apiDisabled" type="number" min="0" max="1.5" step="0.01" /></label>
              <label><span>API Max Tokens</span><input v-model.number="form.api_max_tokens" :disabled="apiDisabled" type="number" min="32" max="8192" step="1" /></label>
              <label><span>API History Turns</span><input v-model.number="form.api_history_turns" :disabled="apiDisabled" type="number" min="1" max="40" step="1" /></label>
            </div>
          </section>
        </article>

        <article class="settings-panel settings-section-detached" :class="{ 'is-active': activeSettingsSection === 'tools' }" id="tools">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Network Tools</p>
              <h2>联网工具</h2>
            </div>
            <div class="inline-actions">
              <span class="soft-badge">{{ tools.loading ? "加载中" : toolsAnyDirty ? "有未保存修改" : "Provider Config" }}</span>
              <button class="secondary-action" type="button" :disabled="tools.saving || !toolsAnyDirty" @click="saveToolsOnly">
                <Save :size="15" />{{ tools.saving ? "保存中..." : "保存联网工具" }}
              </button>
            </div>
          </div>
          <section class="tools-control-strip">
            <label><span>工具总开关</span><select v-model="form.tools_enabled"><option :value="true">启用</option><option :value="false">关闭</option></select></label>
            <label><span>自动调用</span><select v-model="form.tools_auto_call"><option :value="true">启用</option><option :value="false">关闭</option></select></label>
            <label><span>工具超时秒</span><input v-model.number="form.tools_timeout" type="number" min="2" max="60" step="1" /></label>
            <label><span>结果最大字符</span><input v-model.number="form.tools_max_result_chars" type="number" min="500" max="16000" step="100" /></label>
          </section>

          <div class="tool-provider-groups">
            <section v-for="group in providerGroups" :key="group.id" class="tool-provider-group">
              <header class="tool-provider-group-head">
                <div>
                  <strong>{{ group.title }}</strong>
                  <small>{{ group.summary }}</small>
                </div>
                <span class="soft-badge">{{ group.keys.length }} 项</span>
              </header>

              <div class="tool-provider-list">
                <section v-for="providerKey in group.keys" :key="providerKey" class="tool-provider-card overview-card" :class="{ disabled: tools.config[providerKey]?.enabled === false }">
                  <div class="tool-provider-head">
                    <div>
                      <strong>{{ PROVIDER_LABELS[providerKey] || providerKey }}</strong>
                      <small>{{ providerKey }}</small>
                    </div>
                    <span class="tool-provider-state" :class="{ off: tools.config[providerKey]?.enabled === false }">
                      {{ tools.config[providerKey]?.enabled === false ? "关闭" : "启用" }}
                    </span>
                  </div>
                  <div class="tool-provider-status">
                    <span v-if="tools.config[providerKey]?.provider">{{ tools.config[providerKey]?.provider }}</span>
                    <span v-if="PROVIDER_FIELDS[providerKey]?.includes('api_key') || PROVIDER_FIELDS[providerKey]?.includes('webhook_url')">{{ providerSecretState(providerKey) }}</span>
                    <span v-if="tools.config[providerKey]?.limit">limit {{ tools.config[providerKey]?.limit }}</span>
                  </div>
                  <div class="form-grid compact">
                    <label v-for="field in PROVIDER_FIELDS[providerKey]" :key="field" :class="{ wide: field === 'base_url' || field === 'api_key' || field === 'webhook_url' || field === 'user_agent' }">
                      <span>{{ providerFieldLabel(field) }}</span>
                      <select v-if="field === 'enabled' || field.endsWith('_enabled')" :value="providerFieldValue(providerKey, field)" @change="setProviderField(providerKey, field, eventValue($event))">
                        <option value="true">启用</option>
                        <option value="false">关闭</option>
                      </select>
                      <select v-else-if="field === 'provider'" :value="providerFieldValue(providerKey, field)" @change="setProviderField(providerKey, field, eventValue($event))">
                        <option v-for="[value, label] in PROVIDER_OPTIONS[providerKey] || []" :key="value" :value="value">{{ label }}</option>
                      </select>
                      <input
                        v-else
                        :type="providerInputType(field)"
                        :value="providerFieldValue(providerKey, field)"
                        :placeholder="field === 'api_key' || field === 'webhook_url' ? providerSecretState(providerKey) : ''"
                        @input="setProviderField(providerKey, field, eventValue($event))"
                      />
                    </label>
                  </div>
                </section>
              </div>
            </section>
          </div>

          <div class="settings-diagnostics-callout">
            <div>
              <strong>工具测试已集中到检测中心</strong>
              <small>Provider 连通性、工具路由解析和失败日志都在检测页统一查看。</small>
            </div>
            <button class="secondary-action" type="button" @click="openDiagnostics"><ClipboardCheck :size="15" />去检测中心</button>
          </div>
          <p v-if="tools.error" class="muted-copy">工具配置读取失败：{{ tools.error }}</p>
        </article>

        <article class="settings-panel dialog-features-panel settings-section-detached" :class="{ 'is-active': activeSettingsSection === 'dialogFeatures' }" id="dialogFeatures">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Conversation Features</p>
              <h2>对话能力</h2>
            </div>
            <span class="soft-badge">Web + 微信</span>
          </div>
          <div class="dialog-feature-grid">
            <section class="dialog-feature-card compact-feature-card">
              <div class="appearance-card-head"><strong>图片理解</strong><small>发送图片后生成摘要并进入本轮上下文</small></div>
              <div class="form-grid compact">
                <label><span>启用</span><select v-model="form.vision_enabled"><option :value="true">启用</option><option :value="false">关闭</option></select></label>
                <label><span>模型</span><input v-model="form.vision_model" placeholder="qwen-vl" /></label>
                <label class="wide"><span>Vision URL</span><input v-model="form.vision_url" placeholder="http://127.0.0.1:8081/v1/chat/completions" /></label>
                <label><span>超时秒</span><input v-model.number="form.vision_timeout" type="number" min="5" max="180" step="1" /></label>
                <label><span>图片上限 MB</span><input v-model.number="form.vision_max_image_mb" type="number" min="1" max="64" step="1" /></label>
                <label><span>提取记忆</span><select v-model="form.vision_memory_extract_enabled"><option :value="true">启用</option><option :value="false">关闭</option></select></label>
              </div>
            </section>
            <section class="dialog-feature-card compact-feature-card asset-jump-card">
              <div class="appearance-card-head"><strong>素材库</strong><small>表情包识别、审核、策略和微信发送链路已迁移到独立页面</small></div>
              <p class="muted-copy">批量上传、批量识别、一键通过和删除都在素材库统一处理。</p>
              <div class="inline-actions">
                <button class="primary-action" type="button" @click="openAssets"><Library :size="16" />打开素材库</button>
                <button class="secondary-action" type="button" @click="openDiagnostics"><ClipboardCheck :size="16" />去检测中心</button>
              </div>
            </section>
            <section class="dialog-feature-card wide">
              <div class="appearance-card-head"><strong>上下文压缩</strong><small>聊久后保留摘要和最近对话，减少遗忘与延迟</small></div>
              <div class="form-grid compact">
                <label><span>启用</span><select v-model="form.context_compaction_enabled"><option :value="true">启用</option><option :value="false">关闭</option></select></label>
                <label><span>窗口 Tokens</span><input v-model.number="form.context_window_tokens" type="number" min="2048" max="262144" step="512" /></label>
                <label><span>触发比例</span><input v-model.number="form.context_compaction_ratio" type="number" min="0.4" max="0.95" step="0.05" /></label>
                <label><span>保留最近轮数</span><input v-model.number="form.context_keep_recent_turns" type="number" min="1" max="40" step="1" /></label>
                <label><span>摘要长度</span><input v-model.number="form.context_summary_max_chars" type="number" min="400" max="12000" step="100" /></label>
                <label><span>摘要层数</span><input v-model.number="form.context_summary_max_layers" type="number" min="1" max="8" step="1" /></label>
              </div>
            </section>
          </div>
        </article>

        <article class="settings-panel proactive-panel settings-section-detached" :class="{ 'is-active': activeSettingsSection === 'proactive' }" id="proactive">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Proactive Intelligence</p>
              <h2>主动性</h2>
            </div>
            <span class="soft-badge">{{ engagement.config.enabled ? "主动消息已启用" : "主动消息关闭" }}</span>
          </div>
          <div class="proactive-layout">
            <section class="proactive-card">
              <div class="appearance-card-head"><strong>全局策略</strong><small>问候、追问、提醒共用</small></div>
              <div class="form-grid compact">
                <label><span>主动性总开关</span><select v-model="engagement.config.enabled"><option :value="true">启用</option><option :value="false">关闭</option></select></label>
                <label><span>每日上限</span><input v-model.number="engagement.config.daily_limit" type="number" min="0" max="30" step="1" /></label>
                <label><span>语气</span><select v-model="engagement.config.tone"><option value="warm">温和</option><option value="concise">简洁</option><option value="playful">轻快</option></select></label>
                <label><span>追问强度</span><select v-model="engagement.config.followup_level"><option value="off">关闭</option><option value="restrained">克制</option><option value="standard">标准</option><option value="active">积极</option></select></label>
              </div>
              <div class="toggle-row">
                <label><input v-model="engagement.config.ask_followup_enabled" type="checkbox" />缺信息时主动追问</label>
                <label><input v-model="engagement.config.channels.web" type="checkbox" />Web 通道</label>
                <label><input v-model="engagement.config.channels.weixin" type="checkbox" />微信通道</label>
              </div>
              <div class="greeting-time-range">
                <label><input v-model="engagement.config.quiet_hours_enabled" type="checkbox" />免打扰</label>
                <span>开始</span><input v-model="engagement.config.quiet_start" type="time" />
                <span>结束</span><input v-model="engagement.config.quiet_end" type="time" />
              </div>
            </section>

            <section class="proactive-card">
              <div class="appearance-card-head"><strong>问候场景</strong><small>窗口内只会生成一次</small></div>
              <div class="greeting-switches">
                <label><input v-model="engagement.config.greetings.enabled" type="checkbox" />启用问候</label>
                <label><input v-model="engagement.config.greetings.good_morning.enabled" type="checkbox" />早安</label>
                <label><input v-model="engagement.config.greetings.noon.enabled" type="checkbox" />午间</label>
                <label><input v-model="engagement.config.greetings.good_night.enabled" type="checkbox" />晚安</label>
                <label><input v-model="engagement.config.greetings.long_absence.enabled" type="checkbox" />久未互动</label>
              </div>
              <div class="form-grid compact">
                <label><span>早安开始</span><input v-model="engagement.config.greetings.good_morning.window_start" type="time" /></label>
                <label><span>早安结束</span><input v-model="engagement.config.greetings.good_morning.window_end" type="time" /></label>
                <label><span>午间开始</span><input v-model="engagement.config.greetings.noon.window_start" type="time" /></label>
                <label><span>午间结束</span><input v-model="engagement.config.greetings.noon.window_end" type="time" /></label>
                <label><span>晚安开始</span><input v-model="engagement.config.greetings.good_night.window_start" type="time" /></label>
                <label><span>晚安结束</span><input v-model="engagement.config.greetings.good_night.window_end" type="time" /></label>
                <label><span>久未互动小时</span><input v-model.number="engagement.config.greetings.long_absence.after_hours" type="number" min="1" max="720" step="1" /></label>
              </div>
              <div class="greeting-options">
                <label><input v-model="engagement.config.greetings.good_morning.with_weather" type="checkbox" />早安带天气</label>
                <label><input v-model="engagement.config.greetings.good_morning.with_reminders" type="checkbox" />早安带提醒</label>
                <label><input v-model="engagement.config.greetings.noon.with_reminders" type="checkbox" />午间带提醒</label>
              </div>
            </section>

            <section class="proactive-card">
              <div class="appearance-card-head"><strong>触发器</strong><small>控制后台主动事件来源</small></div>
              <div class="toggle-row">
                <label><input v-model="engagement.config.triggers.reminders" type="checkbox" />定时提醒</label>
                <label><input v-model="engagement.config.triggers.service_alerts" type="checkbox" />服务告警</label>
                <label><input v-model="engagement.config.triggers.weather" type="checkbox" />天气</label>
                <label><input v-model="engagement.config.triggers.news_watch" type="checkbox" />新闻观察</label>
                <label><input v-model="engagement.config.triggers.emotion_care" type="checkbox" />情绪关怀</label>
                <label><input v-model="engagement.config.triggers.long_goal_followup" type="checkbox" />长期目标追踪</label>
              </div>
              <div class="settings-diagnostics-callout compact">
                <span>主动消息测试已迁移到检测中心。</span>
                <button class="secondary-action" type="button" @click="openDiagnostics"><ClipboardCheck :size="15" />去检测中心</button>
              </div>
            </section>

            <section class="proactive-card">
              <div class="appearance-card-head"><strong>定时提醒</strong><small>{{ pendingReminders.length }} 条待触发</small></div>
              <div class="reminder-editor">
                <input v-model="engagement.reminderTitle" placeholder="提醒内容" />
                <input v-model="engagement.reminderDueAt" type="datetime-local" />
                <select v-model="engagement.reminderChannel">
                  <option value="web">Web</option>
                  <option value="weixin">微信</option>
                </select>
                <button class="primary-action" type="button" @click="createReminder"><AlarmPlus :size="15" />添加</button>
              </div>
              <div class="reminder-list">
                <article v-for="reminder in pendingReminders" :key="reminder.id" class="reminder-item">
                  <div>
                    <strong>{{ reminder.title }}</strong>
                    <small>{{ formatTime(reminder.due_at) }} · {{ reminder.channel || "web" }}</small>
                  </div>
                  <button class="icon-button" type="button" title="删除提醒" @click="removeReminder(reminder.id, reminder.title)"><Trash2 :size="15" /></button>
                </article>
                <div v-if="!pendingReminders.length" class="model-file-empty">暂无待触发提醒</div>
              </div>
            </section>

            <section class="proactive-card">
              <div class="appearance-card-head"><strong>最近事件</strong><small>主动消息发送记录</small></div>
              <div class="proactive-events">
                <article v-for="event in recentEvents" :key="event.id" class="proactive-event" :class="event.status">
                  <div>
                    <strong>{{ event.title || event.kind || "主动事件" }}</strong>
                    <span>{{ event.content || event.last_error || "--" }}</span>
                    <small>{{ formatTime(event.created_at) }} · {{ event.channel || "web" }} · {{ event.status || "pending" }}</small>
                  </div>
                  <button class="icon-button" type="button" title="忽略事件" @click="dismissEvent(event.id)"><X :size="15" /></button>
                </article>
                <div v-if="!recentEvents.length" class="model-file-empty">暂无主动事件</div>
              </div>
            </section>
          </div>
        </article>

        <article class="settings-panel settings-section-detached" :class="{ 'is-active': activeSettingsSection === 'botProfiles' }" id="botProfiles">
          <div class="panel-head">
            <div><p class="eyebrow">Bot Profiles</p><h2>Bot 人格</h2></div>
            <button class="secondary-action" type="button" @click="addProfile"><Plus :size="15" />新增人格</button>
          </div>
          <div class="bot-profile-list">
            <article v-for="profile in profiles.profiles" :key="profile.id" class="bot-profile-card">
              <div class="tool-provider-head">
                <strong>{{ profile.name || profile.id }}</strong>
                <small>{{ profile.id === "default" ? "默认人格" : profile.id }}</small>
              </div>
              <div class="form-grid compact">
                <label><span>名称</span><input v-model="profile.name" /></label>
                <label><span>回复风格</span><input v-model="profile.reply_style" placeholder="natural / concise / warm" /></label>
                <label><span>允许工具</span><select v-model="profile.tools_enabled"><option :value="true">启用</option><option :value="false">关闭</option></select></label>
                <label class="wide"><span>头像 URL</span><input v-model="profile.avatar_url" /></label>
                <label class="wide"><span>System Prompt</span><textarea v-model="profile.system" class="bot-system"></textarea></label>
              </div>
              <div class="inline-actions">
                <button class="secondary-action" type="button" :disabled="profile.id === 'default'" @click="removeProfile(profile.id, profile.name)"><Trash2 :size="15" />删除</button>
              </div>
            </article>
          </div>
          <p v-if="profiles.error" class="muted-copy">人格配置读取失败：{{ profiles.error }}</p>
        </article>

        <article class="settings-panel settings-panel--prominent settings-section-detached" :class="{ 'is-active': activeSettingsSection === 'prompt' }" id="prompt">
          <div class="panel-head"><div><p class="eyebrow">Persona</p><h2>Prompt 配置</h2></div></div>
          <label class="wide"><span>System Prompt</span><textarea v-model="form.system" class="prompt-textarea"></textarea></label>
        </article>

        <article class="settings-panel settings-section-detached" :class="{ 'is-active': activeSettingsSection === 'tts' }" id="tts">
          <div class="panel-head"><div><p class="eyebrow">Speech Synthesis</p><h2>语音合成</h2></div></div>
          <div class="form-grid compact">
            <label><span>Web TTS</span><select v-model="form.tts_enabled"><option :value="true">启用</option><option :value="false">关闭</option></select></label>
            <label class="wide"><span>TTS URL</span><input v-model="form.tts_url" /></label>
            <label><span>TTS Speed</span><input v-model.number="form.tts_speed" type="number" min="0.7" max="1.5" step="0.01" /></label>
            <label><span>TTS Volume</span><input v-model.number="form.tts_volume" type="number" min="0.05" max="1.5" step="0.01" /></label>
            <label><span>Sample Rate</span><input v-model.number="form.tts_sample_rate" type="number" min="8000" max="48000" step="1000" /></label>
            <label><span>Seed</span><input v-model.number="form.tts_seed" type="number" min="-1" max="999999" step="1" /></label>
            <label><span>Fade ms</span><input v-model.number="form.tts_fade_ms" type="number" min="0" max="2000" step="10" /></label>
          </div>
        </article>

        <article class="settings-panel settings-section-detached" :class="{ 'is-active': activeSettingsSection === 'vad' }" id="vad">
          <div class="panel-head"><div><p class="eyebrow">Voice Activity Detection</p><h2>语音检测</h2></div></div>
          <div class="form-grid compact">
            <label><span>Threshold</span><input v-model.number="form.vad_threshold" type="number" min="0.1" max="0.9" step="0.01" /></label>
            <label><span>Silence ms</span><input v-model.number="form.vad_min_silence_ms" type="number" min="120" max="1500" step="10" /></label>
            <label><span>Speech Pad ms</span><input v-model.number="form.vad_speech_pad_ms" type="number" min="0" max="500" step="10" /></label>
            <label><span>Pre Speech ms</span><input v-model.number="form.pre_speech_ms" type="number" min="0" max="2000" step="10" /></label>
            <label><span>Min Utterance ms</span><input v-model.number="form.min_utterance_ms" type="number" min="80" max="5000" step="10" /></label>
            <label><span>Max Utterance sec</span><input v-model.number="form.max_utterance_sec" type="number" min="2" max="180" step="1" /></label>
          </div>
        </article>

        <article class="settings-panel settings-section-detached" :class="{ 'is-active': activeSettingsSection === 'commands' }" id="commands">
          <div class="panel-head">
            <div><p class="eyebrow">Service Commands</p><h2>服务命令</h2></div>
            <div class="inline-actions">
              <span class="soft-badge">只编辑启动参数</span>
              <button class="secondary-action" type="button" @click="openServices"><Terminal :size="15" />去服务页</button>
            </div>
          </div>
          <div class="profile-list">
            <section v-for="{ service, draft } in serviceDraftList" :key="service.id" class="profile-card service-config-card" :class="{ dirty: serviceDraftDirty[service.id] }">
              <div class="profile-head">
                <div>
                  <strong>{{ service.label || service.id }}</strong>
                  <span>{{ serviceRuntimeLabel(service) }} · {{ service.external ? "外部进程" : "BranchWhisper 配置" }}</span>
                </div>
                <span class="soft-badge">{{ serviceDraftDirty[service.id] ? "未保存" : service.id }}</span>
              </div>
              <div class="form-grid compact">
                <label class="wide"><span>工作目录</span><input v-model="draft.cwd" @input="markServiceDraftDirty(service.id)" /></label>
                <label class="wide"><span>Health URL</span><input v-model="draft.health_url" @input="markServiceDraftDirty(service.id)" /></label>
                <label><span>启动等待秒</span><input v-model.number="draft.startup_wait_sec" type="number" min="0" max="180" step="1" @input="markServiceDraftDirty(service.id)" /></label>
                <label class="wide"><span>启动命令</span><textarea v-model="draft.command" class="profile-command" @input="markServiceDraftDirty(service.id)"></textarea></label>
              </div>
              <div class="inline-actions">
                <button class="secondary-action" type="button" :disabled="serviceSaving[service.id] || settingsSaving" @click="saveServiceDraft(service.id)"><Save :size="15" />{{ serviceSaving[service.id] ? "保存中..." : "保存服务" }}</button>
                <button class="secondary-action" type="button" @click="copyServiceCommand(draft.command || '')"><Copy :size="15" />复制命令</button>
                <button class="secondary-action" type="button" @click="openServices"><Terminal :size="15" />去服务页</button>
              </div>
            </section>
          </div>
          <div v-if="!serviceDraftList.length" class="model-file-empty">
            {{ settingsHydrating ? "正在读取服务配置..." : "未读取到本地服务配置" }}
          </div>
        </article>
      </section>
    </div>

    <div v-if="activeSettingsSection" class="modal-overlay settings-section-backdrop" @click.self="closeSettingsSection">
      <div class="settings-section-modal-toolbar" role="presentation">
        <div>
          <p class="eyebrow">{{ activeSettingsCard?.eyebrow }}</p>
          <strong>{{ activeSettingsCard?.title }}</strong>
        </div>
        <span class="soft-badge">{{ activeSettingsCard?.status }}</span>
        <button class="primary-action" type="button" :disabled="settingsSaving" @click="saveAll"><Save :size="15" />{{ settingsSaving ? "保存中..." : "保存配置" }}</button>
        <button class="icon-button modal-close" type="button" title="关闭配置面板" @click="closeSettingsSection"><X :size="16" /></button>
      </div>
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
