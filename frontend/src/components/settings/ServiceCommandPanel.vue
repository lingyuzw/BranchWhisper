<script setup lang="ts">
import { ChevronDown, ChevronUp, Copy, Save, Terminal } from "@lucide/vue";
import type { ServiceSummary } from "@/api/services";
import type { ServiceDraft } from "@/components/settings/types";

interface ServiceDraftEntry {
  service: ServiceSummary;
  draft: ServiceDraft;
}

defineProps<{
  serviceDraftList: ServiceDraftEntry[];
  serviceDraftDirty: Record<string, boolean>;
  serviceSaving: Record<string, boolean>;
  commandsExpanded: Record<string, boolean>;
  settingsSaving: boolean;
  settingsHydrating: boolean;
  serviceRuntimeLabel: (service: ServiceSummary) => string;
}>();

const emit = defineEmits<{
  openServices: [];
  toggleExpanded: [serviceId: string];
  markDirty: [serviceId: string];
  saveService: [serviceId: string];
  copyCommand: [command: string];
}>();
</script>

<template>
  <article class="settings-panel settings-section-detached is-active is-current" id="commands">
    <div class="panel-head">
      <div><p class="eyebrow">服务</p><h2>服务命令</h2></div>
      <div class="inline-actions">
        <span class="soft-badge">只编辑启动参数</span>
        <button class="secondary-action" type="button" @click="emit('openServices')"><Terminal :size="15" />去服务页</button>
      </div>
    </div>
    <div class="profile-list">
      <section v-for="{ service, draft } in serviceDraftList" :key="service.id" class="profile-card service-config-card" :class="{ dirty: serviceDraftDirty[service.id] }">
        <div class="profile-head">
          <div>
            <strong>{{ service.label || service.id }}</strong>
            <span>{{ serviceRuntimeLabel(service) }} · {{ service.external ? "外部进程" : "BranchWhisper 配置" }}</span>
          </div>
          <span class="soft-badge">{{ serviceDraftDirty[service.id] ? "未保存" : service.id }}</span>
        </div>
        <div class="service-command-summary">
          <span>工作目录：{{ draft.cwd || "--" }}</span>
          <span>健康检查：{{ draft.health_url || "--" }}</span>
          <span>等待：{{ draft.startup_wait_sec || 0 }}s</span>
        </div>
        <div v-if="commandsExpanded[service.id]" class="form-grid compact service-command-body">
          <label class="wide"><span>工作目录</span><input v-model="draft.cwd" @input="emit('markDirty', service.id)" /></label>
          <label class="wide"><span>Health URL</span><input v-model="draft.health_url" @input="emit('markDirty', service.id)" /></label>
          <label><span>启动等待秒</span><input v-model.number="draft.startup_wait_sec" type="number" min="0" max="180" step="1" @input="emit('markDirty', service.id)" /></label>
          <label class="wide"><span>启动命令</span><textarea v-model="draft.command" class="profile-command" @input="emit('markDirty', service.id)"></textarea></label>
        </div>
        <div class="inline-actions">
          <button class="secondary-action" type="button" @click="emit('toggleExpanded', service.id)">
            <component :is="commandsExpanded[service.id] ? ChevronUp : ChevronDown" :size="15" />
            {{ commandsExpanded[service.id] ? "收起" : "展开" }}
          </button>
          <button class="secondary-action" type="button" :disabled="serviceSaving[service.id] || settingsSaving" @click="emit('saveService', service.id)">
            <Save :size="15" />{{ serviceSaving[service.id] ? "保存中..." : "保存服务" }}
          </button>
          <button class="secondary-action" type="button" @click="emit('copyCommand', draft.command || '')"><Copy :size="15" />复制命令</button>
          <button class="secondary-action" type="button" @click="emit('openServices')"><Terminal :size="15" />去服务页</button>
        </div>
      </section>
    </div>
    <div v-if="!serviceDraftList.length" class="model-file-empty">
      {{ settingsHydrating ? "正在读取服务配置..." : "未读取到本地服务配置" }}
    </div>
  </article>
</template>
