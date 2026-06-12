<script setup lang="ts">
import { Sparkles } from "@lucide/vue";
import { computed } from "vue";
import { useAssetsStore } from "@/stores/assets";

const assets = useAssetsStore();

const testSummary = computed(() => {
  const result = assets.testResult as Record<string, any> | null;
  if (!result) return null;
  const sticker = result.sticker || {};
  const diagnostics = result.diagnostics || result.intent || {};
  const score = diagnostics.score ?? diagnostics.best_score;
  const threshold = diagnostics.threshold;
  return {
    hit: Boolean(sticker?.id),
    title: sticker?.tag || sticker?.name || sticker?.id || "未命中素材",
    subtitle: sticker?.emotion || sticker?.review_status || `${result.stickers_count || 0} 张可用素材`,
    score: score === undefined || score === null ? "--" : Number(score).toFixed(2),
    threshold: threshold === undefined || threshold === null ? "--" : Number(threshold).toFixed(2),
    fields: (result.matched_fields || diagnostics.matched_fields || []).join("、") || "无",
  };
});
</script>

<template>
  <aside class="asset-sidebar">
    <div class="asset-filter-card">
      <label>
        <span>状态</span>
        <select v-model="assets.filters.status" @change="assets.reload()">
          <option value="">全部</option>
          <option value="pending">待审核</option>
          <option value="approved">已通过</option>
          <option value="failed">失败</option>
          <option value="disabled">停用</option>
        </select>
      </label>
      <label>
        <span>分类</span>
        <select v-model="assets.filters.emotion" @change="assets.reload()">
          <option value="">全部分类</option>
          <option value="laugh">laugh</option>
          <option value="smug">smug</option>
          <option value="angry">angry</option>
          <option value="sad">sad</option>
          <option value="comfort">comfort</option>
          <option value="confused">confused</option>
          <option value="shock">shock</option>
          <option value="sleepy">sleepy</option>
          <option value="cute">cute</option>
          <option value="bye">bye</option>
          <option value="silent">silent</option>
          <option value="agree">agree</option>
          <option value="reject">reject</option>
        </select>
      </label>
      <label class="wide">
        <span>搜索</span>
        <input v-model="assets.filters.q" type="search" placeholder="标签 / OCR / 场景" @keydown.enter="assets.reload()" />
      </label>
    </div>
    <div class="asset-test-card">
      <strong>策略测试</strong>
      <input v-model="assets.testText" type="text" placeholder="哈哈哈 / 无语了 / 有点难过" />
      <select v-model="assets.testChannel">
        <option value="web">Web</option>
        <option value="weixin">微信</option>
      </select>
      <button class="secondary-action" type="button" @click="assets.runTest()"><Sparkles :size="16" /> 测试命中</button>
      <div class="asset-test-result" :class="{ hit: testSummary?.hit, miss: testSummary && !testSummary.hit }">
        <template v-if="testSummary">
          <strong>{{ testSummary.title }}</strong>
          <span>{{ testSummary.subtitle }}</span>
          <small>score {{ testSummary.score }} · threshold {{ testSummary.threshold }}</small>
          <small>匹配字段：{{ testSummary.fields }}</small>
        </template>
        <template v-else>等待测试。</template>
      </div>
    </div>
  </aside>
</template>
