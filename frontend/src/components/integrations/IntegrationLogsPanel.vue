<script setup lang="ts">
import { Copy, Download, Eraser, RotateCw } from "@lucide/vue";

defineProps<{
  scope: string;
  logs: string;
}>();

const emit = defineEmits<{
  "update:scope": [value: string];
  refresh: [];
  copy: [];
  download: [];
  clear: [];
}>();
</script>

<template>
  <section class="integration-panel integration-log-panel integration-log-column">
    <div class="panel-head">
      <div>
        <p class="eyebrow">Runtime Logs</p>
        <h2>运行日志</h2>
      </div>
      <div class="integration-log-toolbar">
        <select :value="scope" @change="emit('update:scope', ($event.target as HTMLSelectElement).value); emit('refresh')">
          <option value="current">本次启动</option>
          <option value="all">全部日志</option>
        </select>
        <button class="icon-button" type="button" title="刷新日志" @click="emit('refresh')"><RotateCw :size="16" /></button>
        <button class="icon-button" type="button" title="复制日志" @click="emit('copy')"><Copy :size="16" /></button>
        <button class="icon-button" type="button" title="下载日志" @click="emit('download')"><Download :size="16" /></button>
        <button class="icon-button danger" type="button" title="清空日志" @click="emit('clear')"><Eraser :size="16" /></button>
      </div>
    </div>
    <div class="log-viewer integration-log" role="log" aria-live="polite">{{ logs || "暂无日志。" }}</div>
  </section>
</template>
