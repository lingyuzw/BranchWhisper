<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  Circle,
  Clock3,
  Copy,
  Download,
  FileText,
  FlaskConical,
  Mic,
  Pause,
  Play,
  Power,
  RefreshCw,
  RotateCw,
  Server,
  Terminal,
  Volume2,
  Wifi,
  Wrench,
  XCircle,
} from "@lucide/vue";
import {
  loadDialogTraces,
  loadRuntimeDiagnostics,
  runAsrApiDiagnostic,
  runLlmApiDiagnostic,
  runLocalModelsDiagnostic,
  runTtsApiDiagnostic,
} from "@/api/diagnostics";
import type {
  DialogTrace,
  RuntimeDiagnosticCheck,
  RuntimeDiagnosticItem,
  RuntimeDiagnostics,
  RuntimeDiagnosticStatus,
} from "@/api/diagnostics";
import type { ServiceSummary } from "@/api/services";
import DiagnosticCheckList from "@/components/diagnostics/DiagnosticCheckList.vue";
import DialogTracePanel from "@/components/diagnostics/DialogTracePanel.vue";
import { useServicesStore } from "@/stores/services";
import { useUiStore } from "@/stores/ui";

type DisplayStatus = RuntimeDiagnosticStatus | "unknown" | "running";

interface DiagnosticCard {
  id: string;
  role: string;
  label: string;
  status: DisplayStatus;
  provider: string;
  summary: string;
  item: RuntimeDiagnosticItem | null;
  service: ServiceSummary | null;
}

interface DetailRow {
  label: string;
  value: string;
  mono?: boolean;
  status?: DisplayStatus;
}

const ui = useUiStore();
const services = useServicesStore();
const loading = ref(false);
const diagnostics = ref<RuntimeDiagnostics | null>(null);
const traces = ref<DialogTrace[]>([]);
const loadedAt = ref<Date | null>(null);
const selectedCardId = ref("");
const logBox = ref<HTMLElement | null>(null);
const onlyErrorLogs = ref(false);
const pauseLogScroll = ref(false);
const testingCardId = ref("");
const apiProbe = ref<Record<string, { status: DisplayStatus; text: string; detail: string; at: string }>>({});

const expectedRoles = [
  { role: "asr", label: "ASR" },
  { role: "llm", label: "LLM" },
  { role: "tts", label: "TTS" },
  { role: "backend", label: "Backend" },
  { role: "websocket", label: "WebSocket" },
  { role: "integration", label: "微信桥接" },
];

const overall = computed<DisplayStatus>(() => {
  if (loading.value && !diagnostics.value) return "running";
  return diagnostics.value?.status || "unknown";
});
const items = computed(() => diagnostics.value?.items || []);
const summary = computed(() => diagnostics.value?.summary || { total: 0, ok: 0, warning: 0, error: 0 });
const runningServices = computed(() => services.services.filter((service) => isServiceRunning(service)).length);
const interfaceChecks = computed(() => items.value.flatMap((item) => item.checks.filter((check) => ["health_url", "port"].includes(check.kind))));
const interfaceOkCount = computed(() => interfaceChecks.value.filter((check) => check.status === "ok").length);
const issueChecks = computed(() => items.value.flatMap((item) => item.checks.map((check) => ({ item, check }))).filter(({ check }) => check.status !== "ok"));

const dashboardCards = computed<DiagnosticCard[]>(() => {
  const cards: DiagnosticCard[] = [];
  const used = new Set<RuntimeDiagnosticItem>();

  for (const expected of expectedRoles) {
    const item = findDiagnosticForRole(expected.role);
    if (item) used.add(item);
    const service = findServiceForRole(expected.role, item);
    cards.push({
      id: item ? `diagnostic:${item.role}:${item.name}` : `service:${expected.role}`,
      role: expected.role,
      label: expected.label,
      status: item?.status || serviceStatus(service),
      provider: item?.provider || service?.label || "--",
      summary: item?.summary || service?.description || serviceStatusText(service),
      item,
      service,
    });
  }

  for (const item of items.value) {
    if (used.has(item)) continue;
    cards.push({
      id: `diagnostic:${item.role}:${item.name}`,
      role: item.role,
      label: roleLabel(item.role),
      status: item.status,
      provider: item.provider || "--",
      summary: item.summary,
      item,
      service: findServiceForRole(item.role, item),
    });
  }

  return cards;
});

const selectedCard = computed(() => dashboardCards.value.find((card) => card.id === selectedCardId.value) || dashboardCards.value[0] || null);
const selectedItem = computed(() => selectedCard.value?.item || null);
const selectedService = computed(() => selectedCard.value?.service || null);
const selectedProbe = computed(() => (selectedCard.value ? apiProbe.value[selectedCard.value.id] || null : null));
const selectedIssues = computed(() => selectedItem.value?.checks.filter((check) => check.status !== "ok") || []);
const selectedDetailRows = computed(() => buildDetailRows(selectedItem.value, selectedService.value, selectedProbe.value));
const filteredLogs = computed(() => filterLogs(services.logs || "", onlyErrorLogs.value));
const logLineCount = computed(() => filteredLogs.value ? filteredLogs.value.split(/\r?\n/).length : 0);

const pipelineNodes = computed(() => [
  { key: "microphone", label: "麦克风", detail: "浏览器输入", status: inferAuxStatus("microphone"), icon: Mic },
  { key: "vad", label: "VAD", detail: "语音活动检测", status: inferAuxStatus("vad"), icon: Activity },
  { key: "asr", label: "ASR", detail: cardStatusText("asr"), status: roleStatus("asr"), icon: Wifi },
  { key: "llm", label: "LLM", detail: cardStatusText("llm"), status: roleStatus("llm"), icon: Brain },
  { key: "tts", label: "TTS", detail: cardStatusText("tts"), status: roleStatus("tts"), icon: Volume2 },
  { key: "playback", label: "播放", detail: "输出音频", status: inferAuxStatus("playback"), icon: Play },
]);

watch(
  dashboardCards,
  (cards) => {
    if (!cards.length) {
      selectedCardId.value = "";
      return;
    }
    if (!cards.some((card) => card.id === selectedCardId.value)) {
      const firstProblem = cards.find((card) => card.status === "error" || card.status === "warning");
      selectedCardId.value = (firstProblem || cards[0]).id;
    }
  },
  { immediate: true },
);

watch(
  () => filteredLogs.value,
  () => {
    if (pauseLogScroll.value) return;
    void nextTick(() => {
      if (logBox.value) logBox.value.scrollTop = logBox.value.scrollHeight;
    });
  },
);

onMounted(async () => {
  await refreshDiagnostics();
  services.startPolling();
});

onUnmounted(() => {
  services.stopPolling();
});

async function refreshDiagnostics() {
  loading.value = true;
  try {
    const [runtimeResult, traceResult, servicesResult] = await Promise.allSettled([
      loadRuntimeDiagnostics(),
      loadDialogTraces(8),
      services.reload(true),
    ]);
    if (runtimeResult.status === "fulfilled") {
      diagnostics.value = runtimeResult.value;
    } else {
      ui.error(`运行诊断读取失败：${errorMessage(runtimeResult.reason)}`);
    }
    if (traceResult.status === "fulfilled") {
      traces.value = traceResult.value.traces || [];
    }
    if (servicesResult.status === "rejected") {
      ui.warning(`服务状态读取失败：${errorMessage(servicesResult.reason)}`);
    }
    if (services.services.length && !services.selectedId) {
      await services.select(services.services[0].id);
    } else if (services.selectedId) {
      await services.refreshLogs(true);
    }
    loadedAt.value = new Date();
  } finally {
    loading.value = false;
  }
}

async function copyDiagnostics() {
  if (!diagnostics.value) {
    ui.warning("没有可复制的诊断结果");
    return;
  }
  await copyText("运行诊断结果", JSON.stringify(diagnostics.value, null, 2));
}

async function exportReport() {
  const payload = {
    exported_at: new Date().toISOString(),
    loaded_at: loadedAt.value?.toISOString() || null,
    diagnostics: diagnostics.value,
    services: services.services,
    selected_service_logs: services.logs,
    traces: traces.value,
  };
  await copyText("诊断报告", JSON.stringify(payload, null, 2));
}

async function selectCard(card: DiagnosticCard) {
  selectedCardId.value = card.id;
  if (card.service?.id) {
    try {
      await services.select(card.service.id);
    } catch (error) {
      ui.warning(`日志读取失败：${errorMessage(error)}`);
    }
  }
}

async function runInterfaceTest() {
  const card = selectedCard.value;
  if (!card) return;
  testingCardId.value = card.id;
  apiProbe.value = {
    ...apiProbe.value,
    [card.id]: { status: "running", text: "接口测试中", detail: "", at: new Date().toLocaleTimeString() },
  };
  try {
    const result = await runProbeForCard(card);
    const ok = probeResultOk(result);
    apiProbe.value = {
      ...apiProbe.value,
      [card.id]: {
        status: ok ? "ok" : "error",
        text: probeResultText(result, ok),
        detail: formatJson(result),
        at: new Date().toLocaleTimeString(),
      },
    };
    ui[ok ? "success" : "warning"](`${card.label} 接口测试${ok ? "通过" : "发现异常"}`);
  } catch (error) {
    apiProbe.value = {
      ...apiProbe.value,
      [card.id]: { status: "error", text: errorMessage(error), detail: "", at: new Date().toLocaleTimeString() },
    };
    ui.error(`${card.label} 接口测试失败：${errorMessage(error)}`);
  } finally {
    testingCardId.value = "";
  }
}

async function restartSelectedService() {
  const service = selectedService.value;
  if (!service?.id) {
    ui.warning("当前项目没有可重启的服务编排项");
    return;
  }
  try {
    ui.info(`开始重启 ${service.label || service.id}...`, 1600);
    await services.restart(service.id);
    await refreshDiagnostics();
    ui.success(`${service.label || service.id} 重启请求已发送`);
  } catch (error) {
    ui.error(`重启失败：${errorMessage(error)}`);
  }
}

async function viewSelectedLogs() {
  const service = selectedService.value;
  if (!service?.id) {
    ui.warning("当前项目没有对应运行日志");
    return;
  }
  await services.select(service.id);
  ui.info(`已切换到 ${service.label || service.id} 日志`);
}

async function copySelectedError() {
  const card = selectedCard.value;
  if (!card) return;
  const lines = [
    `${card.label}：${statusLabel(card.status)}`,
    card.summary,
    ...selectedIssues.value.map((check) => `${checkKindLabel(check.kind)} ${check.target || "--"}：${check.message || statusLabel(check.status)}\n建议：${fixText(check)}`),
  ].filter(Boolean);
  await copyText("错误信息", lines.join("\n\n"));
}

async function copySelectedCommand() {
  const command = startCommand(selectedService.value);
  if (!command) {
    ui.warning("当前服务没有可复制的启动命令");
    return;
  }
  await copyText("启动命令", command);
}

async function copyCurrentLogs() {
  await copyText("当前日志", filteredLogs.value);
}

async function selectLogService(id: string) {
  try {
    await services.select(id);
  } catch (error) {
    ui.error(`日志读取失败：${errorMessage(error)}`);
  }
}

function findDiagnosticForRole(role: string) {
  const aliases = roleAliases(role);
  return items.value.find((item) => aliases.some((alias) => normalized(`${item.role} ${item.name} ${item.provider}`).includes(alias))) || null;
}

function findServiceForRole(role: string, item?: RuntimeDiagnosticItem | null) {
  const aliases = roleAliases(role);
  const itemText = normalized(`${item?.role || ""} ${item?.name || ""} ${item?.provider || ""}`);
  return services.services.find((service) => {
    const text = normalized(`${service.id} ${service.label} ${service.description || ""} ${service.health_url || ""}`);
    return aliases.some((alias) => text.includes(alias) || itemText.includes(alias));
  }) || null;
}

function roleAliases(role: string) {
  const aliases: Record<string, string[]> = {
    asr: ["asr", "speech", "recognition", "qwen"],
    llm: ["llm", "chat", "llama", "qwen"],
    tts: ["tts", "voice", "cosyvoice"],
    backend: ["backend", "api", "fastapi", "branchwhisper"],
    websocket: ["websocket", "ws", "socket"],
    integration: ["wechat", "weixin", "wx", "bridge", "integration"],
  };
  return aliases[role] || [normalized(role)];
}

function normalized(value: string) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

function roleStatus(role: string): DisplayStatus {
  const card = dashboardCards.value.find((item) => item.role === role);
  return card?.status || "unknown";
}

function cardStatusText(role: string) {
  const card = dashboardCards.value.find((item) => item.role === role);
  return card?.summary || "未检测";
}

function inferAuxStatus(kind: "microphone" | "vad" | "playback"): DisplayStatus {
  if (kind === "playback") return roleStatus("tts") === "ok" ? "ok" : roleStatus("tts") === "error" ? "warning" : "unknown";
  const backend = roleStatus("backend");
  if (backend === "error") return "warning";
  return diagnostics.value ? "unknown" : "unknown";
}

function isServiceRunning(service: ServiceSummary | null | undefined) {
  if (!service) return false;
  const state = String(service.state || service.status || "").toLowerCase();
  return Boolean(service.running || ["ready", "running", "active", "started"].includes(state));
}

function serviceStatus(service: ServiceSummary | null | undefined): DisplayStatus {
  if (!service) return "unknown";
  const state = String(service.state || service.status || "").toLowerCase();
  if (["starting", "stopping", "restarting"].includes(state)) return "running";
  if (["failed", "error"].includes(state) || service.error) return "error";
  if (isServiceRunning(service)) return "running";
  if (state === "stopped") return "warning";
  return "unknown";
}

function serviceStatusText(service: ServiceSummary | null | undefined) {
  if (!service) return "未检测到对应服务编排项";
  if (service.error) return service.error;
  const state = service.state || service.status || (service.running ? "running" : "stopped");
  return `${service.label || service.id} · ${state}`;
}

function buildDetailRows(
  item: RuntimeDiagnosticItem | null,
  service: ServiceSummary | null,
  probe: { status: DisplayStatus; text: string; detail: string; at: string } | null,
): DetailRow[] {
  const healthCheck = firstCheck(item, ["health_url"]);
  const portCheck = firstCheck(item, ["port"]);
  const modelCheck = firstCheck(item, ["model_path"]);
  const binaryCheck = firstCheck(item, ["binary"]);
  return [
    { label: "地址", value: service?.health_url || healthCheck?.target || "--", mono: true, status: healthCheck?.status },
    { label: "端口", value: String(service?.port || portCheck?.target || portFromUrl(service?.health_url || healthCheck?.target || "") || "--"), status: portCheck?.status },
    { label: "PID", value: service?.external ? "external" : String(service?.pid || "--"), status: service?.pid || service?.external ? "ok" : "unknown" },
    { label: "模型路径", value: modelCheck ? resolvedTarget(modelCheck) : "--", mono: true, status: modelCheck?.status },
    { label: "健康检查", value: healthCheck?.message || item?.summary || "--", status: healthCheck?.status || item?.status },
    { label: "接口测试", value: probe ? `${probe.text} · ${probe.at}` : "未测试", status: probe?.status || "unknown" },
    { label: "启动命令", value: startCommand(service) || binaryCheck?.target || "--", mono: true, status: startCommand(service) || binaryCheck ? "ok" : "unknown" },
  ];
}

function firstCheck(item: RuntimeDiagnosticItem | null, kinds: string[]) {
  return item?.checks.find((check) => kinds.includes(check.kind)) || null;
}

function resolvedTarget(check: RuntimeDiagnosticCheck) {
  const metadata = check.metadata || {};
  return String(metadata.resolved_target || metadata.resolved_path || metadata.path || check.target || "--");
}

function portFromUrl(value: string) {
  try {
    return new URL(value).port;
  } catch {
    return "";
  }
}

function startCommand(service: ServiceSummary | null | undefined) {
  return service?.final_command || service?.effective_command || service?.configured_command || service?.command || "";
}

function filterLogs(text: string, errorsOnly: boolean) {
  const value = String(text || "").trim();
  if (!value) return "";
  if (!errorsOnly) return value;
  const lines = value.split(/\r?\n/).filter((line) => /error|exception|traceback|failed|fatal|失败|异常|错误/i.test(line));
  return lines.join("\n") || "没有匹配到错误日志。";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function statusLabel(status: DisplayStatus) {
  if (status === "ok") return "正常";
  if (status === "warning") return "警告";
  if (status === "error") return "错误";
  if (status === "running") return "运行中";
  return "未检测";
}

function statusIcon(status: DisplayStatus) {
  if (status === "ok") return CheckCircle2;
  if (status === "warning") return AlertTriangle;
  if (status === "error") return XCircle;
  if (status === "running") return Clock3;
  return Circle;
}

function statusClass(status: DisplayStatus | undefined) {
  return `status-${status || "unknown"}`;
}

function roleLabel(role: string) {
  const labels: Record<string, string> = {
    asr: "ASR",
    llm: "LLM",
    tts: "TTS",
    backend: "Backend",
    websocket: "WebSocket",
    integration: "微信桥接",
    tool: "工具",
  };
  return labels[role] || role.toUpperCase();
}

function checkKindLabel(kind: string) {
  const labels: Record<string, string> = {
    model_path: "路径",
    cwd: "目录",
    binary: "命令",
    required_file: "依赖文件",
    port: "端口",
    health_url: "健康检查",
    profile: "Profile",
  };
  return labels[kind] || kind;
}

function loadedAtText() {
  return loadedAt.value ? loadedAt.value.toLocaleString() : "尚未检测";
}

function compactProblem(text: string) {
  const value = String(text || "").trim();
  const firstLine = value.split(/\r?\n/).find((line) => line.trim()) || value;
  return firstLine.length > 150 ? `${firstLine.slice(0, 150)}...` : firstLine || "未返回具体原因";
}

function hasDetail(text: string) {
  const value = String(text || "");
  return value.includes("\n") || value.length > 150;
}

function fixText(check: RuntimeDiagnosticCheck) {
  if (check.fix) return check.fix;
  if (check.kind === "model_path") return "确认模型文件存在，并检查配置里的相对路径是否以 profile cwd 或工作区根目录为基准。";
  if (check.kind === "binary") return "确认命令已安装，或在服务配置里填写可执行文件的绝对路径。";
  if (check.kind === "port") return "确认服务已启动且端口未被占用。";
  if (check.kind === "health_url") return "确认服务健康检查地址可访问，必要时重启对应服务。";
  return "根据失败信息修正配置后重新检测。";
}

function failureReasonText(check: RuntimeDiagnosticCheck) {
  return compactProblem(check.message || statusLabel(check.status));
}

function probableCauseText(check: RuntimeDiagnosticCheck) {
  if (check.kind === "model_path") return "模型文件路径解析后不存在，常见原因是相对路径基准和服务工作目录不一致。";
  if (check.kind === "binary") return "可执行文件没有出现在 PATH 中，或当前运行环境不是安装该命令的环境。";
  if (check.kind === "port") return "服务未启动、启动失败，或端口配置和实际监听端口不一致。";
  if (check.kind === "health_url") return "服务进程可能仍在加载、健康接口路径不对，或后端无法访问该地址。";
  if (check.kind === "required_file") return "依赖文件缺失或路径配置指向了错误目录。";
  return "配置、环境或服务状态与当前诊断项预期不一致。";
}

async function runProbeForCard(card: DiagnosticCard) {
  if (card.role === "asr") return runAsrApiDiagnostic();
  if (card.role === "llm") return runLlmApiDiagnostic();
  if (card.role === "tts") return runTtsApiDiagnostic();
  return runLocalModelsDiagnostic();
}

function probeResultOk(result: unknown) {
  const record = result as { ok?: boolean; checks?: Array<{ ok: boolean }> };
  if (Array.isArray(record.checks)) return record.checks.every((check) => check.ok);
  return Boolean(record.ok);
}

function probeResultText(result: unknown, ok: boolean) {
  const record = result as { message?: string; error?: string; checks?: Array<{ ok: boolean }> };
  if (record.message) return record.message;
  if (record.error) return record.error;
  if (Array.isArray(record.checks)) {
    const failed = record.checks.filter((check) => !check.ok).length;
    return failed ? `${failed} 项异常` : `${record.checks.length} 项正常`;
  }
  return ok ? "接口可用" : "接口异常";
}

function formatJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value ?? "");
  }
}

async function copyText(label: string, text: string) {
  const value = String(text || "").trim();
  if (!value) {
    ui.warning(`${label}为空`);
    return;
  }
  try {
    await navigator.clipboard.writeText(value);
    ui.success(`${label}已复制`);
  } catch (error) {
    ui.error(`${label}复制失败：${errorMessage(error)}`);
  }
}
</script>

<template>
  <main class="page-view">
    <div class="diagnostics-dashboard-shell diagnostics-page">
      <section class="diagnostics-hero" :class="statusClass(overall)">
        <div class="diagnostics-hero-copy">
          <p class="eyebrow">Runtime Diagnostics</p>
          <h1>运行诊断</h1>
          <small>检查模型路径、端口、运行进程、健康接口、启动命令和最近日志，快速定位语音链路哪里异常。</small>
        </div>
        <div class="diagnostics-hero-meta">
          <span>最后检测</span>
          <strong>{{ loadedAtText() }}</strong>
        </div>
        <div class="head-actions diagnostics-hero-actions">
          <button class="secondary-action" type="button" :disabled="loading" @click="copyDiagnostics">
            <Copy :size="16" /> 复制结果
          </button>
          <button class="secondary-action" type="button" :disabled="loading" @click="exportReport">
            <Download :size="16" /> 导出报告
          </button>
          <button class="primary-action" type="button" :disabled="loading" @click="refreshDiagnostics">
            <RefreshCw :size="16" /> {{ loading ? "检测中..." : "重新检测" }}
          </button>
        </div>
      </section>

      <section class="diagnostics-summary-cards">
        <article class="diagnostics-summary-card" :class="statusClass(overall)">
          <span class="summary-card-icon"><component :is="statusIcon(overall)" :size="20" /></span>
          <div>
            <small>整体状态</small>
            <strong>{{ statusLabel(overall) }}</strong>
            <span>{{ summary.total }} 个 profile，{{ issueChecks.length }} 个问题</span>
          </div>
        </article>
        <article class="diagnostics-summary-card status-running">
          <span class="summary-card-icon"><Server :size="20" /></span>
          <div>
            <small>服务运行数量</small>
            <strong>{{ runningServices }}/{{ services.services.length || dashboardCards.length }}</strong>
            <span>来自服务编排状态</span>
          </div>
        </article>
        <article class="diagnostics-summary-card" :class="interfaceChecks.length && interfaceOkCount === interfaceChecks.length ? 'status-ok' : 'status-warning'">
          <span class="summary-card-icon"><Wifi :size="20" /></span>
          <div>
            <small>接口可用数量</small>
            <strong>{{ interfaceOkCount }}/{{ interfaceChecks.length }}</strong>
            <span>健康检查与端口探测</span>
          </div>
        </article>
        <article class="diagnostics-summary-card" :class="issueChecks.length ? 'status-error' : 'status-ok'">
          <span class="summary-card-icon"><Wrench :size="20" /></span>
          <div>
            <small>当前问题数量</small>
            <strong>{{ issueChecks.length }}</strong>
            <span>{{ summary.error }} 个异常，{{ summary.warning }} 个警告</span>
          </div>
        </article>
      </section>

      <section class="diagnostics-pipeline" aria-label="语音链路状态">
        <div class="diagnostics-pipeline-head">
          <div>
            <p class="eyebrow">Voice Pipeline</p>
            <h2>语音链路</h2>
          </div>
          <span class="status-badge" :class="statusClass(overall)">
            <component :is="statusIcon(overall)" :size="14" />
            {{ statusLabel(overall) }}
          </span>
        </div>
        <div class="pipeline-flow">
          <article v-for="node in pipelineNodes" :key="node.key" class="pipeline-node" :class="statusClass(node.status)">
            <span class="pipeline-node-icon"><component :is="node.icon" :size="18" /></span>
            <strong>{{ node.label }}</strong>
            <small>{{ node.detail }}</small>
          </article>
        </div>
      </section>

      <section v-if="dashboardCards.length" class="diagnostics-workspace">
        <aside class="diagnostics-service-rail">
          <div class="diagnostics-panel-head">
            <div>
              <p class="eyebrow">Services</p>
              <h2>服务列表</h2>
            </div>
            <span>{{ dashboardCards.length }} 项</span>
          </div>
          <button
            v-for="card in dashboardCards"
            :key="card.id"
            class="diagnostics-service-item"
            :class="[statusClass(card.status), { active: selectedCard?.id === card.id }]"
            type="button"
            @click="selectCard(card)"
          >
            <span class="service-item-status"><component :is="statusIcon(card.status)" :size="16" /></span>
            <span class="service-item-main">
              <strong>{{ card.label }}</strong>
              <small>{{ card.provider }}</small>
            </span>
            <span class="status-badge" :class="statusClass(card.status)">{{ statusLabel(card.status) }}</span>
          </button>
        </aside>

        <section class="diagnostics-detail-panel">
          <header class="diagnostics-panel-head detail-head">
            <div>
              <p class="eyebrow">Selected Service</p>
              <h2>{{ selectedCard?.label || "未选择服务" }}</h2>
              <small>{{ selectedCard?.summary || "选择左侧服务查看配置、健康检查和接口测试结果。" }}</small>
            </div>
            <span class="status-badge" :class="statusClass(selectedCard?.status)">
              <component :is="statusIcon(selectedCard?.status || 'unknown')" :size="14" />
              {{ statusLabel(selectedCard?.status || "unknown") }}
            </span>
          </header>

          <div class="diagnostics-detail-actions">
            <button class="secondary-action" type="button" :disabled="!selectedCard || Boolean(testingCardId)" @click="runInterfaceTest">
              <FlaskConical :size="15" /> {{ testingCardId === selectedCard?.id ? "测试中..." : "测试接口" }}
            </button>
            <button class="secondary-action" type="button" :disabled="!selectedService" @click="restartSelectedService">
              <Power :size="15" /> 重启服务
            </button>
            <button class="secondary-action" type="button" :disabled="!selectedService" @click="viewSelectedLogs">
              <FileText :size="15" /> 查看日志
            </button>
            <button class="secondary-action" type="button" :disabled="!selectedCard" @click="copySelectedError">
              <Copy :size="15" /> 复制错误
            </button>
            <button class="secondary-action" type="button" :disabled="!selectedService" @click="copySelectedCommand">
              <Terminal :size="15" /> 复制启动命令
            </button>
          </div>

          <div class="diagnostics-detail-grid">
            <article v-for="row in selectedDetailRows" :key="row.label" class="diagnostics-detail-row" :class="statusClass(row.status)">
              <span>{{ row.label }}</span>
              <strong :class="{ mono: row.mono }">{{ row.value }}</strong>
            </article>
          </div>

          <section v-if="selectedItem" class="diagnostics-check-section">
            <div class="diagnostics-panel-head compact">
              <div>
                <p class="eyebrow">Checks</p>
                <h2>配置与健康检查</h2>
              </div>
              <span>{{ selectedItem.checks.length }} 项</span>
            </div>
            <DiagnosticCheckList :checks="selectedItem.checks" :kind-label="checkKindLabel" :status-label="statusLabel" />
          </section>

          <section v-if="selectedProbe?.detail" class="diagnostics-probe-detail">
            <div class="diagnostics-panel-head compact">
              <div>
                <p class="eyebrow">Interface Probe</p>
                <h2>接口测试结果</h2>
              </div>
              <span class="status-badge" :class="statusClass(selectedProbe.status)">{{ statusLabel(selectedProbe.status) }}</span>
            </div>
            <pre>{{ selectedProbe.detail }}</pre>
          </section>
        </section>

        <aside class="diagnostics-insight-rail">
          <section class="diagnostics-log-panel">
            <div class="diagnostics-panel-head">
              <div>
                <p class="eyebrow">Live Logs</p>
                <h2>实时日志</h2>
              </div>
              <span>{{ logLineCount }} 行</span>
            </div>
            <div class="diagnostics-log-controls">
              <select :value="services.selectedId" @change="selectLogService(($event.target as HTMLSelectElement).value)">
                <option v-for="service in services.services" :key="service.id" :value="service.id">{{ service.label || service.id }}</option>
              </select>
              <button class="icon-button" type="button" title="刷新日志" @click="services.refreshLogs()"><RotateCw :size="15" /></button>
              <button class="icon-button" :class="{ active: onlyErrorLogs }" type="button" title="只看错误" @click="onlyErrorLogs = !onlyErrorLogs">
                <AlertTriangle :size="15" />
              </button>
              <button class="icon-button" :class="{ active: pauseLogScroll }" type="button" title="暂停滚动" @click="pauseLogScroll = !pauseLogScroll">
                <Pause :size="15" />
              </button>
              <button class="icon-button" type="button" title="复制日志" @click="copyCurrentLogs"><Copy :size="15" /></button>
            </div>
            <pre ref="logBox" class="diagnostics-log-viewer">{{ filteredLogs || "选择一个服务查看日志。" }}</pre>
          </section>

          <section class="diagnostics-fix-panel">
            <div class="diagnostics-panel-head">
              <div>
                <p class="eyebrow">Repair Guide</p>
                <h2>修复建议</h2>
              </div>
              <span>{{ selectedIssues.length }} 项</span>
            </div>
            <div v-if="selectedIssues.length" class="diagnostics-fix-list">
              <article v-for="check in selectedIssues" :key="`${check.kind}:${check.target}`" class="diagnostics-fix-item" :class="statusClass(check.status)">
                <header>
                  <span>{{ checkKindLabel(check.kind) }}</span>
                  <strong>{{ check.target || "--" }}</strong>
                </header>
                <div>
                  <span>当前异常</span>
                  <strong>{{ failureReasonText(check) }}</strong>
                </div>
                <details v-if="hasDetail(check.message)">
                  <summary>展开详细信息</summary>
                  <pre>{{ check.message }}</pre>
                </details>
                <div>
                  <span>可能原因</span>
                  <strong>{{ probableCauseText(check) }}</strong>
                </div>
                <div>
                  <span>建议操作</span>
                  <strong>{{ fixText(check) }}</strong>
                </div>
              </article>
            </div>
            <div v-else class="diagnostics-empty compact">
              <CheckCircle2 :size="22" />
              <strong>当前选中服务没有异常</strong>
              <span>如果语音链路仍不可用，可以先运行接口测试，再查看实时日志。</span>
            </div>
          </section>

          <DialogTracePanel :traces="traces" />
        </aside>
      </section>

      <section v-else class="diagnostics-empty">
        <Server :size="28" />
        <strong>{{ loading ? "正在读取运行诊断" : "暂无运行 profile" }}</strong>
        <span>{{ loading ? "请稍候。" : "配置 ASR、LLM 或 TTS 服务后，这里会显示路径、端口、命令和健康检查结果。" }}</span>
      </section>
    </div>
  </main>
</template>
