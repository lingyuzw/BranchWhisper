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
import { formatApiError } from "@/api/client";
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
const selectedAccount = computed(() => selectedAccounts.value[0] || null);
const bridgeRunning = computed(() => ["running", "starting"].includes(String(selected.value?.status || "")));
const loginReady = computed(() => selectedAccounts.value.length > 0);
const textProbeReady = computed(() => integrations.testOk === true);
const voiceProbeReady = computed(() => integrations.voiceOk === true);
const voiceProbeUnconfirmed = computed(() => integrations.voiceResult.includes("微信端未渲染") || integrations.voiceResult.includes("未确认显示语音气泡"));
type ProbeStatus = "idle" | "running" | "ok" | "failed" | "warning";
const dialogProbeRunning = ref(false);
const voiceProbeRunning = ref(false);
const stickerProbeRunning = ref(false);
const dialogProbeStatus = computed<ProbeStatus>(() => {
  if (dialogProbeRunning.value) return "running";
  if (!integrations.testResult) return "idle";
  if (integrations.testOk === true) return "ok";
  if (integrations.testOk === false || integrations.testResult.includes("失败")) return "failed";
  return "idle";
});
const voiceProbeStatus = computed<ProbeStatus>(() => {
  if (voiceProbeRunning.value) return "running";
  if (!integrations.voiceResult) return "idle";
  if (voiceProbeUnconfirmed.value || integrations.voiceResult.includes("等待 TTS")) return "warning";
  if (integrations.voiceOk === true) return "ok";
  if (integrations.voiceOk === false || integrations.voiceResult.includes("失败")) return "failed";
  return "idle";
});
const stickerProbeStatus = computed<ProbeStatus>(() => {
  if (stickerProbeRunning.value) return "running";
  if (!integrations.stickerResult) return "idle";
  if (integrations.stickerOk === true) return "ok";
  if (integrations.stickerOk === false || integrations.stickerResult.includes("失败")) return "failed";
  return "idle";
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
    label: "语音",
    status: voiceProbeReady.value ? "发送正常" : voiceProbeUnconfirmed.value ? "待客户端确认" : voiceProbeStatus.value === "warning" ? "等待 TTS" : integrations.voiceResult ? "失败" : "未测试",
    state: voiceProbeReady.value ? "ok" : voiceProbeStatus.value === "warning" ? "pending" : integrations.voiceResult ? "failed" : "idle",
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
  return formatApiError(error);
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
    integrations.testOk = false;
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
    const waitingTts = integrations.voiceResult.includes("等待 TTS");
    const unsupportedVoice = integrations.voiceResult.includes("微信端未渲染") || integrations.voiceResult.includes("未送达：微信端");
    showActionMessage(
      unsupportedVoice ? "微信端没有收到原生语音气泡" : integrations.voiceOk ? "原生语音已送达" : waitingTts ? "TTS 还在加载，稍后再测语音" : "语音测试失败，已生成诊断",
      unsupportedVoice ? "warning" : integrations.voiceOk ? "success" : "warning",
    );
  } catch (error) {
    integrations.voiceOk = false;
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
    showActionMessage(integrations.stickerOk ? "素材测试已发送，请到微信端确认" : "素材测试失败，已生成诊断", integrations.stickerOk ? "success" : "warning");
  } catch (error) {
    integrations.stickerOk = false;
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
        <div class="integration-test-column">
          <section class="integration-panel integration-tests-panel">
            <div class="panel-head">
              <div>
                <p class="eyebrow">Loop Checks</p>
                <h2>链路测试</h2>
              </div>
              <span v-if="actionMessage" class="soft-badge integration-action-message">{{ actionMessage }}</span>
            </div>
            <section class="integration-probe-panel">
              <div class="integration-probe-card">
                <input v-model="integrations.testText" type="text" placeholder="你好，测试一下" @keydown.enter="runDialogProbe" />
                <InlineProbe
                  variant="compact"
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
              </div>
              <div class="integration-probe-card">
                <input v-model="integrations.voiceText" type="text" placeholder="我在，听得到的话我们继续。" @keydown.enter="runVoiceProbe" />
                <InlineProbe
                  variant="compact"
                  title="语音发送链路"
                  summary="生成短音频并尝试发送微信原生语音；本地文件不算送达。"
                  :status="voiceProbeStatus"
                  :status-text="voiceProbeStatus === 'ok' ? '发送正常' : voiceProbeStatus === 'warning' ? (voiceProbeUnconfirmed ? '原生语音未送达' : '等待 TTS') : voiceProbeStatus === 'failed' ? '发送失败' : voiceProbeStatus === 'running' ? '检测中' : '未检测'"
                  :detail="integrations.voiceResult"
                  action-text="运行"
                  :disabled="!selected || integrations.actioning"
                  @run="runVoiceProbe"
                  @copy="copyProbeResult('语音发送', integrations.voiceResult)"
                />
              </div>
              <div class="integration-probe-card">
                <input v-model="integrations.stickerText" type="text" placeholder="打一架" @keydown.enter="runStickerProbe" />
                <InlineProbe
                  variant="compact"
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
              </div>
            </section>
          </section>

          <section class="integration-panel integration-log-panel integration-log-column">
            <div class="panel-head">
              <div>
                <p class="eyebrow">Runtime Logs</p>
                <h2>运行日志</h2>
              </div>
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
            </div>
            <div class="log-viewer integration-log" role="log" aria-live="polite">{{ integrations.logs || "暂无日志。" }}</div>
          </section>
        </div>

        <aside class="integration-workbench">
          <section class="integration-panel integration-login-panel">
            <div class="panel-head">
              <div>
                <p class="eyebrow">Login</p>
                <h2>登录控制</h2>
              </div>
              <span class="soft-badge">{{ selected?.id || "--" }}</span>
            </div>
            <div class="integration-console-grid">
              <div class="integration-status-grid">
                <div class="integration-status-card integration-bridge-card" :class="statusClass(selected?.status)">
                  <div class="integration-status-card-head">
                    <span class="status-dot" :class="statusClass(selected?.status)"></span>
                    <span>桥接状态</span>
                  </div>
                  <img v-if="qrImage(integrations.qrSession)" class="integration-qr-image" :src="qrImage(integrations.qrSession)" alt="微信扫码二维码" />
                  <div v-else class="integration-status-copy">
                    <strong>{{ selected?.status === "running" ? "桥接运行中" : selected ? "等待扫码" : "请选择实例" }}</strong>
                    <small>{{ integrations.qrSession?.message || (selected?.runtime?.manual_stop ? "实例已手动停止。" : "扫码后会在这里显示登录状态。") }}</small>
                  </div>
                </div>
                <div class="integration-status-card integration-selected-account-card" :class="{ active: selectedAccount }">
                  <div class="integration-status-card-head">
                    <span class="status-dot" :class="{ active: selectedAccount }"></span>
                    <span>当前账号</span>
                  </div>
                  <div class="integration-status-copy">
                    <strong>{{ selectedAccount?.nickname || selectedAccount?.name || selectedAccount?.account_id || selectedAccount?.id || "暂无账号" }}</strong>
                    <small>{{ selectedAccount?.account_id || selectedAccount?.id || "扫码登录成功后显示" }}</small>
                    <small v-if="selectedAccount?.base_url">Base URL: {{ selectedAccount.base_url }}</small>
                  </div>
                  <button
                    v-if="selectedAccount?.diagnostic_hint || selectedAccount?.connectivity_error"
                    class="small-button"
                    type="button"
                    @click="copyAccountDiagnostic(selectedAccount)"
                  >
                    <Copy :size="13" />复制诊断
                  </button>
                </div>
              </div>
              <div v-if="integrations.qrSession" class="integration-login-meta">
                <strong>{{ integrations.qrSession.status || "login" }}</strong>
                <span>{{ integrations.qrSession.message || integrations.qrSession.qrcode_url || "--" }}</span>
                <small v-if="integrations.qrSession.expire_at">过期时间 {{ integrations.qrSession.expire_at }}</small>
              </div>
              <div class="integration-step-track">
                <span v-for="step in integrationSteps" :key="step.label" :class="step.state">
                  <b></b>
                  <em>{{ step.label }}</em>
                  <strong>{{ step.status }}</strong>
                </span>
              </div>
            </div>
            <div class="integration-login-actions">
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
              <div class="integration-bridge-row wide">
                <input v-model="integrations.verifyCode" type="text" placeholder="验证码 / verify_code" @keydown.enter="pollLogin" />
                <button class="secondary-action" type="button" :disabled="!integrations.qrSession" @click="pollLogin">
                  <RefreshCw :size="16" /> 轮询登录
                </button>
              </div>
            </div>
          </section>

          <section class="integration-panel integration-sessions-panel">
            <div class="panel-head">
              <div>
                <p class="eyebrow">WeChat Sessions</p>
                <h2>我的微信聊天</h2>
              </div>
              <span class="soft-badge">{{ integrations.summary }}</span>
            </div>
            <div class="integration-session-grid">
              <article
                v-for="item in integrations.items"
                :key="item.id"
                class="integration-card integration-card--mini"
                :class="[statusClass(item.status), { selected: item.id === integrations.selectedId }]"
                @click="integrations.select(item.id)"
              >
                <div class="integration-card-head">
                  <div class="integration-title">
                    <span class="status-dot"></span>
                    <strong>{{ item.chat_name || item.id }}</strong>
                    <small>{{ item.id }} · {{ profileName(item.bot_profile_id) }}</small>
                  </div>
                  <span class="service-badge">{{ integrations.humanStatus(item) }}</span>
                </div>

                <div class="integration-meta integration-meta--mini">
                  <span class="meta-cell"><span>启用</span><strong>{{ item.enabled ? "守护" : "手动" }}</strong></span>
                  <span class="meta-cell"><span>回复</span><strong>{{ item.reply_mode || "text" }}</strong></span>
                  <span class="meta-cell"><span>账号</span><strong>{{ item.runtime?.account_count ?? item.accounts?.length ?? 0 }}</strong></span>
                  <span class="meta-cell"><span>PID</span><strong>{{ item.pid || "--" }}</strong></span>
                </div>

                <div class="integration-card-foot">
                  <p class="integration-card-note" :class="statusClass(item.status)">
                    {{ item.last_error || item.runtime?.last_error || (item.status === "running" ? "桥接运行中，微信消息会进入 BranchWhisper。" : "首次使用请先扫码登录。") }}
                  </p>
                  <div class="integration-actions integration-actions--mini" @click.stop>
                    <button class="icon-button" type="button" title="编辑" aria-label="编辑接入实例" @click="openEdit(item)">
                      <Edit3 :size="15" />
                    </button>
                    <button class="icon-button" type="button" title="启动" aria-label="启动接入" :disabled="integrations.actioning" @click="runIntegration(item, 'start')">
                      <Play :size="15" />
                    </button>
                    <button class="icon-button" type="button" title="停止" aria-label="停止接入" :disabled="integrations.actioning" @click="runIntegration(item, 'stop')">
                      <Square :size="15" />
                    </button>
                    <button class="icon-button" type="button" title="重启" aria-label="重启接入" :disabled="integrations.actioning" @click="runIntegration(item, 'restart')">
                      <RefreshCw :size="15" />
                    </button>
                    <button class="icon-button danger" type="button" title="删除" aria-label="删除接入实例" :disabled="integrations.actioning" @click="removeIntegration(item)">
                      <Trash2 :size="15" />
                    </button>
                  </div>
                </div>
              </article>
              <p v-if="!integrations.items.length" class="integration-empty compact">还没有接入实例。添加微信个人号后会显示在这里。</p>
            </div>
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
