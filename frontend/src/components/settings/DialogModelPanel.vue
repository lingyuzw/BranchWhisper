<script setup lang="ts">
import { Cloud, FileSearch, HardDrive } from "@lucide/vue";
import type { PublicConfig } from "@/api/config";
import InlineProbe from "@/components/layout/InlineProbe.vue";

type ProbeStatus = "idle" | "running" | "ok" | "failed" | "warning";

interface ProbeView {
  status: ProbeStatus;
  text: string;
  detail: string;
}

interface ApiModelPreset {
  id: string;
  label: string;
  summary: string;
  url: string;
  model: string;
}

const props = defineProps<{
  form: Partial<PublicConfig>;
  localDisabled: boolean;
  apiDisabled: boolean;
  llmApiProbe: ProbeView;
  localModelsProbe: ProbeView;
  presets: ApiModelPreset[];
  selectedPresetId: string;
  modelFilePath: string;
}>();

const emit = defineEmits<{
  setMode: [mode: "local" | "api"];
  runLlmProbe: [];
  copyLlmProbe: [];
  runLocalProbe: [];
  copyLocalProbe: [];
  updateModelFilePath: [path: string];
  syncModelFile: [];
  openModelPicker: [];
  presetChange: [event: Event];
}>();

const form = props.form as Partial<PublicConfig>;

function updateModelFilePath(event: Event) {
  emit("updateModelFilePath", (event.target as HTMLInputElement).value);
}
</script>

<template>
  <article class="settings-panel settings-section-detached is-active is-current" id="engine">
    <div class="panel-head">
      <div>
        <p class="eyebrow">模型</p>
        <h2>对话模型</h2>
      </div>
      <span class="soft-badge">当前模式：{{ form.dialog_mode || "local" }}</span>
    </div>

    <div class="dialog-mode-panel">
      <div class="dialog-mode-copy">
        <strong>对话模式</strong>
        <small>同一时间只启用一种模型；本地/API 记忆库自动隔离。</small>
      </div>
      <div class="theme-toggle-group dialog-mode-toggle">
        <button type="button" :class="{ active: form.dialog_mode !== 'api' }" @click="emit('setMode', 'local')"><HardDrive :size="15" />本地模型</button>
        <button type="button" :class="{ active: form.dialog_mode === 'api' }" @click="emit('setMode', 'api')"><Cloud :size="15" />API 模型</button>
      </div>
      <label class="thinking-toggle"><input v-model="form.thinking_enabled" type="checkbox" /> 启用思考模式，仅输出最终结果</label>
    </div>

    <div class="settings-probe-grid">
      <InlineProbe
        variant="strip"
        title="API 对话模型"
        summary="用当前 API 配置发送一次最小请求。"
        :status="llmApiProbe.status"
        :status-text="llmApiProbe.text"
        :detail="llmApiProbe.detail"
        action-text="测试 API"
        :disabled="apiDisabled"
        @run="emit('runLlmProbe')"
        @copy="emit('copyLlmProbe')"
      />
      <InlineProbe
        variant="strip"
        title="本地模型与主后端"
        summary="检查本地服务和主后端状态。"
        :status="localModelsProbe.status"
        :status-text="localModelsProbe.text"
        :detail="localModelsProbe.detail"
        action-text="测试本地"
        @run="emit('runLocalProbe')"
        @copy="emit('copyLocalProbe')"
      />
    </div>

    <section class="local-engine-card" :class="{ 'model-panel-locked': localDisabled }" data-locked-label="当前使用 API 模型，本地模型参数已锁定">
      <div class="appearance-card-head"><strong>本地对话模型</strong><small>仅在本地模式下生效</small></div>
      <div class="form-grid compact">
        <label><span>本地模型别名</span><input v-model="form.llm_model" :disabled="localDisabled" /></label>
        <label><span>温度</span><input v-model.number="form.temperature" :disabled="localDisabled" type="number" min="0" max="1.5" step="0.01" /></label>
        <label><span>最大 Tokens</span><input v-model.number="form.max_tokens" :disabled="localDisabled" type="number" min="32" max="4096" step="1" /></label>
        <label><span>历史轮数</span><input v-model.number="form.history_turns" :disabled="localDisabled" type="number" min="1" max="40" step="1" /></label>
        <label class="wide"><span>本地对话 URL</span><input v-model="form.llm_url" :disabled="localDisabled" /></label>
        <label class="wide model-file-field">
          <span>LLM 模型文件</span>
          <div class="model-file-row">
            <input :value="modelFilePath" :disabled="localDisabled" placeholder="选择或粘贴 .gguf / .safetensors / .bin 模型文件路径" @input="updateModelFilePath" @change="emit('syncModelFile')" />
            <button class="secondary-action" type="button" :disabled="localDisabled" @click="emit('openModelPicker')"><FileSearch :size="16" /> 选择</button>
          </div>
        </label>
      </div>
    </section>

    <section class="api-engine-card" :class="{ 'model-panel-locked': apiDisabled }" data-locked-label="当前使用本地模型，API 参数已锁定">
      <div class="appearance-card-head">
        <div><strong>API 对话模型</strong><small>兼容 OpenAI 格式的服务都填在这里</small></div>
        <span class="soft-badge">预设不覆盖 Key</span>
      </div>
      <div class="form-grid compact">
        <label>
          <span>API 预设</span>
          <select :value="selectedPresetId" :disabled="apiDisabled" @change="emit('presetChange', $event)">
            <option value="custom">自定义</option>
            <option v-for="preset in presets" :key="preset.id" :value="preset.id">{{ preset.label }} · {{ preset.model }}</option>
          </select>
        </label>
        <label class="wide"><span>API 对话 URL</span><input v-model="form.api_llm_url" :disabled="apiDisabled" placeholder="https://api.example.com/v1/chat/completions" /></label>
        <label><span>API 模型</span><input v-model="form.api_llm_model" :disabled="apiDisabled" placeholder="model-name" /></label>
        <label><span>API Key</span><input v-model="form.api_llm_api_key" :disabled="apiDisabled" type="password" :placeholder="form.api_llm_api_key_masked || '留空则保留已保存 Key'" /></label>
        <label><span>温度</span><input v-model.number="form.api_temperature" :disabled="apiDisabled" type="number" min="0" max="1.5" step="0.01" /></label>
        <label><span>最大 Tokens</span><input v-model.number="form.api_max_tokens" :disabled="apiDisabled" type="number" min="32" max="8192" step="1" /></label>
        <label><span>历史轮数</span><input v-model.number="form.api_history_turns" :disabled="apiDisabled" type="number" min="1" max="40" step="1" /></label>
      </div>
    </section>

    <section class="api-engine-card context-compaction-card">
      <div class="appearance-card-head"><strong>上下文压缩</strong><small>聊久后保留摘要和最近对话，减少遗忘与延迟</small></div>
      <div class="form-grid compact">
        <label><span>启用</span><select v-model="form.context_compaction_enabled"><option :value="true">启用</option><option :value="false">关闭</option></select></label>
        <label><span>窗口 Tokens</span><input v-model.number="form.context_window_tokens" type="number" min="2048" max="262144" step="512" /></label>
        <label><span>触发比例</span><input v-model.number="form.context_compaction_ratio" type="number" min="0.4" max="0.95" step="0.05" /></label>
        <label><span>保留最近轮数</span><input v-model.number="form.context_keep_recent_turns" type="number" min="1" max="40" step="1" /></label>
        <label><span>摘要长度</span><input v-model.number="form.context_summary_max_chars" type="number" min="400" max="12000" step="100" /></label>
        <label><span>摘要层数</span><input v-model.number="form.context_summary_max_layers" type="number" min="1" max="8" step="1" /></label>
      </div>
    </section>
  </article>
</template>
