<script setup lang="ts">
import PageScaffold from "@/components/common/PageScaffold.vue";
</script>

<template>
  <PageScaffold eyebrow="Dialog" title="对话" description="Vue 新前端预览。语音对话页会在最后迁移，当前正式页面仍使用旧版 /static。">
    <section class="preview-card">
      <h2>迁移策略</h2>
      <p>先迁移服务、配置、记忆、素材库等低风险页面，再迁移 WebSocket 和音频链路最复杂的对话页。</p>
      <a class="legacy-link" href="/static/index.html">打开当前正式前端</a>
    </section>
  </PageScaffold>
</template>
