import { defineStore } from "pinia";
import { deleteConversation, loadConversation, loadConversations, type Conversation, type ConversationSummary } from "@/api/conversations";

interface ConversationState {
  items: ConversationSummary[];
  active: Conversation | null;
  query: string;
  archivedMode: "active" | "archived";
  loadingList: boolean;
  loadingActive: boolean;
  error: string;
  pollHandle: number | null;
}

function conversationSignature(conversation: Conversation | null) {
  if (!conversation) return "";
  const messages = conversation.messages || [];
  const last = messages[messages.length - 1];
  return [
    conversation.id,
    conversation.updated_at || "",
    messages.length,
    last?.id || "",
    last?.role || "",
    last?.content?.length || 0,
    last?.attachments?.length || 0,
  ].join("|");
}

export const useConversationsStore = defineStore("conversations", {
  state: (): ConversationState => ({
    items: [],
    active: null,
    query: "",
    archivedMode: "active",
    loadingList: false,
    loadingActive: false,
    error: "",
    pollHandle: null,
  }),
  getters: {
    webChats(state) {
      return state.items.filter((item) => !item.platform_id && !item.source);
    },
    weixinChats(state) {
      return state.items.filter((item) => item.platform_id || item.source === "weixin_personal");
    },
  },
  actions: {
    async reloadList(quiet = false) {
      if (!quiet) this.loadingList = true;
      this.error = "";
      try {
        const data = await loadConversations(this.query, this.archivedMode);
        this.items = data.conversations || [];
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.loadingList = false;
      }
    },
    async select(id: string, options: { force?: boolean } = {}) {
      if (!id) return;
      if (!options.force && this.active?.id === id) return;
      this.loadingActive = true;
      try {
        const data = await loadConversation(id);
        if (this.active?.id === id && conversationSignature(this.active) === conversationSignature(data.conversation)) return;
        this.active = data.conversation;
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.loadingActive = false;
      }
    },
    async refreshActive() {
      if (!this.active?.id) return;
      await this.select(this.active.id, { force: true });
    },
    async remove(id: string) {
      await deleteConversation(id);
      if (this.active?.id === id) this.active = null;
      await this.reloadList();
    },
    async setArchivedMode(mode: "active" | "archived") {
      this.archivedMode = mode;
      await this.reloadList();
    },
    startPolling() {
      this.stopPolling();
      this.pollHandle = window.setInterval(async () => {
        await this.reloadList(true);
        if (this.active?.id) await this.refreshActive();
      }, 2200);
    },
    stopPolling() {
      if (this.pollHandle) window.clearInterval(this.pollHandle);
      this.pollHandle = null;
    },
  },
});
