<script setup lang="ts">
import { Copy, Download, Pause, RotateCw, Trash2 } from "@lucide/vue";
import { nextTick, ref, watch } from "vue";
import type { ServiceSummary } from "@/api/services";

const props = defineProps<{
  services: ServiceSummary[];
  selectedId: string;
  logs: string;
  live: boolean;
}>();

const emit = defineEmits<{
  select: [id: string];
  refresh: [];
  clear: [];
  "update:live": [value: boolean];
}>();

const logBox = ref<HTMLElement | null>(null);

watch(
  () => props.logs,
  () => {
    void nextTick(() => {
      if (logBox.value) logBox.value.scrollTop = logBox.value.scrollHeight;
    });
  },
);
</script>

<template>
  <section class="logs-section">
    <div class="logs-head">
      <div><p class="eyebrow">Live Logs</p><h2>运行日志</h2></div>
      <div class="inline-actions">
        <div class="log-tabs">
          <button
            v-for="service in services"
            :key="service.id"
            class="log-tab"
            :class="{ active: service.id === selectedId }"
            type="button"
            @click="emit('select', service.id)"
          >
            {{ service.label || service.id }}
          </button>
        </div>
        <button class="icon-button toggle-button" :class="{ off: !live }" type="button" title="暂停实时刷新" @click="emit('update:live', !live)">
          <Pause :size="16" />
        </button>
        <button class="icon-button" type="button" title="刷新" @click="emit('refresh')"><RotateCw :size="16" /></button>
        <button class="icon-button" type="button" title="复制"><Copy :size="16" /></button>
        <button class="icon-button" type="button" title="下载"><Download :size="16" /></button>
        <button class="icon-button" type="button" title="清空" @click="emit('clear')"><Trash2 :size="16" /></button>
      </div>
    </div>
    <div ref="logBox" class="log-viewer" role="log" aria-live="polite">{{ logs || "选择一个服务查看日志。" }}</div>
  </section>
</template>
