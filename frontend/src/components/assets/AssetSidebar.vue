<script setup lang="ts">
import { Sparkles } from "@lucide/vue";
import { useAssetsStore } from "@/stores/assets";

const assets = useAssetsStore();
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
      <input v-model="assets.testText" type="text" placeholder="哈哈哈哈 / 无语了 / 有点难过" />
      <select v-model="assets.testChannel">
        <option value="web">Web</option>
        <option value="weixin">微信</option>
      </select>
      <button class="secondary-action" type="button" @click="assets.runTest()"><Sparkles :size="16" /> 测试命中</button>
      <div class="asset-test-result" :class="{ hit: assets.testResult }">{{ assets.testResult ? JSON.stringify(assets.testResult, null, 2) : "等待测试。" }}</div>
    </div>
  </aside>
</template>
