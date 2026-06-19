<script setup lang="ts">
import { Globe2, Save } from "@lucide/vue";
import type { PublicConfig } from "@/api/config";
import type { ToolProviderConfig, ToolResolveResult } from "@/api/tools";
import InlineProbe from "@/components/layout/InlineProbe.vue";
import { PROVIDER_OPTIONS } from "@/stores/tools";

type ProbeStatus = "idle" | "running" | "ok" | "failed" | "warning";

interface ToolGridItem {
  key: string;
  label: string;
  summary: string;
  badge: string;
  fields: string[];
}

const props = defineProps<{
  form: Partial<PublicConfig>;
  toolsConfig: ToolProviderConfig;
  toolsLoading: boolean;
  toolsSaving: boolean;
  toolsAnyDirty: boolean;
  toolGridItems: ToolGridItem[];
  selectedToolKey: string;
  selectedToolItem: ToolGridItem;
  testResults: Record<string, string>;
  resolveResult: ToolResolveResult | null;
  toolsError: string;
}>();

const emit = defineEmits<{
  saveTools: [];
  selectTool: [providerKey: string];
  setProviderField: [providerKey: string, field: string, value: string];
  runToolProbe: [providerKey: string];
  copyToolProbe: [providerKey: string];
  runResolve: [];
}>();

const form = props.form as Partial<PublicConfig>;

function eventValue(event: Event) {
  return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
}

function providerFieldValue(providerKey: string, field: string) {
  const value = (props.toolsConfig[providerKey] || {})[field];
  if (typeof value === "boolean") return String(value);
  if ((field === "api_key" || field === "webhook_url") && !value && (props.toolsConfig[providerKey]?.[`${field}_set`] || props.toolsConfig[providerKey]?.[`${field}_masked`])) {
    return "";
  }
  return String(value ?? "");
}

function providerFieldLabel(field: string) {
  return {
    enabled: "启用",
    provider: "服务商",
    base_url: "Base URL",
    api_key: "API Key",
    default_location: "默认地点",
    limit: "数量上限",
    region: "区域",
    user_agent: "User Agent",
    max_chars: "最大字符",
    web_enabled: "Web",
    weixin_enabled: "微信",
    webhook_url: "Webhook",
  }[field] || field;
}

function providerSecretState(providerKey: string) {
  const provider = props.toolsConfig[providerKey] || {};
  if (provider.api_key_set || provider.webhook_url_set) return "密钥已保存";
  if (provider.api_key_masked || provider.webhook_url_masked) return provider.api_key_masked || provider.webhook_url_masked;
  return "未配置密钥";
}

function providerInputType(field: string) {
  if (field === "api_key" || field === "webhook_url") return "password";
  if (field === "limit" || field === "max_chars") return "number";
  return "text";
}

function providerCardDisabled(providerKey: string) {
  return Boolean(props.toolsConfig[providerKey]?.enabled === false);
}

function toolProbeStatus(providerKey: string): ProbeStatus {
  const text = props.testResults[providerKey] || "";
  if (!text) return "idle";
  if (text === "测试中...") return "running";
  if (text.startsWith("测试失败") || text.includes('"ok": false') || text.includes('"error"')) return "failed";
  return "ok";
}

function toolProbeText(providerKey: string) {
  const text = props.testResults[providerKey] || "";
  if (!text) return "未检测";
  if (text === "测试中...") return "检测中";
  if (toolProbeStatus(providerKey) === "failed") return "调用异常";
  return "调用正常";
}

function formatProbeDetail(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value ?? "");
  }
}
</script>

<template>
  <article class="settings-panel settings-section-detached is-active is-current" id="tools">
    <div class="panel-head">
      <div>
        <p class="eyebrow">工具</p>
        <h2>联网工具</h2>
      </div>
      <div class="inline-actions">
        <span class="soft-badge">{{ toolsLoading ? "加载中" : toolsAnyDirty ? "有未保存修改" : "配置已同步" }}</span>
        <button class="secondary-action" type="button" :disabled="toolsSaving || !toolsAnyDirty" @click="emit('saveTools')">
          <Save :size="15" />{{ toolsSaving ? "保存中..." : "保存联网工具" }}
        </button>
      </div>
    </div>
    <section class="tools-control-strip">
      <label><span>工具总开关</span><select v-model="form.tools_enabled"><option :value="true">启用</option><option :value="false">关闭</option></select></label>
      <label><span>自动调用</span><select v-model="form.tools_auto_call"><option :value="true">启用</option><option :value="false">关闭</option></select></label>
      <label><span>工具超时秒</span><input v-model.number="form.tools_timeout" type="number" min="2" max="60" step="1" /></label>
      <label><span>结果最大字符</span><input v-model.number="form.tools_max_result_chars" type="number" min="500" max="16000" step="100" /></label>
    </section>

    <div class="tool-provider-list tool-provider-grid">
      <button
        v-for="item in toolGridItems"
        :key="item.key"
        class="tool-provider-card overview-card"
        :class="{ active: selectedToolKey === item.key, disabled: providerCardDisabled(item.key), 'readonly-tool-card': !item.fields.length }"
        type="button"
        @click="emit('selectTool', item.key)"
      >
        <div class="tool-provider-head">
          <div>
            <strong>{{ item.label }}</strong>
            <small>{{ item.summary }}</small>
          </div>
          <span class="tool-provider-state" :class="{ off: providerCardDisabled(item.key) }">
            {{ providerCardDisabled(item.key) ? "关闭" : item.badge }}
          </span>
        </div>
        <div class="tool-provider-status">
          <span v-if="toolsConfig[item.key]?.provider">{{ toolsConfig[item.key]?.provider }}</span>
          <span v-if="item.fields.includes('api_key') || item.fields.includes('webhook_url')">{{ providerSecretState(item.key) }}</span>
          <span v-if="toolsConfig[item.key]?.limit">limit {{ toolsConfig[item.key]?.limit }}</span>
          <span v-if="!item.fields.length">无需配置</span>
        </div>
        <span class="tool-card-action">配置 / 测试</span>
      </button>
    </div>

    <section v-if="selectedToolItem" class="tool-detail-panel">
      <div class="tool-detail-head">
        <div>
          <p class="eyebrow">当前工具</p>
          <h3>{{ selectedToolItem.label }}</h3>
          <small>{{ selectedToolItem.summary }}</small>
        </div>
        <span class="tool-provider-state" :class="{ off: providerCardDisabled(selectedToolItem.key) }">
          {{ providerCardDisabled(selectedToolItem.key) ? "关闭" : selectedToolItem.badge }}
        </span>
      </div>
      <div v-if="selectedToolItem.fields.length" class="form-grid compact tool-detail-form">
        <label v-for="field in selectedToolItem.fields" :key="field" :class="{ wide: field === 'base_url' || field === 'api_key' || field === 'webhook_url' || field === 'user_agent' }">
          <span>{{ providerFieldLabel(field) }}</span>
          <select v-if="field === 'enabled' || field.endsWith('_enabled')" :value="providerFieldValue(selectedToolItem.key, field)" @change="emit('setProviderField', selectedToolItem.key, field, eventValue($event))">
            <option value="true">启用</option>
            <option value="false">关闭</option>
          </select>
          <select v-else-if="field === 'provider'" :value="providerFieldValue(selectedToolItem.key, field)" @change="emit('setProviderField', selectedToolItem.key, field, eventValue($event))">
            <option v-for="[value, label] in PROVIDER_OPTIONS[selectedToolItem.key] || []" :key="value" :value="value">{{ label }}</option>
          </select>
          <input
            v-else
            :type="providerInputType(field)"
            :value="providerFieldValue(selectedToolItem.key, field)"
            :placeholder="field === 'api_key' || field === 'webhook_url' ? providerSecretState(selectedToolItem.key) : ''"
            @input="emit('setProviderField', selectedToolItem.key, field, eventValue($event))"
          />
        </label>
      </div>
      <p v-else class="tool-readonly-note">由本地运行时提供，不需要填写服务商或密钥。</p>
      <InlineProbe
        class="provider-inline-probe"
        variant="strip"
        :title="`${selectedToolItem.label} API`"
        :summary="selectedToolItem.summary"
        :status="toolProbeStatus(selectedToolItem.key)"
        :status-text="toolProbeText(selectedToolItem.key)"
        :detail="testResults[selectedToolItem.key]"
        action-text="调用测试"
        :disabled="providerCardDisabled(selectedToolItem.key)"
        @run="emit('runToolProbe', selectedToolItem.key)"
        @copy="emit('copyToolProbe', selectedToolItem.key)"
      />
    </section>

    <div class="settings-diagnostics-callout">
      <div>
        <strong>工具路由测试</strong>
        <small>用“漳州今天天气怎么样”检查工具解析，并按各 Provider 卡片逐项调用。</small>
      </div>
      <button class="secondary-action" type="button" @click="emit('runResolve')"><Globe2 :size="15" />解析测试</button>
    </div>
    <pre v-if="resolveResult" class="settings-probe-result">{{ formatProbeDetail(resolveResult) }}</pre>
    <p v-if="toolsError" class="muted-copy">工具配置读取失败：{{ toolsError }}</p>
  </article>
</template>
