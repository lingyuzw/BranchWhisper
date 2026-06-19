<script setup lang="ts">
import StatusMetric from "@/components/ui/StatusMetric.vue";

defineProps<{
  items?: Array<{
    label: string;
    value: string | number;
    detail?: string;
    tone?: "neutral" | "ok" | "warning" | "danger" | "info";
  }>;
}>();
</script>

<template>
  <section class="workspace-status-summary">
    <slot>
      <StatusMetric
        v-for="item in items || []"
        :key="item.label"
        :label="item.label"
        :value="item.value"
        :detail="item.detail"
        :tone="item.tone"
      />
    </slot>
  </section>
</template>
