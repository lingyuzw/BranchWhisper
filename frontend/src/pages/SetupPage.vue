<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { CheckCircle2, Cloud, MessageSquareText, MicVocal, Rocket, ShieldCheck, Volume2 } from "@lucide/vue";
import { runAsrApiDiagnostic, runLlmApiDiagnostic, runTtsApiDiagnostic } from "@/api/diagnostics";
import { loadConfig, saveConfig, type PublicConfig } from "@/api/config";
import PageHeader from "@/components/ui/PageHeader.vue";
import StatusSummary from "@/components/ui/StatusSummary.vue";
import { useUiStore } from "@/stores/ui";

type StepId = "welcome" | "llm" | "asr" | "tts" | "review";
type ProbeStatus = "idle" | "running" | "ok" | "failed" | "warning";

interface Preset {
  id: string;
  provider?: string;
  label: string;
  summary: string;
  url: string;
  model: string;
  language?: string;
  voice?: string;
  voiceMode?: "builtin" | "manual" | "cloned";
  format?: "pcm" | "wav" | "mp3";
}

const router = useRouter();
const ui = useUiStore();
const form = reactive<Partial<PublicConfig>>({});
const activeStep = ref<StepId>("welcome");
const loading = ref(false);
const saving = ref(false);
const asrSkipped = ref(false);
const ttsSkipped = ref(false);
const probeState = reactive<Record<"llm" | "asr" | "tts", { status: ProbeStatus; text: string; detail: string }>>({
  llm: { status: "idle", text: "未检测", detail: "" },
  asr: { status: "idle", text: "可跳过", detail: "" },
  tts: { status: "idle", text: "可跳过", detail: "" },
});

const chatPresets: Preset[] = [
  { id: "dashscope", label: "百炼 Qwen", summary: "阿里云百炼 OpenAI 兼容接口", url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", model: "qwen-plus" },
  { id: "openai", label: "OpenAI", summary: "官方 Chat Completions", url: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini" },
  { id: "deepseek", label: "DeepSeek", summary: "DeepSeek 官方兼容接口", url: "https://api.deepseek.com/chat/completions", model: "deepseek-chat" },
  { id: "custom", label: "自定义", summary: "任何 OpenAI 兼容接口", url: "", model: "" },
];

const asrPresets: Preset[] = [
  { id: "openai-mini", provider: "openai", label: "OpenAI 轻量", summary: "gpt-4o-mini-transcribe，成本和延迟较低", url: "https://api.openai.com/v1/audio/transcriptions", model: "gpt-4o-mini-transcribe", language: "zh" },
  { id: "groq-whisper", provider: "groq", label: "Groq Whisper", summary: "whisper-large-v3-turbo，适合极速识别", url: "https://api.groq.com/openai/v1/audio/transcriptions", model: "whisper-large-v3-turbo", language: "zh" },
  { id: "dashscope-qwen-asr", provider: "dashscope", label: "百炼 Qwen-ASR", summary: "qwen3-asr-flash，同步识别", url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", model: "qwen3-asr-flash", language: "zh" },
  { id: "custom", provider: "custom_openai", label: "自定义", summary: "兼容当前后端 ASR API 适配", url: "", model: "", language: "zh" },
];

const ttsPresets: Preset[] = [
  { id: "openai-mini", provider: "openai", label: "OpenAI 自然音色", summary: "gpt-4o-mini-tts，内置音色", url: "https://api.openai.com/v1/audio/speech", model: "gpt-4o-mini-tts", voice: "coral", voiceMode: "builtin", format: "pcm" },
  { id: "eleven-flash", provider: "elevenlabs", label: "ElevenLabs 极速", summary: "eleven_flash_v2_5，适合低延迟语音", url: "https://api.elevenlabs.io/v1/text-to-speech", model: "eleven_flash_v2_5", voiceMode: "manual", format: "pcm" },
  { id: "dashscope-qwen-tts", provider: "dashscope", label: "百炼 Qwen-TTS", summary: "Qwen 语音合成，返回 WAV 后内部处理", url: "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation", model: "qwen-tts", voice: "Cherry", voiceMode: "builtin", format: "wav" },
  { id: "custom", provider: "custom_openai", label: "自定义", summary: "兼容当前后端 TTS API 适配", url: "", model: "", voiceMode: "builtin", format: "pcm" },
];

const steps = computed(() => [
  { id: "welcome" as StepId, title: "选择路径", summary: "API 先可用，本地模型稍后配置", icon: Rocket, status: "ok" },
  { id: "llm" as StepId, title: "对话模型", summary: "必填，负责回复生成", icon: MessageSquareText, status: probeState.llm.status },
  { id: "asr" as StepId, title: "语音识别", summary: asrSkipped.value ? "已跳过，可稍后开启" : "可选，负责语音输入", icon: MicVocal, status: asrSkipped.value ? "warning" : probeState.asr.status },
  { id: "tts" as StepId, title: "语音合成", summary: ttsSkipped.value ? "已跳过，可稍后开启" : "可选，负责语音输出", icon: Volume2, status: ttsSkipped.value ? "warning" : probeState.tts.status },
  { id: "review" as StepId, title: "完成检测", summary: "保存 API 模式并进入对话", icon: ShieldCheck, status: readyToSave.value ? "ok" : "idle" },
]);

const summaryItems = computed(() => [
  { label: "上手路径", value: "API 模式", detail: "零环境默认", tone: "info" as const },
  { label: "本地依赖", value: "不需要", detail: "WSL/CUDA/conda 稍后再配", tone: "ok" as const },
  { label: "必填项目", value: "LLM", detail: "ASR/TTS 可跳过", tone: "neutral" as const },
  { label: "保存后", value: "进入对话", detail: "可以稍后配置本地模型", tone: "ok" as const },
]);

const readyToSave = computed(() => Boolean((form.api_llm_url || "").trim() && (form.api_llm_model || "").trim()));
const activeStepIndex = computed(() => steps.value.findIndex((step) => step.id === activeStep.value));

onMounted(async () => {
  await hydrate();
});

async function hydrate() {
  loading.value = true;
  try {
    const config = await loadConfig();
    Object.assign(form, config);
    applyChatPreset(chatPresets[0], false);
    if (!form.api_asr_url) applyAsrPreset(asrPresets[0], false);
    if (!form.api_tts_url) applyTtsPreset(ttsPresets[0], false);
    form.api_temperature ??= 0.7;
    form.api_max_tokens ??= 1024;
    form.api_history_turns ??= 12;
    form.api_asr_timeout ??= 60;
    form.api_tts_sample_rate ??= 24000;
  } catch (error) {
    ui.error(error instanceof Error ? error.message : "配置加载失败");
  } finally {
    loading.value = false;
  }
}

function stepClass(status: string) {
  return {
    ok: status === "ok",
    running: status === "running",
    danger: status === "failed",
    warning: status === "warning",
  };
}

function probeClass(status: ProbeStatus) {
  return {
    ok: status === "ok",
    running: status === "running",
    danger: status === "failed",
    warning: status === "warning",
  };
}

function applyChatPreset(preset: Preset, overwriteKey = true) {
  if (preset.url) form.api_llm_url = preset.url;
  if (preset.model) form.api_llm_model = preset.model;
  if (overwriteKey) form.api_llm_api_key = form.api_llm_api_key || "";
}

function applyAsrPreset(preset: Preset, overwriteKey = true) {
  form.api_asr_provider = preset.provider || "custom_openai";
  if (preset.url) form.api_asr_url = preset.url;
  if (preset.model) form.api_asr_model = preset.model;
  if (preset.language) form.api_asr_language = preset.language;
  if (overwriteKey) form.api_asr_api_key = form.api_asr_api_key || "";
  asrSkipped.value = false;
}

function applyTtsPreset(preset: Preset, overwriteKey = true) {
  form.api_tts_provider = preset.provider || "custom_openai";
  if (preset.url) form.api_tts_url = preset.url;
  if (preset.model) form.api_tts_model = preset.model;
  if (preset.voiceMode) form.api_tts_voice_mode = preset.voiceMode;
  if (preset.voice) form.api_tts_voice = preset.voice;
  if (preset.format) form.api_tts_format = preset.format;
  if (overwriteKey) form.api_tts_api_key = form.api_tts_api_key || "";
  ttsSkipped.value = false;
}

async function saveApiDraft(extra: Partial<PublicConfig> = {}) {
  const payload: Partial<PublicConfig> = {
    dialog_mode: "api",
    api_llm_url: form.api_llm_url,
    api_llm_model: form.api_llm_model,
    api_llm_api_key: form.api_llm_api_key,
    api_temperature: form.api_temperature,
    api_max_tokens: form.api_max_tokens,
    api_history_turns: form.api_history_turns,
    ...extra,
  };
  const saved = await saveConfig(payload);
  Object.assign(form, saved);
}

async function runLlmProbe() {
  probeState.llm = { status: "running", text: "检测中", detail: "正在用当前 LLM API 发送最小请求" };
  try {
    await saveApiDraft();
    const result = await runLlmApiDiagnostic();
    probeState.llm = {
      status: result.ok ? "ok" : "failed",
      text: result.ok ? "LLM API 可用" : "LLM API 失败",
      detail: result.ok ? `${result.model} · ${result.latency_ms ?? "-"} ms` : result.error || "请检查 URL、模型名和 API Key",
    };
  } catch (error) {
    probeState.llm = { status: "failed", text: "LLM API 失败", detail: error instanceof Error ? error.message : "请求失败" };
  }
}

async function runAsrProbe() {
  asrSkipped.value = false;
  probeState.asr = { status: "running", text: "检测中", detail: "正在保存 ASR API 配置并测试短音频" };
  try {
    await saveApiDraft({
      asr_provider_mode: "api",
      api_asr_provider: form.api_asr_provider,
      api_asr_url: form.api_asr_url,
      api_asr_model: form.api_asr_model,
      api_asr_api_key: form.api_asr_api_key,
      api_asr_language: form.api_asr_language,
      api_asr_timeout: form.api_asr_timeout,
    });
    const result = await runAsrApiDiagnostic();
    probeState.asr = {
      status: result.ok ? "ok" : "failed",
      text: result.ok ? "ASR API 可用" : "ASR API 失败",
      detail: result.message || result.error || result.hint || "请检查识别服务配置",
    };
  } catch (error) {
    probeState.asr = { status: "failed", text: "ASR API 失败", detail: error instanceof Error ? error.message : "请求失败" };
  }
}

async function runTtsProbe() {
  ttsSkipped.value = false;
  probeState.tts = { status: "running", text: "检测中", detail: "正在保存 TTS API 配置并生成短音频" };
  try {
    await saveApiDraft({
      tts_provider_mode: "api",
      api_tts_provider: form.api_tts_provider,
      api_tts_url: form.api_tts_url,
      api_tts_model: form.api_tts_model,
      api_tts_api_key: form.api_tts_api_key,
      api_tts_voice_mode: form.api_tts_voice_mode,
      api_tts_voice: form.api_tts_voice,
      api_tts_format: form.api_tts_format,
      api_tts_sample_rate: form.api_tts_sample_rate,
    });
    const result = await runTtsApiDiagnostic();
    probeState.tts = {
      status: result.ok ? "ok" : "failed",
      text: result.ok ? "TTS API 可用" : "TTS API 失败",
      detail: result.message || result.error || result.hint || "请检查语音合成配置",
    };
  } catch (error) {
    probeState.tts = { status: "failed", text: "TTS API 失败", detail: error instanceof Error ? error.message : "请求失败" };
  }
}

function skipAsr() {
  asrSkipped.value = true;
  probeState.asr = { status: "warning", text: "已跳过", detail: "可以稍后在配置页开启 API 语音识别" };
  activeStep.value = "tts";
}

function skipTts() {
  ttsSkipped.value = true;
  probeState.tts = { status: "warning", text: "已跳过", detail: "可以稍后在配置页开启 API 语音合成" };
  activeStep.value = "review";
}

async function saveAndEnter() {
  if (!readyToSave.value) {
    ui.warning("请先填写对话模型 API URL 和模型名。");
    activeStep.value = "llm";
    return;
  }
  saving.value = true;
  try {
    const payload: Partial<PublicConfig> = {
      dialog_mode: "api",
      api_llm_url: form.api_llm_url,
      api_llm_model: form.api_llm_model,
      api_llm_api_key: form.api_llm_api_key,
      api_temperature: form.api_temperature,
      api_max_tokens: form.api_max_tokens,
      api_history_turns: form.api_history_turns,
      asr_provider_mode: asrSkipped.value ? form.asr_provider_mode || "local" : "api",
      api_asr_provider: form.api_asr_provider,
      api_asr_url: form.api_asr_url,
      api_asr_model: form.api_asr_model,
      api_asr_api_key: form.api_asr_api_key,
      api_asr_language: form.api_asr_language,
      api_asr_timeout: form.api_asr_timeout,
      tts_provider_mode: ttsSkipped.value ? form.tts_provider_mode || "local" : "api",
      api_tts_provider: form.api_tts_provider,
      api_tts_url: form.api_tts_url,
      api_tts_model: form.api_tts_model,
      api_tts_api_key: form.api_tts_api_key,
      api_tts_voice_mode: form.api_tts_voice_mode,
      api_tts_voice: form.api_tts_voice,
      api_tts_format: form.api_tts_format,
      api_tts_sample_rate: form.api_tts_sample_rate,
    };
    const saved = await saveConfig(payload);
    Object.assign(form, saved);
    ui.success("API 快速模式已保存。");
    await router.push("/");
  } catch (error) {
    ui.error(error instanceof Error ? error.message : "保存失败");
  } finally {
    saving.value = false;
  }
}

function nextStep() {
  const ids = steps.value.map((step) => step.id);
  const next = ids[Math.min(ids.length - 1, activeStepIndex.value + 1)];
  activeStep.value = next;
}
</script>

<template>
  <main class="page-view">
    <section class="setup-page workspace-page">
      <PageHeader
        title="快速开始：API 模式"
        subtitle="不需要安装 WSL、CUDA、conda 或本地模型。先填 API Key 跑起来，后面可以稍后配置本地模型。"
        status="零环境可用"
        tone="ok"
      >
        <template #actions>
          <button class="secondary-action" type="button" @click="router.push('/settings')">打开完整配置</button>
          <button class="primary-action" type="button" :disabled="saving" @click="saveAndEnter">
            <Rocket :size="16" />{{ saving ? "保存中..." : "保存并进入对话" }}
          </button>
        </template>
      </PageHeader>

      <StatusSummary :items="summaryItems" />

      <div class="setup-workspace">
        <aside class="setup-step-rail">
          <button
            v-for="(step, index) in steps"
            :key="step.id"
            class="setup-step"
            :class="[{ active: activeStep === step.id }, stepClass(String(step.status))]"
            type="button"
            @click="activeStep = step.id"
          >
            <span class="setup-step-index">{{ index + 1 }}</span>
            <component :is="step.icon" :size="17" />
            <span><strong>{{ step.title }}</strong><small>{{ step.summary }}</small></span>
          </button>
        </aside>

        <section class="setup-panel">
          <div v-if="loading" class="setup-loading">正在读取当前配置...</div>

          <template v-else-if="activeStep === 'welcome'">
            <div class="setup-panel-head">
              <p class="eyebrow">推荐路径</p>
              <h2>先用 API 进入应用</h2>
              <p>BranchWhisper 的本地 Qwen3、CosyVoice、CUDA 都可以后续增强。第一次打开时，最重要的是先能对话、能验证、能保存。</p>
            </div>
            <div class="setup-choice-grid">
              <article class="setup-choice recommended">
                <Cloud :size="20" />
                <strong>快速开始：API 模式</strong>
                <span>适合没有任何本地环境的新电脑。配置一个 LLM API 就能先开始文字对话。</span>
              </article>
              <article class="setup-choice">
                <CheckCircle2 :size="20" />
                <strong>本地模型稍后配置</strong>
                <span>需要 WSL、conda、CUDA 和模型目录。这里不阻塞你首次使用。</span>
              </article>
            </div>
            <div class="setup-actions">
              <button class="secondary-action" type="button" @click="activeStep = 'llm'">开始配置 API</button>
            </div>
          </template>

          <template v-else-if="activeStep === 'llm'">
            <div class="setup-panel-head">
              <p class="eyebrow">必填</p>
              <h2>对话模型 API</h2>
              <p>这是唯一必填项。支持 OpenAI 兼容的 Chat Completions 接口。</p>
            </div>
            <div class="setup-preset-grid">
              <button v-for="preset in chatPresets" :key="preset.id" class="setup-preset" type="button" @click="applyChatPreset(preset)">
                <strong>{{ preset.label }}</strong>
                <span>{{ preset.summary }}</span>
              </button>
            </div>
            <div class="setup-form-grid">
              <label class="wide"><span>API URL</span><input v-model="form.api_llm_url" placeholder="https://api.example.com/v1/chat/completions" /></label>
              <label><span>模型名</span><input v-model="form.api_llm_model" placeholder="qwen-plus" /></label>
              <label><span>API Key</span><input v-model="form.api_llm_api_key" type="password" :placeholder="form.api_llm_api_key_masked || '留空则保留已保存 Key'" /></label>
              <label><span>温度</span><input v-model.number="form.api_temperature" type="number" min="0" max="1.5" step="0.01" /></label>
              <label><span>最大 Tokens</span><input v-model.number="form.api_max_tokens" type="number" min="32" max="8192" step="1" /></label>
            </div>
            <div class="setup-probe" :class="probeClass(probeState.llm.status)">
              <strong>{{ probeState.llm.text }}</strong>
              <span>{{ probeState.llm.detail || "建议保存前测试一次，确认 URL、模型和 Key 可用。" }}</span>
              <button class="secondary-action" type="button" @click="runLlmProbe">测试 LLM API</button>
            </div>
          </template>

          <template v-else-if="activeStep === 'asr'">
            <div class="setup-panel-head">
              <p class="eyebrow">可选</p>
              <h2>语音识别 API</h2>
              <p>需要语音输入时再配置。跳过后仍然可以文字对话。</p>
            </div>
            <div class="setup-preset-grid">
              <button v-for="preset in asrPresets" :key="preset.id" class="setup-preset" type="button" @click="applyAsrPreset(preset)">
                <strong>{{ preset.label }}</strong>
                <span>{{ preset.summary }}</span>
              </button>
            </div>
            <div class="setup-form-grid">
              <label><span>服务商</span><input v-model="form.api_asr_provider" placeholder="openai" /></label>
              <label><span>模型名</span><input v-model="form.api_asr_model" placeholder="gpt-4o-mini-transcribe" /></label>
              <label><span>语言</span><input v-model="form.api_asr_language" placeholder="zh" /></label>
              <label><span>API Key</span><input v-model="form.api_asr_api_key" type="password" :placeholder="form.api_asr_api_key_masked || '留空则保留已保存 Key'" /></label>
              <label class="wide"><span>ASR API URL</span><input v-model="form.api_asr_url" /></label>
            </div>
            <div class="setup-probe" :class="probeClass(probeState.asr.status)">
              <strong>{{ probeState.asr.text }}</strong>
              <span>{{ probeState.asr.detail || "可以跳过，不影响文字对话。" }}</span>
              <div class="setup-inline-actions">
                <button class="secondary-action" type="button" @click="runAsrProbe">测试 ASR API</button>
                <button class="ghost-action" type="button" @click="skipAsr">跳过语音输入</button>
              </div>
            </div>
          </template>

          <template v-else-if="activeStep === 'tts'">
            <div class="setup-panel-head">
              <p class="eyebrow">可选</p>
              <h2>语音合成 API</h2>
              <p>需要语音回复时再配置。跳过后先使用文字回复。</p>
            </div>
            <div class="setup-preset-grid">
              <button v-for="preset in ttsPresets" :key="preset.id" class="setup-preset" type="button" @click="applyTtsPreset(preset)">
                <strong>{{ preset.label }}</strong>
                <span>{{ preset.summary }}</span>
              </button>
            </div>
            <div class="setup-form-grid">
              <label><span>服务商</span><input v-model="form.api_tts_provider" placeholder="openai" /></label>
              <label><span>模型名</span><input v-model="form.api_tts_model" placeholder="gpt-4o-mini-tts" /></label>
              <label><span>音色</span><input v-model="form.api_tts_voice" placeholder="coral" /></label>
              <label><span>API Key</span><input v-model="form.api_tts_api_key" type="password" :placeholder="form.api_tts_api_key_masked || '留空则保留已保存 Key'" /></label>
              <label class="wide"><span>TTS API URL</span><input v-model="form.api_tts_url" /></label>
            </div>
            <div class="setup-probe" :class="probeClass(probeState.tts.status)">
              <strong>{{ probeState.tts.text }}</strong>
              <span>{{ probeState.tts.detail || "可以跳过，不影响文字对话。" }}</span>
              <div class="setup-inline-actions">
                <button class="secondary-action" type="button" @click="runTtsProbe">测试 TTS API</button>
                <button class="ghost-action" type="button" @click="skipTts">跳过语音输出</button>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="setup-panel-head">
              <p class="eyebrow">确认</p>
              <h2>保存 API 快速模式</h2>
              <p>保存后会进入对话页。本地运行时可以稍后配置本地模型，不会阻塞现在使用。</p>
            </div>
            <div class="setup-review-grid">
              <div><span>对话模型</span><strong>{{ form.api_llm_model || "未填写" }}</strong></div>
              <div><span>语音输入</span><strong>{{ asrSkipped ? "已跳过" : form.api_asr_model || "未填写" }}</strong></div>
              <div><span>语音输出</span><strong>{{ ttsSkipped ? "已跳过" : form.api_tts_model || "未填写" }}</strong></div>
            </div>
            <div class="setup-actions">
              <button class="secondary-action" type="button" @click="activeStep = 'llm'">返回检查</button>
              <button class="primary-action" type="button" :disabled="saving" @click="saveAndEnter">
                <Rocket :size="16" />{{ saving ? "保存中..." : "保存并进入对话" }}
              </button>
            </div>
          </template>

          <footer v-if="activeStep !== 'review'" class="setup-footer-actions">
            <button class="secondary-action" type="button" :disabled="activeStepIndex <= 0" @click="activeStep = steps[Math.max(0, activeStepIndex - 1)].id">上一步</button>
            <button class="secondary-action" type="button" @click="nextStep">下一步</button>
          </footer>
        </section>
      </div>
    </section>
  </main>
</template>
