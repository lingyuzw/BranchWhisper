<script setup lang="ts">
defineProps<{
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
</script>

<template>
  <section class="sidebar-scope">
    <div class="scope-header"><span>{{ metrics.status }}</span><span>{{ Math.round(level * 100) }}%</span></div>
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
