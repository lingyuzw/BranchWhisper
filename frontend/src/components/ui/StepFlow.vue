<script setup lang="ts">
defineProps<{
  items: Array<{
    key?: string;
    label: string;
    status?: string;
    detail?: string;
    state?: "idle" | "current" | "pending" | "ok" | "warning" | "failed" | "running" | "error" | "unknown";
  }>;
  ariaLabel?: string;
}>();

function stepClass(state?: string) {
  if (state === "error") return "failed";
  if (state === "running") return "current";
  if (state === "warning") return "pending";
  return state || "idle";
}
</script>

<template>
  <section class="workspace-step-flow" :aria-label="ariaLabel">
    <article v-for="(item, index) in items" :key="item.key || item.label" class="workspace-step-item" :class="stepClass(item.state)">
      <span class="integration-step-index workspace-step-index">{{ index + 1 }}</span>
      <span class="integration-step-copy workspace-step-copy">
        <strong>{{ item.label }}</strong>
        <em>{{ item.status || item.detail || "未开始" }}</em>
      </span>
    </article>
  </section>
</template>
