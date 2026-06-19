<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { Plus, RefreshCw } from "@lucide/vue";
import type { IntegrationItem } from "@/api/integrations";
import { formatApiError } from "@/api/client";
import IntegrationConfigModal from "@/components/integrations/IntegrationConfigModal.vue";
import IntegrationLoginPanel from "@/components/integrations/IntegrationLoginPanel.vue";
import IntegrationLogsPanel from "@/components/integrations/IntegrationLogsPanel.vue";
import IntegrationProbePanel from "@/components/integrations/IntegrationProbePanel.vue";
import IntegrationSessionsPanel from "@/components/integrations/IntegrationSessionsPanel.vue";
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
          <small>微信机器人、扫码登录、人格绑定和运行日志。当前 {{ integrations.summary }}</small>
        </div>
        <div class="head-actions">
          <button class="primary-action" type="button" @click="openNew">
            <Plus :size="16" /> 新增机器人
          </button>
          <button class="secondary-action" type="button" :disabled="integrations.loading" @click="refreshIntegrations">
            <RefreshCw :size="16" /> {{ integrations.loading ? "刷新中" : "刷新" }}
          </button>
        </div>
      </section>

      <section class="integration-shell">
        <div class="integration-test-column">
          <IntegrationProbePanel
            v-model:test-text="integrations.testText"
            v-model:voice-text="integrations.voiceText"
            v-model:sticker-text="integrations.stickerText"
            :action-message="actionMessage"
            :dialog-status="dialogProbeStatus"
            :voice-status="voiceProbeStatus"
            :sticker-status="stickerProbeStatus"
            :voice-unconfirmed="voiceProbeUnconfirmed"
            :test-result="integrations.testResult"
            :voice-result="integrations.voiceResult"
            :sticker-result="integrations.stickerResult"
            :disabled="!selected || integrations.actioning"
            @run-dialog="runDialogProbe"
            @run-voice="runVoiceProbe"
            @run-sticker="runStickerProbe"
            @copy-dialog="copyProbeResult('文本回复', integrations.testResult)"
            @copy-voice="copyProbeResult('语音发送', integrations.voiceResult)"
            @copy-sticker="copyProbeResult('素材发送', integrations.stickerResult)"
          />

          <IntegrationLogsPanel
            v-model:scope="integrations.logScope"
            :logs="integrations.logs"
            @refresh="refreshLogs"
            @copy="copyLogs"
            @download="downloadLogs"
            @clear="clearLogs"
          />
        </div>

        <aside class="integration-workbench">
          <IntegrationLoginPanel
            v-model:bridge-url="integrations.bridgeUrl"
            v-model:verify-code="integrations.verifyCode"
            :selected="selected"
            :selected-account="selectedAccount"
            :qr-session="integrations.qrSession"
            :steps="integrationSteps"
            :actioning="integrations.actioning"
            :status-class="statusClass"
            :qr-image="qrImage"
            @copy-account-diagnostic="copyAccountDiagnostic"
            @start-qr-login="startQrLogin"
            @install="selected && runIntegration(selected, 'install')"
            @start-bridge="startBridge"
            @poll-login="pollLogin"
          />

          <IntegrationSessionsPanel
            :items="integrations.items"
            :summary="integrations.summary"
            :selected-id="integrations.selectedId"
            :actioning="integrations.actioning"
            :status-class="statusClass"
            :human-status="integrations.humanStatus"
            :profile-name="profileName"
            @select="integrations.select"
            @edit="openEdit"
            @start="(item) => runIntegration(item, 'start')"
            @stop="(item) => runIntegration(item, 'stop')"
            @restart="(item) => runIntegration(item, 'restart')"
            @remove="removeIntegration"
          />
        </aside>
      </section>

      <IntegrationConfigModal
        v-if="configOpen"
        :form="integrations.form"
        :profiles="profiles.profiles"
        :editing-id="integrations.editingId"
        :error="integrations.error"
        :saving="configSaving"
        @close="configOpen = false"
        @save="saveConfig"
      />
    </div>
  </main>
</template>
