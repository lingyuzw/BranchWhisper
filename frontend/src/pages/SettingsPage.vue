<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import {
  Bot,
  Cloud,
  Cpu,
  Globe2,
  HardDrive,
  ImagePlus,
  Library,
  MessageSquareText,
  MicVocal,
  Moon,
  Palette,
  Save,
  Settings2,
  Sparkles,
  Sun,
  Terminal,
  Volume2,
} from "@lucide/vue";
import { uploadAvatar } from "@/api/assets";
import { useAppStore } from "@/stores/app";
import type { PublicConfig } from "@/api/config";
import { fileToDataUrl } from "@/utils/files";

const app = useAppStore();
const router = useRouter();
const form = reactive<Partial<PublicConfig>>({});
const userAvatarInput = ref<HTMLInputElement | null>(null);
const assistantAvatarInput = ref<HTMLInputElement | null>(null);
const localDisabled = computed(() => form.dialog_mode === "api");
const apiDisabled = computed(() => form.dialog_mode === "local");

watch(
  () => app.config,
  (config) => {
    if (!config) return;
    Object.assign(form, config);
  },
  { immediate: true },
);

async function saveAll() {
  await app.saveConfig({ ...form });
}

async function openAssets() {
  await saveAll();
  await router.push("/assets");
}

function setMode(mode: "local" | "api") {
  form.dialog_mode = mode;
}

async function handleAvatarSelected(event: Event, target: "user" | "assistant") {
  const input = event.target as HTMLInputElement;
  const file = Array.from(input.files || []).find((item) => item.type.startsWith("image/"));
  input.value = "";
  if (!file) return;
  const dataUrl = await fileToDataUrl(file);
  const result = await uploadAvatar(dataUrl);
  const url = result.asset.url || "";
  if (target === "user") form.web_user_avatar_url = url;
  else form.web_assistant_avatar_url = url;
  await saveAll();
}

async function clearAvatar(target: "user" | "assistant") {
  if (target === "user") form.web_user_avatar_url = "";
  else form.web_assistant_avatar_url = "";
  await saveAll();
}
</script>

<template>
  <main class="page-view">
    <div class="settings-page">
      <aside class="settings-nav">
        <p class="eyebrow">BranchWhisper</p>
        <h1>配置中心</h1>
        <a href="#appearance"><Palette :size="16" />外观</a>
        <a href="#engine"><Cpu :size="16" />对话模型</a>
        <a href="#tools"><Globe2 :size="16" />联网工具</a>
        <a href="#dialogFeatures"><Library :size="16" />素材与对话</a>
        <a href="#proactive"><Sparkles :size="16" />主动性</a>
        <a href="#botProfiles"><Bot :size="16" />人格</a>
        <a href="#prompt"><MessageSquareText :size="16" />Prompt</a>
        <a href="#tts"><Volume2 :size="16" />语音合成</a>
        <a href="#vad"><MicVocal :size="16" />语音检测</a>
        <a href="#commands"><Terminal :size="16" />服务命令</a>
        <button class="primary-action full settings-save-main" type="button" @click="saveAll">
          <Save :size="16" /> 应用全部配置
        </button>
      </aside>

      <section class="settings-content">
        <section class="settings-hero">
          <div>
            <p class="eyebrow">Control Room</p>
            <h2>本地模型与对话能力</h2>
            <p>常用配置直接展开，复杂能力进入对应页面或后续弹窗，避免一个配置页堆满所有东西。</p>
          </div>
          <button class="primary-action" type="button" @click="saveAll">
            <Save :size="16" /> 保存当前配置
          </button>
        </section>

        <section class="settings-overview-grid">
          <article class="settings-overview-card primary-card">
            <span><Library :size="15" />素材与对话</span>
            <strong>图片 · 表情包</strong>
            <small>图片理解、素材库、上下文压缩</small>
            <button class="secondary-action" type="button" @click="openAssets"><Settings2 :size="14" />打开素材库</button>
          </article>
          <article class="settings-overview-card primary-card">
            <span><Sparkles :size="15" />主动性</span>
            <strong>规则触达</strong>
            <small>早安、提醒、主动追问</small>
            <button class="secondary-action" type="button" disabled><Settings2 :size="14" />后续弹窗</button>
          </article>
          <article class="settings-overview-card">
            <span><Bot :size="15" />人格</span>
            <strong>默认人格</strong>
            <small>Profile、工具开关、角色风格</small>
            <button class="secondary-action" type="button" disabled><Settings2 :size="14" />配置</button>
          </article>
          <article class="settings-overview-card">
            <span><Volume2 :size="15" />语音合成</span>
            <strong>{{ form.tts_enabled ? "启用" : "关闭" }}</strong>
            <small>TTS 地址、速度、音量</small>
            <button class="secondary-action" type="button" @click="saveAll"><Save :size="14" />保存</button>
          </article>
        </section>

        <article class="theme-section" id="appearance">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Appearance</p>
              <h2>外观与身份</h2>
            </div>
            <span class="soft-badge">Web 对话页生效</span>
          </div>
          <div class="appearance-layout">
            <section class="appearance-card appearance-card--compact">
              <div class="appearance-card-head">
                <strong>界面</strong>
                <small>主题与字号</small>
              </div>
              <div class="theme-toggle-group theme-toggle-group--compact">
                <button class="active" type="button"><Moon :size="15" />深色</button>
                <button type="button"><Sun :size="15" />浅色</button>
              </div>
              <label class="compact-field"><span>页面文字大小</span><input v-model.number="form.ui_font_scale" type="number" min="0.9" max="1.25" step="0.05" /></label>
            </section>
            <section class="appearance-card appearance-identity-card">
              <div class="identity-preview">
                <img v-if="form.web_user_avatar_url" :src="form.web_user_avatar_url" alt="我的头像" />
                <span v-else>我</span>
              </div>
              <div class="identity-form">
                <div class="appearance-card-head">
                  <strong>我的显示</strong>
                  <small>仅 Web 对话页生效</small>
                </div>
                <label><span>显示名称</span><input v-model="form.web_user_name" maxlength="40" /></label>
                <input ref="userAvatarInput" class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="handleAvatarSelected($event, 'user')" />
                <div class="avatar-upload-row">
                  <button class="secondary-action avatar-upload-btn" type="button" @click="userAvatarInput?.click()"><ImagePlus :size="15" />选择头像</button>
                  <button class="small-button avatar-clear-btn" type="button" @click="clearAvatar('user')">清除</button>
                </div>
              </div>
            </section>
            <section class="appearance-card appearance-identity-card">
              <div class="identity-preview">
                <img v-if="form.web_assistant_avatar_url" :src="form.web_assistant_avatar_url" alt="AI 头像" />
                <span v-else>枝</span>
              </div>
              <div class="identity-form">
                <div class="appearance-card-head">
                  <strong>AI 显示</strong>
                  <small>用于 Web 对话气泡</small>
                </div>
                <label><span>显示名称</span><input v-model="form.web_assistant_name" maxlength="40" /></label>
                <input ref="assistantAvatarInput" class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="handleAvatarSelected($event, 'assistant')" />
                <div class="avatar-upload-row">
                  <button class="secondary-action avatar-upload-btn" type="button" @click="assistantAvatarInput?.click()"><ImagePlus :size="15" />选择头像</button>
                  <button class="small-button avatar-clear-btn" type="button" @click="clearAvatar('assistant')">清除</button>
                </div>
              </div>
            </section>
          </div>
        </article>

        <article class="settings-panel" id="engine">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Model Engine</p>
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
              <button type="button" :class="{ active: form.dialog_mode !== 'api' }" @click="setMode('local')"><HardDrive :size="15" />本地模型</button>
              <button type="button" :class="{ active: form.dialog_mode === 'api' }" @click="setMode('api')"><Cloud :size="15" />API 模型</button>
            </div>
            <label class="thinking-toggle"><input v-model="form.thinking_enabled" type="checkbox" /> 启用思考模式，仅输出最终结果</label>
          </div>

          <section class="local-engine-card" :class="{ 'model-panel-locked': localDisabled }" data-locked-label="当前使用 API 模型，本地模型参数已锁定">
            <div class="appearance-card-head"><strong>Local Chat Completions</strong><small>仅在本地模型模式下生效</small></div>
            <div class="form-grid compact">
              <label><span>本地模型别名</span><input v-model="form.llm_model" :disabled="localDisabled" /></label>
              <label><span>Temperature</span><input v-model.number="form.temperature" :disabled="localDisabled" type="number" min="0" max="1.5" step="0.01" /></label>
              <label><span>Max Tokens</span><input v-model.number="form.max_tokens" :disabled="localDisabled" type="number" min="32" max="4096" step="1" /></label>
              <label><span>History Turns</span><input v-model.number="form.history_turns" :disabled="localDisabled" type="number" min="1" max="40" step="1" /></label>
              <label class="wide"><span>本地 Chat Completions URL</span><input v-model="form.llm_url" :disabled="localDisabled" /></label>
              <label class="wide model-file-field">
                <span>LLM 模型文件</span>
                <div class="model-file-row">
                  <input v-model="form.llm_model_file" :disabled="localDisabled" placeholder="选择或粘贴 .gguf / .safetensors / .bin 模型文件路径" />
                  <button class="secondary-action" type="button" disabled>选择</button>
                </div>
              </label>
            </div>
          </section>

          <section class="api-engine-card" :class="{ 'model-panel-locked': apiDisabled }" data-locked-label="当前使用本地模型，API 参数已锁定">
            <div class="appearance-card-head"><strong>OpenAI-compatible API</strong><small>DeepSeek、通义兼容接口、自建网关都可填这里</small></div>
            <div class="form-grid compact">
              <label class="wide"><span>API Chat Completions URL</span><input v-model="form.api_llm_url" :disabled="apiDisabled" placeholder="https://api.example.com/v1/chat/completions" /></label>
              <label><span>API Model</span><input v-model="form.api_llm_model" :disabled="apiDisabled" placeholder="model-name" /></label>
              <label><span>API Key</span><input v-model="form.api_llm_api_key" :disabled="apiDisabled" type="password" :placeholder="form.api_llm_api_key_masked || '留空则保留已保存 Key'" /></label>
              <label><span>API Temperature</span><input v-model.number="form.api_temperature" :disabled="apiDisabled" type="number" min="0" max="1.5" step="0.01" /></label>
              <label><span>API Max Tokens</span><input v-model.number="form.api_max_tokens" :disabled="apiDisabled" type="number" min="32" max="8192" step="1" /></label>
              <label><span>API History Turns</span><input v-model.number="form.api_history_turns" :disabled="apiDisabled" type="number" min="1" max="40" step="1" /></label>
            </div>
          </section>
        </article>

        <article class="settings-panel" id="tools">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Network Tools</p>
              <h2>联网工具</h2>
            </div>
            <span class="soft-badge">配置入口保留</span>
          </div>
          <div class="form-grid compact">
            <label><span>工具总开关</span><select v-model="form.tools_enabled"><option :value="true">启用</option><option :value="false">关闭</option></select></label>
            <label><span>自动调用</span><select v-model="form.tools_auto_call"><option :value="true">启用</option><option :value="false">关闭</option></select></label>
            <label><span>工具超时秒</span><input v-model.number="form.tools_timeout" type="number" min="2" max="60" step="1" /></label>
            <label><span>结果最大字符</span><input v-model.number="form.tools_max_result_chars" type="number" min="500" max="16000" step="100" /></label>
          </div>
        </article>

        <article class="settings-panel dialog-features-panel" id="dialogFeatures">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Conversation Features</p>
              <h2>对话能力</h2>
            </div>
            <span class="soft-badge">Web + 微信</span>
          </div>
          <div class="dialog-feature-grid">
            <section class="dialog-feature-card compact-feature-card">
              <div class="appearance-card-head"><strong>图片理解</strong><small>发送图片后生成摘要并进入本轮上下文</small></div>
              <div class="form-grid compact">
                <label><span>启用</span><select v-model="form.vision_enabled"><option :value="true">启用</option><option :value="false">关闭</option></select></label>
                <label><span>模型</span><input v-model="form.vision_model" placeholder="qwen-vl" /></label>
                <label class="wide"><span>Vision URL</span><input v-model="form.vision_url" placeholder="http://127.0.0.1:8081/v1/chat/completions" /></label>
                <label><span>超时秒</span><input v-model.number="form.vision_timeout" type="number" min="5" max="180" step="1" /></label>
              </div>
            </section>
            <section class="dialog-feature-card compact-feature-card asset-jump-card">
              <div class="appearance-card-head"><strong>素材库</strong><small>表情包识别、审核、策略和微信发送测试已迁移到独立页面</small></div>
              <p class="muted-copy">批量上传、批量识别、一键通过和删除都在素材库统一处理。</p>
              <button class="primary-action" type="button" @click="openAssets"><Library :size="16" />打开素材库</button>
            </section>
            <section class="dialog-feature-card wide">
              <div class="appearance-card-head"><strong>上下文压缩</strong><small>聊久后保留摘要和最近对话，减少遗忘与延迟</small></div>
              <div class="form-grid compact">
                <label><span>启用</span><select v-model="form.context_compaction_enabled"><option :value="true">启用</option><option :value="false">关闭</option></select></label>
                <label><span>窗口 Tokens</span><input v-model.number="form.context_window_tokens" type="number" min="2048" max="262144" step="512" /></label>
                <label><span>触发比例</span><input v-model.number="form.context_compaction_ratio" type="number" min="0.4" max="0.95" step="0.05" /></label>
              </div>
            </section>
          </div>
        </article>

        <article class="settings-panel proactive-panel" id="proactive">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Proactive Intelligence</p>
              <h2>主动性</h2>
            </div>
            <span class="soft-badge">后续弹窗配置</span>
          </div>
          <p class="muted-copy">日常问候、主动追问和定时提醒会保留为独立配置入口，避免撑满主配置页。</p>
        </article>

        <article class="settings-panel" id="botProfiles">
          <div class="panel-head"><div><p class="eyebrow">Bot Profiles</p><h2>Bot 人格</h2></div></div>
          <p class="muted-copy">人格配置后续会迁移成独立弹窗组件。</p>
        </article>

        <article class="settings-panel settings-panel--prominent" id="prompt">
          <div class="panel-head"><div><p class="eyebrow">Persona</p><h2>Prompt 配置</h2></div></div>
          <label class="wide"><span>System Prompt</span><textarea v-model="form.system" class="prompt-textarea"></textarea></label>
        </article>

        <article class="settings-panel" id="tts">
          <div class="panel-head"><div><p class="eyebrow">Speech Synthesis</p><h2>语音合成</h2></div></div>
          <div class="form-grid compact">
            <label><span>Web TTS</span><select v-model="form.tts_enabled"><option :value="true">启用</option><option :value="false">关闭</option></select></label>
            <label class="wide"><span>TTS URL</span><input v-model="form.tts_url" /></label>
            <label><span>TTS Speed</span><input v-model.number="form.tts_speed" type="number" min="0.7" max="1.5" step="0.01" /></label>
            <label><span>TTS Volume</span><input v-model.number="form.tts_volume" type="number" min="0.05" max="1.5" step="0.01" /></label>
          </div>
        </article>

        <article class="settings-panel" id="vad">
          <div class="panel-head"><div><p class="eyebrow">Voice Activity Detection</p><h2>语音检测</h2></div></div>
          <div class="form-grid compact">
            <label><span>Threshold</span><input v-model.number="form.vad_threshold" type="number" min="0.1" max="0.9" step="0.01" /></label>
            <label><span>Silence ms</span><input v-model.number="form.vad_min_silence_ms" type="number" min="120" max="1500" step="10" /></label>
            <label><span>Speech Pad ms</span><input v-model.number="form.vad_speech_pad_ms" type="number" min="0" max="500" step="10" /></label>
          </div>
        </article>

        <article class="settings-panel" id="commands">
          <div class="panel-head"><div><p class="eyebrow">Service Commands</p><h2>服务命令</h2></div><span class="soft-badge">默认不展开</span></div>
          <p class="muted-copy">服务命令保持在配置页底部，下一步会迁移为可折叠编辑器。</p>
        </article>
      </section>
    </div>
  </main>
</template>
