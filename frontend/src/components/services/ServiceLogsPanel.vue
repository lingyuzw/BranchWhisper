<script setup lang="ts">
import { Copy, Download, Pause, RotateCw, Trash2 } from "@lucide/vue";
import { computed, nextTick, ref, watch } from "vue";
import type { ServiceSummary } from "@/api/services";
import { useUiStore, type ToastKind } from "@/stores/ui";

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
  clearAll: [];
  "update:live": [value: boolean];
}>();

const logBox = ref<HTMLElement | null>(null);
const actionMessage = ref("");
const ui = useUiStore();
const selectedService = computed(() => props.services.find((service) => service.id === props.selectedId) || null);
const logSections = computed(() => {
  const text = String(props.logs || "");
  if (!/^=+\s*start\s+/im.test(text) || text.length > 32000) return [];
  return splitLogSections(text);
});

watch(
  () => props.logs,
  () => {
    if (!props.live) return;
    void nextTick(() => {
      if (logBox.value) logBox.value.scrollTop = logBox.value.scrollHeight;
    });
  },
);

function setActionMessage(message: string, type: ToastKind = "info") {
  actionMessage.value = message;
  ui.toast(message, type);
  window.setTimeout(() => {
    if (actionMessage.value === message) actionMessage.value = "";
  }, 1800);
}

async function copyLogs() {
  const text = props.logs || "";
  if (!text.trim()) {
    setActionMessage("没有可复制日志", "warning");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    setActionMessage("日志已复制", "success");
  } catch {
    setActionMessage("复制失败", "error");
  }
}

function downloadLogs() {
  const text = props.logs || "";
  if (!text.trim()) {
    setActionMessage("没有可下载日志", "warning");
    return;
  }
  const id = selectedService.value?.id || props.selectedId || "service";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${id}-${timestamp}.log`;
  link.click();
  URL.revokeObjectURL(url);
  setActionMessage("日志已下载", "success");
}

function splitLogSections(text: string) {
  const lines = String(text || "").split(/\r?\n/);
  const sections: Array<{ title: string; lines: string[] }> = [];
  let current: { title: string; lines: string[] } | null = null;
  const startRe = /^=+\s*start\s+(.+?)\s*=+$/i;
  for (const line of lines) {
    const match = line.match(startRe);
    if (match) {
      if (current) sections.push(current);
      current = { title: match[1], lines: [] };
      continue;
    }
    if (!current) current = { title: "当前日志", lines: [] };
    current.lines.push(line);
  }
  if (current) sections.push(current);
  return sections.filter((section) => section.title || section.lines.join("").trim());
}
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
        <button class="icon-button" type="button" title="复制" @click="copyLogs"><Copy :size="16" /></button>
        <button class="icon-button" type="button" title="下载" @click="downloadLogs"><Download :size="16" /></button>
        <button class="icon-button" type="button" title="清空" @click="emit('clear')"><Trash2 :size="16" /></button>
        <button class="secondary-action log-clear-all" type="button" @click="emit('clearAll')"><Trash2 :size="15" />全部</button>
      </div>
    </div>
    <span v-if="actionMessage" class="soft-badge log-action-message">{{ actionMessage }}</span>
    <div ref="logBox" class="log-viewer" role="log" aria-live="polite">
      <template v-if="logSections.length > 1">
        <section v-for="section in logSections" :key="section.title + section.lines.length" class="log-run">
          <div class="log-run-head">
            <strong>{{ section.title }}</strong>
            <span>{{ section.lines.length }} lines</span>
          </div>
          <pre class="log-run-body">{{ section.lines.join("\n") || "--" }}</pre>
        </section>
      </template>
      <template v-else>{{ logs || "选择一个服务查看日志。" }}</template>
    </div>
  </section>
</template>
