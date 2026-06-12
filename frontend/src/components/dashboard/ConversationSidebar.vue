<script setup lang="ts">
import { Archive, Download, Search, SquarePen, Star, Trash2 } from "@lucide/vue";
import type { ConversationSummary } from "@/api/conversations";

defineProps<{
  query: string;
  activeScope: "recent" | "weixin";
  activeId?: string;
  visibleConversations: ConversationSummary[];
  isWeixinConversation: (item: ConversationSummary) => boolean;
}>();

const emit = defineEmits<{
  "update:query": [value: string];
  newConversation: [];
  switchScope: [scope: "recent" | "weixin"];
  openConversation: [id: string];
  search: [];
  toggleFavorite: [item: ConversationSummary];
  exportConversation: [item: ConversationSummary];
  archiveConversation: [item: ConversationSummary];
  removeConversation: [item: ConversationSummary];
}>();
</script>

<template>
  <div class="conversation-top">
    <button class="conversation-action-row" type="button" @click="emit('newConversation')">
      <SquarePen :size="16" />
      <span>新建对话</span>
    </button>
    <label class="conversation-search-row">
      <Search :size="16" />
      <input :value="query" type="search" placeholder="搜索对话" autocomplete="off" @input="emit('update:query', ($event.target as HTMLInputElement).value); emit('search')" />
    </label>
    <div class="conversation-tabs">
      <button type="button" :class="{ active: activeScope === 'recent' }" @click="emit('switchScope', 'recent')">最近</button>
      <button type="button" :class="{ active: activeScope === 'weixin' }" @click="emit('switchScope', 'weixin')">微信聊天</button>
    </div>
    <button class="conversation-action-row subtle" type="button">
      <Archive :size="16" />
      <span>归档</span>
    </button>
  </div>

  <div class="conversation-rail">
    <div class="rail-head">
      <p class="eyebrow rail-label">{{ activeScope === "weixin" ? "微信聊天" : "最近" }}</p>
      <span>{{ visibleConversations.length }}</span>
    </div>

    <section class="conversation-list">
      <article
        v-for="item in visibleConversations"
        :key="item.id"
        class="conversation-item"
        :class="{ active: activeId === item.id }"
      >
        <button class="conversation-open" type="button" @click="emit('openConversation', item.id)">
          <strong>{{ item.title || (isWeixinConversation(item) ? "微信聊天" : "新的对话") }}</strong>
          <span>{{ item.summary || item.last_message || "空会话" }}</span>
          <small>{{ item.favorite ? "★ " : "" }}{{ isWeixinConversation(item) ? "微信 · " : "" }}{{ item.updated_at?.slice(0, 16) || "--" }}</small>
        </button>
        <div class="conversation-actions">
          <button class="conversation-icon" type="button" title="收藏" @click.stop="emit('toggleFavorite', item)"><Star :size="14" /></button>
          <button class="conversation-icon" type="button" title="导出" @click.stop="emit('exportConversation', item)"><Download :size="14" /></button>
          <button class="conversation-icon" type="button" title="归档" @click.stop="emit('archiveConversation', item)"><Archive :size="14" /></button>
          <button class="conversation-icon danger" type="button" title="删除" @click.stop="emit('removeConversation', item)"><Trash2 :size="14" /></button>
        </div>
      </article>
      <p v-if="!visibleConversations.length" class="conversation-empty">
        {{ activeScope === "weixin" ? "还没有微信聊天。先在微信里发一条消息。" : "还没有保存的对话。发送第一条消息后会出现在这里。" }}
      </p>
    </section>
  </div>
</template>
