<script setup lang="ts">
defineProps<{
  title?: string;
  description?: string;
}>();
</script>

<template>
  <section class="workspace-task-panel">
    <header v-if="title || description || $slots.toolbar" class="workspace-task-panel-head">
      <div class="workspace-task-panel-title">
        <h2 v-if="title">{{ title }}</h2>
        <p v-if="description">{{ description }}</p>
      </div>
      <div v-if="$slots.toolbar" class="workspace-task-panel-toolbar">
        <slot name="toolbar" />
      </div>
    </header>
    <slot />
    <footer v-if="$slots.footer">
      <slot name="footer" />
    </footer>
  </section>
</template>
