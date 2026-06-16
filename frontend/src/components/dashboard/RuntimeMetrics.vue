<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{
  metrics: {
    status: string;
    trace: string;
    vad: string;
    asr: string;
    llm: string;
    tts: string;
  };
  level: number;
}>();

const canvas = ref<HTMLCanvasElement | null>(null);
const levels = ref<number[]>(Array.from({ length: 48 }, () => 0));
let frame = 0;

function cssValue(name: string, fallback: string) {
  const node = canvas.value;
  const source = node ? getComputedStyle(node) : getComputedStyle(document.documentElement);
  return source.getPropertyValue(name).trim() || fallback;
}

watch(
  () => props.level,
  (level) => {
    levels.value = [...levels.value.slice(1), Math.max(0, Math.min(1, Number(level) || 0))];
  },
);

function drawScope() {
  const node = canvas.value;
  if (!node) {
    frame = requestAnimationFrame(drawScope);
    return;
  }
  const ctx = node.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const width = node.clientWidth || 260;
  const height = node.clientHeight || 68;
  if (node.width !== Math.round(width * dpr) || node.height !== Math.round(height * dpr)) {
    node.width = Math.round(width * dpr);
    node.height = Math.round(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const surface = cssValue("--scope-surface", "rgba(18, 22, 27, 0.92)");
  const primary = cssValue("--scope-primary", "rgba(240, 199, 100, 0.32)");
  const info = cssValue("--scope-info", "rgba(106, 213, 207, 0.14)");
  const line = cssValue("--scope-line", "rgba(106, 213, 207, 0.72)");
  const activeLine = cssValue("--scope-active-line", "#f0c764");
  const midLine = cssValue("--scope-midline", "rgba(255,255,255,0.12)");
  ctx.fillStyle = surface;
  ctx.fillRect(0, 0, width, height);
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, primary);
  gradient.addColorStop(1, info);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = props.metrics.status === "收音" || props.metrics.status === "监听中" ? activeLine : line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  levels.value.forEach((item, index) => {
    const x = (index / Math.max(1, levels.value.length - 1)) * width;
    const y = height / 2 - (item - 0.18) * height * 0.72;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.strokeStyle = midLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
  frame = requestAnimationFrame(drawScope);
}

onMounted(() => {
  frame = requestAnimationFrame(drawScope);
});

onBeforeUnmount(() => {
  if (frame) cancelAnimationFrame(frame);
});
</script>

<template>
  <section class="sidebar-scope">
    <div class="scope-header"><span>{{ metrics.status }}</span><span>{{ Math.round(level * 100) }}%</span></div>
    <canvas ref="canvas" aria-label="麦克风电平波形"></canvas>
    <div class="level-track"><span class="level-bar" :style="{ width: `${Math.round(level * 100)}%` }"></span></div>
  </section>

  <section class="pipeline-compact">
    <div class="pipeline-row" :class="{ active: metrics.status === '收音' }"><span class="pdot"></span><strong>VAD</strong><small>{{ metrics.vad }}</small></div>
    <div class="pipeline-row"><span class="pdot"></span><strong>ASR</strong><small>{{ metrics.asr }}</small></div>
    <div class="pipeline-row"><span class="pdot"></span><strong>LLM</strong><small>{{ metrics.llm }}</small></div>
    <div class="pipeline-row"><span class="pdot"></span><strong>TTS</strong><small>{{ metrics.tts }}</small></div>
  </section>

  <section class="runtime-chips sidebar-chips">
    <span><b>ASR</b><strong>{{ metrics.asr }}</strong></span>
    <span><b>LLM</b><strong>{{ metrics.llm }}</strong></span>
    <span><b>TTS</b><strong>{{ metrics.tts }}</strong></span>
    <span><b>TRACE</b><strong>{{ metrics.trace }}</strong></span>
  </section>
</template>
