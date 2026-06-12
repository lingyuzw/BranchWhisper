<script setup lang="ts">
import { BadgeCheck, CheckCheck, CheckSquare, PauseCircle, ScanEye, Sparkles, Trash, Trash2 } from "@lucide/vue";
import { computed } from "vue";
import { useAssetsStore } from "@/stores/assets";
import { useUiStore } from "@/stores/ui";
import type { Sticker } from "@/api/assets";

const props = defineProps<{
  visibleStickers: Sticker[];
}>();

const assets = useAssetsStore();
const ui = useUiStore();
const checkedIds = computed(() => assets.selectedIds);

function selectAllCurrent() {
  assets.selectedIds = [...new Set([...assets.selectedIds, ...props.visibleStickers.map((item) => item.id)])];
  ui.info(`已选中当前视图 ${props.visibleStickers.length} 张素材`, 1800);
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function recognizeSelected() {
  if (!checkedIds.value.length) {
    ui.warning("请先选择要识别的素材");
    return;
  }
  try {
    await assets.recognize(checkedIds.value, "识别选中");
    ui.success("选中素材识别完成");
  } catch (error) {
    ui.error(`识别失败：${errorText(error)}`);
  }
}

async function runBulk(action: "reanalyze" | "approve" | "delete", ids: string[], label: string, includeFiltered = false) {
  if (!includeFiltered && !ids.length) {
    ui.warning("请先选择素材");
    return;
  }
  const scope = includeFiltered ? "当前筛选结果" : `${ids.length} 张选中素材`;
  if (action === "delete") {
    const confirmed = await ui.confirmAction({
      title: "删除素材",
      message: `确定删除${scope}？这个操作会移除素材文件。`,
      confirmText: "删除",
      tone: "error",
    });
    if (!confirmed) return;
  }
  try {
    ui.info(`${label}处理中...`, 1600);
    await assets.bulk(action, ids, label, includeFiltered);
    ui.success(`${label}完成`);
  } catch (error) {
    ui.error(`${label}失败：${errorText(error)}`);
  }
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
      <button class="secondary-action" type="button" :disabled="assets.progress.active" @click="recognizeSelected"><ScanEye :size="16" /> 识别选中</button>
      <button class="secondary-action danger" type="button" :disabled="!assets.progress.active" @click="assets.cancelProgress()"><PauseCircle :size="16" /> 停止识别</button>
      <button class="secondary-action" type="button" :disabled="assets.progress.active" @click="runBulk('approve', checkedIds, '通过选中')"><BadgeCheck :size="16" /> 通过选中</button>
      <button class="secondary-action danger" type="button" :disabled="assets.progress.active" @click="runBulk('delete', checkedIds, '删除选中')"><Trash2 :size="16" /> 删除选中</button>
      <button class="secondary-action" type="button" :disabled="assets.progress.active" @click="runBulk('reanalyze', [], '识别当前筛选', true)"><Sparkles :size="16" /> 识别当前筛选</button>
      <button class="secondary-action" type="button" :disabled="assets.progress.active" @click="runBulk('approve', [], '通过当前筛选', true)"><CheckCheck :size="16" /> 通过当前筛选</button>
      <button class="secondary-action danger" type="button" :disabled="assets.progress.active" @click="runBulk('delete', [], '删除当前筛选', true)"><Trash :size="16" /> 删除当前筛选</button>
    </div>
  </section>
</template>
