<script setup lang="ts">
import type { Sticker } from "@/api/assets";

defineProps<{
  stickers: Sticker[];
  selectedId: string;
  selectedIds: string[];
  hasMore: boolean;
}>();

const emit = defineEmits<{
  select: [id: string];
  toggle: [id: string, checked: boolean];
  remove: [id: string];
  loadMore: [];
}>();

function statusText(value?: string) {
  return {
    approved: "已识别",
    pending: "待审核",
    failed: "未识别",
    disabled: "已停用",
  }[String(value || "")] || "未识别";
}
</script>

<template>
  <section class="asset-gallery-panel">
    <div class="asset-gallery">
      <article
        v-for="item in stickers"
        :key="item.id"
        class="asset-card"
        :class="{ active: item.id === selectedId, selected: selectedIds.includes(item.id), 'review-approved': item.review_status === 'approved', 'review-failed': item.review_status === 'failed' }"
        @click="emit('select', item.id)"
      >
        <input
          class="asset-card-check"
          type="checkbox"
          :checked="selectedIds.includes(item.id)"
          @click.stop
          @change="emit('toggle', item.id, ($event.target as HTMLInputElement).checked)"
        />
        <div class="asset-card-preview">
          <img :src="item.thumbnail || item.url" :alt="item.name" loading="lazy" />
          <div class="asset-card-copy">
            <strong :title="item.name">{{ item.name || item.id }}</strong>
            <small><span>{{ item.tag || item.emotion || "默认" }}</span>{{ statusText(item.review_status) }}</small>
          </div>
          <div class="asset-card-actions">
            <button type="button" @click.stop="emit('select', item.id)">查看</button>
            <button type="button" @click.stop="emit('select', item.id)">重命名</button>
            <button type="button" class="danger" @click.stop="emit('remove', item.id)">删除</button>
          </div>
        </div>
      </article>
      <div v-if="!stickers.length" class="asset-empty">当前筛选下没有素材</div>
    </div>
    <div v-if="hasMore" class="asset-load-more">
      <button class="secondary-action" type="button" @click="emit('loadMore')">加载更多</button>
    </div>
  </section>
</template>
