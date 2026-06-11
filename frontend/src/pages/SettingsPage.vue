<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { useRouter } from "vue-router";
import { BrainCircuit, Library, Palette, Save, SlidersHorizontal, Volume2 } from "@lucide/vue";
import PageScaffold from "@/components/common/PageScaffold.vue";
import { useAppStore } from "@/stores/app";
import type { PublicConfig } from "@/api/config";

const app = useAppStore();
const router = useRouter();
const form = reactive<Partial<PublicConfig>>({});
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
  await router.push("/assets");
}
</script>

<template>
  <PageScaffold eyebrow="Settings" title="配置" description="常用配置直接展开，扩展能力按模块分组，避免所有参数挤在一起。">
    <main class="settings-page">
      <section class="settings-hero-card">
        <div>
          <SlidersHorizontal :size="22" />
          <div>
            <h2>对话模式</h2>
            <p>当前只能选择一种模型来源；两个模式的记忆库会按模式隔离。</p>
          </div>
        </div>
        <select v-model="form.dialog_mode">
          <option value="local">本地/自训练模型</option>
          <option value="api">OpenAI-compatible API</option>
        </select>
        <button class="primary-action" type="button" @click="saveAll">
          <Save :size="16" /> 保存当前配置
        </button>
      </section>

      <section class="settings-two-col">
        <article class="settings-card" :class="{ disabled: localDisabled }">
          <header><BrainCircuit :size="20" /><h2>本地模型</h2></header>
          <label>模型 URL<input v-model="form.llm_url" :disabled="localDisabled" /></label>
          <label>模型别名<input v-model="form.llm_model" :disabled="localDisabled" /></label>
          <div class="settings-inline">
            <label>Temperature<input v-model.number="form.llm_temperature" :disabled="localDisabled" type="number" step="0.05" /></label>
            <label>Max Tokens<input v-model.number="form.llm_max_tokens" :disabled="localDisabled" type="number" /></label>
            <label>历史轮数<input v-model.number="form.history_turns" :disabled="localDisabled" type="number" /></label>
          </div>
        </article>

        <article class="settings-card" :class="{ disabled: apiDisabled }">
          <header><BrainCircuit :size="20" /><h2>API 模型</h2></header>
          <label>API URL<input v-model="form.api_llm_url" :disabled="apiDisabled" placeholder="https://api.deepseek.com/v1/chat/completions" /></label>
          <label>模型名称<input v-model="form.api_llm_model" :disabled="apiDisabled" /></label>
          <label>API Key<input v-model="form.api_llm_api_key" :disabled="apiDisabled" type="password" :placeholder="form.api_llm_api_key_masked || '留空则保持原 key'" /></label>
          <div class="settings-inline">
            <label>Temperature<input v-model.number="form.api_llm_temperature" :disabled="apiDisabled" type="number" step="0.05" /></label>
            <label>Max Tokens<input v-model.number="form.api_llm_max_tokens" :disabled="apiDisabled" type="number" /></label>
          </div>
        </article>
      </section>

      <section class="settings-grid">
        <article class="settings-card">
          <header><Volume2 :size="20" /><h2>语音与图片理解</h2></header>
          <label class="toggle-line"><input v-model="form.tts_enabled" type="checkbox" /> Web 对话播放 TTS</label>
          <label>图片理解 URL<input v-model="form.vision_url" /></label>
          <label>图片理解模型<input v-model="form.vision_model" /></label>
          <label>图片理解超时<input v-model.number="form.vision_timeout" type="number" /></label>
        </article>

        <article class="settings-card">
          <header><Library :size="20" /><h2>素材与对话</h2></header>
          <label class="toggle-line"><input v-model="form.sticker_vision_enabled" type="checkbox" /> 自动识别表情包</label>
          <label>素材识别 URL<input v-model="form.sticker_vision_url" /></label>
          <label>素材识别模型<input v-model="form.sticker_vision_model" /></label>
          <label>素材识别 Key<input v-model="form.sticker_vision_api_key" type="password" :placeholder="form.sticker_vision_api_key_masked || '留空则保持原 key'" /></label>
          <button class="secondary-action full" type="button" @click="openAssets">打开素材库</button>
        </article>

        <article class="settings-card">
          <header><Palette :size="20" /><h2>外观</h2></header>
          <label>我的名称<input v-model="form.web_user_name" /></label>
          <label>AI 名称<input v-model="form.web_assistant_name" /></label>
          <label>页面字号比例<input v-model.number="form.ui_font_scale" type="number" step="0.05" /></label>
        </article>
      </section>
    </main>
  </PageScaffold>
</template>
