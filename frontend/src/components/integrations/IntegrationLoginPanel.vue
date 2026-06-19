<script setup lang="ts">
import { Copy, Link2, PackagePlus, QrCode, RefreshCw } from "@lucide/vue";
import type { IntegrationItem } from "@/api/integrations";

type IntegrationStep = {
  label: string;
  status: string;
  state: string;
};

defineProps<{
  bridgeUrl: string;
  verifyCode: string;
  selected: IntegrationItem | null | undefined;
  selectedAccount: Record<string, any> | null;
  qrSession: Record<string, any> | null;
  steps: IntegrationStep[];
  actioning: boolean;
  statusClass: (status?: string) => string;
  qrImage: (session: Record<string, any> | null) => string;
}>();

const emit = defineEmits<{
  "update:bridgeUrl": [value: string];
  "update:verifyCode": [value: string];
  copyAccountDiagnostic: [account: Record<string, any>];
  startQrLogin: [];
  install: [];
  startBridge: [];
  pollLogin: [];
}>();
</script>

<template>
  <section class="integration-panel integration-login-panel">
    <div class="panel-head">
      <div>
        <p class="eyebrow">Login</p>
        <h2>设备扫码</h2>
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
          <img v-if="qrImage(qrSession)" class="integration-qr-image" :src="qrImage(qrSession)" alt="微信扫码二维码" />
          <div v-else class="integration-status-copy">
            <strong>{{ selected?.status === "running" ? "桥接运行中" : selected ? "等待扫码" : "请选择实例" }}</strong>
            <small>{{ qrSession?.message || (selected?.runtime?.manual_stop ? "实例已手动停止。" : "扫码后会在这里显示登录状态。") }}</small>
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
            @click="selectedAccount && emit('copyAccountDiagnostic', selectedAccount)"
          >
            <Copy :size="13" />复制诊断
          </button>
        </div>
      </div>
      <div v-if="qrSession" class="integration-login-meta">
        <strong>{{ qrSession.status || "login" }}</strong>
        <span>{{ qrSession.message || qrSession.qrcode_url || "--" }}</span>
        <small v-if="qrSession.expire_at">过期时间 {{ qrSession.expire_at }}</small>
      </div>
      <div class="integration-step-track">
        <span v-for="step in steps" :key="step.label" :class="step.state">
          <b></b>
          <em>{{ step.label }}</em>
          <strong>{{ step.status }}</strong>
        </span>
      </div>
    </div>
    <div class="integration-login-actions">
      <div class="inline-actions">
        <button class="secondary-action" type="button" :disabled="!selected || actioning" @click="emit('startQrLogin')">
          <QrCode :size="16" /> 用新设备扫码
        </button>
        <button class="secondary-action" type="button" :disabled="!selected || actioning" @click="emit('install')">
          <PackagePlus :size="16" /> 安装适配器
        </button>
      </div>
      <div class="integration-bridge-row">
        <input :value="bridgeUrl" type="text" placeholder="http://127.0.0.1:7860" @input="emit('update:bridgeUrl', ($event.target as HTMLInputElement).value)" />
        <button class="secondary-action" type="button" :disabled="!selected || actioning" @click="emit('startBridge')">
          <Link2 :size="16" /> 启动桥接
        </button>
      </div>
      <div class="integration-bridge-row wide">
        <input :value="verifyCode" type="text" placeholder="验证码 / verify_code" @input="emit('update:verifyCode', ($event.target as HTMLInputElement).value)" @keydown.enter="emit('pollLogin')" />
        <button class="secondary-action" type="button" :disabled="!qrSession" @click="emit('pollLogin')">
          <RefreshCw :size="16" /> 轮询登录
        </button>
      </div>
    </div>
  </section>
</template>
