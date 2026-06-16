<script setup lang="ts">
import { CheckCircle2, Copy, Loader2, Play, TriangleAlert, XCircle } from "@lucide/vue";

const props = withDefaults(defineProps<{
  eyebrow?: string;
  title: string;
  summary?: string;
  status?: "idle" | "running" | "ok" | "failed" | "warning";
  statusText?: string;
  detail?: string;
  actionText?: string;
  disabled?: boolean;
  variant?: "default" | "compact" | "strip" | "detail";
  detailOpen?: boolean;
}>(), {
  variant: "default",
  detailOpen: false,
});

const emit = defineEmits<{
  run: [];
  copy: [];
}>();
</script>

<template>
  <section class="inline-probe" :class="[status || 'idle', `inline-probe--${props.variant}`, { 'has-detail': detail }]">
    <div class="inline-probe-copy">
      <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
      <strong>{{ title }}</strong>
      <small v-if="summary && props.variant !== 'compact'">{{ summary }}</small>
      <code v-if="detail && (props.variant === 'detail' || detailOpen)">{{ detail }}</code>
    </div>
    <div class="inline-probe-state">
      <span class="soft-badge">
        <CheckCircle2 v-if="status === 'ok'" :size="14" />
        <XCircle v-else-if="status === 'failed'" :size="14" />
        <TriangleAlert v-else-if="status === 'warning'" :size="14" />
        <Loader2 v-else-if="status === 'running'" :size="14" class="spin-icon" />
        {{ statusText || (status === "running" ? "检测中" : status === "ok" ? "正常" : status === "failed" ? "异常" : "未检测") }}
      </span>
      <button class="secondary-action" type="button" :disabled="disabled || status === 'running'" @click="emit('run')">
        <Play :size="15" />{{ actionText || "运行测试" }}
      </button>
      <button v-if="detail" class="icon-button" type="button" title="复制结果" @click="emit('copy')">
        <Copy :size="15" />
      </button>
    </div>
  </section>
</template>
