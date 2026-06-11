<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { Copy, Download, Pause, Play, Power, RefreshCcw, RefreshCw, RotateCw, Square, Trash2 } from "@lucide/vue";
import { useServicesStore } from "@/stores/services";

const services = useServicesStore();
const logBox = ref<HTMLElement | null>(null);

onMounted(async () => {
  await services.reload();
  await services.refreshLogs(true);
  services.startPolling();
});

onUnmounted(() => {
  services.stopPolling();
});

watch(
  () => services.logs,
  () => {
    void nextTick(() => {
      if (logBox.value) logBox.value.scrollTop = logBox.value.scrollHeight;
    });
  },
);
</script>

<template>
  <main class="page-view">
    <div class="ops-page services-page">
      <section class="page-head">
        <div><p class="eyebrow">Service Orchestration</p><h1>服务编排</h1></div>
        <div class="head-actions">
          <button class="primary-action" type="button" @click="services.startAll()"><Power :size="16" /> 一键启动</button>
          <button class="secondary-action" type="button" @click="services.stopAll()"><Square :size="16" /> 停止全部</button>
          <button class="secondary-action" type="button" @click="services.startAll()"><RefreshCcw :size="16" /> 重启全部</button>
          <button class="icon-button" type="button" title="刷新" @click="services.reload()"><RefreshCw :size="16" /></button>
        </div>
      </section>

      <section class="resource-section">
        <div class="section-head">
          <div><p class="eyebrow">System Resources</p><h2>资源状态</h2></div>
          <span class="soft-badge">{{ String(services.resources?.platform || services.resources?.os || "--") }}</span>
        </div>
        <div class="resource-grid">
          <article v-for="(value, key) in services.resources || {}" :key="String(key)" class="resource-card">
            <div class="resource-card-head">
              <strong>{{ key }}</strong>
            </div>
            <div class="resource-value">{{ typeof value === "object" ? "--" : value }}</div>
            <small v-if="typeof value === 'object'">{{ JSON.stringify(value) }}</small>
          </article>
        </div>
      </section>

      <div class="service-list">
      <article
        v-for="service in services.services"
        :key="service.id"
        class="service-card"
        :class="{ active: service.running, loading: services.pending[service.id], failed: service.status === 'error' || service.status === 'failed' }"
        @click="services.select(service.id)"
      >
        <div class="service-head">
          <span class="status-dot"></span>
          <div class="service-title">
            <strong>{{ service.label || service.id }}</strong>
            <small>{{ service.description || service.health_url || "本地服务" }}</small>
          </div>
          <span class="service-badge" :class="{ running: service.running, loading: services.pending[service.id], failed: service.status === 'error' || service.status === 'failed' }">
            {{ services.pending[service.id] || service.status || (service.running ? "running" : "stopped") }}
          </span>
        </div>
        <div class="service-meta">
          <span class="meta-cell" :class="{ good: service.running }"><span>状态</span><strong>{{ service.running ? "运行中" : "已停止" }}</strong></span>
          <span class="meta-cell"><span>PID</span><strong>{{ service.pid || "--" }}</strong></span>
          <span class="meta-cell"><span>端口</span><strong>{{ service.port || "--" }}</strong></span>
          <span class="meta-cell"><span>健康</span><strong>{{ service.health || service.status || "--" }}</strong></span>
        </div>
        <div class="service-actions">
          <button class="service-action" type="button" :disabled="!!services.pending[service.id]" @click.stop="services.start(service.id)">
            <Play :size="15" /> 启动
          </button>
          <button class="service-action" type="button" :disabled="!!services.pending[service.id]" @click.stop="services.stop(service.id)">
            <Pause :size="15" /> 停止
          </button>
        </div>
      </article>
      </div>

      <section class="logs-section">
        <div class="logs-head">
          <div><p class="eyebrow">Live Logs</p><h2>运行日志</h2></div>
          <div class="inline-actions">
            <div class="log-tabs">
              <button
                v-for="service in services.services"
                :key="service.id"
                class="log-tab"
                :class="{ active: service.id === services.selectedId }"
                type="button"
                @click="services.select(service.id)"
              >
                {{ service.label || service.id }}
              </button>
            </div>
            <button class="icon-button toggle-button" :class="{ off: !services.live }" type="button" title="暂停实时刷新" @click="services.live = !services.live">
              <Pause :size="16" />
            </button>
            <button class="icon-button" type="button" title="刷新" @click="services.refreshLogs()"><RotateCw :size="16" /></button>
            <button class="icon-button" type="button" title="复制"><Copy :size="16" /></button>
            <button class="icon-button" type="button" title="下载"><Download :size="16" /></button>
            <button class="icon-button" type="button" title="清空" @click="services.clearLogs()"><Trash2 :size="16" /></button>
          </div>
        </div>
        <div ref="logBox" class="log-viewer" role="log" aria-live="polite">{{ services.logs || "选择一个服务查看日志。" }}</div>
      </section>
    </div>
  </main>
</template>
