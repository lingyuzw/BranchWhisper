<script setup lang="ts">
import type { PublicConfig } from "@/api/config";

const props = defineProps<{
  form: Partial<PublicConfig>;
}>();

const form = props.form;
</script>

<template>
  <article class="settings-panel settings-panel--prominent settings-section-detached is-active is-current" id="prompt">
    <div class="panel-head">
      <div><p class="eyebrow">提示词</p><h2>Prompt 配置</h2></div>
    </div>
    <label class="wide"><span>系统提示词</span><textarea v-model="form.system" class="prompt-textarea"></textarea></label>
  </article>
</template>
