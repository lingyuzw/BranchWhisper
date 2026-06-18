<script setup lang="ts">
import { Cloud, HardDrive } from "@lucide/vue";
import InlineProbe from "@/components/layout/InlineProbe.vue";
import type { PublicConfig } from "@/api/config";

type ProbeStatus = "idle" | "running" | "ok" | "failed" | "warning";

interface ProbeView {
  status: ProbeStatus;
  text: string;
  detail: string;
}

interface AudioPreset {
  id: string;
  provider: string;
  label: string;
  summary: string;
  url: string;
  model: string;
  language?: string;
}

const props = defineProps<{
  form: Partial<PublicConfig>;
  asrApiDisabled: boolean;
  asrProbe: ProbeView;
  localProbe: ProbeView;
  presets: AudioPreset[];
  selectedPresetId: string;
}>();

const emit = defineEmits<{
  setMode: [mode: "local" | "api"];
  presetChange: [id: string];
  runAsrProbe: [];
  copyAsrProbe: [];
  runLocalProbe: [];
  copyLocalProbe: [];
}>();

const form = props.form as Partial<PublicConfig>;

function selectValue(event: Event) {
  return (event.target as HTMLSelectElement).value;
}
</script>

<template>
  <article class="settings-panel settings-section-detached is-active is-current" id="asr">
    <div class="panel-head">
      <div>
        <p class="eyebrow">识别</p>
        <h2>语音识别</h2>
      </div>
      <div class="theme-toggle-group dialog-mode-toggle">
        <button type="button" :class="{ active: form.asr_provider_mode !== 'api' }" @click="emit('setMode', 'local')"><HardDrive :size="15" />本地</button>
        <button type="button" :class="{ active: form.asr_provider_mode === 'api' }" @click="emit('setMode', 'api')"><Cloud :size="15" />API</button>
      </div>
    </div>

    <div class="settings-probe-grid">
      <InlineProbe
        variant="strip"
        title="ASR API 回路"
        summary="用短音频测试当前识别接口。"
        :status="asrProbe.status"
        :status-text="asrProbe.text"
        :detail="asrProbe.detail"
        action-text="测试 ASR"
        :disabled="asrApiDisabled"
        @run="emit('runAsrProbe')"
        @copy="emit('copyAsrProbe')"
      />
      <InlineProbe
        variant="strip"
        title="本地识别服务"
        summary="检查 ASR 服务和主后端状态。"
        :status="localProbe.status"
        :status-text="localProbe.text"
        :detail="localProbe.detail"
        action-text="测试本地"
        @run="emit('runLocalProbe')"
        @copy="emit('copyLocalProbe')"
      />
    </div>

    <section class="audio-engine-card">
      <div class="appearance-card-head"><strong>本地语音识别</strong><small>本地 Qwen3-ASR 服务，仅在本地模式下生效</small></div>
      <div class="form-grid compact" :class="{ 'model-panel-locked': form.asr_provider_mode === 'api' }" data-locked-label="当前使用 API ASR">
        <label><span>ASR Mode</span><select v-model="form.asr_mode" :disabled="form.asr_provider_mode === 'api'"><option value="transcription">transcription</option><option value="chat">chat</option></select></label>
        <label><span>本地模型</span><input v-model="form.asr_model" :disabled="form.asr_provider_mode === 'api'" /></label>
        <label><span>本地超时</span><input v-model.number="form.asr_timeout" :disabled="form.asr_provider_mode === 'api'" type="number" min="5" max="300" step="1" /></label>
        <label class="wide"><span>本地 ASR URL</span><input v-model="form.asr_url" :disabled="form.asr_provider_mode === 'api'" /></label>
      </div>
    </section>

    <section class="audio-engine-card" :class="{ 'model-panel-locked': asrApiDisabled }" data-locked-label="当前使用本地 ASR">
      <div class="appearance-card-head">
        <div><strong>API 语音识别</strong><small>在线 ASR 服务配置，预设不覆盖 API Key</small></div>
        <span class="soft-badge">{{ form.api_asr_provider || "未选择" }}</span>
      </div>
      <div class="form-grid compact">
        <label>
          <span>ASR 预设</span>
          <select :value="selectedPresetId" :disabled="asrApiDisabled" @change="emit('presetChange', selectValue($event))">
            <option value="custom">自定义</option>
            <option v-for="preset in presets" :key="preset.id" :value="preset.id">{{ preset.label }} · {{ preset.model }}</option>
          </select>
        </label>
        <label><span>服务商</span><select v-model="form.api_asr_provider" :disabled="asrApiDisabled"><option value="openai">OpenAI</option><option value="groq">Groq</option><option value="deepgram">Deepgram</option><option value="dashscope">百炼 DashScope</option><option value="custom_openai">自定义 OpenAI</option></select></label>
        <label><span>模型</span><input v-model="form.api_asr_model" :disabled="asrApiDisabled" /></label>
        <label><span>语言</span><input v-model="form.api_asr_language" :disabled="asrApiDisabled" placeholder="zh" /></label>
        <label><span>API 超时</span><input v-model.number="form.api_asr_timeout" :disabled="asrApiDisabled" type="number" min="5" max="180" step="1" /></label>
        <label><span>ASR API Key</span><input v-model="form.api_asr_api_key" :disabled="asrApiDisabled" type="password" :placeholder="form.api_asr_api_key_masked || '留空则保留已保存 Key'" /></label>
        <label class="wide"><span>API ASR URL</span><input v-model="form.api_asr_url" :disabled="asrApiDisabled" /></label>
      </div>
    </section>
  </article>
</template>
