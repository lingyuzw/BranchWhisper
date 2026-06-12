<script setup lang="ts">
import { BadgeCheck, CheckCheck, CheckSquare, PauseCircle, ScanEye, Sparkles, Trash, Trash2 } from "@lucide/vue";
import { computed } from "vue";
import { useAssetsStore } from "@/stores/assets";
import type { Sticker } from "@/api/assets";

const props = defineProps<{
  visibleStickers: Sticker[];
}>();

const assets = useAssetsStore();
const checkedIds = computed(() => assets.selectedIds);

function selectAllCurrent() {
  assets.selectedIds = [...new Set([...assets.selectedIds, ...props.visibleStickers.map((item) => item.id)])];
}
</script>

<template>
  <section class="asset-bulk-bar">
    <div class="asset-bulk-status">
      <strong>{{ assets.selectedIds.length ? `已选择 ${assets.selectedIds.length} 张` : "未选择" }}</strong>
      <small>批量识别、审核和删除可作用于当前筛选结果或选中素材。</small>
    </div>
    <div class="asset-bulk-actions">
      <button class="secondary-action" type="button" @click="selectAllCurrent"><CheckSquare :size="16" /> 全选当前</button>
      <button class="secondary-action" type="button" :disabled="assets.progress.active" @click="assets.recognize(checkedIds, '识别选中')"><ScanEye :size="16" /> 识别选中</button>
      <button class="secondary-action danger" type="button" :disabled="!assets.progress.active" @click="assets.cancelProgress()"><PauseCircle :size="16" /> 停止识别</button>
      <button class="secondary-action" type="button" @click="assets.bulk('approve', checkedIds, '通过选中')"><BadgeCheck :size="16" /> 通过选中</button>
      <button class="secondary-action danger" type="button" @click="assets.bulk('delete', checkedIds, '删除选中')"><Trash2 :size="16" /> 删除选中</button>
      <button class="secondary-action" type="button" :disabled="assets.progress.active" @click="assets.bulk('reanalyze', [], '识别当前筛选', true)"><Sparkles :size="16" /> 识别当前筛选</button>
      <button class="secondary-action" type="button" @click="assets.bulk('approve', [], '通过当前筛选', true)"><CheckCheck :size="16" /> 通过当前筛选</button>
      <button class="secondary-action danger" type="button" @click="assets.bulk('delete', [], '删除当前筛选', true)"><Trash :size="16" /> 删除当前筛选</button>
    </div>
  </section>
</template>
