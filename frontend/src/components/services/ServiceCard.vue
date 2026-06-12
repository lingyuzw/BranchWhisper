<script setup lang="ts">
import { computed } from "vue";
import { Play, RotateCcw, Square } from "@lucide/vue";
import type { ServiceSummary } from "@/api/services";

const props = defineProps<{
  service: ServiceSummary;
  pending?: string;
}>();

const emit = defineEmits<{
  select: [id: string];
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
const isFailed = computed(() => ["error", "failed"].includes(String(runtimeState.value)) || Boolean(props.service.error));
const isReady = computed(() => props.service.running || ["ready", "running"].includes(String(runtimeState.value)));

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

const startedAtText = computed(() => {
  const value = props.service.started_at;
  if (value === null || value === undefined || value === "") return "--";
  const timestamp = typeof value === "number" ? value * 1000 : Number(value) * 1000;
  if (Number.isFinite(timestamp)) return new Date(timestamp).toLocaleString();
  return String(value);
});

const commandText = computed(() => String(props.service.command || "--"));

const detailRows = computed(() => [
  { label: "工作目录", value: props.service.cwd || "--", wide: true, mono: true },
  { label: "Health URL", value: props.service.health_url || "--", wide: true, mono: true },
  { label: "启动等待", value: `${props.service.startup_wait_sec ?? 0}s` },
  { label: "就绪超时", value: `${props.service.startup_ready_timeout_sec ?? 0}s` },
  { label: "日志文件", value: props.service.log_file || "--", wide: true, mono: true },
  { label: "启动时间", value: startedAtText.value },
  { label: "返回码", value: props.service.returncode ?? "--" },
  { label: "健康耗时", value: healthLatency.value },
  { label: "错误详情", value: props.service.error || "--", wide: true, tone: props.service.error ? "failed" : "" },
]);

const advice = computed(() => {
  if (props.service.error) return props.service.error;
  if (warmup.value?.error) return String(warmup.value.error);
  if (warmup.value?.detail) return String(warmup.value.detail);
  if (isLoading.value) return "服务启动后会持续刷新健康状态和日志。";
  if (!props.service.running) return "可单独启动，或在页头一键启动全部服务。";
  return props.service.external ? "检测到外部进程正在提供服务。" : "服务已纳入当前运行时管理。";
});
</script>

<template>
  <article
    class="service-card"
    :class="{ active: isReady, loading: isLoading, failed: isFailed }"
    @click="emit('select', service.id)"
  >
    <div class="service-head">
      <span class="status-dot"></span>
      <div class="service-title">
        <strong>{{ service.label || service.id }}</strong>
        <small>{{ service.description || service.health_url || "本地服务" }}</small>
      </div>
      <span class="service-badge" :class="{ running: isReady, loading: isLoading, failed: isFailed }">
        {{ stateLabel }}
      </span>
    </div>
    <div class="service-meta">
      <span class="meta-cell" :class="{ good: isReady, loading: isLoading, failed: isFailed }"><span>状态</span><strong>{{ stateLabel }}</strong></span>
      <span class="meta-cell"><span>PID</span><strong>{{ service.external ? "external" : service.pid || "--" }}</strong></span>
      <span class="meta-cell"><span>端口</span><strong>{{ servicePort }}</strong></span>
      <span class="meta-cell" :class="{ good: healthLabel === '健康', failed: isFailed }"><span>健康</span><strong>{{ healthLabel }}</strong></span>
      <span class="meta-cell" :class="{ good: warmupLabel === '完成', loading: ['预热中', '排队', '加载中'].includes(warmupLabel), failed: warmupLabel === '失败' }"><span>预热</span><strong>{{ warmupLabel }}</strong></span>
      <span class="meta-cell muted"><span>等待</span><strong>{{ service.startup_wait_sec ?? 0 }}s</strong></span>
    </div>
    <div class="service-advice" :class="{ failed: isFailed, loading: isLoading }">{{ advice }}</div>
    <details class="service-details" @click.stop>
      <summary>参数详情</summary>
      <div class="service-detail-grid">
        <div
          v-for="row in detailRows"
          :key="row.label"
          class="service-detail-row"
          :class="{ wide: row.wide, mono: row.mono, failed: row.tone === 'failed' }"
        >
          <span>{{ row.label }}</span>
          <strong>{{ row.value }}</strong>
        </div>
      </div>
      <div class="service-command-detail">
        <span>启动命令</span>
        <pre>{{ commandText }}</pre>
      </div>
    </details>
    <div class="service-actions">
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
