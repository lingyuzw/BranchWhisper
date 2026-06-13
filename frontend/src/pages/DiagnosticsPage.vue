<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { CheckCircle2, Clipboard, Copy, Image, Play, RefreshCw, Server, XCircle } from "@lucide/vue";
import {
  runLocalModelsDiagnostic,
  runVisionApiDiagnostic,
  type LocalModelCheck,
  type VisionApiDiagnostic,
} from "@/api/diagnostics";
import { useUiStore } from "@/stores/ui";

const ui = useUiStore();
const localChecks = ref<LocalModelCheck[]>([]);
const visionResult = ref<VisionApiDiagnostic | null>(null);
const localLoading = ref(false);
const visionLoading = ref(false);
const copiedLabel = ref("");

const localPassed = computed(() => localChecks.value.filter((item) => item.ok).length);
const localFailed = computed(() => localChecks.value.filter((item) => !item.ok).length);

onMounted(() => {
  void runLocalModels();
});

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function formatLatency(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${Math.round(numeric)} ms` : "--";
}

function formatJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value ?? "");
  }
}

async function copyText(label: string, text: string) {
  const value = String(text || "").trim();
  if (!value) {
    ui.warning(`${label}为空`);
    return;
  }
  try {
    await navigator.clipboard.writeText(value);
    copiedLabel.value = label;
    ui.success(`${label}已复制`);
    window.setTimeout(() => {
      if (copiedLabel.value === label) copiedLabel.value = "";
    }, 1400);
  } catch (error) {
    ui.error(`${label}复制失败：${errorText(error)}`);
  }
}

async function runLocalModels() {
  localLoading.value = true;
  try {
    const result = await runLocalModelsDiagnostic();
    localChecks.value = result.checks || [];
  } catch (error) {
    ui.error(`本地模型检测失败：${errorText(error)}`);
  } finally {
    localLoading.value = false;
  }
}

async function runVisionApi() {
  visionLoading.value = true;
  try {
    visionResult.value = await runVisionApiDiagnostic();
  } catch (error) {
    visionResult.value = {
      ok: false,
      url: "",
      model: "",
      api_key_set: false,
      message: `调用失败：${errorText(error)}`,
      error: errorText(error),
    };
  } finally {
    visionLoading.value = false;
  }
}
</script>

<template>
  <main class="page-view">
    <div class="diagnostics-page diagnostics-lite">
      <section class="page-head">
        <div>
          <p class="eyebrow">Diagnostics</p>
          <h1>检测中心</h1>
          <small>本地模型 API 与识图 API</small>
        </div>
        <div class="head-actions">
          <span v-if="copiedLabel" class="soft-badge">{{ copiedLabel }}已复制</span>
          <button class="secondary-action" type="button" :disabled="localLoading" @click="runLocalModels">
            <RefreshCw :size="16" /> {{ localLoading ? "检测中" : "检测本地模型" }}
          </button>
          <button class="primary-action" type="button" :disabled="visionLoading" @click="runVisionApi">
            <Play :size="16" /> {{ visionLoading ? "检测中" : "检测识图 API" }}
          </button>
        </div>
      </section>

      <section class="diagnostics-summary">
        <article><small>本地服务</small><strong>{{ localChecks.length || 4 }}</strong></article>
        <article class="passed"><small>正常</small><strong>{{ localPassed }}</strong></article>
        <article class="failed"><small>异常</small><strong>{{ localFailed }}</strong></article>
        <article :class="visionResult?.ok ? 'passed' : visionResult ? 'failed' : ''">
          <small>识图 API</small><strong>{{ visionResult ? (visionResult.ok ? "正常" : "异常") : "--" }}</strong>
        </article>
      </section>

      <section class="diagnostics-workbench">
      <section class="diagnostics-panel diagnostics-panel--local">
        <header class="diagnostics-panel-head">
          <div>
            <Server :size="18" />
            <strong>本地模型 API 检测</strong>
            <small>{{ localPassed }} / {{ localChecks.length || 4 }} 正常</small>
          </div>
          <button class="secondary-action" type="button" :disabled="localLoading" @click="runLocalModels">
            <RefreshCw :size="15" /> 刷新
          </button>
        </header>
        <div class="diagnostics-model-list diagnostics-model-table">
          <article v-for="check in localChecks" :key="check.id" class="diagnostic-api-row" :class="{ ok: check.ok, failed: !check.ok }">
            <div class="diagnostic-api-main">
              <CheckCircle2 v-if="check.ok" :size="18" />
              <XCircle v-else :size="18" />
              <div>
                <strong>{{ check.name }}</strong>
                <span>{{ check.message }}</span>
              </div>
            </div>
            <div class="diagnostic-api-meta">
              <span><small>状态</small><strong>{{ check.status }}</strong></span>
              <span><small>延迟</small><strong>{{ formatLatency(check.latency_ms) }}</strong></span>
              <span><small>端口</small><strong>{{ check.port || "--" }}</strong></span>
            </div>
            <div class="diagnostic-api-actions">
              <button class="small-button" type="button" @click="copyText('curl', check.curl)">
                <Clipboard :size="13" /> curl
              </button>
              <button class="small-button" type="button" @click="copyText('错误', check.error || check.message)">
                <Copy :size="13" /> 错误
              </button>
              <button class="small-button" type="button" @click="copyText('JSON', formatJson(check.detail))">
                <Copy :size="13" /> JSON
              </button>
            </div>
            <details class="diagnostic-details">
              <summary>展开详情</summary>
              <pre>{{ formatJson(check.detail) }}</pre>
            </details>
          </article>
          <p v-if="!localChecks.length && !localLoading" class="diagnostic-empty">还没有检测结果。</p>
        </div>
      </section>

      <section class="diagnostics-panel diagnostics-panel--vision">
        <header class="diagnostics-panel-head">
          <div>
            <Image :size="18" />
            <strong>识图模型 API 检测</strong>
            <small>{{ visionResult ? (visionResult.ok ? "可以正常调用 API" : "调用失败") : "未运行" }}</small>
          </div>
          <button class="secondary-action" type="button" :disabled="visionLoading" @click="runVisionApi">
            <Play :size="15" /> 运行
          </button>
        </header>
        <article v-if="visionResult" class="diagnostic-vision-card" :class="{ ok: visionResult.ok, failed: !visionResult.ok }">
          <div class="diagnostic-api-main">
            <CheckCircle2 v-if="visionResult.ok" :size="18" />
            <XCircle v-else :size="18" />
            <div>
              <strong>{{ visionResult.message }}</strong>
              <span>{{ visionResult.model || "--" }} · {{ visionResult.url || "--" }}</span>
            </div>
          </div>
          <div class="diagnostic-api-meta">
            <span><small>API Key</small><strong>{{ visionResult.api_key_set ? "已配置" : "未配置" }}</strong></span>
            <span><small>HTTP</small><strong>{{ visionResult.status_code || "--" }}</strong></span>
            <span><small>延迟</small><strong>{{ formatLatency(visionResult.latency_ms) }}</strong></span>
          </div>
          <div class="diagnostic-api-actions">
            <button class="small-button" type="button" @click="copyText('错误', visionResult.error || visionResult.message)">
              <Copy :size="13" /> 错误
            </button>
            <button class="small-button" type="button" @click="copyText('请求 JSON', formatJson(visionResult.request_shape))">
              <Copy :size="13" /> 请求 JSON
            </button>
            <button class="small-button" type="button" @click="copyText('响应 JSON', formatJson(visionResult.response))">
              <Copy :size="13" /> 响应 JSON
            </button>
          </div>
          <details class="diagnostic-details">
            <summary>展开详情</summary>
            <pre>请求:
{{ formatJson(visionResult.request_shape) }}

响应:
{{ formatJson(visionResult.response) }}</pre>
          </details>
        </article>
        <p v-else class="diagnostic-empty">尚未运行识图 API 检测。</p>
      </section>
      </section>
    </div>
  </main>
</template>
