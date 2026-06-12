<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { Copy, Power, RefreshCcw, RefreshCw, Square, Trash2, X } from "@lucide/vue";
import ResourceSection from "@/components/services/ResourceSection.vue";
import ServiceCard from "@/components/services/ServiceCard.vue";
import ServiceLogsPanel from "@/components/services/ServiceLogsPanel.vue";
import type { ServiceSummary } from "@/api/services";
import { useServicesStore } from "@/stores/services";
import { useUiStore } from "@/stores/ui";

const services = useServicesStore();
const ui = useUiStore();
const bulkBusy = computed(() => Boolean(services.bulkPending));
const detailServiceId = ref("");
const detailService = computed(() => services.services.find((item) => item.id === detailServiceId.value) || null);

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
  services.select(id).catch((error) => ui.error(`服务日志读取失败：${errorMessage(error)}`));
}

function closeServiceDetail() {
  detailServiceId.value = "";
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
    { label: "日志文件", value: formatValue(service.log_file), wide: true, mono: true },
    { label: "启动等待", value: `${service.startup_wait_sec ?? 0}s` },
    { label: "就绪超时", value: `${service.startup_ready_timeout_sec ?? "--"}s` },
    { label: "启动时间", value: formatStartedAt(service.started_at) },
    { label: "退出码", value: formatValue(service.returncode), failed: service.returncode !== undefined && service.returncode !== null },
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
    <div class="ops-page services-page">
      <section class="page-head">
        <div><p class="eyebrow">Service Orchestration</p><h1>服务编排</h1></div>
        <div class="head-actions">
          <button class="primary-action" type="button" :disabled="bulkBusy" @click="handleStartAll"><Power :size="16" /> {{ services.bulkPending === "starting" ? "启动中..." : "一键启动" }}</button>
          <button class="secondary-action" type="button" :disabled="bulkBusy" @click="handleStopAll"><Square :size="16" /> {{ services.bulkPending === "stopping" ? "停止中..." : "停止全部" }}</button>
          <button class="secondary-action" type="button" :disabled="bulkBusy" @click="handleRestartAll"><RefreshCcw :size="16" /> {{ services.bulkPending === "restarting" ? "重启中..." : "重启全部" }}</button>
          <button class="secondary-action" type="button" :disabled="bulkBusy" @click="handleClearAllLogs"><Trash2 :size="16" /> 清空日志</button>
          <button class="icon-button" type="button" title="刷新" :disabled="services.loading" @click="handleRefresh"><RefreshCw :size="16" /></button>
        </div>
      </section>

      <ResourceSection :resources="services.resources" />

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
            <section class="service-detail-code">
              <div class="service-detail-code-head">
                <span>启动命令</span>
                <button class="small-button" type="button" @click="copyText('启动命令', detailService.command || '')">
                  <Copy :size="14" /> 复制
                </button>
              </div>
              <pre>{{ detailService.command || "--" }}</pre>
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
