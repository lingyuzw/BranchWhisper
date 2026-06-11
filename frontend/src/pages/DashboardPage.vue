<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { MessageSquarePlus, RefreshCw, Search, Send, Trash2 } from "@lucide/vue";
import { useConversationsStore } from "@/stores/conversations";
import type { ChatAttachment, ChatMessage } from "@/api/conversations";

const conversations = useConversationsStore();
const scroller = ref<HTMLElement | null>(null);
const draft = ref("");
const connected = ref(false);
const busy = ref(false);
const socket = ref<WebSocket | null>(null);
const liveMessages = ref<ChatMessage[]>([]);

function scrollToBottom() {
  void nextTick(() => {
    const el = scroller.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

async function openConversation(id: string) {
  closeSocket();
  await conversations.select(id, { force: true });
  liveMessages.value = [...(conversations.active?.messages || [])];
  connectSocket(id);
  scrollToBottom();
}

watch(
  () => liveMessages.value.length,
  () => scrollToBottom(),
);

onMounted(async () => {
  await conversations.reloadList();
  if (!conversations.active && conversations.items[0]) await openConversation(conversations.items[0].id);
  conversations.startPolling();
});

onUnmounted(() => {
  conversations.stopPolling();
  closeSocket();
});

function connectSocket(conversationId = conversations.active?.id || "") {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const query = conversationId ? `?conversation_id=${encodeURIComponent(conversationId)}` : "";
  const ws = new WebSocket(`${scheme}://${location.host}/ws/dialog${query}`);
  socket.value = ws;
  ws.addEventListener("open", () => {
    connected.value = true;
  });
  ws.addEventListener("close", () => {
    connected.value = false;
  });
  ws.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    try {
      handleSocketEvent(JSON.parse(event.data));
    } catch {
      // Ignore non-JSON frames here; audio migration will handle binary later.
    }
  });
}

function closeSocket() {
  socket.value?.close();
  socket.value = null;
  connected.value = false;
  busy.value = false;
}

function handleSocketEvent(data: Record<string, any>) {
  if (data.type === "conversation") {
    conversations.active = data.conversation;
    liveMessages.value = [...(data.conversation?.messages || [])];
  }
  if (data.type === "conversation_saved") {
    conversations.active = data.conversation;
    liveMessages.value = [...(data.conversation?.messages || liveMessages.value)];
    void conversations.reloadList(true);
  }
  if (data.type === "user") {
    liveMessages.value.push({ role: "user", content: data.text || "", attachments: data.attachments || [], created_at: "刚刚" });
  }
  if (data.type === "assistant_start") {
    busy.value = true;
    liveMessages.value.push({ role: "assistant", content: "", attachments: [], created_at: "生成中" });
  }
  if (data.type === "llm_delta") {
    const last = liveMessages.value[liveMessages.value.length - 1];
    if (last?.role === "assistant") last.content += data.text || "";
  }
  if (data.type === "assistant_attachment") {
    const last = liveMessages.value[liveMessages.value.length - 1];
    if (last?.role === "assistant") {
      last.attachments = [...(last.attachments || []), ...((data.attachments || []) as ChatAttachment[])];
    }
  }
  if (data.type === "turn_done" || data.type === "error") {
    busy.value = false;
  }
}

function sendText() {
  const text = draft.value.trim();
  if (!text || busy.value || socket.value?.readyState !== WebSocket.OPEN) return;
  socket.value.send(JSON.stringify({ type: "text", text }));
  draft.value = "";
}
</script>

<template>
  <main class="chat-page">
    <aside class="chat-sidebar">
      <div class="chat-brand-row">
        <strong>对话</strong>
        <button class="icon-button" title="新聊天"><MessageSquarePlus :size="16" /></button>
      </div>
      <label class="chat-search">
        <Search :size="15" />
        <input v-model="conversations.query" placeholder="搜索聊天" @keydown.enter="conversations.reloadList()" />
      </label>

      <section class="chat-section">
        <h2>微信聊天</h2>
        <button
          v-for="item in conversations.weixinChats"
          :key="item.id"
          class="chat-list-item"
          :class="{ active: conversations.active?.id === item.id }"
          type="button"
          @click="openConversation(item.id)"
        >
          <strong>{{ item.title }}</strong>
          <small>{{ item.last_message || item.summary || "暂无消息" }}</small>
        </button>
      </section>

      <section class="chat-section grow">
        <h2>最近</h2>
        <button
          v-for="item in conversations.webChats"
          :key="item.id"
          class="chat-list-item"
          :class="{ active: conversations.active?.id === item.id }"
          type="button"
          @click="openConversation(item.id)"
        >
          <strong>{{ item.title }}</strong>
          <small>{{ item.last_message || item.summary || "暂无消息" }}</small>
        </button>
      </section>
    </aside>

    <section class="chat-main">
      <header class="chat-header">
        <div>
          <h1>{{ conversations.active?.title || "新的对话" }}</h1>
          <small>{{ conversations.active?.message_count || conversations.active?.messages.length || 0 }} 条消息</small>
        </div>
        <div class="chat-header-actions">
          <button class="icon-button" type="button" @click="conversations.refreshActive()"><RefreshCw :size="16" /></button>
          <button v-if="conversations.active" class="icon-button danger" type="button" @click="conversations.remove(conversations.active.id)">
            <Trash2 :size="16" />
          </button>
        </div>
      </header>

      <div ref="scroller" class="message-list">
        <article v-for="message in liveMessages" :key="message.id || `${message.role}-${message.created_at}-${message.content}`" class="message-row" :class="message.role">
          <div class="message-bubble">
            <p v-if="message.content">{{ message.content }}</p>
            <div v-if="message.attachments?.length" class="message-attachments">
              <img v-for="attachment in message.attachments" :key="attachment.asset_id || attachment.url" :src="attachment.url" :alt="attachment.name || attachment.tag || '附件'" />
            </div>
            <small>{{ message.created_at }}</small>
          </div>
        </article>
      </div>

      <footer class="chat-compose">
        <input v-model="draft" :disabled="!connected || busy" placeholder="有问题，尽管问" @keydown.enter="sendText" />
        <button class="primary-action" type="button" :disabled="!connected || busy || !draft.trim()" @click="sendText"><Send :size="16" />发送</button>
      </footer>
    </section>
  </main>
</template>
