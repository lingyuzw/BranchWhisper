<script setup lang="ts">
import { ref } from "vue";
import { Cloud, HardDrive, Volume2 } from "@lucide/vue";
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
  voice?: string;
  voiceMode?: "builtin" | "manual" | "cloned";
  format?: "pcm" | "wav" | "mp3";
  latency?: "quality" | "balanced" | "fast";
  cloneSupport?: boolean;
}

const props = defineProps<{
  form: Partial<PublicConfig>;
  ttsApiDisabled: boolean;
  ttsProbe: ProbeView;
  presets: AudioPreset[];
  selectedPresetId: string;
  activeVoiceLabel: string;
  voiceStateText: string;
  voiceHintText: string;
  previewText: string;
  previewUrl: string;
  previewLoading: boolean;
  previewStatus: string;
}>();

const emit = defineEmits<{
  setMode: [mode: "local" | "api"];
  presetChange: [id: string];
  runTtsProbe: [];
  copyTtsProbe: [];
  voiceSampleSelected: [event: Event];
  updatePreviewText: [text: string];
  runPreview: [];
}>();

const form = props.form as Partial<PublicConfig>;
const voiceSampleInput = ref<HTMLInputElement | null>(null);

function selectValue(event: Event) {
  return (event.target as HTMLSelectElement).value;
}

function inputValue(event: Event) {
  return (event.target as HTMLInputElement).value;
}
</script>

<template>
  <article class="settings-panel settings-section-detached is-active is-current" id="tts">
    <div class="panel-head">
      <div><p class="eyebrow">语音</p><h2>语音合成</h2></div>
      <div class="theme-toggle-group dialog-mode-toggle">
        <button type="button" :class="{ active: form.tts_provider_mode !== 'api' }" @click="emit('setMode', 'local')"><HardDrive :size="15" />本地</button>
        <button type="button" :class="{ active: form.tts_provider_mode === 'api' }" @click="emit('setMode', 'api')"><Cloud :size="15" />API</button>
      </div>
    </div>

    <div class="settings-probe-grid">
      <InlineProbe
        variant="strip"
        title="TTS API 回路"
        summary="用当前默认声音生成一段短音频。"
        :status="ttsProbe.status"
        :status-text="ttsProbe.text"
        :detail="ttsProbe.detail"
        action-text="测试 TTS"
        :disabled="ttsApiDisabled"
        @run="emit('runTtsProbe')"
        @copy="emit('copyTtsProbe')"
      />
    </div>

    <section class="audio-engine-card">
      <div class="appearance-card-head"><strong>本地语音合成</strong><small>使用本地 TTS 服务</small></div>
      <div class="form-grid compact" :class="{ 'model-panel-locked': form.tts_provider_mode === 'api' }" data-locked-label="当前使用 API TTS">
        <label><span>Web TTS</span><select v-model="form.tts_enabled"><option :value="true">启用</option><option :value="false">关闭</option></select></label>
        <label><span>本地模型</span><input v-model="form.tts_model" :disabled="form.tts_provider_mode === 'api'" /></label>
        <label class="wide"><span>TTS URL</span><input v-model="form.tts_url" :disabled="form.tts_provider_mode === 'api'" /></label>
        <label><span>语速</span><input v-model.number="form.tts_speed" :disabled="form.tts_provider_mode === 'api'" type="number" min="0.7" max="1.5" step="0.01" /></label>
        <label><span>音量</span><input v-model.number="form.tts_volume" type="number" min="0.05" max="1.5" step="0.01" /></label>
        <label><span>采样率</span><input v-model.number="form.tts_sample_rate" :disabled="form.tts_provider_mode === 'api'" type="number" min="8000" max="48000" step="1000" /></label>
        <label><span>随机种子</span><input v-model.number="form.tts_seed" :disabled="form.tts_provider_mode === 'api'" type="number" min="-1" max="999999" step="1" /></label>
        <label><span>淡入淡出 ms</span><input v-model.number="form.tts_fade_ms" type="number" min="0" max="2000" step="10" /></label>
      </div>
    </section>

    <section class="audio-engine-card" :class="{ 'model-panel-locked': ttsApiDisabled }" data-locked-label="当前使用本地 TTS">
      <div class="appearance-card-head">
        <div><strong>API 语音合成</strong><small>预设只填模型和协议，不覆盖 API Key</small></div>
        <span class="soft-badge">{{ voiceStateText }}</span>
      </div>
      <div class="voice-state-strip" :class="{ warning: form.api_tts_voice_mode === 'cloned' && !form.api_tts_voice_id }">
        <Volume2 :size="15" />
        <span>{{ activeVoiceLabel }}</span>
        <small>{{ voiceHintText }}</small>
      </div>
      <div class="form-grid compact">
        <label>
          <span>TTS 预设</span>
          <select :value="selectedPresetId" :disabled="ttsApiDisabled" @change="emit('presetChange', selectValue($event))">
            <option value="custom">自定义</option>
            <option v-for="preset in presets" :key="preset.id" :value="preset.id">{{ preset.label }} · {{ preset.model }}</option>
          </select>
        </label>
        <label><span>服务商</span><select v-model="form.api_tts_provider" :disabled="ttsApiDisabled"><option value="openai">OpenAI</option><option value="elevenlabs">ElevenLabs</option><option value="dashscope">百炼 DashScope</option><option value="custom_openai">自定义 OpenAI</option></select></label>
        <label><span>模型</span><input v-model="form.api_tts_model" :disabled="ttsApiDisabled" /></label>
        <label><span>API Key</span><input v-model="form.api_tts_api_key" :disabled="ttsApiDisabled" type="password" :placeholder="form.api_tts_api_key_masked || '留空则保留已保存 Key'" /></label>
        <label class="wide"><span>API TTS URL</span><input v-model="form.api_tts_url" :disabled="ttsApiDisabled" /></label>
        <label><span>音色来源</span><select v-model="form.api_tts_voice_mode" :disabled="ttsApiDisabled"><option value="builtin">内置音色</option><option value="manual">远程 Voice ID</option><option value="cloned">本地参考音频</option></select></label>
        <label><span>内置音色</span><input v-model="form.api_tts_voice" :disabled="ttsApiDisabled || form.api_tts_voice_mode !== 'builtin'" placeholder="coral" /></label>
        <label><span>Voice ID</span><input v-model="form.api_tts_voice_id" :disabled="ttsApiDisabled || form.api_tts_voice_mode === 'builtin'" placeholder="远程 voice_id" /></label>
        <label><span>声音名称</span><input v-model="form.api_tts_voice_name" :disabled="ttsApiDisabled" placeholder="满穗默认声音" /></label>
        <label class="wide"><span>语气指令</span><input v-model="form.api_tts_instructions" :disabled="ttsApiDisabled" /></label>
        <label><span>输出格式</span><select v-model="form.api_tts_format" :disabled="ttsApiDisabled"><option value="pcm">PCM · 当前链路</option></select></label>
        <label><span>API 采样率</span><input v-model.number="form.api_tts_sample_rate" :disabled="ttsApiDisabled" type="number" min="8000" max="48000" step="1000" /></label>
        <label><span>API 语速</span><input v-model.number="form.api_tts_speed" :disabled="ttsApiDisabled" type="number" min="0.7" max="1.5" step="0.01" /></label>
        <label><span>生成模式</span><select v-model="form.api_tts_latency_mode" :disabled="ttsApiDisabled"><option value="quality">质量优先</option><option value="balanced">均衡</option><option value="fast">极速生成</option></select></label>
      </div>
    </section>

    <section class="audio-engine-card voice-preview-card">
      <div class="appearance-card-head">
        <div><strong>音色与试听</strong><small>上传参考音频后，用当前默认音色生成一段可播放测试</small></div>
        <span class="soft-badge">{{ form.api_tts_voice_profile_id || "未上传" }}</span>
      </div>
      <div class="voice-preview-layout">
        <div class="voice-clone-strip">
          <input ref="voiceSampleInput" class="visually-hidden" type="file" accept="audio/wav,audio/mpeg,audio/mp3,audio/ogg,audio/webm" @change="emit('voiceSampleSelected', $event)" />
          <button class="secondary-action" type="button" :disabled="ttsApiDisabled" @click="voiceSampleInput?.click()"><Volume2 :size="15" />上传参考音频</button>
          <span>{{ form.api_tts_voice_name || "建议 10-20 秒、无背景噪声、只包含目标音色。" }}</span>
        </div>
        <div class="tts-preview-box">
          <label class="wide">
            <span>试听文本</span>
            <input :value="previewText" :disabled="previewLoading" placeholder="你好，今天过得怎么样。" @input="emit('updatePreviewText', inputValue($event))" />
          </label>
          <div class="tts-preview-actions">
            <button class="secondary-action" type="button" :disabled="previewLoading" @click="emit('runPreview')">
              <Volume2 :size="15" />{{ previewLoading ? "生成中..." : "生成试听" }}
            </button>
            <span>{{ previewStatus || "会先保存当前语音配置，再用当前音色生成 WAV。" }}</span>
          </div>
          <audio v-if="previewUrl" class="tts-preview-player" :src="previewUrl" controls></audio>
        </div>
      </div>
    </section>
  </article>
</template>
