<script setup lang="ts">
import { ImagePlus, RefreshCw, UploadCloud } from "@lucide/vue";
import { computed, onMounted, ref, watch } from "vue";
import AssetBulkBar from "@/components/assets/AssetBulkBar.vue";
import AssetConfigStrip from "@/components/assets/AssetConfigStrip.vue";
import AssetDetailPanel from "@/components/assets/AssetDetailPanel.vue";
import AssetGallery from "@/components/assets/AssetGallery.vue";
import AssetSidebar from "@/components/assets/AssetSidebar.vue";
import InlineProbe from "@/components/layout/InlineProbe.vue";
import { useAssetsStore } from "@/stores/assets";
import { useUiStore } from "@/stores/ui";

const assets = useAssetsStore();
const ui = useUiStore();

const selected = computed(() => assets.selected);
const visibleLimit = ref(36);
const uploadInput = ref<HTMLInputElement | null>(null);
const uploadDragging = ref(false);
const detailOpen = ref(false);
type ProbeStatus = "idle" | "running" | "ok" | "failed" | "warning";
const assetProbe = ref<{ status: ProbeStatus; text: string; detail: string }>({ status: "idle", text: "未检测", detail: "" });
const stickerProbe = ref<{ status: ProbeStatus; text: string; detail: string }>({ status: "idle", text: "未检测", detail: "" });
const visibleStickers = computed(() => assets.stickers.slice(0, visibleLimit.value));
const hasMoreStickers = computed(() => visibleLimit.value < assets.stickers.length);
const progressStage = computed(() => {
  const labels = {
    reading: "读取",
    uploading: "上传",
    processing: "处理",
    refreshing: "刷新",
    saving: "保存",
    idle: "完成",
  };
  return labels[assets.progress.phase] || "处理";
});
const progressCountText = computed(() => {
  if (assets.progress.total === 100) return `${assets.progress.done}%`;
  return `${assets.progress.done} / ${assets.progress.total}`;
});
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

async function uploadFiles(files: File[]) {
  const accepted = files.filter((file) => /image\/(png|jpe?g|webp)/i.test(file.type));
  if (!accepted.length) {
    if (files.length) ui.warning("只支持 PNG / JPG / WebP 图片");
    return;
  }
  assets.progress = { active: true, label: "读取文件", done: 0, total: 100, failed: 0, phase: "reading" };
  const payload = [];
  try {
    for (const [index, file] of accepted.entries()) {
      try {
        payload.push(await readFile(file));
      } finally {
        assets.progress.done = Math.round(((index + 1) / accepted.length) * 18);
      }
    }
    await assets.upload(payload);
    visibleLimit.value = Math.max(visibleLimit.value, assets.selectedIds.length, 36);
    ui.success(`已导入 ${accepted.length} 张素材`);
  } catch (error) {
    assets.progress.active = false;
    ui.error(`素材上传失败：${errorText(error)}`);
  }
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function refreshAssets() {
  try {
    await assets.reload();
    if (assets.error) throw new Error(assets.error);
    ui.success("素材库已刷新", 1800);
  } catch (error) {
    ui.error(`刷新失败：${errorText(error)}`);
  }
}

function formatProbeDetail(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value ?? "");
  }
}

async function copyProbeDetail(detail: string) {
  if (!detail.trim()) {
    ui.warning("没有可复制的检测结果", 1200);
    return;
  }
  try {
    await navigator.clipboard.writeText(detail);
    ui.success("检测结果已复制", 1200);
  } catch (error) {
    ui.error(`复制失败：${errorText(error)}`);
  }
}

async function runVisionProbe() {
  assetProbe.value = { status: "running", text: "检测中", detail: "" };
  await assets.runVisionTest(assets.selectedId);
  const result = assets.visionTestResult;
  if (result) {
    const ok = result.ok !== false;
    assetProbe.value = {
      status: ok ? "ok" : "failed",
      text: ok ? "识图 API 正常" : String(result.error || result.message || "识图失败"),
      detail: formatProbeDetail(result),
    };
    return;
  }
  assetProbe.value = { status: "failed", text: assets.detailMessage || "识图测试失败", detail: "" };
}

async function runStickerPolicyProbe() {
  stickerProbe.value = { status: "running", text: "检测中", detail: "" };
  try {
    await assets.runTest();
    const result = assets.testResult || {};
    const selectedSticker = Boolean((result as Record<string, unknown>).sticker);
    stickerProbe.value = {
      status: selectedSticker ? "ok" : "warning",
      text: selectedSticker ? "策略命中素材" : "策略返回但未命中素材",
      detail: formatProbeDetail(result),
    };
  } catch (error) {
    stickerProbe.value = { status: "failed", text: errorText(error), detail: "" };
  }
}

async function onUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = "";
  await uploadFiles(files);
}

async function onUploadDrop(event: DragEvent) {
  uploadDragging.value = false;
  const files = Array.from(event.dataTransfer?.files || []);
  await uploadFiles(files);
}

function onUploadDragLeave(event: DragEvent) {
  const current = event.currentTarget as HTMLElement | null;
  const next = event.relatedTarget;
  if (current && next instanceof Node && current.contains(next)) return;
  uploadDragging.value = false;
}

function openUploadPicker() {
  uploadInput.value?.click();
}

function toggle(id: string, checked: boolean) {
  assets.selectedIds = checked ? [...new Set([...assets.selectedIds, id])] : assets.selectedIds.filter((item) => item !== id);
}

function selectSticker(id: string) {
  assets.selectedId = id;
  detailOpen.value = true;
}

async function removeOne(id: string) {
  const item = assets.stickers.find((sticker) => sticker.id === id);
  const confirmed = await ui.confirmAction({
    title: "删除素材",
    message: `确定删除「${item?.name || id}」？这个操作会移除素材文件。`,
    confirmText: "删除",
    tone: "error",
  });
  if (!confirmed) return;
  try {
    await assets.remove([id]);
    ui.success("素材已删除");
  } catch (error) {
    ui.error(`删除失败：${errorText(error)}`);
  }
}
</script>

<template>
  <main class="page-view">
    <div class="ops-page assets-page">
      <section class="page-head assets-head">
        <div>
          <p class="eyebrow">Asset Library</p>
          <h1>素材库</h1>
          <small>表情包上传、识别、审核和发送策略配置在这里处理；识图和策略测试就在本页完成。</small>
        </div>
        <div class="head-actions">
          <button class="icon-button" type="button" title="刷新" :disabled="assets.loading" @click="refreshAssets"><RefreshCw :size="16" /></button>
        </div>
      </section>

      <section
        class="asset-upload-dock"
        :class="{ 'is-dragging': uploadDragging }"
        @dragenter.prevent="uploadDragging = true"
        @dragover.prevent="uploadDragging = true"
        @dragleave.prevent="onUploadDragLeave"
        @drop.prevent="onUploadDrop"
      >
        <div class="asset-upload-mark"><UploadCloud :size="22" /></div>
        <div class="asset-upload-copy">
          <span><ImagePlus :size="14" />PNG / JPG / WebP</span>
          <strong>拖放图片到这里，或选择文件批量导入</strong>
          <small>上传后会进入素材库，可继续批量识别、审核和配置发送策略。</small>
        </div>
        <div class="asset-upload-actions">
          <button class="primary-action" type="button" @click="openUploadPicker"><ImagePlus :size="16" />选择文件</button>
          <input ref="uploadInput" class="asset-file-input" type="file" accept="image/png,image/jpeg,image/webp" multiple @change="onUpload" />
        </div>
      </section>

      <AssetConfigStrip />

      <section class="asset-probe-strip">
        <InlineProbe
          variant="strip"
          title="素材识图 API"
          summary="用当前选中素材或内置样例请求识图接口，验证模型与 Key。"
          :status="assetProbe.status"
          :status-text="assetProbe.text"
          :detail="assetProbe.detail"
          action-text="测试识图"
          @run="runVisionProbe"
          @copy="copyProbeDetail(assetProbe.detail)"
        />
        <InlineProbe
          variant="strip"
          title="表情策略匹配"
          summary="用测试文案运行素材选择逻辑，检查是否误发或匹配不到。"
          :status="stickerProbe.status"
          :status-text="stickerProbe.text"
          :detail="stickerProbe.detail"
          action-text="测试策略"
          @run="runStickerPolicyProbe"
          @copy="copyProbeDetail(stickerProbe.detail)"
        />
      </section>

      <section class="asset-stats-grid">
        <article v-for="item in stats" :key="item.label" class="asset-stat-card">
          <small>{{ item.label }}</small>
          <strong>{{ item.value }}</strong>
        </article>
      </section>

      <AssetBulkBar :visible-stickers="visibleStickers" />

      <section v-if="assets.progress.active" class="asset-progress-panel">
        <div class="asset-progress-head">
          <strong><span>{{ progressStage }}</span>{{ assets.progress.label || "识别准备中" }}</strong>
          <em>{{ progressCountText }}</em>
        </div>
        <div class="asset-progress-track"><span :style="{ width: `${assets.progressPercent}%` }"></span></div>
        <small>{{ assets.progress.failed ? `失败 ${assets.progress.failed} · ` : "" }}正在处理当前任务，完成后会自动刷新列表。</small>
      </section>

      <p v-if="assets.error" class="asset-error">{{ assets.error }}</p>

      <section class="asset-workbench" :class="{ 'detail-open': detailOpen }">
        <AssetSidebar />
        <AssetGallery
          :stickers="visibleStickers"
          :selected-id="assets.selectedId"
          :selected-ids="assets.selectedIds"
          :has-more="hasMoreStickers"
          @select="selectSticker"
          @toggle="toggle"
          @remove="removeOne"
          @load-more="visibleLimit += 36"
        />
        <AssetDetailPanel v-if="detailOpen" :selected="selected" @close="detailOpen = false" />
      </section>
    </div>
  </main>
</template>
