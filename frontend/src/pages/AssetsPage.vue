<script setup lang="ts">
import { BadgeCheck, CheckCheck, CheckSquare, ImagePlus, PauseCircle, RefreshCw, ScanEye, Sparkles, Trash, Trash2 } from "@lucide/vue";
import { computed, onMounted, ref, watch } from "vue";
import { useAssetsStore } from "@/stores/assets";

const assets = useAssetsStore();

const selected = computed(() => assets.selected);
const checkedIds = computed(() => assets.selectedIds);
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
  void assets.reload();
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

function currentScopeIds() {
  return checkedIds.value.length ? checkedIds.value : assets.stickers.map((item) => item.id);
}

function selectAllCurrent() {
  assets.selectedIds = [...new Set([...assets.selectedIds, ...visibleStickers.value.map((item) => item.id)])];
}
</script>

<template>
  <main class="page-view">
    <div class="ops-page assets-page">
      <section class="page-head assets-head">
        <div><p class="eyebrow">Asset Library</p><h1>素材库</h1><small>表情包上传、识别、审核和微信发送自检都在这里处理。</small></div>
        <div class="head-actions">
          <label class="primary-action file-action">
            <ImagePlus :size="17" />
            批量上传
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple @change="onUpload" />
          </label>
          <button class="secondary-action" type="button"><ScanEye :size="16" /> 识别自检</button>
          <button class="icon-button" type="button" title="刷新" @click="assets.reload()"><RefreshCw :size="16" /></button>
        </div>
      </section>

      <section class="asset-config-strip">
        <label><span>自动识别</span><select><option>启用</option><option>关闭</option></select></label>
        <label><span>识别 URL</span><input placeholder="https://.../v1/chat/completions" /></label>
        <label><span>模型</span><input placeholder="qwen-vl / gpt-4.1-mini" /></label>
        <label><span>API Key</span><input type="password" placeholder="留空不修改" /></label>
        <label><span>超时秒</span><input type="number" value="45" /></label>
        <label><span>Max Tokens</span><input type="number" value="420" /></label>
        <label><span>自动发图</span><select><option>启用</option><option>关闭</option></select></label>
        <label><span>活跃度</span><select><option>标准</option><option>活跃</option><option>低</option></select></label>
        <label><span>冷却秒</span><input type="number" value="5" /></label>
        <label><span>每日上限</span><input type="number" value="60" /></label>
        <label><span>连续上限</span><input type="number" value="2" /></label>
        <label><span>自定义概率</span><input type="number" value="0.65" /></label>
        <button class="secondary-action" type="button">保存素材配置</button>
      </section>

      <section class="asset-stats-grid">
        <article v-for="item in stats" :key="item.label" class="asset-stat-card">
          <small>{{ item.label }}</small>
          <strong>{{ item.value }}</strong>
        </article>
      </section>

      <section class="asset-bulk-bar">
        <div class="asset-bulk-status">
          <strong>{{ assets.selectedIds.length ? `已选择 ${assets.selectedIds.length} 张` : "未选择" }}</strong>
          <small>批量识别、审核和删除会作用于当前筛选结果或选中素材。</small>
        </div>
        <div class="asset-bulk-actions">
          <button class="secondary-action" type="button" @click="selectAllCurrent"><CheckSquare :size="16" /> 全选当前</button>
          <button class="secondary-action" type="button" :disabled="assets.progress.active" @click="assets.recognize(checkedIds, '识别选中')"><ScanEye :size="16" /> 识别选中</button>
          <button class="secondary-action danger" type="button" :disabled="!assets.progress.active"><PauseCircle :size="16" /> 停止识别</button>
          <button class="secondary-action" type="button" @click="assets.approve(checkedIds)"><BadgeCheck :size="16" /> 通过选中</button>
          <button class="secondary-action danger" type="button" @click="assets.remove(checkedIds)"><Trash2 :size="16" /> 删除选中</button>
          <button class="secondary-action" type="button" :disabled="assets.progress.active" @click="assets.recognize(currentScopeIds(), '识别当前筛选')"><Sparkles :size="16" /> 识别当前筛选</button>
          <button class="secondary-action" type="button" @click="assets.approve(currentScopeIds())"><CheckCheck :size="16" /> 通过当前筛选</button>
          <button class="secondary-action danger" type="button" @click="assets.remove(currentScopeIds())"><Trash :size="16" /> 删除当前筛选</button>
        </div>
      </section>

      <section v-if="assets.progress.active" class="asset-progress-panel">
        <div class="asset-progress-head">
          <strong>{{ assets.progress.label || "识别准备中" }}</strong>
          <span>{{ assets.progress.done }} / {{ assets.progress.total }}</span>
        </div>
        <div class="asset-progress-track"><span :style="{ width: `${assets.progressPercent}%` }"></span></div>
        <small>失败 {{ assets.progress.failed }} · 正在处理当前任务。</small>
      </section>

      <section class="asset-workbench">
        <aside class="asset-sidebar">
          <div class="asset-filter-card">
            <label><span>状态</span><select v-model="assets.filters.status" @change="assets.reload()"><option value="">全部</option><option value="pending">待审核</option><option value="approved">已通过</option><option value="failed">失败</option><option value="disabled">停用</option></select></label>
            <label><span>分类</span><select v-model="assets.filters.emotion" @change="assets.reload()"><option value="">全部分类</option><option value="laugh">laugh</option><option value="smug">smug</option><option value="angry">angry</option><option value="sad">sad</option><option value="comfort">comfort</option><option value="confused">confused</option><option value="shock">shock</option><option value="sleepy">sleepy</option><option value="cute">cute</option><option value="bye">bye</option><option value="silent">silent</option><option value="agree">agree</option><option value="reject">reject</option></select></label>
            <label class="wide"><span>搜索</span><input v-model="assets.filters.q" type="search" placeholder="标签 / OCR / 场景" @keydown.enter="assets.reload()" /></label>
          </div>
          <div class="asset-test-card">
            <strong>策略测试</strong>
            <input v-model="assets.testText" type="text" placeholder="哈哈哈哈 / 无语了 / 有点难过" />
            <select><option value="web">Web</option><option value="weixin">微信</option></select>
            <button class="secondary-action" type="button" @click="assets.runTest()"><Sparkles :size="16" /> 测试命中</button>
            <div class="asset-test-result" :class="{ hit: assets.testResult }">{{ assets.testResult ? JSON.stringify(assets.testResult, null, 2) : "等待测试。" }}</div>
          </div>
        </aside>

        <section class="asset-gallery-panel">
          <div class="asset-gallery">
            <article
              v-for="item in visibleStickers"
              :key="item.id"
              class="asset-card"
              :class="{ active: item.id === assets.selectedId, selected: assets.selectedIds.includes(item.id), 'review-approved': item.review_status === 'approved', 'review-failed': item.review_status === 'failed' }"
              @click="assets.selectedId = item.id"
            >
              <input class="asset-card-check" type="checkbox" :checked="assets.selectedIds.includes(item.id)" @click.stop @change="toggle(item.id, ($event.target as HTMLInputElement).checked)" />
              <div class="asset-card-preview">
                <img :src="item.thumbnail || item.url" :alt="item.name" loading="lazy" />
                <strong>{{ item.tag || item.emotion || "默认" }}</strong>
                <small>{{ item.review_status || "pending" }} · 强度 {{ item.intensity || "-" }}</small>
              </div>
            </article>
          </div>
          <div v-if="hasMoreStickers" class="asset-load-more">
            <button class="secondary-action" type="button" @click="visibleLimit += 36">加载更多</button>
          </div>
        </section>

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
      </section>
    </div>
  </main>
</template>
