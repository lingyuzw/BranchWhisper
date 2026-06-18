<script setup lang="ts">
import { Plus, Trash2 } from "@lucide/vue";
import type { BotProfile } from "@/api/profiles";

defineProps<{
  profiles: BotProfile[];
  error: string;
}>();

const emit = defineEmits<{
  addProfile: [];
  removeProfile: [profileId: string, profileName?: string];
}>();
</script>

<template>
  <article class="settings-panel settings-section-detached is-active is-current" id="botProfiles">
    <div class="panel-head">
      <div><p class="eyebrow">人格</p><h2>Bot 人格</h2></div>
      <button class="secondary-action" type="button" @click="emit('addProfile')"><Plus :size="15" />新增人格</button>
    </div>
    <div class="bot-profile-list">
      <article v-for="profile in profiles" :key="profile.id" class="bot-profile-card">
        <div class="tool-provider-head">
          <strong>{{ profile.name || profile.id }}</strong>
          <small>{{ profile.id === "default" ? "默认人格" : profile.id }}</small>
        </div>
        <div class="form-grid compact">
          <label><span>名称</span><input v-model="profile.name" /></label>
          <label><span>回复风格</span><input v-model="profile.reply_style" placeholder="natural / concise / warm" /></label>
          <label><span>允许工具</span><select v-model="profile.tools_enabled"><option :value="true">启用</option><option :value="false">关闭</option></select></label>
          <label class="wide"><span>头像 URL</span><input v-model="profile.avatar_url" /></label>
          <label class="wide"><span>System Prompt</span><textarea v-model="profile.system" class="bot-system"></textarea></label>
        </div>
        <div class="inline-actions">
          <button class="secondary-action" type="button" :disabled="profile.id === 'default'" @click="emit('removeProfile', profile.id, profile.name)"><Trash2 :size="15" />删除</button>
        </div>
      </article>
    </div>
    <p v-if="error" class="muted-copy">人格配置读取失败：{{ error }}</p>
  </article>
</template>
