<script setup lang="ts">
import { Pause, Play } from "@lucide/vue";
import type { ServiceSummary } from "@/api/services";

defineProps<{
  service: ServiceSummary;
  pending?: string;
}>();

const emit = defineEmits<{
  select: [id: string];
  start: [id: string];
  stop: [id: string];
}>();
</script>

<template>
  <article
    class="service-card"
    :class="{ active: service.running, loading: pending, failed: service.status === 'error' || service.status === 'failed' }"
    @click="emit('select', service.id)"
  >
    <div class="service-head">
      <span class="status-dot"></span>
      <div class="service-title">
        <strong>{{ service.label || service.id }}</strong>
        <small>{{ service.description || service.health_url || "本地服务" }}</small>
      </div>
      <span class="service-badge" :class="{ running: service.running, loading: pending, failed: service.status === 'error' || service.status === 'failed' }">
        {{ pending || service.status || (service.running ? "running" : "stopped") }}
      </span>
    </div>
    <div class="service-meta">
      <span class="meta-cell" :class="{ good: service.running }"><span>状态</span><strong>{{ service.running ? "运行中" : "已停止" }}</strong></span>
      <span class="meta-cell"><span>PID</span><strong>{{ service.pid || "--" }}</strong></span>
      <span class="meta-cell"><span>端口</span><strong>{{ service.port || "--" }}</strong></span>
      <span class="meta-cell"><span>健康</span><strong>{{ service.health || service.status || "--" }}</strong></span>
    </div>
    <div class="service-actions">
      <button class="service-action" type="button" :disabled="!!pending" @click.stop="emit('start', service.id)">
        <Play :size="15" /> 启动
      </button>
      <button class="service-action" type="button" :disabled="!!pending" @click.stop="emit('stop', service.id)">
        <Pause :size="15" /> 停止
      </button>
    </div>
  </article>
</template>
