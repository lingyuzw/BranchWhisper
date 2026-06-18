<script setup lang="ts">
import type { PublicConfig } from "@/api/config";

const props = defineProps<{
  form: Partial<PublicConfig>;
}>();

const form = props.form;
</script>

<template>
  <article class="settings-panel settings-section-detached is-active is-current" id="vad">
    <div class="panel-head">
      <div><p class="eyebrow">检测</p><h2>语音检测</h2></div>
    </div>
    <div class="form-grid compact">
      <label><span>触发阈值</span><input v-model.number="form.vad_threshold" type="number" min="0.1" max="0.9" step="0.01" /></label>
      <label><span>静默 ms</span><input v-model.number="form.vad_min_silence_ms" type="number" min="120" max="1500" step="10" /></label>
      <label><span>语音补边 ms</span><input v-model.number="form.vad_speech_pad_ms" type="number" min="0" max="500" step="10" /></label>
      <label><span>前置缓存 ms</span><input v-model.number="form.pre_speech_ms" type="number" min="0" max="2000" step="10" /></label>
      <label><span>最短语音 ms</span><input v-model.number="form.min_utterance_ms" type="number" min="80" max="5000" step="10" /></label>
      <label><span>最长语音 sec</span><input v-model.number="form.max_utterance_sec" type="number" min="2" max="180" step="1" /></label>
    </div>
  </article>
</template>
