import { defineStore } from "pinia";
import {
  clearIntegrationLogs,
  createIntegration,
  deleteIntegration,
  fetchIntegrationLogs,
  installIntegration,
  loadIntegrations,
  pollIntegrationQrLogin,
  restartIntegration,
  startIntegrationBridge,
  startIntegration,
  startIntegrationQrLogin,
  stopIntegration,
  testIntegrationDialog,
  testIntegrationSticker,
  testIntegrationVoice,
  updateIntegration,
  type IntegrationEnvironment,
  type IntegrationItem,
} from "@/api/integrations";

const DEFAULT_KEYWORDS = ["发语音", "发条语音", "发句语音", "说句话", "讲句话", "念给我听", "读出来", "语音回复", "我想听你说话", "听听"];

interface IntegrationForm {
  id: string;
  chat_name: string;
  enabled: boolean;
  openclaw_profile: string;
  bot_profile_id: string;
  reply_mode: string;
  voice_trigger_keywords: string;
}

interface IntegrationState {
  items: IntegrationItem[];
  environment: IntegrationEnvironment | null;
  selectedId: string;
  editingId: string;
  logs: string;
  logScope: string;
  loading: boolean;
  actioning: boolean;
  error: string;
  qrSession: Record<string, any> | null;
  verifyCode: string;
  bridgeUrl: string;
  pollHandle: number | null;
  loginPollHandle: number | null;
  form: IntegrationForm;
  testText: string;
  voiceText: string;
  stickerText: string;
  testResult: string;
  testOk: boolean | null;
  voiceResult: string;
  voiceOk: boolean | null;
  stickerResult: string;
  stickerOk: boolean | null;
}

function defaultForm(): IntegrationForm {
  return {
    id: "weixin_personal",
    chat_name: "我的微信聊天",
    enabled: true,
    openclaw_profile: "branchwhisper",
    bot_profile_id: "default",
    reply_mode: "text",
    voice_trigger_keywords: DEFAULT_KEYWORDS.join("\n"),
  };
}

function compact(value: unknown, limit = 52) {
  const text = String(value || "");
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

export function probeStatusText(result: Record<string, any>) {
  if (result.ok) return "接口已接收，请到微信端验证";
  if (result.stage === "tts_loading") return "等待 TTS 加载/预热";
  return "失败";
}

function formatProbeResult(result: Record<string, any>, kind: "voice" | "sticker") {
  const target = result.target || {};
  const clientDelivery = result.client_delivery === "unconfirmed" ? "接口已接收，微信客户端需人工确认" : result.client_delivery || "--";
  const lines = [
    `状态：${probeStatusText(result)}`,
    `阶段：${result.stage || "--"}`,
    `目标：${target.account_id || "--"} -> ${target.sender_id || "--"}`,
  ];
  if (result.target_url) lines.push(`目标 URL：${result.target_url}`);
  if (kind === "voice") {
    const diagnostic = result.voice_diagnostic || {};
    const cdnVerify = diagnostic.cdn_verify || {};
    if (result.tts_done) lines.push(`TTS：完成 · ${result.tts_ms || 0}ms`);
    if (result.voice_file) lines.push(`文件：${result.voice_file}`);
    if (result.send_done) lines.push(`发送：完成 · ${result.send_ms || 0}ms · ${result.voice_format || "--"}`);
    if (result.voice_message_id) lines.push(`消息：${result.voice_message_id}`);
    if (diagnostic.encode_type || diagnostic.sample_rate || diagnostic.playtime_ms) {
      lines.push(`编码：type=${diagnostic.encode_type || "--"} · ${diagnostic.sample_rate || "--"}Hz · ${diagnostic.playtime_ms || 0}ms`);
    }
    if (cdnVerify.ok === false) {
      lines.push(`CDN 回读：未通过自检（微信 CDN 对下载校验返回 400），发送请求已继续提交`);
    } else if (cdnVerify.ok === true) {
      lines.push(`CDN 回读：通过 · ${cdnVerify.verify_ms || 0}ms`);
    }
  } else {
    const sticker = result.sticker || {};
    lines.push(`素材：${sticker.tag || "--"} · ${sticker.name || sticker.id || "--"} · ${sticker.mime || "--"}`);
    if (result.send_done) lines.push(`发送：完成 · ${result.send_ms || 0}ms`);
    if (result.image_message_id) lines.push(`消息：${result.image_message_id}`);
    if (result.image_diagnostic) lines.push(`诊断：${JSON.stringify(result.image_diagnostic, null, 2)}`);
    if (result.selection_diagnostic) lines.push(`选择诊断：${JSON.stringify(result.selection_diagnostic, null, 2)}`);
  }
  if (result.client_delivery) lines.push(`客户端：${clientDelivery}`);
  if (result.error) lines.push(`错误：${result.error}`);
  if (result.sender_payload) lines.push(`发送器：${JSON.stringify(result.sender_payload, null, 2)}`);
  return lines.join("\n");
}

export const useIntegrationsStore = defineStore("integrations", {
  state: (): IntegrationState => ({
    items: [],
    environment: null,
    selectedId: "",
    editingId: "",
    logs: "",
    logScope: "current",
    loading: false,
    actioning: false,
    error: "",
    qrSession: null,
    verifyCode: "",
    bridgeUrl: "",
    pollHandle: null,
    loginPollHandle: null,
    form: defaultForm(),
    testText: "你好，测试一下",
    voiceText: "我在，听得到的话我们继续聊。",
    stickerText: "打一架",
    testResult: "",
    testOk: null,
    voiceResult: "",
    voiceOk: null,
    stickerResult: "",
    stickerOk: null,
  }),
  getters: {
    selected(state): IntegrationItem | null {
      return state.items.find((item) => item.id === state.selectedId) || state.items[0] || null;
    },
    environmentReady(state): boolean {
      return Boolean(state.environment?.ready);
    },
    summary(state): string {
      const active = state.items.filter((item) => ["running", "login", "logged_in"].includes(String(item.status || ""))).length;
      return `${active}/${state.items.length} 接入`;
    },
  },
  actions: {
    sync(data: { integrations?: IntegrationItem[]; environment?: IntegrationEnvironment }) {
      this.items = data.integrations || this.items;
      this.environment = data.environment || this.environment;
      if (!this.items.some((item) => item.id === this.selectedId)) this.selectedId = this.items[0]?.id || "";
    },
    async reload(quiet = false) {
      if (!quiet) this.loading = true;
      this.error = "";
      try {
        this.sync(await loadIntegrations());
        await this.refreshLogs(true);
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.loading = false;
      }
    },
    select(id: string) {
      this.selectedId = id;
      void this.refreshLogs(true);
    },
    fillForm(item?: IntegrationItem | null) {
      const target = item || null;
      this.editingId = target?.id || "";
      this.form = {
        id: target?.id || `weixin_${Date.now().toString(36)}`,
        chat_name: target?.chat_name || "我的微信聊天",
        enabled: target?.enabled ?? true,
        openclaw_profile: target?.openclaw_profile || "branchwhisper",
        bot_profile_id: target?.bot_profile_id || "default",
        reply_mode: target?.reply_mode || "text",
        voice_trigger_keywords: (target?.voice_trigger_keywords?.length ? target.voice_trigger_keywords : DEFAULT_KEYWORDS).join("\n"),
      };
    },
    async saveForm() {
      const payload = {
        id: this.form.id.trim() || "weixin_personal",
        chat_name: this.form.chat_name.trim() || "我的微信聊天",
        enabled: this.form.enabled,
        openclaw_profile: this.form.openclaw_profile.trim() || "branchwhisper",
        bot_profile_id: this.form.bot_profile_id || "default",
        reply_mode: this.form.reply_mode || "text",
        voice_trigger_keywords: this.form.voice_trigger_keywords
          .split(/\r?\n|[,，]/)
          .map((item) => item.trim())
          .filter(Boolean),
      };
      const data = this.editingId ? await updateIntegration(this.editingId, payload) : await createIntegration(payload);
      this.sync(data);
      this.selectedId = this.editingId || payload.id;
      this.editingId = "";
      await this.refreshLogs(true);
    },
    async remove(id: string) {
      this.actioning = true;
      try {
        this.sync(await deleteIntegration(id));
        this.selectedId = this.items[0]?.id || "";
        await this.refreshLogs(true);
      } finally {
        this.actioning = false;
      }
    },
    async ensureIntegrationEnabled(id: string) {
      const item = this.items.find((candidate) => candidate.id === id);
      if (!item || item.enabled) return;
      this.sync(await updateIntegration(id, { enabled: true }));
    },
    async run(action: "install" | "start" | "stop" | "restart") {
      const id = this.selected?.id;
      if (!id) return;
      this.actioning = true;
      try {
        if (["start", "restart", "install"].includes(action)) await this.ensureIntegrationEnabled(id);
        if (action === "install") this.sync(await installIntegration(id));
        if (action === "start") this.sync(await startIntegration(id));
        if (action === "stop") this.sync(await stopIntegration(id));
        if (action === "restart") this.sync(await restartIntegration(id));
        await this.refreshLogs(true);
      } finally {
        this.actioning = false;
      }
    },
    async startQrLogin(force = true) {
      const id = this.selected?.id;
      if (!id) return;
      await this.ensureIntegrationEnabled(id);
      const data = await startIntegrationQrLogin(id, force);
      this.sync(data);
      this.qrSession = { ...(data.result?.login || {}), integrationId: id };
      this.startLoginPolling();
      await this.refreshLogs(true);
    },
    async pollQrLogin(quiet = true) {
      const id = this.selected?.id;
      if (!id || this.qrSession?.integrationId !== id) return;
      try {
        const data = await pollIntegrationQrLogin(id, this.verifyCode.trim());
        this.sync(data);
        const session = { ...(this.qrSession || {}), ...(data.result?.login || {}), integrationId: id };
        this.qrSession = session;
        const doneStatuses = ["created", "expired", "denied", "cancel", "canceled", "verify_code_blocked", "error"];
        if (doneStatuses.includes(String(session.status || ""))) {
          this.stopLoginPolling();
          if (session.status === "created") this.qrSession = null;
          await this.reload(true);
        }
      } catch (error) {
        if (!quiet) this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async refreshLogs(quiet = false) {
      const id = this.selected?.id;
      if (!id) {
        this.logs = "";
        return;
      }
      if (!quiet) this.error = "";
      try {
        this.logs = await fetchIntegrationLogs(id, this.logScope);
      } catch (error) {
        if (!quiet) this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async clearLogs() {
      const id = this.selected?.id;
      if (!id) return;
      await clearIntegrationLogs(id);
      await this.refreshLogs(true);
    },
    async startBridge() {
      const id = this.selected?.id;
      if (!id) return;
      this.actioning = true;
      try {
        await this.ensureIntegrationEnabled(id);
        this.sync(await startIntegrationBridge(id, this.bridgeUrl.trim()));
        await this.refreshLogs(true);
      } finally {
        this.actioning = false;
      }
    },
    async runDialogTest() {
      const id = this.selected?.id;
      if (!id || !this.testText.trim()) return;
      this.testResult = "正在请求对话模型...";
      this.testOk = null;
      try {
        const data = await testIntegrationDialog(id, this.testText.trim());
        this.testOk = Boolean(data.ok);
        this.testResult = data.reply_text || JSON.stringify(data, null, 2);
        await this.refreshLogs(true);
      } catch (error) {
        this.testOk = false;
        throw error;
      }
    },
    async runVoiceTest() {
      const id = this.selected?.id;
      if (!id || !this.voiceText.trim()) return;
      this.voiceResult = "正在合成并发送...";
      this.voiceOk = null;
      try {
        const result = await testIntegrationVoice(id, this.voiceText.trim());
        this.voiceOk = Boolean(result.ok);
        this.voiceResult = formatProbeResult(result, "voice");
        await this.reload(true);
      } catch (error) {
        this.voiceOk = false;
        throw error;
      }
    },
    async runStickerTest() {
      const id = this.selected?.id;
      if (!id || !this.stickerText.trim()) return;
      this.stickerResult = "正在选择素材并发送...";
      this.stickerOk = null;
      try {
        const result = await testIntegrationSticker(id, this.stickerText.trim());
        this.stickerOk = Boolean(result.ok);
        this.stickerResult = formatProbeResult(result, "sticker");
        await this.reload(true);
      } catch (error) {
        this.stickerOk = false;
        throw error;
      }
    },
    humanStatus(item: IntegrationItem) {
      const status = String(item.status || "stopped");
      return {
        running: "桥接运行中",
        login: "等待扫码",
        logged_in: "已登录未启动",
        starting: "桥接启动中",
        installing: "安装中",
        failed: "失败",
        stopped: "已停止",
      }[status] || compact(status || "未知");
    },
    startPolling() {
      this.stopPolling();
      this.pollHandle = window.setInterval(() => {
        void this.reload(true);
      }, 6000);
    },
    stopPolling() {
      if (this.pollHandle) window.clearInterval(this.pollHandle);
      this.pollHandle = null;
      this.stopLoginPolling();
    },
    startLoginPolling() {
      this.stopLoginPolling();
      this.loginPollHandle = window.setInterval(() => {
        void this.pollQrLogin(true);
      }, 2600);
    },
    stopLoginPolling() {
      if (this.loginPollHandle) window.clearInterval(this.loginPollHandle);
      this.loginPollHandle = null;
    },
  },
});
