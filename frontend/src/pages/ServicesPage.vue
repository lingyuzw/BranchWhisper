<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { ChevronDown, ChevronUp, Copy, Power, RefreshCcw, RefreshCw, Square, Trash2, X } from "@lucide/vue";
import ResourceSection from "@/components/services/ResourceSection.vue";
import ServiceCard from "@/components/services/ServiceCard.vue";
import ServiceLogsPanel from "@/components/services/ServiceLogsPanel.vue";
import InlineProbe from "@/components/layout/InlineProbe.vue";
import PageHeader from "@/components/ui/PageHeader.vue";
import StatusSummary from "@/components/ui/StatusSummary.vue";
import TaskPanel from "@/components/ui/TaskPanel.vue";
import { runLocalModelsDiagnostic } from "@/api/diagnostics";
import type { ServiceSummary } from "@/api/services";
import { useServicesStore } from "@/stores/services";
import { useUiStore } from "@/stores/ui";

const services = useServicesStore();
const ui = useUiStore();
const bulkBusy = computed(() => Boolean(services.bulkPending));
const detailServiceId = ref("");
const serviceDetailExpanded = ref(false);
const detailService = computed(() => services.services.find((item) => item.id === detailServiceId.value) || null);
type ProbeStatus = "idle" | "running" | "ok" | "failed" | "warning";
type MetricTone = "neutral" | "ok" | "warning" | "danger" | "info";
interface StatusMetricItem {
  label: string;
  value: string | number;
  detail?: string;
  tone?: MetricTone;
}
const serviceProbe = ref<{ status: ProbeStatus; text: string; detail: string }>({ status: "idle", text: "未检测", detail: "" });
const runningServices = computed(() => services.services.filter((service) => service.running || ["ready", "running"].includes(serviceRuntimeState(service))).length);
const healthyServices = computed(() => services.services.filter((service) => service.port_open || service.health).length);
const problemServices = computed(() => services.services.filter((service) => service.error || service.command_mismatch || ["failed", "error"].includes(serviceRuntimeState(service))).length);
const serviceHeaderTone = computed(() => {
  if (problemServices.value > 0) return "danger";
  if (services.loading || bulkBusy.value) return "running";
  if (runningServices.value > 0) return "ok";
  return "idle";
});
const serviceHeaderStatus = computed(() => {
  if (problemServices.value > 0) return `${problemServices.value} 项需要处理`;
  if (services.loading || bulkBusy.value) return "服务状态更新中";
  if (runningServices.value > 0) return `${runningServices.value} 个服务运行中`;
  return "等待启动";
});
const serviceSummaryItems = computed<StatusMetricItem[]>(() => [
  {
    label: "运行服务",
    value: `${runningServices.value}/${services.services.length || 0}`,
    detail: services.services.length ? "ASR、LLM、TTS 当前状态" : "等待读取服务列表",
    tone: runningServices.value ? "ok" : "neutral",
  },
  {
    label: "接口可用",
    value: healthyServices.value,
    detail: "端口开放或健康检查有返回",
    tone: healthyServices.value ? "info" : "neutral",
  },
  {
    label: "当前问题",
    value: problemServices.value,
    detail: problemServices.value ? "存在错误、命令不一致或失败状态" : "未发现服务异常",
    tone: problemServices.value ? "danger" : "ok",
  },
  {
    label: "资源状态",
    value: services.resourceLoading ? "更新中" : services.resources ? "已读取" : "未读取",
    detail: "CPU、内存和 GPU 辅助判断",
    tone: services.resourceLoading ? "info" : services.resources ? "ok" : "neutral",
  },
]);

onMounted(async () => {
  try {
    await services.reload();
    await services.refreshLogs(true);
  } catch (error) {
    ui.error(`服务状态读取失败：${errorMessage(error)}`);
  }
  services.startPolling();
});

onUnmounted(() => {
  services.stopPolling();
});

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function serviceName(id: string) {
  const service = services.services.find((item) => item.id === id);
  return service?.label || id;
}

function servicePending(id: string) {
  return services.pending[id] || services.bulkPending;
}

async function runAction(working: string, done: string, failed: string, action: () => Promise<void>, doneDelayMs = 0) {
  ui.info(working, 1400);
  try {
    await action();
    if (doneDelayMs > 0) {
      window.setTimeout(() => ui.success(done), doneDelayMs);
    } else {
      ui.success(done);
    }
  } catch (error) {
    ui.error(`${failed}：${errorMessage(error)}`);
  }
}

async function handleStart(id: string) {
  await runAction(`开始启动 ${serviceName(id)}...`, `${serviceName(id)} 启动请求已发送`, `${serviceName(id)} 启动失败`, () => services.start(id));
}

async function handleStop(id: string) {
  await runAction(`正在停止 ${serviceName(id)}...`, `${serviceName(id)} 停止完成`, `${serviceName(id)} 停止失败`, () => services.stop(id));
}

async function handleRestart(id: string) {
  await runAction(`开始重启 ${serviceName(id)}...`, `${serviceName(id)} 重启请求已发送`, `${serviceName(id)} 重启失败`, () => services.restart(id));
}

async function handleStartAll() {
  await runAction("开始启动全部服务...", "全部服务启动请求已发送", "全部服务启动失败", () => services.startAll());
}

async function handleStopAll() {
  await runAction("正在停止全部服务...", "全部服务停止完成", "全部服务停止失败", () => services.stopAll());
}

async function handleRestartAll() {
  await runAction("开始重启全部服务...", "全部服务重启请求已发送", "全部服务重启失败", () => services.restartAll());
}

async function handleRefresh() {
  await runAction("正在刷新服务状态...", "服务状态刷新完成", "服务状态刷新失败", () => services.reload());
}

async function handleRefreshLogs() {
  await runAction("正在刷新运行日志...", "运行日志刷新完成", "运行日志刷新失败", () => services.refreshLogs());
}

async function handleClearLogs() {
  await runAction("正在清空当前服务日志...", "当前服务日志已清空", "当前服务日志清空失败", () => services.clearLogs());
}

async function handleClearAllLogs() {
  const confirmed = await ui.confirmAction({
    title: "清空所有日志",
    message: "这会清空 ASR、LLM、TTS 的本地运行日志，操作不可撤销。",
    confirmText: "清空",
    tone: "error",
  });
  if (!confirmed) return;
  await runAction("正在清空所有服务日志...", "所有服务日志已清空", "所有服务日志清空失败", () => services.clearAllLogs());
}

function openServiceDetail(id: string) {
  detailServiceId.value = id;
  serviceDetailExpanded.value = false;
  services.select(id).catch((error) => ui.error(`服务日志读取失败：${errorMessage(error)}`));
}

function closeServiceDetail() {
  detailServiceId.value = "";
  serviceDetailExpanded.value = false;
}

function formatValue(value: unknown) {
  if (value === undefined || value === null || value === "") return "--";
  return String(value);
}

function formatStartedAt(value: ServiceSummary["started_at"]) {
  if (!value) return "--";
  const numeric = Number(value);
  const date = Number.isFinite(numeric) ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric) : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function servicePort(service: ServiceSummary) {
  if (service.port) return String(service.port);
  try {
    return service.health_url ? new URL(service.health_url).port || "--" : "--";
  } catch {
    return "--";
  }
}

function serviceRuntimeState(service: ServiceSummary) {
  return String(service.state || service.status || (service.running ? "running" : "stopped"));
}

function serviceDetailRows(service: ServiceSummary) {
  return [
    { label: "状态", value: serviceRuntimeState(service) },
    { label: "PID", value: service.external ? "external" : formatValue(service.pid) },
    { label: "端口", value: servicePort(service) },
    { label: "Health URL", value: formatValue(service.health_url), wide: true, mono: true },
    { label: "工作目录", value: formatValue(service.cwd), wide: true, mono: true },
    { label: "配置文件", value: formatValue(service.config_path), wide: true, mono: true },
    { label: "日志文件", value: formatValue(service.log_file), wide: true, mono: true },
    { label: "启动等待", value: `${service.startup_wait_sec ?? 0}s` },
    { label: "就绪超时", value: `${service.startup_ready_timeout_sec ?? "--"}s` },
    { label: "启动时间", value: formatStartedAt(service.started_at) },
    { label: "退出码", value: formatValue(service.returncode), failed: service.returncode !== undefined && service.returncode !== null },
    { label: "命令一致性", value: service.command_mismatch ? "配置未生效" : "一致", failed: Boolean(service.command_mismatch) },
    { label: "最近错误", value: formatValue(service.error), wide: true, failed: Boolean(service.error) },
  ];
}

function formatJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value ?? "");
  }
}

async function runServiceProbe() {
  serviceProbe.value = { status: "running", text: "检测中", detail: "" };
  try {
    const result = await runLocalModelsDiagnostic();
    const failed = (result.checks || []).filter((item) => !item.ok);
    serviceProbe.value = {
      status: failed.length ? "failed" : "ok",
      text: failed.length ? `${failed.length} 项异常` : `${result.checks.length} 项正常`,
      detail: formatJson(result),
    };
  } catch (error) {
    serviceProbe.value = { status: "failed", text: errorMessage(error), detail: "" };
  }
}

async function copyServiceProbe() {
  if (!serviceProbe.value.detail.trim()) {
    ui.warning("没有可复制的检测结果");
    return;
  }
  await copyText("服务检测结果", serviceProbe.value.detail);
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
    <div class="workspace-page services-page">
      <PageHeader
        eyebrow="Service Orchestration"
        title="服务编排"
        description="启动和管理本地 ASR、LLM、TTS，让对话和语音回复可用。"
        :status-text="serviceHeaderStatus"
        :status-tone="serviceHeaderTone"
      >
        <template #actions>
          <button class="primary-action" type="button" :disabled="bulkBusy" @click="handleStartAll"><Power :size="16" /> {{ services.bulkPending === "starting" ? "启动中..." : "一键启动" }}</button>
          <button class="secondary-action" type="button" :disabled="bulkBusy" @click="handleStopAll"><Square :size="16" /> {{ services.bulkPending === "stopping" ? "停止中..." : "停止全部" }}</button>
          <button class="secondary-action" type="button" :disabled="bulkBusy" @click="handleRestartAll"><RefreshCcw :size="16" /> {{ services.bulkPending === "restarting" ? "重启中..." : "重启全部" }}</button>
          <button class="secondary-action" type="button" :disabled="bulkBusy" @click="handleClearAllLogs"><Trash2 :size="16" /> 清空日志</button>
          <button class="icon-button" type="button" title="刷新" :disabled="services.loading" @click="handleRefresh"><RefreshCw :size="16" /></button>
        </template>
      </PageHeader>

      <StatusSummary :items="serviceSummaryItems" />

      <ResourceSection :resources="services.resources" />

      <InlineProbe
        variant="strip"
        title="本地服务 Health"
        summary="最小调用 ASR、LLM、TTS 和 BranchWhisper 主后端，定位端口、路径和健康检查问题。"
        :status="serviceProbe.status"
        :status-text="serviceProbe.text"
        :detail="serviceProbe.detail"
        action-text="运行检测"
        @run="runServiceProbe"
        @copy="copyServiceProbe"
      />

      <TaskPanel title="本地模型服务" description="优先确认三个核心服务能启动、端口可访问、健康检查有返回。">
        <div class="service-list">
          <ServiceCard
            v-for="service in services.services"
            :key="service.id"
            :service="service"
            :pending="servicePending(service.id)"
            @select="services.select"
            @detail="openServiceDetail"
            @start="handleStart"
            @stop="handleStop"
            @restart="handleRestart"
          />
        </div>
      </TaskPanel>

      <div v-if="detailService" class="modal-overlay service-detail-overlay" @click.self="closeServiceDetail">
        <section class="modal-panel service-detail-modal" role="dialog" aria-modal="true" aria-label="服务参数详情">
          <div class="modal-head service-detail-head">
            <div>
              <p class="eyebrow">Service Detail</p>
              <h2>{{ detailService.label || detailService.id }}</h2>
            </div>
            <button class="icon-button modal-close" type="button" title="关闭" @click="closeServiceDetail"><X :size="16" /></button>
          </div>
          <div class="modal-body service-detail-body">
            <div class="service-detail-grid">
              <div
                v-for="row in serviceDetailRows(detailService)"
                :key="row.label"
                class="service-detail-row"
                :class="{ wide: row.wide, mono: row.mono, failed: row.failed }"
              >
                <span>{{ row.label }}</span>
                <strong>{{ row.value }}</strong>
              </div>
            </div>
            <button class="secondary-action service-detail-toggle" type="button" @click="serviceDetailExpanded = !serviceDetailExpanded">
              <component :is="serviceDetailExpanded ? ChevronUp : ChevronDown" :size="15" />
              {{ serviceDetailExpanded ? "收起命令详情" : "展开命令详情" }}
            </button>
            <div v-if="serviceDetailExpanded" class="service-detail-code-list">
              <section class="service-detail-code">
                <div class="service-detail-code-head">
                  <span>配置命令</span>
                  <button class="small-button" type="button" @click="copyText('配置命令', detailService.configured_command || detailService.command || '')">
                    <Copy :size="14" /> 复制
                  </button>
                </div>
                <pre>{{ detailService.configured_command || detailService.command || "--" }}</pre>
              </section>
              <section class="service-detail-code">
                <div class="service-detail-code-head">
                  <span>最终启动命令</span>
                  <button class="small-button" type="button" @click="copyText('最终启动命令', detailService.final_command || detailService.effective_command || '')">
                    <Copy :size="14" /> 复制
                  </button>
                </div>
                <pre>{{ detailService.final_command || detailService.effective_command || "--" }}</pre>
              </section>
              <section class="service-detail-code">
                <div class="service-detail-code-head">
                  <span>最近实际启动命令</span>
                  <button class="small-button" type="button" @click="copyText('实际启动命令', detailService.actual_command || '')">
                    <Copy :size="14" /> 复制
                  </button>
                </div>
                <pre>{{ detailService.actual_command || "尚未由当前配置启动" }}</pre>
              </section>
              <section class="service-detail-code">
                <div class="service-detail-code-head">
                  <span>健康返回</span>
                  <button class="small-button" type="button" @click="copyText('健康返回', formatJson(detailService.health))">
                    <Copy :size="14" /> 复制
                  </button>
                </div>
                <pre>{{ formatJson(detailService.health) }}</pre>
              </section>
            </div>
          </div>
        </section>
      </div>

      <ServiceLogsPanel
        :services="services.services"
        :selected-id="services.selectedId"
        :logs="services.logs"
        :live="services.live"
        @select="services.select"
        @refresh="handleRefreshLogs"
        @clear="handleClearLogs"
        @clear-all="handleClearAllLogs"
        @update:live="services.live = $event"
      />
    </div>
  </main>
</template>
