<script setup lang="ts">
defineProps<{
  eyebrow?: string;
  title: string;
  description?: string;
  statusText?: string;
  statusTone?: "idle" | "ok" | "warning" | "danger" | "running";
}>();
</script>

<template>
  <section class="workspace-page-header">
    <div class="workspace-page-header-copy">
      <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
      <h1>{{ title }}</h1>
      <p v-if="description">{{ description }}</p>
    </div>
    <span v-if="statusText" class="workspace-page-header-status" :class="statusTone || 'idle'">
      {{ statusText }}
    </span>
    <div v-if="$slots.actions" class="workspace-page-header-actions">
      <slot name="actions" />
    </div>
  </section>
</template>
