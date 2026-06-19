<script setup lang="ts">
import { Save, X } from "@lucide/vue";
import type { BotProfile } from "@/api/profiles";

type IntegrationForm = {
  id: string;
  chat_name: string;
  enabled: boolean;
  openclaw_profile: string;
  bot_profile_id: string;
  reply_mode: string;
  voice_trigger_keywords: string;
};

defineProps<{
  form: IntegrationForm;
  profiles: BotProfile[];
  editingId: string;
  error: string;
  saving: boolean;
}>();

const emit = defineEmits<{
  close: [];
  save: [];
}>();
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <section class="modal-panel integration-modal-panel" role="dialog" aria-modal="true" aria-label="接入实例配置">
      <div class="modal-head">
        <div>
          <p class="eyebrow">Instance Config</p>
          <h2>{{ editingId ? "编辑机器人" : "新增机器人" }}</h2>
        </div>
        <button class="icon-button modal-close" type="button" title="关闭" @click="emit('close')"><X :size="16" /></button>
      </div>
      <div class="modal-body">
        <div class="integration-profile-hint">
          <strong>每个机器人使用独立 OpenClaw profile。</strong>
          <span>新增后先保存，再用对应设备扫码；扫码 token、会话和消息记录会存到这个 profile 下，不会覆盖当前机器人。</span>
        </div>
        <div class="form-grid compact">
          <label><span>机器人 ID</span><input v-model="form.id" :disabled="!!editingId" placeholder="weixin_phone2" /></label>
          <label><span>显示名称</span><input v-model="form.chat_name" placeholder="新设备微信" /></label>
          <label><span>隔离 profile</span><input v-model="form.openclaw_profile" placeholder="branchwhisper_weixin_phone2" /></label>
          <label><span>Bot 人格</span><select v-model="form.bot_profile_id"><option v-for="profile in profiles" :key="profile.id" :value="profile.id">{{ profile.name || profile.id }}</option></select></label>
          <label><span>回复模式</span><select v-model="form.reply_mode"><option value="text">文字默认</option><option value="voice">语音优先</option></select></label>
          <label class="switch-label"><span>启用后台守护</span><input v-model="form.enabled" type="checkbox" /></label>
          <label class="wide"><span>语音触发词</span><textarea v-model="form.voice_trigger_keywords" rows="5"></textarea></label>
        </div>
        <p v-if="error" class="asset-error">{{ error }}</p>
      </div>
      <div class="modal-actions">
        <button class="secondary-action" type="button" @click="emit('close')">取消</button>
        <button class="primary-action" type="button" :disabled="saving" @click="emit('save')"><Save :size="16" /> {{ saving ? "保存中" : "保存" }}</button>
      </div>
    </section>
  </div>
</template>
