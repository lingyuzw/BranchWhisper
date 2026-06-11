<script setup lang="ts">
import { computed } from "vue";
import PageScaffold from "@/components/common/PageScaffold.vue";
import { useAppStore } from "@/stores/app";

const app = useAppStore();
const services = computed(() => app.services);
</script>

<template>
  <PageScaffold eyebrow="Services" title="服务" description="服务页将作为第一批迁移页面，先验证 API、状态刷新和页面布局。">
    <section class="grid-list">
      <article v-for="service in services" :key="service.id" class="preview-card">
        <div class="card-row">
          <h2>{{ service.label || service.id }}</h2>
          <span class="status-pill" :class="{ ok: service.running }">{{ service.running ? "运行中" : service.status || "未运行" }}</span>
        </div>
        <p>{{ service.description || service.health_url || "暂无描述" }}</p>
      </article>
      <article v-if="!services.length" class="preview-card">
        <h2>等待服务数据</h2>
        <p>{{ app.error || "正在从 /api/services 读取服务状态。" }}</p>
      </article>
    </section>
  </PageScaffold>
</template>
