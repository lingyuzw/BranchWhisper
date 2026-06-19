<script setup lang="ts">
defineProps<{
  label: string;
  value: string | number;
  detail?: string;
  tone?: "neutral" | "ok" | "warning" | "danger" | "info";
}>();
</script>

<template>
  <article class="workspace-status-metric" :class="tone || 'neutral'">
    <small>{{ label }}</small>
    <strong>{{ value }}</strong>
    <span v-if="detail">{{ detail }}</span>
  </article>
</template>
