<script setup lang="ts">
import { Save } from "@lucide/vue";
import { useAssetsStore } from "@/stores/assets";
import { useUiStore } from "@/stores/ui";

const assets = useAssetsStore();
const ui = useUiStore();

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function saveAssetConfig() {
  try {
    await assets.saveConfig();
    ui.success("素材配置已保存");
  } catch (error) {
    ui.error(`素材配置保存失败：${errorText(error)}`);
  }
}
</script>

<template>
  <section class="asset-config-strip">
    <div class="asset-config-group asset-config-group--vision">
      <header>
        <strong>识别服务</strong>
        <small>{{ assets.config.sticker_vision_enabled ? "上传后自动识别" : "自动识别关闭" }}</small>
      </header>
      <div class="asset-config-fields">
        <label>
          <span>自动识别</span>
          <select v-model="assets.config.sticker_vision_enabled">
            <option :value="true">启用</option>
            <option :value="false">关闭</option>
          </select>
        </label>
        <label class="wide">
          <span>识别 URL</span>
          <input v-model="assets.config.sticker_vision_url" placeholder="https://.../v1/chat/completions" />
        </label>
        <label>
          <span>模型</span>
          <input v-model="assets.config.sticker_vision_model" placeholder="qwen3-vl-plus" />
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
      </div>
    </div>
    <div class="asset-config-group asset-config-group--policy">
      <header>
        <strong>发送策略</strong>
        <small>{{ assets.config.stickers_enabled ? "表情发送启用" : "表情发送关闭" }}</small>
      </header>
      <div class="asset-config-fields policy">
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
      </div>
    </div>
    <div class="asset-config-actions">
      <button class="secondary-action" type="button" :disabled="assets.configLoading" @click="saveAssetConfig">
        <Save :size="16" /> {{ assets.configLoading ? "保存中" : "保存素材配置" }}
      </button>
      <small v-if="assets.configMessage" class="asset-config-message">{{ assets.configMessage }}</small>
    </div>
  </section>
</template>
