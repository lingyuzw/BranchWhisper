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
  loadMore: [];
}>();
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
          <strong>{{ item.tag || item.emotion || "默认" }}</strong>
          <small>{{ item.review_status || "pending" }} · 强度 {{ item.intensity || "-" }}</small>
        </div>
      </article>
    </div>
    <div v-if="hasMore" class="asset-load-more">
      <button class="secondary-action" type="button" @click="emit('loadMore')">加载更多</button>
    </div>
  </section>
</template>
