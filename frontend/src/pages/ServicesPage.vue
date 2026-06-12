<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import { Power, RefreshCcw, RefreshCw, Square, Trash2 } from "@lucide/vue";
import ResourceSection from "@/components/services/ResourceSection.vue";
import ServiceCard from "@/components/services/ServiceCard.vue";
import ServiceLogsPanel from "@/components/services/ServiceLogsPanel.vue";
import { useServicesStore } from "@/stores/services";
import { useUiStore } from "@/stores/ui";

const services = useServicesStore();
const ui = useUiStore();
const bulkBusy = computed(() => Boolean(services.bulkPending));

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

async function runAction(working: string, done: string, failed: string, action: () => Promise<void>) {
  ui.info(working, 1400);
  try {
    await action();
    ui.success(done);
  } catch (error) {
    ui.error(`${failed}：${errorMessage(error)}`);
  }
}

async function handleStart(id: string) {
  await runAction(`正在启动 ${serviceName(id)}...`, `${serviceName(id)} 启动完成`, `${serviceName(id)} 启动失败`, () => services.start(id));
}

async function handleStop(id: string) {
  await runAction(`正在停止 ${serviceName(id)}...`, `${serviceName(id)} 停止完成`, `${serviceName(id)} 停止失败`, () => services.stop(id));
}

async function handleRestart(id: string) {
  await runAction(`正在重启 ${serviceName(id)}...`, `${serviceName(id)} 重启完成`, `${serviceName(id)} 重启失败`, () => services.restart(id));
}

async function handleStartAll() {
  await runAction("正在启动全部服务...", "全部服务启动完成", "全部服务启动失败", () => services.startAll());
}

async function handleStopAll() {
  await runAction("正在停止全部服务...", "全部服务停止完成", "全部服务停止失败", () => services.stopAll());
}

async function handleRestartAll() {
  await runAction("正在重启全部服务...", "全部服务重启完成", "全部服务重启失败", () => services.restartAll());
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
          @start="handleStart"
          @stop="handleStop"
          @restart="handleRestart"
        />
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
