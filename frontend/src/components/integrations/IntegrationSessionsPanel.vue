<script setup lang="ts">
import { Edit3, Play, RefreshCw, Square, Trash2 } from "@lucide/vue";
import type { IntegrationItem } from "@/api/integrations";

defineProps<{
  items: IntegrationItem[];
  summary: string;
  selectedId: string;
  actioning: boolean;
  statusClass: (status?: string) => string;
  humanStatus: (item: IntegrationItem) => string;
  profileName: (id?: string) => string;
}>();

const emit = defineEmits<{
  select: [id: string];
  edit: [item: IntegrationItem];
  start: [item: IntegrationItem];
  stop: [item: IntegrationItem];
  restart: [item: IntegrationItem];
  remove: [item: IntegrationItem];
}>();
</script>

<template>
  <section class="integration-panel integration-sessions-panel">
    <div class="panel-head">
      <div>
        <p class="eyebrow">WeChat Sessions</p>
        <h2>微信机器人</h2>
      </div>
      <span class="soft-badge">{{ summary }}</span>
    </div>
    <div class="integration-session-grid">
      <article
        v-for="item in items"
        :key="item.id"
        class="integration-card integration-card--mini"
        :class="[statusClass(item.status), { selected: item.id === selectedId }]"
        @click="emit('select', item.id)"
      >
        <div class="integration-card-head">
          <div class="integration-title">
            <span class="status-dot"></span>
            <strong>{{ item.chat_name || item.id }}</strong>
            <small>{{ item.id }} · {{ item.openclaw_profile || "--" }}</small>
          </div>
          <span class="service-badge">{{ humanStatus(item) }}</span>
        </div>

        <div class="integration-meta integration-meta--mini">
          <span class="meta-cell"><span>启用</span><strong>{{ item.enabled ? "守护" : "手动" }}</strong></span>
          <span class="meta-cell"><span>回复</span><strong>{{ item.reply_mode || "text" }}</strong></span>
          <span class="meta-cell"><span>账号</span><strong>{{ item.runtime?.account_count ?? item.accounts?.length ?? 0 }}</strong></span>
          <span class="meta-cell"><span>人格</span><strong>{{ profileName(item.bot_profile_id) }}</strong></span>
        </div>

        <div class="integration-card-foot">
          <p class="integration-card-note" :class="statusClass(item.status)">
            {{ item.last_error || item.runtime?.last_error || (item.status === "running" ? "桥接运行中，微信消息会进入 BranchWhisper。" : "首次使用请先扫码登录。") }}
          </p>
          <div class="integration-actions integration-actions--mini" @click.stop>
            <button class="icon-button" type="button" title="编辑" aria-label="编辑接入实例" @click="emit('edit', item)">
              <Edit3 :size="15" />
            </button>
            <button class="icon-button" type="button" title="启动" aria-label="启动接入" :disabled="actioning" @click="emit('start', item)">
              <Play :size="15" />
            </button>
            <button class="icon-button" type="button" title="停止" aria-label="停止接入" :disabled="actioning" @click="emit('stop', item)">
              <Square :size="15" />
            </button>
            <button class="icon-button" type="button" title="重启" aria-label="重启接入" :disabled="actioning" @click="emit('restart', item)">
              <RefreshCw :size="15" />
            </button>
            <button class="icon-button danger" type="button" title="删除" aria-label="删除接入实例" :disabled="actioning" @click="emit('remove', item)">
              <Trash2 :size="15" />
            </button>
          </div>
        </div>
      </article>
      <p v-if="!items.length" class="integration-empty compact">还没有微信机器人。新增后扫码登录，新设备会显示在这里。</p>
    </div>
  </section>
</template>
