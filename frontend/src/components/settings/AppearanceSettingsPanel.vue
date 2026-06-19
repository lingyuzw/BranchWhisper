<script setup lang="ts">
import { ImagePlus, Moon, Sun } from "@lucide/vue";
import type { PublicConfig } from "@/api/config";

const props = defineProps<{
  form: Partial<PublicConfig>;
  theme: "dark" | "light";
}>();

const emit = defineEmits<{
  applyTheme: [theme: "dark" | "light"];
  selectAvatar: [target: "user" | "assistant"];
  clearAvatar: [target: "user" | "assistant"];
}>();

const form = props.form as Partial<PublicConfig>;

function themeFromEvent(event: Event): "dark" | "light" {
  return (event.target as HTMLSelectElement).value === "light" ? "light" : "dark";
}
</script>

<template>
  <article class="settings-panel settings-section-detached is-active is-current" id="appearance">
    <div class="panel-head">
      <div><p class="eyebrow">显示</p><h2>外观与身份</h2></div>
    </div>
    <div class="appearance-balance-grid">
      <section class="appearance-balance-card">
        <div class="appearance-card-head"><strong>显示偏好</strong><small>主题和整体字号</small></div>
        <div class="form-grid compact">
          <label><span>主题</span><select :value="theme" @change="emit('applyTheme', themeFromEvent($event))"><option value="dark">深色</option><option value="light">浅色</option></select></label>
          <label><span>文字大小</span><input v-model.number="form.ui_font_scale" type="number" min="0.9" max="1.25" step="0.05" /></label>
        </div>
        <div class="theme-preview-strip">
          <button class="theme-preview-button" type="button" :class="{ active: theme === 'dark' }" @click="emit('applyTheme', 'dark')"><Moon :size="15" />深色</button>
          <button class="theme-preview-button" type="button" :class="{ active: theme === 'light' }" @click="emit('applyTheme', 'light')"><Sun :size="15" />浅色</button>
        </div>
      </section>
      <section class="appearance-balance-card">
        <div class="appearance-card-head"><strong>身份头像</strong><small>Web 对话展示名称</small></div>
        <div class="settings-identity-row">
          <div class="identity-preview">
            <img v-if="form.web_user_avatar_url" :src="form.web_user_avatar_url" alt="我的头像" />
            <span v-else>我</span>
          </div>
          <label><span>我的名称</span><input v-model="form.web_user_name" maxlength="40" /></label>
          <button class="icon-button" type="button" title="选择我的头像" @click="emit('selectAvatar', 'user')"><ImagePlus :size="15" /></button>
          <button class="small-button" type="button" @click="emit('clearAvatar', 'user')">清除</button>
        </div>
        <div class="settings-identity-row">
          <div class="identity-preview assistant">
            <img v-if="form.web_assistant_avatar_url" :src="form.web_assistant_avatar_url" alt="AI 头像" />
            <span v-else>枝</span>
          </div>
          <label><span>AI 名称</span><input v-model="form.web_assistant_name" maxlength="40" /></label>
          <button class="icon-button" type="button" title="选择 AI 头像" @click="emit('selectAvatar', 'assistant')"><ImagePlus :size="15" /></button>
          <button class="small-button" type="button" @click="emit('clearAvatar', 'assistant')">清除</button>
        </div>
      </section>
    </div>
  </article>
</template>
