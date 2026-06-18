<script setup lang="ts">
import type { Component } from "vue";
import { Save } from "@lucide/vue";
import type { PublicConfig } from "@/api/config";
import type { ProactiveConfig } from "@/api/engagement";

interface SettingsSection {
  eyebrow: string;
  title: string;
  summary: string;
  status: string;
}

interface RuntimeChainItem {
  id: string;
  icon: Component;
  title: string;
  mode: string;
  model: string;
  endpoint: string;
  section: string;
}

const props = defineProps<{
  activeSection: SettingsSection;
  runtimeChainItems: RuntimeChainItem[];
  form: Partial<PublicConfig>;
  engagementConfig: ProactiveConfig;
  settingsMessage: string;
  settingsSaving: boolean;
}>();

const emit = defineEmits<{
  openSection: [id: string];
  saveAll: [];
}>();

const form = props.form;
</script>

<template>
  <section class="settings-command-bar">
    <div class="settings-title-block">
      <p class="eyebrow">{{ activeSection.eyebrow }}</p>
      <h2>{{ activeSection.title }}</h2>
      <p>{{ activeSection.summary }} · {{ activeSection.status }}</p>
    </div>
    <div class="settings-command-actions">
      <span v-if="settingsMessage" class="soft-badge">{{ settingsMessage }}</span>
      <button class="primary-action" type="button" :disabled="settingsSaving" @click="emit('saveAll')">
        <Save :size="16" />{{ settingsSaving ? "保存中..." : "保存配置" }}
      </button>
    </div>
  </section>

  <section class="settings-ops-board" aria-label="常用配置">
    <div class="settings-board-column settings-board-column--chain">
      <header>
        <p class="eyebrow">链路</p>
        <h2>当前模型链路</h2>
      </header>
      <button
        v-for="item in runtimeChainItems"
        :key="item.id"
        class="settings-chain-row"
        type="button"
        @click="emit('openSection', item.section)"
      >
        <component :is="item.icon" :size="15" />
        <span>
          <strong>{{ item.title }} · {{ item.mode }}</strong>
          <small>{{ item.model }}</small>
        </span>
        <em>{{ item.endpoint }}</em>
      </button>
    </div>

    <div class="settings-board-column settings-board-column--capabilities">
      <header>
        <p class="eyebrow">能力</p>
        <h2>能力开关</h2>
      </header>
      <div class="settings-toggle-matrix">
        <label><span>TTS</span><select v-model="form.tts_enabled"><option :value="true">启用</option><option :value="false">关闭</option></select></label>
        <label><span>联网工具</span><select v-model="form.tools_enabled"><option :value="true">启用</option><option :value="false">关闭</option></select></label>
        <label><span>上下文压缩</span><select v-model="form.context_compaction_enabled"><option :value="true">启用</option><option :value="false">关闭</option></select></label>
        <label><span>主动消息</span><select v-model="props.engagementConfig.enabled"><option :value="true">启用</option><option :value="false">关闭</option></select></label>
      </div>
    </div>
  </section>
</template>
