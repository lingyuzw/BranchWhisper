<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { AlertTriangle, CheckCircle2, Copy, RefreshCw, Stethoscope, XCircle } from "@lucide/vue";
import { loadDialogTraces, loadRuntimeDiagnostics } from "@/api/diagnostics";
import type { DialogTrace, RuntimeDiagnosticItem, RuntimeDiagnostics, RuntimeDiagnosticStatus } from "@/api/diagnostics";
import DiagnosticCheckList from "@/components/diagnostics/DiagnosticCheckList.vue";
import DialogTracePanel from "@/components/diagnostics/DialogTracePanel.vue";
import { useUiStore } from "@/stores/ui";

const ui = useUiStore();
const loading = ref(false);
const diagnostics = ref<RuntimeDiagnostics | null>(null);
const traces = ref<DialogTrace[]>([]);
const loadedAt = ref<Date | null>(null);

const overall = computed(() => diagnostics.value?.status || "warning");
const items = computed(() => diagnostics.value?.items || []);
const summary = computed(() => diagnostics.value?.summary || { total: 0, ok: 0, warning: 0, error: 0 });

onMounted(() => {
  void refreshDiagnostics();
});

async function refreshDiagnostics() {
  loading.value = true;
  try {
    diagnostics.value = await loadRuntimeDiagnostics();
    traces.value = (await loadDialogTraces(8)).traces || [];
    loadedAt.value = new Date();
  } catch (error) {
    ui.error(`运行诊断读取失败：${errorMessage(error)}`);
  } finally {
    loading.value = false;
  }
}

async function copyDiagnostics() {
  if (!diagnostics.value) {
    ui.warning("没有可复制的诊断结果");
    return;
  }
  try {
    await navigator.clipboard.writeText(JSON.stringify(diagnostics.value, null, 2));
    ui.success("运行诊断结果已复制");
  } catch (error) {
    ui.error(`复制失败：${errorMessage(error)}`);
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function statusLabel(status: RuntimeDiagnosticStatus) {
  if (status === "ok") return "正常";
  if (status === "warning") return "需关注";
  return "异常";
}

function statusIcon(status: RuntimeDiagnosticStatus) {
  if (status === "ok") return CheckCircle2;
  if (status === "warning") return AlertTriangle;
  return XCircle;
}

function roleLabel(role: string) {
  const labels: Record<string, string> = {
    asr: "ASR",
    llm: "LLM",
    tts: "TTS",
    integration: "接入",
    tool: "工具",
  };
  return labels[role] || role.toUpperCase();
}

function checkKindLabel(kind: string) {
  const labels: Record<string, string> = {
    model_path: "路径",
    cwd: "目录",
    binary: "命令",
    required_file: "依赖文件",
    port: "端口",
    health_url: "健康检查",
    profile: "Profile",
  };
  return labels[kind] || kind;
}

function loadedAtText() {
  return loadedAt.value ? loadedAt.value.toLocaleTimeString() : "尚未检测";
}
</script>

<template>
  <main class="page-view">
    <div class="ops-page diagnostics-page">
      <section class="page-head">
        <div>
          <p class="eyebrow">Runtime Diagnostics</p>
          <h1>运行诊断</h1>
        </div>
        <div class="head-actions">
          <button class="secondary-action" type="button" :disabled="loading" @click="copyDiagnostics">
            <Copy :size="16" /> 复制结果
          </button>
          <button class="primary-action" type="button" :disabled="loading" @click="refreshDiagnostics">
            <RefreshCw :size="16" /> {{ loading ? "检测中..." : "重新检测" }}
          </button>
        </div>
      </section>

      <section class="diagnostics-overview" :class="overall">
        <div class="diagnostics-overview-main">
          <span class="diagnostics-mark">
            <component :is="statusIcon(overall)" :size="22" />
          </span>
          <div>
            <strong>{{ statusLabel(overall) }}</strong>
            <span>{{ summary.total }} 个运行 profile，{{ summary.error }} 个异常，{{ summary.warning }} 个需关注。</span>
          </div>
        </div>
        <div class="diagnostics-overview-meta">
          <span>最近检测</span>
          <strong>{{ loadedAtText() }}</strong>
        </div>
      </section>

      <section class="diagnostics-kpis">
        <div class="diagnostics-kpi ok"><span>正常</span><strong>{{ summary.ok }}</strong></div>
        <div class="diagnostics-kpi warning"><span>需关注</span><strong>{{ summary.warning }}</strong></div>
        <div class="diagnostics-kpi error"><span>异常</span><strong>{{ summary.error }}</strong></div>
        <div class="diagnostics-kpi total"><span>总数</span><strong>{{ summary.total }}</strong></div>
      </section>

      <section v-if="items.length" class="diagnostics-grid">
        <article v-for="item in items" :key="`${item.role}:${item.name}`" class="diagnostic-card" :class="item.status">
          <header class="diagnostic-card-head">
            <span class="diagnostic-role">{{ roleLabel(item.role) }}</span>
            <span class="diagnostic-status">
              <component :is="statusIcon(item.status)" :size="15" />
              {{ statusLabel(item.status) }}
            </span>
          </header>
          <div class="diagnostic-title">
            <strong>{{ item.name }}</strong>
            <span>{{ item.provider }}</span>
          </div>
          <p class="diagnostic-summary">{{ item.summary }}</p>

          <DiagnosticCheckList :checks="item.checks" :kind-label="checkKindLabel" :status-label="statusLabel" />
        </article>
      </section>

      <section v-else class="diagnostics-empty">
        <Stethoscope :size="28" />
        <strong>{{ loading ? "正在读取运行诊断" : "暂无运行 profile" }}</strong>
        <span>{{ loading ? "请稍候。" : "配置 ASR、LLM 或 TTS 服务后，这里会显示路径、端口、命令和健康检查结果。" }}</span>
      </section>

      <DialogTracePanel :traces="traces" />
    </div>
  </main>
</template>
