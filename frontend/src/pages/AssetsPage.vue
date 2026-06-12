<script setup lang="ts">
import { ImagePlus, RefreshCw, ScanEye } from "@lucide/vue";
import { computed, onMounted, ref, watch } from "vue";
import AssetBulkBar from "@/components/assets/AssetBulkBar.vue";
import AssetConfigStrip from "@/components/assets/AssetConfigStrip.vue";
import AssetDetailPanel from "@/components/assets/AssetDetailPanel.vue";
import AssetGallery from "@/components/assets/AssetGallery.vue";
import AssetSidebar from "@/components/assets/AssetSidebar.vue";
import { useAssetsStore } from "@/stores/assets";

const assets = useAssetsStore();

const selected = computed(() => assets.selected);
const visibleLimit = ref(36);
const visibleStickers = computed(() => assets.stickers.slice(0, visibleLimit.value));
const hasMoreStickers = computed(() => visibleLimit.value < assets.stickers.length);
const stats = computed(() => {
  const all = assets.stickers.length;
  const pending = assets.stickers.filter((item) => item.review_status === "pending").length;
  const approved = assets.stickers.filter((item) => item.review_status === "approved").length;
  const failed = assets.stickers.filter((item) => item.review_status === "failed").length;
  return [
    { label: "当前视图", value: all },
    { label: "待审核", value: pending },
    { label: "已通过", value: approved },
    { label: "失败", value: failed },
  ];
});

onMounted(() => {
  void Promise.all([assets.reload(), assets.loadConfig()]);
});

watch(
  () => [assets.filters.status, assets.filters.emotion, assets.filters.q],
  () => {
    visibleLimit.value = 36;
  },
);

function readFile(file: File): Promise<{ name: string; data_url: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, data_url: String(reader.result || "") });
    reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

async function onUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = "";
  const accepted = files.filter((file) => /image\/(png|jpe?g|webp)/i.test(file.type));
  if (!accepted.length) return;
  assets.progress = { active: true, label: "读取文件", done: 0, total: accepted.length, failed: 0 };
  const payload = [];
  for (const file of accepted) {
    try {
      payload.push(await readFile(file));
    } finally {
      assets.progress.done += 1;
    }
  }
  await assets.upload(payload);
}

function toggle(id: string, checked: boolean) {
  assets.selectedIds = checked ? [...new Set([...assets.selectedIds, id])] : assets.selectedIds.filter((item) => item !== id);
}
</script>

<template>
  <main class="page-view">
    <div class="ops-page assets-page">
      <section class="page-head assets-head">
        <div>
          <p class="eyebrow">Asset Library</p>
          <h1>素材库</h1>
          <small>表情包上传、识别、审核、策略测试和微信发送自检都在这里处理。</small>
        </div>
        <div class="head-actions">
          <label class="primary-action file-action">
            <ImagePlus :size="17" />
            批量上传
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple @change="onUpload" />
          </label>
          <button class="secondary-action" type="button" :disabled="!selected" @click="assets.runVisionTest(selected?.id)">
            <ScanEye :size="16" /> 识别自检
          </button>
          <button class="icon-button" type="button" title="刷新" @click="assets.reload()"><RefreshCw :size="16" /></button>
        </div>
      </section>

      <AssetConfigStrip />

      <section class="asset-stats-grid">
        <article v-for="item in stats" :key="item.label" class="asset-stat-card">
          <small>{{ item.label }}</small>
          <strong>{{ item.value }}</strong>
        </article>
      </section>

      <AssetBulkBar :visible-stickers="visibleStickers" />

      <section v-if="assets.progress.active" class="asset-progress-panel">
        <div class="asset-progress-head">
          <strong>{{ assets.progress.label || "识别准备中" }}</strong>
          <span>{{ assets.progress.done }} / {{ assets.progress.total }}</span>
        </div>
        <div class="asset-progress-track"><span :style="{ width: `${assets.progressPercent}%` }"></span></div>
        <small>失败 {{ assets.progress.failed }} · 正在处理当前任务。</small>
      </section>

      <p v-if="assets.error" class="asset-error">{{ assets.error }}</p>

      <section class="asset-workbench">
        <AssetSidebar />
        <AssetGallery
          :stickers="visibleStickers"
          :selected-id="assets.selectedId"
          :selected-ids="assets.selectedIds"
          :has-more="hasMoreStickers"
          @select="assets.selectedId = $event"
          @toggle="toggle"
          @load-more="visibleLimit += 36"
        />
        <AssetDetailPanel :selected="selected" />
      </section>
    </div>
  </main>
</template>
