<script setup lang="ts">
import { useRouter } from "vue-router";
import { Library, Palette, SlidersHorizontal, Sparkles } from "@lucide/vue";
import PageScaffold from "@/components/common/PageScaffold.vue";
import { useAppStore } from "@/stores/app";

const app = useAppStore();
const router = useRouter();
</script>

<template>
  <PageScaffold eyebrow="Settings" title="配置" description="常用配置直接展开，复杂能力进入独立页面，避免一个配置页堆满所有东西。">
    <section class="settings-grid">
      <article class="settings-card wide">
        <div>
          <SlidersHorizontal :size="20" />
          <h2>模型模式</h2>
        </div>
        <p>当前模式：{{ app.config?.dialog_mode || "读取中" }}</p>
        <p>本地模型和 OpenAI-compatible API 后续会在这里做互斥切换，避免两个模式混在一起。</p>
      </article>

      <article class="settings-card">
        <div>
          <Library :size="20" />
          <h2>素材与对话</h2>
        </div>
        <p>表情包上传、批量识别、审核和策略测试已迁移到素材库页面。</p>
        <button class="primary-action" type="button" @click="router.push('/assets')">打开素材库</button>
      </article>

      <article class="settings-card">
        <div>
          <Sparkles :size="20" />
          <h2>主动性</h2>
        </div>
        <p>日常问候、主动追问和定时提醒会保留为独立弹窗配置，不再撑满整个页面。</p>
      </article>

      <article class="settings-card">
        <div>
          <Palette :size="20" />
          <h2>外观</h2>
        </div>
        <p>字体、对话双方头像和字号会集中在这里，影响 Web 对话页。</p>
      </article>
    </section>
  </PageScaffold>
</template>
