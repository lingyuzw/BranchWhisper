<script setup lang="ts">
import { Save } from "@lucide/vue";
import { useAssetsStore } from "@/stores/assets";

const assets = useAssetsStore();
</script>

<template>
  <section class="asset-config-strip">
    <label>
      <span>自动识别</span>
      <select v-model="assets.config.sticker_vision_enabled">
        <option :value="true">启用</option>
        <option :value="false">关闭</option>
      </select>
    </label>
    <label>
      <span>识别 URL</span>
      <input v-model="assets.config.sticker_vision_url" placeholder="https://.../v1/chat/completions" />
    </label>
    <label>
      <span>模型</span>
      <input v-model="assets.config.sticker_vision_model" placeholder="qwen-vl / qwen3-vl-plus" />
    </label>
    <label>
      <span>API Key</span>
      <input v-model="assets.config.sticker_vision_api_key" type="password" :placeholder="assets.config.sticker_vision_api_key_masked || '留空不修改'" />
    </label>
    <label>
      <span>超时秒</span>
      <input v-model.number="assets.config.sticker_vision_timeout" type="number" min="5" max="180" step="1" />
    </label>
    <label>
      <span>Max Tokens</span>
      <input v-model.number="assets.config.sticker_vision_max_tokens" type="number" min="128" max="4096" step="32" />
    </label>
    <label>
      <span>自动发图</span>
      <select v-model="assets.config.stickers_enabled">
        <option :value="true">启用</option>
        <option :value="false">关闭</option>
      </select>
    </label>
    <label>
      <span>活跃度</span>
      <select v-model="assets.config.sticker_activity">
        <option value="off">关闭</option>
        <option value="low">低</option>
        <option value="standard">标准</option>
        <option value="active">活跃</option>
        <option value="very_active">很活跃</option>
        <option value="custom">自定义</option>
      </select>
    </label>
    <label>
      <span>冷却秒</span>
      <input v-model.number="assets.config.sticker_cooldown_sec" type="number" min="0" max="3600" step="5" />
    </label>
    <label>
      <span>每日上限</span>
      <input v-model.number="assets.config.sticker_daily_limit" type="number" min="0" max="500" step="1" />
    </label>
    <label>
      <span>连续上限</span>
      <input v-model.number="assets.config.sticker_max_streak" type="number" min="0" max="10" step="1" />
    </label>
    <label>
      <span>自定义概率</span>
      <input v-model.number="assets.config.sticker_custom_probability" type="number" min="0" max="1" step="0.05" />
    </label>
    <button class="secondary-action" type="button" :disabled="assets.configLoading" @click="assets.saveConfig()">
      <Save :size="16" /> 保存素材配置
    </button>
    <small v-if="assets.configMessage" class="asset-config-message">{{ assets.configMessage }}</small>
  </section>
</template>
