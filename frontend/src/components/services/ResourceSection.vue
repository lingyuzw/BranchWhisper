<script setup lang="ts">
import { computed } from "vue";
import { Activity, Cpu, HardDrive, Thermometer } from "@lucide/vue";

const props = defineProps<{
  resources: Record<string, unknown> | null;
}>();

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? (value as Record<string, any>) : {};
}

function numberValue(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function percent(value: unknown) {
  const num = numberValue(value);
  return num === null ? null : Math.max(0, Math.min(100, num));
}

function percentText(value: unknown) {
  const num = percent(value);
  return num === null ? "--" : `${Math.round(num)}%`;
}

function formatBytes(value: unknown) {
  const bytes = numberValue(value);
  if (!bytes || bytes <= 0) return "--";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let next = bytes;
  let index = 0;
  while (next >= 1024 && index < units.length - 1) {
    next /= 1024;
    index += 1;
  }
  return `${next >= 10 ? next.toFixed(1) : next.toFixed(2)} ${units[index]}`;
}

function gpuMemory(gpu: Record<string, any>) {
  const used = numberValue(gpu.memory_used_mb);
  const total = numberValue(gpu.memory_total_mb);
  if (used === null || total === null) return "--";
  return `${Math.round(used)} / ${Math.round(total)} MB`;
}

function meterClass(value: unknown) {
  const pct = percent(value) || 0;
  if (pct >= 90) return "danger";
  if (pct >= 75) return "warning";
  return "";
}

const cpu = computed(() => asRecord(props.resources?.cpu));
const memory = computed(() => asRecord(props.resources?.memory));
const gpus = computed(() => (Array.isArray(props.resources?.gpus) ? (props.resources?.gpus as Record<string, any>[]) : []));
const platformText = computed(() => String(props.resources?.platform || props.resources?.os || "--"));
</script>

<template>
  <section class="resource-section">
    <div class="section-head">
      <div><p class="eyebrow">System Resources</p><h2>资源状态</h2></div>
      <span class="resource-platform-badge">{{ platformText }}</span>
    </div>
    <div class="resource-grid">
      <article class="resource-card">
        <div class="resource-card-head">
          <span class="resource-icon"><Cpu :size="15" /></span>
          <strong>CPU</strong>
        </div>
        <div class="resource-value">{{ percentText(cpu.percent) }}</div>
        <small>{{ cpu.cores || "--" }} cores · load {{ cpu.load_1m ?? "--" }} / {{ cpu.load_5m ?? "--" }} / {{ cpu.load_15m ?? "--" }}</small>
        <div class="resource-meter" :class="meterClass(cpu.percent)"><span :style="{ width: `${percent(cpu.percent) || 0}%` }"></span></div>
      </article>

      <article class="resource-card">
        <div class="resource-card-head">
          <span class="resource-icon"><HardDrive :size="15" /></span>
          <strong>内存</strong>
        </div>
        <div class="resource-value">{{ percentText(memory.percent) }}</div>
        <small>{{ formatBytes(memory.used_bytes) }} / {{ formatBytes(memory.total_bytes) }} · 可用 {{ formatBytes(memory.available_bytes) }}</small>
        <div class="resource-meter" :class="meterClass(memory.percent)"><span :style="{ width: `${percent(memory.percent) || 0}%` }"></span></div>
      </article>

      <article v-for="gpu in gpus" :key="gpu.index ?? gpu.name" class="resource-card">
        <div class="resource-card-head">
          <span class="resource-icon"><Activity :size="15" /></span>
          <strong>GPU {{ gpu.index ?? "" }}</strong>
        </div>
        <div class="resource-value">{{ percentText(gpu.memory_percent) }}</div>
        <small class="resource-meta-line">
          <span>{{ gpu.name || "--" }} · 显存 {{ gpuMemory(gpu) }}</span>
          <span class="resource-temp"><Thermometer :size="13" /> {{ gpu.temperature_c ?? "--" }}°C · GPU {{ percentText(gpu.util_percent) }}</span>
        </small>
        <div class="resource-meter" :class="meterClass(gpu.memory_percent)"><span :style="{ width: `${percent(gpu.memory_percent) || 0}%` }"></span></div>
      </article>

      <article v-if="!gpus.length" class="resource-card muted">
        <div class="resource-card-head">
          <span class="resource-icon"><Activity :size="15" /></span>
          <strong>GPU</strong>
        </div>
        <div class="resource-value">--</div>
        <small>未检测到 nvidia-smi 输出，或当前环境没有可读 GPU。</small>
      </article>
    </div>
  </section>
</template>
