<script setup lang="ts">
defineProps<{
  resources: Record<string, unknown> | null;
}>();

function displayValue(value: unknown) {
  return typeof value === "object" && value !== null ? "--" : String(value ?? "--");
}
</script>

<template>
  <section class="resource-section">
    <div class="section-head">
      <div><p class="eyebrow">System Resources</p><h2>资源状态</h2></div>
      <span class="soft-badge">{{ String(resources?.platform || resources?.os || "--") }}</span>
    </div>
    <div class="resource-grid">
      <article v-for="(value, key) in resources || {}" :key="String(key)" class="resource-card">
        <div class="resource-card-head">
          <strong>{{ key }}</strong>
        </div>
        <div class="resource-value">{{ displayValue(value) }}</div>
        <small v-if="typeof value === 'object'">{{ JSON.stringify(value) }}</small>
      </article>
    </div>
  </section>
</template>
