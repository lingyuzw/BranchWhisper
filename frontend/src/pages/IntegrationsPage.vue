<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import {
  Copy,
  Download,
  Edit3,
  Eraser,
  Link2,
  PackagePlus,
  Play,
  Plus,
  QrCode,
  RefreshCw,
  RotateCw,
  Save,
  Square,
  Trash2,
  X,
} from "@lucide/vue";
import type { IntegrationItem } from "@/api/integrations";
import InlineProbe from "@/components/layout/InlineProbe.vue";
import { useIntegrationsStore } from "@/stores/integrations";
import { useProfilesStore } from "@/stores/profiles";
import { useUiStore } from "@/stores/ui";

const integrations = useIntegrationsStore();
const profiles = useProfilesStore();
const ui = useUiStore();
const configOpen = ref(false);
const actionMessage = ref("");
const configSaving = ref(false);

const selected = computed(() => integrations.selected);
const selectedAccounts = computed(() => accounts(selected.value));
const bridgeRunning = computed(() => ["running", "starting"].includes(String(selected.value?.status || "")));
const loginReady = computed(() => selectedAccounts.value.length > 0);
const textProbeReady = computed(() => Boolean(integrations.testResult && !integrations.testResult.startsWith("失败")));
const voiceProbeReady = computed(() => Boolean(integrations.voiceResult && integrations.voiceResult.includes("接口已接收")));
type ProbeStatus = "idle" | "running" | "ok" | "failed" | "warning";
const dialogProbeRunning = ref(false);
const voiceProbeRunning = ref(false);
const stickerProbeRunning = ref(false);
const dialogProbeStatus = computed<ProbeStatus>(() => {
  if (dialogProbeRunning.value) return "running";
  if (!integrations.testResult) return "idle";
  return integrations.testResult.startsWith("失败") ? "failed" : "ok";
});
const voiceProbeStatus = computed<ProbeStatus>(() => {
  if (voiceProbeRunning.value) return "running";
  if (!integrations.voiceResult) return "idle";
  return integrations.voiceResult.includes("失败") ? "failed" : "ok";
});
const stickerProbeStatus = computed<ProbeStatus>(() => {
  if (stickerProbeRunning.value) return "running";
  if (!integrations.stickerResult) return "idle";
  return integrations.stickerResult.includes("失败") ? "failed" : "ok";
});
const integrationSteps = computed(() => [
  {
    label: "登录",
    status: loginReady.value ? "已登录" : integrations.qrSession ? "待扫码" : "未配置",
    state: loginReady.value ? "ok" : integrations.qrSession ? "pending" : "idle",
  },
  {
    label: "桥接",
    status: bridgeRunning.value ? "桥接成功" : selected.value?.status === "failed" ? "失败" : "未启动",
    state: bridgeRunning.value ? "ok" : selected.value?.status === "failed" ? "failed" : "idle",
  },
  {
    label: "文字",
    status: textProbeReady.value ? "接收正常" : integrations.testResult ? "失败" : "未测试",
    state: textProbeReady.value ? "ok" : integrations.testResult ? "failed" : "idle",
  },
  {
    label: "发送",
    status: voiceProbeReady.value ? "发送正常" : integrations.voiceResult ? "失败" : "未测试",
    state: voiceProbeReady.value ? "ok" : integrations.voiceResult ? "failed" : "idle",
  },
]);

onMounted(async () => {
  await Promise.all([integrations.reload(), profiles.reload()]);
  integrations.startPolling();
});

onUnmounted(() => {
  integrations.stopPolling();
});

function statusClass(status?: string) {
  if (["running", "login", "logged_in"].includes(status || "")) return "active";
  if (["starting", "installing"].includes(status || "")) return "loading";
  if (status === "failed") return "failed";
  return "stopped";
}

function qrImage(session: Record<string, any> | null) {
  const content = String(session?.qrcode_img_content || "");
  if (!content) return "";
  if (content.startsWith("data:")) return content;
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(content)}`;
}

function accounts(item: Record<string, any> | null | undefined) {
  return Array.isArray(item?.accounts) ? item.accounts : [];
}

function accountDiagnosticText(account: Record<string, any>) {
  return [
    `账号：${account.nickname || account.name || account.account_id || account.id || "--"}`,
    `Account ID：${account.account_id || account.id || "--"}`,
    `Base URL：${account.base_url || "--"}`,
    `Base URL 可达：${account.base_url_reachable === true ? "是" : account.base_url_reachable === false ? "否" : "未检测"}`,
    account.connectivity_error ? `错误：${account.connectivity_error}` : "",
    account.diagnostic_hint ? `提示：${account.diagnostic_hint}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function copyAccountDiagnostic(account: Record<string, any>) {
  try {
    await navigator.clipboard.writeText(accountDiagnosticText(account));
    showActionMessage("账号诊断已复制", "success");
  } catch {
    showActionMessage("账号诊断复制失败", "error");
  }
}

function timings(item: Record<string, any> | null | undefined) {
  return Array.isArray(item?.recent_timings) ? item.recent_timings.slice(0, 4) : [];
}

function profileName(id?: string) {
  const profile = profiles.profiles.find((item) => item.id === (id || "default"));
  return profile?.name || id || "default";
}

function openNew() {
  integrations.fillForm(null);
  configOpen.value = true;
}

function openEdit(item: IntegrationItem) {
  integrations.fillForm(item);
  configOpen.value = true;
}

async function saveConfig() {
  configSaving.value = true;
  try {
    await integrations.saveForm();
    configOpen.value = false;
    showActionMessage("接入配置已保存", "success");
  } catch (error) {
    showActionMessage(`接入配置保存失败：${errorText(error)}`, "error");
  } finally {
    configSaving.value = false;
  }
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function showActionMessage(message: string, type: "info" | "success" | "warning" | "error" = "info") {
  actionMessage.value = message;
  ui.toast(message, type);
  window.setTimeout(() => {
    if (actionMessage.value === message) actionMessage.value = "";
  }, 1800);
}

async function refreshIntegrations() {
  try {
    await integrations.reload();
    if (integrations.error) throw new Error(integrations.error);
    showActionMessage("接入状态已刷新", "success");
  } catch (error) {
    showActionMessage(`刷新失败：${errorText(error)}`, "error");
  }
}

async function runIntegration(item: IntegrationItem, action: "install" | "start" | "stop" | "restart") {
  integrations.selectedId = item.id;
  const label = { install: "安装适配器", start: "启动接入", stop: "停止接入", restart: "重启接入" }[action];
  showActionMessage(`${label}中...`);
  try {
    await integrations.run(action);
    showActionMessage(`${label}完成`, "success");
  } catch (error) {
    showActionMessage(`${label}失败：${errorText(error)}`, "error");
  }
}

async function removeIntegration(item: IntegrationItem) {
  const confirmed = await ui.confirmAction({
    title: "删除接入实例",
    message: `确定删除「${item.chat_name || item.id}」？运行日志和实例配置会一并移除。`,
    confirmText: "删除",
    tone: "error",
  });
  if (!confirmed) return;
  try {
    await integrations.remove(item.id);
    showActionMessage("接入实例已删除", "success");
  } catch (error) {
    showActionMessage(`删除失败：${errorText(error)}`, "error");
  }
}

async function startQrLogin() {
  showActionMessage("正在创建扫码登录会话...");
  try {
    await integrations.startQrLogin(true);
    showActionMessage("扫码登录会话已创建", "success");
  } catch (error) {
    showActionMessage(`扫码登录失败：${errorText(error)}`, "error");
  }
}

async function startBridge() {
  showActionMessage("正在启动桥接...");
  try {
    await integrations.startBridge();
    showActionMessage("桥接启动请求已发送", "success");
  } catch (error) {
    showActionMessage(`桥接启动失败：${errorText(error)}`, "error");
  }
}

async function runDialogProbe() {
  showActionMessage("正在测试真实微信 dialog 链路...");
  dialogProbeRunning.value = true;
  try {
    await integrations.runDialogTest();
    showActionMessage("文本回复链路正常", "success");
  } catch (error) {
    integrations.testResult = `失败：${errorText(error)}`;
    showActionMessage(`文本回复测试失败：${errorText(error)}`, "error");
  } finally {
    dialogProbeRunning.value = false;
  }
}

async function runVoiceProbe() {
  showActionMessage("正在测试语音发送...");
  voiceProbeRunning.value = true;
  try {
    await integrations.runVoiceTest();
    showActionMessage(integrations.voiceResult.includes("失败") ? "语音测试失败，已生成诊断" : "语音测试已发送", integrations.voiceResult.includes("失败") ? "warning" : "success");
  } catch (error) {
    integrations.voiceResult = `失败：${errorText(error)}`;
    showActionMessage(`语音测试失败：${errorText(error)}`, "error");
  } finally {
    voiceProbeRunning.value = false;
  }
}

async function runStickerProbe() {
  showActionMessage("正在测试素材发送...");
  stickerProbeRunning.value = true;
  try {
    await integrations.runStickerTest();
    showActionMessage(integrations.stickerResult.includes("失败") ? "素材测试失败，已生成诊断" : "素材测试已发送", integrations.stickerResult.includes("失败") ? "warning" : "success");
  } catch (error) {
    integrations.stickerResult = `失败：${errorText(error)}`;
    showActionMessage(`素材测试失败：${errorText(error)}`, "error");
  } finally {
    stickerProbeRunning.value = false;
  }
}

async function copyProbeResult(label: string, detail: string) {
  if (!detail.trim()) {
    showActionMessage(`${label}没有可复制结果`, "warning");
    return;
  }
  try {
    await navigator.clipboard.writeText(detail);
    showActionMessage(`${label}结果已复制`, "success");
  } catch {
    showActionMessage(`${label}结果复制失败`, "error");
  }
}

async function pollLogin() {
  try {
    await integrations.pollQrLogin(false);
    showActionMessage("登录状态已更新", "success");
  } catch (error) {
    showActionMessage(`登录轮询失败：${errorText(error)}`, "error");
  }
}

async function refreshLogs() {
  try {
    await integrations.refreshLogs();
    if (integrations.error) throw new Error(integrations.error);
    showActionMessage("日志已刷新", "success");
  } catch (error) {
    showActionMessage(`日志刷新失败：${errorText(error)}`, "error");
  }
}

async function clearLogs() {
  const id = selected.value?.id;
  if (!id) return;
  const confirmed = await ui.confirmAction({
    title: "清空接入日志",
    message: `确定清空 ${id} 的接入日志？这个操作不可撤销。`,
    confirmText: "清空",
    tone: "warning",
  });
  if (!confirmed) return;
  try {
    await integrations.clearLogs();
    showActionMessage("接入日志已清空", "success");
  } catch (error) {
    showActionMessage(`清空日志失败：${errorText(error)}`, "error");
  }
}

async function copyLogs() {
  if (!integrations.logs.trim()) {
    showActionMessage("没有可复制日志", "warning");
    return;
  }
  try {
    await navigator.clipboard.writeText(integrations.logs);
    showActionMessage("日志已复制", "success");
  } catch {
    showActionMessage("复制失败", "error");
  }
}

function downloadLogs() {
  if (!integrations.logs.trim()) {
    showActionMessage("没有可下载日志", "warning");
    return;
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const blob = new Blob([integrations.logs], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${selected.value?.id || "integration"}-${timestamp}.log`;
  link.click();
  URL.revokeObjectURL(url);
  showActionMessage("日志已下载", "success");
}
</script>

<template>
  <main class="page-view">
    <div class="ops-page integrations-page">
      <section class="page-head">
        <div>
          <p class="eyebrow">Channel Bots</p>
          <h1>接入管理</h1>
          <small>微信桥接、扫码登录、人格绑定和运行日志。当前 {{ integrations.summary }}</small>
        </div>
        <div class="head-actions">
          <button class="primary-action" type="button" @click="openNew">
            <Plus :size="16" /> 添加微信个人号
          </button>
          <button class="secondary-action" type="button" :disabled="integrations.loading" @click="refreshIntegrations">
            <RefreshCw :size="16" /> {{ integrations.loading ? "刷新中" : "刷新" }}
          </button>
        </div>
      </section>

      <section class="integration-shell">
        <div class="integration-list">
          <article
            v-for="item in integrations.items"
            :key="item.id"
            class="integration-card"
            :class="[statusClass(item.status), { selected: item.id === integrations.selectedId }]"
            @click="integrations.select(item.id)"
          >
            <div class="integration-card-head">
              <div class="integration-title">
                <span class="status-dot"></span>
                <strong>{{ item.chat_name || item.id }}</strong>
                <small>微信个人号 · {{ item.id }} · OpenClaw {{ item.openclaw_profile || "branchwhisper" }}</small>
              </div>
              <span class="service-badge">{{ integrations.humanStatus(item) }}</span>
            </div>

            <div class="integration-meta">
              <span class="meta-cell"><span>启用</span><strong>{{ item.enabled ? "自动守护" : "手动" }}</strong></span>
              <span class="meta-cell"><span>人格</span><strong>{{ profileName(item.bot_profile_id) }}</strong></span>
              <span class="meta-cell"><span>回复</span><strong>{{ item.reply_mode || "text" }}</strong></span>
              <span class="meta-cell"><span>账号</span><strong>{{ item.runtime?.account_count ?? item.accounts?.length ?? 0 }}</strong></span>
              <span class="meta-cell"><span>PID</span><strong>{{ item.pid || "--" }}</strong></span>
              <span class="meta-cell"><span>提示</span><strong>{{ item.last_error ? "有错误" : "--" }}</strong></span>
            </div>

            <p class="integration-state-note" :class="statusClass(item.status)">
              {{ item.last_error || item.runtime?.last_error || (item.status === "running" ? "桥接进程运行中，微信消息会进入 BranchWhisper。" : "首次使用请先扫码登录。") }}
            </p>

            <div class="integration-actions" @click.stop>
              <button class="secondary-action" type="button" @click="openEdit(item)">
                <Edit3 :size="15" /> 编辑
              </button>
              <button class="secondary-action" type="button" :disabled="integrations.actioning" @click="runIntegration(item, 'start')">
                <Play :size="15" /> {{ integrations.actioning && selected?.id === item.id ? "处理中" : "启动" }}
              </button>
              <button class="secondary-action" type="button" :disabled="integrations.actioning" @click="runIntegration(item, 'stop')">
                <Square :size="15" /> 停止
              </button>
              <button class="secondary-action" type="button" :disabled="integrations.actioning" @click="runIntegration(item, 'restart')">
                <RefreshCw :size="15" /> 重启
              </button>
              <button class="secondary-action danger" type="button" :disabled="integrations.actioning" @click="removeIntegration(item)">
                <Trash2 :size="15" /> 删除
              </button>
            </div>
          </article>
          <p v-if="!integrations.items.length" class="integration-empty">还没有接入实例。添加微信个人号后会显示在这里。</p>
        </div>

        <aside class="integration-side">
          <section class="integration-panel">
            <div class="panel-head">
              <div>
                <p class="eyebrow">Login & Logs</p>
                <h2>登录与日志</h2>
              </div>
              <span class="soft-badge">{{ selected?.id || "--" }}</span>
            </div>
            <div class="integration-qr">
              <img v-if="qrImage(integrations.qrSession)" class="integration-qr-image" :src="qrImage(integrations.qrSession)" alt="微信扫码二维码" />
              <div v-else class="integration-login-placeholder">
                <strong>{{ selected?.status === "running" ? "桥接运行中" : selected ? "等待扫码" : "请选择实例" }}</strong>
                <span>{{ integrations.qrSession?.message || (selected?.runtime?.manual_stop ? "实例已手动停止。" : "点击扫码登录后，这里会显示二维码。") }}</span>
              </div>
            </div>
            <div v-if="integrations.qrSession" class="integration-login-meta">
              <strong>{{ integrations.qrSession.status || "login" }}</strong>
              <span>{{ integrations.qrSession.message || integrations.qrSession.qrcode_url || "--" }}</span>
              <small v-if="integrations.qrSession.expire_at">过期时间 {{ integrations.qrSession.expire_at }}</small>
            </div>
            <div class="integration-account-list">
              <div v-for="account in selectedAccounts" :key="account.account_id || account.id" class="integration-account-item">
                <span>账号</span>
                <strong>{{ account.nickname || account.name || account.account_id || account.id }}</strong>
                <small>{{ account.account_id || account.id || "--" }}</small>
                <small v-if="account.base_url">Base URL: {{ account.base_url }}</small>
                <div v-if="account.diagnostic_hint || account.connectivity_error" class="integration-account-diagnostic">
                  <span>{{ account.diagnostic_hint || "账号本地服务不可达" }}</span>
                  <small v-if="account.connectivity_error">{{ account.connectivity_error }}</small>
                  <button class="small-button" type="button" @click="copyAccountDiagnostic(account)"><Copy :size="13" />复制诊断</button>
                </div>
              </div>
              <div v-if="!selectedAccounts.length" class="integration-account-item muted">
                <span>账号</span>
                <strong>暂无账号</strong>
                <small>扫码登录成功后显示</small>
              </div>
            </div>
            <div class="integration-step-list">
              <span v-for="step in integrationSteps" :key="step.label" :class="step.state">
                <b></b>
                <strong>{{ step.label }}</strong>
                <small>{{ step.status }}</small>
              </span>
            </div>
            <div v-if="timings(selected).length" class="integration-timing-summary">
              <span v-for="timing in timings(selected)" :key="timing.message_id || timing.created_at || timing.total_ms">
                <b>{{ timing.total_ms || timing.branch_ms || "--" }}ms</b>
                <small>{{ timing.text || timing.message || "最近消息" }}</small>
              </span>
            </div>
            <div class="inline-actions">
              <button class="secondary-action" type="button" :disabled="!selected || integrations.actioning" @click="startQrLogin">
                <QrCode :size="16" /> 扫码登录
              </button>
              <button class="secondary-action" type="button" :disabled="!selected || integrations.actioning" @click="selected && runIntegration(selected, 'install')">
                <PackagePlus :size="16" /> 安装适配器
              </button>
            </div>
            <div class="integration-bridge-row">
              <input v-model="integrations.bridgeUrl" type="text" placeholder="http://127.0.0.1:7860" />
              <button class="secondary-action" type="button" :disabled="!selected || integrations.actioning" @click="startBridge">
                <Link2 :size="16" /> 启动桥接
              </button>
            </div>
            <div class="integration-bridge-row">
              <input v-model="integrations.verifyCode" type="text" placeholder="验证码 / verify_code" @keydown.enter="pollLogin" />
              <button class="secondary-action" type="button" :disabled="!integrations.qrSession" @click="pollLogin">
                <RefreshCw :size="16" /> 轮询登录
              </button>
            </div>
            <section class="integration-probe-panel">
              <div class="probe-row">
                <input v-model="integrations.testText" type="text" placeholder="测试文本回复" @keydown.enter="runDialogProbe" />
                <button class="secondary-action" type="button" :disabled="!selected || integrations.actioning || dialogProbeRunning" @click="runDialogProbe"><Play :size="15" />文本回复</button>
              </div>
              <InlineProbe
                variant="strip"
                title="文本回复链路"
                summary="模拟微信入站消息，测试 dialog API、LLM 和回传结果。"
                :status="dialogProbeStatus"
                :status-text="dialogProbeStatus === 'ok' ? '回复正常' : dialogProbeStatus === 'failed' ? '回复失败' : dialogProbeStatus === 'running' ? '检测中' : '未检测'"
                :detail="integrations.testResult"
                action-text="运行"
                :disabled="!selected || integrations.actioning"
                @run="runDialogProbe"
                @copy="copyProbeResult('文本回复', integrations.testResult)"
              />
              <div class="probe-row">
                <input v-model="integrations.voiceText" type="text" placeholder="测试语音发送" @keydown.enter="runVoiceProbe" />
                <button class="secondary-action" type="button" :disabled="!selected || integrations.actioning || voiceProbeRunning" @click="runVoiceProbe"><Play :size="15" />语音发送</button>
              </div>
              <InlineProbe
                variant="strip"
                title="语音发送链路"
                summary="生成一段短语音并调用微信发送，验证 TTS、转码和发送器。"
                :status="voiceProbeStatus"
                :status-text="voiceProbeStatus === 'ok' ? '接口已接收' : voiceProbeStatus === 'failed' ? '发送失败' : voiceProbeStatus === 'running' ? '检测中' : '未检测'"
                :detail="integrations.voiceResult"
                action-text="运行"
                :disabled="!selected || integrations.actioning"
                @run="runVoiceProbe"
                @copy="copyProbeResult('语音发送', integrations.voiceResult)"
              />
              <div class="probe-row">
                <input v-model="integrations.stickerText" type="text" placeholder="测试素材发送" @keydown.enter="runStickerProbe" />
                <button class="secondary-action" type="button" :disabled="!selected || integrations.actioning || stickerProbeRunning" @click="runStickerProbe"><Play :size="15" />素材发送</button>
              </div>
              <InlineProbe
                variant="strip"
                title="素材发送链路"
                summary="按测试文本选择素材并发送到微信，验证素材策略和图片发送。"
                :status="stickerProbeStatus"
                :status-text="stickerProbeStatus === 'ok' ? '接口已接收' : stickerProbeStatus === 'failed' ? '发送失败' : stickerProbeStatus === 'running' ? '检测中' : '未检测'"
                :detail="integrations.stickerResult"
                action-text="运行"
                :disabled="!selected || integrations.actioning"
                @run="runStickerProbe"
                @copy="copyProbeResult('素材发送', integrations.stickerResult)"
              />
            </section>
            <div class="integration-log-toolbar">
              <select v-model="integrations.logScope" @change="refreshLogs">
                <option value="current">本次启动</option>
                <option value="all">全部日志</option>
              </select>
              <button class="icon-button" type="button" title="刷新日志" @click="refreshLogs"><RotateCw :size="16" /></button>
              <button class="icon-button" type="button" title="复制日志" @click="copyLogs"><Copy :size="16" /></button>
              <button class="icon-button" type="button" title="下载日志" @click="downloadLogs"><Download :size="16" /></button>
              <button class="icon-button danger" type="button" title="清空日志" @click="clearLogs"><Eraser :size="16" /></button>
            </div>
            <span v-if="actionMessage" class="soft-badge integration-action-message">{{ actionMessage }}</span>
            <div class="log-viewer integration-log" role="log" aria-live="polite">{{ integrations.logs || "暂无日志。" }}</div>
          </section>

        </aside>
      </section>

      <div v-if="configOpen" class="modal-overlay" @click.self="configOpen = false">
        <section class="modal-panel integration-modal-panel" role="dialog" aria-modal="true" aria-label="接入实例配置">
          <div class="modal-head">
            <div>
              <p class="eyebrow">Instance Config</p>
              <h2>{{ integrations.editingId ? "编辑实例" : "新增实例" }}</h2>
            </div>
            <button class="icon-button modal-close" type="button" title="关闭" @click="configOpen = false"><X :size="16" /></button>
          </div>
          <div class="modal-body">
            <div class="form-grid compact">
              <label><span>实例 ID</span><input v-model="integrations.form.id" :disabled="!!integrations.editingId" /></label>
              <label><span>微信聊天名</span><input v-model="integrations.form.chat_name" /></label>
              <label><span>OpenClaw profile</span><input v-model="integrations.form.openclaw_profile" /></label>
              <label><span>Bot 人格</span><select v-model="integrations.form.bot_profile_id"><option v-for="profile in profiles.profiles" :key="profile.id" :value="profile.id">{{ profile.name || profile.id }}</option></select></label>
              <label><span>回复模式</span><select v-model="integrations.form.reply_mode"><option value="text">文字默认</option><option value="voice">语音优先</option></select></label>
              <label class="switch-label"><span>启用后台守护</span><input v-model="integrations.form.enabled" type="checkbox" /></label>
              <label class="wide"><span>语音触发词</span><textarea v-model="integrations.form.voice_trigger_keywords" rows="5"></textarea></label>
            </div>
            <p v-if="integrations.error" class="asset-error">{{ integrations.error }}</p>
          </div>
          <div class="modal-actions">
            <button class="secondary-action" type="button" @click="configOpen = false">取消</button>
            <button class="primary-action" type="button" :disabled="configSaving" @click="saveConfig"><Save :size="16" /> {{ configSaving ? "保存中" : "保存" }}</button>
          </div>
        </section>
      </div>
    </div>
  </main>
</template>
