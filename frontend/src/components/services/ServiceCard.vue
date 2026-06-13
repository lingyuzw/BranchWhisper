<script setup lang="ts">
import { computed } from "vue";
import { Info, Play, RotateCcw, Square } from "@lucide/vue";
import type { ServiceSummary } from "@/api/services";

const props = defineProps<{
  service: ServiceSummary;
  pending?: string;
}>();

const emit = defineEmits<{
  select: [id: string];
  detail: [id: string];
  start: [id: string];
  stop: [id: string];
  restart: [id: string];
}>();

const runtimeState = computed(() => props.pending || props.service.state || props.service.status || (props.service.running ? "running" : "stopped"));
const healthPayload = computed(() => {
  const health = props.service.health;
  if (!health || typeof health !== "object") return {};
  const payload = (health as Record<string, any>).payload || {};
  const detail = typeof payload.detail === "object" && payload.detail ? payload.detail : {};
  return { ...payload, ...detail };
});
const warmup = computed(() => props.service.warmup || {});
const isLoading = computed(() => Boolean(props.pending) || ["starting", "warming", "loading"].includes(String(runtimeState.value)));
const isDegraded = computed(() => String(runtimeState.value) === "running_degraded");
const isReady = computed(() => ["ready", "running", "running_degraded"].includes(String(runtimeState.value)));
const isFailed = computed(
  () =>
    ["error", "failed"].includes(String(runtimeState.value)) ||
    (Boolean(props.service.error) && !isReady.value && !isDegraded.value && !isLoading.value),
);

const stateLabel = computed(() => {
  const value = String(runtimeState.value || "");
  return {
    starting: "启动中",
    warming: "预热中",
    loading: "加载中",
    restarting: "重启中",
    stopping: "停止中",
    ready: "就绪",
    running: "运行中",
    running_degraded: "运行中",
    failed: "失败",
    error: "异常",
    stopped: "已停止",
  }[value] || value || "未知";
});

const warmupLabel = computed(() => {
  const state = String(warmup.value?.state || healthPayload.value?.status || "");
  if (!state) return "--";
  return {
    queued: "排队",
    running: "预热中",
    ready: "完成",
    failed: "失败",
    loading: "加载中",
    warming: "预热中",
  }[state] || state;
});

const healthLabel = computed(() => {
  const health = props.service.health;
  if (isDegraded.value) return "降级";
  if (!health) return props.service.port_open ? "端口可达" : "--";
  if (typeof health === "string") return health;
  if (health.ok) return healthPayload.value?.ready === false ? "未就绪" : "健康";
  if (health.status) return `HTTP ${health.status}`;
  return "不可用";
});

const servicePort = computed(() => {
  if (props.service.port) return props.service.port;
  try {
    return props.service.health_url ? new URL(props.service.health_url).port || "--" : "--";
  } catch {
    return "--";
  }
});

const healthLatency = computed(() => {
  const health = props.service.health;
  if (!health || typeof health !== "object") return "--";
  const latency = (health as Record<string, any>).latency_ms;
  return Number.isFinite(Number(latency)) ? `${Math.round(Number(latency))} ms` : "--";
});

const advice = computed(() => {
  if (isLoading.value) return "服务正在启动，健康检查可能会短暂不可用。页面会继续刷新直到就绪或超时。";
  if (props.service.command_mismatch) return "配置未生效：最近实际启动命令和当前配置不一致，请重启该服务。";
  if (isDegraded.value) return "服务端口已响应，但健康接口不支持或未提供标准 ready 信息。";
  if (props.service.error && !isReady.value) return props.service.error;
  if (warmup.value?.error) return String(warmup.value.error);
  if (warmup.value?.detail) return String(warmup.value.detail);
  if (!props.service.running) return "可单独启动，或在页头一键启动全部服务。";
  return props.service.external ? "检测到外部进程正在提供服务。" : "服务已纳入当前运行时管理。";
});
</script>

<template>
  <article
    class="service-card"
    :class="{ active: isReady, loading: isLoading, failed: isFailed, degraded: isDegraded }"
    @click="emit('select', service.id)"
  >
    <div class="service-head">
      <span class="status-dot"></span>
      <div class="service-title">
        <strong>{{ service.label || service.id }}</strong>
        <small>{{ service.description || service.health_url || "本地服务" }}</small>
      </div>
      <span class="service-badge" :class="{ running: isReady, loading: isLoading, failed: isFailed, degraded: isDegraded }">
        {{ stateLabel }}
      </span>
    </div>
    <div class="service-meta">
      <span class="meta-cell" :class="{ good: isReady && !isDegraded, loading: isLoading, degraded: isDegraded, failed: isFailed }"><span>状态</span><strong>{{ stateLabel }}</strong></span>
      <span class="meta-cell"><span>PID</span><strong>{{ service.external ? "external" : service.pid || "--" }}</strong></span>
      <span class="meta-cell"><span>端口</span><strong>{{ servicePort }}</strong></span>
      <span class="meta-cell" :class="{ good: healthLabel === '健康', degraded: isDegraded, failed: isFailed }"><span>健康</span><strong>{{ healthLabel }}</strong></span>
      <span class="meta-cell" :class="{ good: warmupLabel === '完成', loading: ['预热中', '排队', '加载中'].includes(warmupLabel), failed: warmupLabel === '失败' }"><span>预热</span><strong>{{ warmupLabel }}</strong></span>
      <span class="meta-cell muted"><span>等待</span><strong>{{ service.startup_wait_sec ?? 0 }}s</strong></span>
    </div>
    <div class="service-advice" :class="{ failed: isFailed, loading: isLoading }">{{ advice }}</div>
    <div class="service-actions">
      <button class="service-action" type="button" @click.stop="emit('detail', service.id)">
        <Info :size="15" /> 参数详情
      </button>
      <button class="service-action" type="button" :disabled="!!pending" @click.stop="emit('start', service.id)">
        <Play :size="15" /> {{ pending === "starting" ? "启动中..." : "启动" }}
      </button>
      <button class="service-action" type="button" :disabled="!!pending" @click.stop="emit('stop', service.id)">
        <Square :size="15" /> {{ pending === "stopping" ? "停止中..." : "停止" }}
      </button>
      <button class="service-action" type="button" :disabled="!!pending" @click.stop="emit('restart', service.id)">
        <RotateCcw :size="15" /> {{ pending === "restarting" ? "重启中..." : "重启" }}
      </button>
    </div>
  </article>
</template>
