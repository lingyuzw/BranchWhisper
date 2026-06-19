<script setup lang="ts">
defineProps<{
  title: string;
  open?: boolean;
}>();
</script>

<template>
  <details class="workspace-advanced-disclosure" :open="open">
    <summary>{{ title }}</summary>
    <div class="workspace-advanced-disclosure-body">
      <slot />
    </div>
  </details>
</template>
