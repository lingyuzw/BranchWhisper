<script setup lang="ts">
import type { Sticker } from "@/api/assets";

defineProps<{
  selected: Sticker | null;
}>();
</script>

<template>
  <aside class="asset-detail-panel" :class="{ empty: !selected }">
    <template v-if="selected">
      <div class="asset-detail-head">
        <img :src="selected.url || selected.thumbnail" :alt="selected.name" />
        <div>
          <strong>{{ selected.name }}</strong>
          <small>{{ selected.emotion || selected.tag || "-" }} · {{ selected.review_status || "pending" }}</small>
        </div>
      </div>
      <label><span>分类</span><input :value="selected.emotion || selected.tag || ''" readonly /></label>
      <label><span>标签</span><input :value="(selected.tags || []).join('，')" readonly /></label>
      <label><span>适用场景</span><textarea :value="(selected.scene || []).join('，') || selected.caption || ''" readonly /></label>
      <label><span>禁用场景</span><textarea :value="(selected.avoid || []).join('，')" readonly /></label>
    </template>
    <template v-else>选择一张素材后，可以复核分类、标签和适用场景。</template>
  </aside>
</template>
