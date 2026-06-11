<script setup lang="ts">
import PageScaffold from "@/components/common/PageScaffold.vue";
import { useAppStore } from "@/stores/app";

const app = useAppStore();
</script>

<template>
  <PageScaffold eyebrow="Settings" title="配置" description="配置页会按模型、工具、外观、主动性、素材策略分区迁移。">
    <section class="preview-card">
      <h2>当前模型模式</h2>
      <p>{{ app.config?.dialog_mode || "读取中" }}</p>
    </section>
  </PageScaffold>
</template>
