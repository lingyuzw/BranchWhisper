<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { Pause, Play, RefreshCw, Square, Trash2 } from "@lucide/vue";
import PageScaffold from "@/components/common/PageScaffold.vue";
import { useServicesStore } from "@/stores/services";

const services = useServicesStore();

onMounted(async () => {
  await services.reload();
  await services.refreshLogs(true);
  services.startPolling();
});

onUnmounted(() => {
  services.stopPolling();
});
</script>

<template>
  <PageScaffold eyebrow="Runtime" title="服务" description="服务状态、资源和日志会自动刷新；启动或停止后会进入短轮询直到状态稳定。">
    <div class="service-actions">
      <button class="primary-action" type="button" @click="services.startAll()"><Play :size="16" /> 全部启动</button>
      <button class="secondary-action" type="button" @click="services.stopAll()"><Square :size="16" /> 全部停止</button>
      <button class="icon-button" type="button" @click="services.reload()"><RefreshCw :size="16" /></button>
    </div>

    <section class="service-grid">
      <article
        v-for="service in services.services"
        :key="service.id"
        class="service-card"
        :class="{ running: service.running, active: service.id === services.selectedId }"
        @click="services.select(service.id)"
      >
        <div class="service-card-head">
          <span class="run-dot"></span>
          <strong>{{ service.label || service.id }}</strong>
          <small>{{ services.pending[service.id] || service.status || (service.running ? "running" : "stopped") }}</small>
        </div>
        <p>{{ service.description || service.health_url || "本地服务" }}</p>
        <div class="service-card-actions">
          <button class="secondary-action" type="button" :disabled="!!services.pending[service.id]" @click.stop="services.start(service.id)">
            <Play :size="15" /> 启动
          </button>
          <button class="secondary-action" type="button" :disabled="!!services.pending[service.id]" @click.stop="services.stop(service.id)">
            <Pause :size="15" /> 停止
          </button>
        </div>
      </article>
    </section>

    <section class="service-lower">
      <article class="resource-panel">
        <h2>资源</h2>
        <pre>{{ JSON.stringify(services.resources || {}, null, 2) }}</pre>
      </article>

      <article class="log-panel">
        <div class="log-head">
          <div>
            <h2>运行日志</h2>
            <small>{{ services.selected?.label || services.selected?.id || "未选择服务" }}</small>
          </div>
          <div class="log-actions">
            <label class="toggle-line"><input v-model="services.live" type="checkbox" /> 实时</label>
            <button class="icon-button" type="button" @click="services.refreshLogs()"><RefreshCw :size="16" /></button>
            <button class="icon-button danger" type="button" @click="services.clearLogs()"><Trash2 :size="16" /></button>
          </div>
        </div>
        <pre class="log-box">{{ services.logs || "暂无日志。" }}</pre>
      </article>
    </section>
  </PageScaffold>
</template>
