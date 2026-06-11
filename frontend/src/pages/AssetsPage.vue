<script setup lang="ts">
import { Check, ImagePlus, RefreshCw, ScanEye, Trash2 } from "@lucide/vue";
import { computed, onMounted } from "vue";
import PageScaffold from "@/components/common/PageScaffold.vue";
import { useAssetsStore } from "@/stores/assets";

const assets = useAssetsStore();

const selected = computed(() => assets.selected);
const checkedIds = computed(() => assets.selectedIds);

onMounted(() => {
  void assets.reload();
});

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

function currentScopeIds() {
  return checkedIds.value.length ? checkedIds.value : assets.stickers.map((item) => item.id);
}
</script>

<template>
  <PageScaffold eyebrow="Asset Library" title="素材库" description="上传、识别、审核和测试都在这里完成，操作后会直接刷新当前页面。">
    <div class="asset-toolbar">
      <label class="primary-action file-action">
        <ImagePlus :size="17" />
        批量上传
        <input type="file" accept="image/png,image/jpeg,image/webp" multiple @change="onUpload" />
      </label>
      <button class="secondary-action" type="button" :disabled="assets.progress.active" @click="assets.recognize(currentScopeIds(), '识别当前范围')">
        <ScanEye :size="16" /> 识别当前
      </button>
      <button class="secondary-action" type="button" @click="assets.approve(currentScopeIds())">
        <Check :size="16" /> 通过当前
      </button>
      <button class="secondary-action danger" type="button" @click="assets.remove(currentScopeIds())">
        <Trash2 :size="16" /> 删除当前
      </button>
      <button class="icon-button" type="button" @click="assets.reload()"><RefreshCw :size="16" /></button>
    </div>

    <section v-if="assets.progress.active" class="progress-panel">
      <div>
        <strong>{{ assets.progress.label }}</strong>
        <span>{{ assets.progress.done }} / {{ assets.progress.total }} · 失败 {{ assets.progress.failed }}</span>
      </div>
      <div class="progress-track"><span :style="{ width: `${assets.progressPercent}%` }"></span></div>
    </section>

    <section class="assets-layout">
      <aside class="asset-side">
        <label><span>状态</span><select v-model="assets.filters.status" @change="assets.reload()"><option value="">全部</option><option value="pending">待审核</option><option value="approved">已通过</option><option value="failed">失败</option></select></label>
        <label><span>分类</span><input v-model="assets.filters.emotion" placeholder="laugh / angry / smug" @keydown.enter="assets.reload()" /></label>
        <label><span>搜索</span><input v-model="assets.filters.q" placeholder="标签 / OCR / 场景" @keydown.enter="assets.reload()" /></label>
        <button class="secondary-action full" type="button" @click="assets.reload()">筛选</button>

        <div class="asset-test">
          <strong>策略测试</strong>
          <input v-model="assets.testText" placeholder="打一架?" />
          <button class="secondary-action full" type="button" @click="assets.runTest()">测试命中</button>
          <pre v-if="assets.testResult">{{ JSON.stringify(assets.testResult, null, 2) }}</pre>
        </div>
      </aside>

      <main class="asset-gallery-panel">
        <div class="asset-stats">
          <span>当前 {{ assets.stickers.length }} 张</span>
          <span>已选 {{ assets.selectedIds.length }} 张</span>
          <span v-if="assets.error" class="danger-text">{{ assets.error }}</span>
        </div>
        <div class="asset-gallery">
          <article
            v-for="item in assets.stickers"
            :key="item.id"
            class="asset-card"
            :class="{ active: item.id === assets.selectedId }"
            @click="assets.selectedId = item.id"
          >
            <input type="checkbox" :checked="assets.selectedIds.includes(item.id)" @click.stop @change="toggle(item.id, ($event.target as HTMLInputElement).checked)" />
            <img :src="item.thumbnail || item.url" :alt="item.name" loading="lazy" />
            <strong>{{ item.tag || item.emotion || "默认" }}</strong>
            <small>{{ item.review_status || "pending" }} · 强度 {{ item.intensity || "-" }}</small>
          </article>
        </div>
      </main>

      <aside class="asset-detail" v-if="selected">
        <img :src="selected.url || selected.thumbnail" :alt="selected.name" />
        <h2>{{ selected.name }}</h2>
        <p>{{ selected.caption || "暂无说明" }}</p>
        <dl>
          <dt>分类</dt><dd>{{ selected.emotion || selected.tag || "-" }}</dd>
          <dt>标签</dt><dd>{{ (selected.tags || []).join("，") || "-" }}</dd>
          <dt>场景</dt><dd>{{ (selected.scene || []).join("，") || "-" }}</dd>
          <dt>禁用</dt><dd>{{ (selected.avoid || []).join("，") || "-" }}</dd>
        </dl>
      </aside>
    </section>
  </PageScaffold>
</template>
