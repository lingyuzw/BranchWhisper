<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import { Bot, Check, CircleAlert, Eraser, PackagePlus, Play, QrCode, RefreshCw, Save, Square, Trash2, Volume2 } from "@lucide/vue";
import PageScaffold from "@/components/common/PageScaffold.vue";
import { useIntegrationsStore } from "@/stores/integrations";

const integrations = useIntegrationsStore();

const tools = computed(() => integrations.environment?.tools || {});
const selected = computed(() => integrations.selected);

onMounted(async () => {
  await integrations.reload();
  integrations.fillForm();
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
</script>

<template>
  <PageScaffold eyebrow="Integrations" title="接入" :description="`微信桥接、扫码登录、语音与表情自检。当前 ${integrations.summary}`">
    <main class="integration-page">
      <section class="integration-left">
        <div class="integration-toolbar">
          <button class="primary-action" type="button" @click="integrations.fillForm(null)">
            <Bot :size="16" /> 添加微信个人号
          </button>
          <button class="secondary-action" type="button" @click="integrations.reload()">
            <RefreshCw :size="16" /> 刷新
          </button>
        </div>

        <div class="integration-cards">
          <article
            v-for="item in integrations.items"
            :key="item.id"
            class="integration-card"
            :class="[statusClass(item.status), { selected: item.id === integrations.selectedId }]"
            @click="integrations.select(item.id)"
          >
            <header>
              <div>
                <span class="status-dot"></span>
                <strong>{{ item.chat_name || item.id }}</strong>
                <small>微信个人号 · {{ item.id }} · OpenClaw {{ item.openclaw_profile || "branchwhisper" }}</small>
              </div>
              <span class="service-badge">{{ integrations.humanStatus(item) }}</span>
            </header>
            <div class="integration-meta">
              <span><small>启用</small><b>{{ item.enabled ? "自动启用" : "手动" }}</b></span>
              <span><small>回复</small><b>{{ item.reply_mode || "text" }}</b></span>
              <span><small>账号</small><b>{{ item.runtime?.account_count ?? item.accounts?.length ?? 0 }}</b></span>
              <span><small>PID</small><b>{{ item.pid || "--" }}</b></span>
            </div>
            <p class="integration-hint">{{ item.last_error || item.runtime?.last_error || (item.status === "running" ? "桥接进程运行中，微信消息会进入 BranchWhisper。" : "首次使用先扫码登录。") }}</p>
            <div class="integration-actions" @click.stop>
              <button class="secondary-action" type="button" @click="integrations.selectedId = item.id; integrations.run('start')">
                <Play :size="15" /> 启动
              </button>
              <button class="secondary-action" type="button" @click="integrations.selectedId = item.id; integrations.run('stop')">
                <Square :size="15" /> 停止
              </button>
              <button class="secondary-action" type="button" @click="integrations.selectedId = item.id; integrations.run('restart')">
                <RefreshCw :size="15" /> 重启
              </button>
              <button class="secondary-action danger" type="button" @click="integrations.remove(item.id)">
                <Trash2 :size="15" /> 删除
              </button>
            </div>
          </article>
          <p v-if="!integrations.items.length" class="integration-empty">还没有接入实例。添加微信个人号后会显示在这里。</p>
        </div>
      </section>

      <section class="integration-right">
        <article class="integration-panel">
          <header>
            <div>
              <strong>环境</strong>
              <small>{{ integrations.environmentReady ? "环境可用" : "需要检查 Node/OpenClaw/ffmpeg" }}</small>
            </div>
            <button class="secondary-action" type="button" @click="selected && integrations.run('install')">
              <PackagePlus :size="16" /> 安装/更新微信 CLI
            </button>
          </header>
          <div class="integration-env-grid">
            <div v-for="name in ['node', 'npm', 'openclaw', 'ffmpeg', 'silk-wasm']" :key="name" class="integration-env-card" :class="{ ready: tools[name]?.available }">
              <component :is="tools[name]?.available ? Check : CircleAlert" :size="16" />
              <strong>{{ name }}</strong>
              <small>{{ tools[name]?.version || "未检测到" }}</small>
              <span>{{ tools[name]?.path || "PATH 中不可用" }}</span>
            </div>
          </div>
        </article>

        <article class="integration-panel">
          <header>
            <div>
              <strong>实例配置</strong>
              <small>保存后立即应用到当前实例。</small>
            </div>
            <button class="primary-action" type="button" @click="integrations.saveForm">
              <Save :size="16" /> 保存
            </button>
          </header>
          <div class="integration-form-grid">
            <label>实例 ID<input v-model="integrations.form.id" /></label>
            <label>微信聊天命名<input v-model="integrations.form.chat_name" /></label>
            <label>OpenClaw profile<input v-model="integrations.form.openclaw_profile" /></label>
            <label>回复模式<select v-model="integrations.form.reply_mode"><option value="text">文字默认</option><option value="voice">语音优先</option></select></label>
            <label class="toggle-line"><input v-model="integrations.form.enabled" type="checkbox" />启用后台守护</label>
            <label class="wide">语音触发词<textarea v-model="integrations.form.voice_trigger_keywords" rows="4"></textarea></label>
          </div>
        </article>

        <article class="integration-panel">
          <header>
            <div>
              <strong>扫码登录</strong>
              <small>扫码成功后二维码会自动隐藏。</small>
            </div>
            <button class="secondary-action" type="button" @click="integrations.startQrLogin(true)">
              <QrCode :size="16" /> 扫码登录
            </button>
          </header>
          <div class="integration-login-box">
            <img v-if="qrImage(integrations.qrSession)" class="integration-qr-image" :src="qrImage(integrations.qrSession)" alt="微信扫码二维码" />
            <div v-else>
              <strong>{{ selected?.status === "running" ? "桥接运行中" : selected ? "等待扫码" : "请选择实例" }}</strong>
              <span>{{ selected?.runtime?.manual_stop ? "实例已手动停止。" : "点击扫码登录后在这里显示二维码。" }}</span>
            </div>
          </div>
        </article>

        <article class="integration-panel">
          <header>
            <div>
              <strong>测试区</strong>
              <small>文本、语音和表情包走真实接入链路。</small>
            </div>
          </header>
          <div class="integration-test-grid">
            <label>对话测试<input v-model="integrations.testText" @keydown.enter="integrations.runDialogTest" /></label>
            <button class="secondary-action" type="button" @click="integrations.runDialogTest">测试对话</button>
            <label>语音自检<input v-model="integrations.voiceText" @keydown.enter="integrations.runVoiceTest" /></label>
            <button class="secondary-action" type="button" @click="integrations.runVoiceTest"><Volume2 :size="16" /> 发送语音</button>
            <label>表情自检<input v-model="integrations.stickerText" @keydown.enter="integrations.runStickerTest" /></label>
            <button class="secondary-action" type="button" @click="integrations.runStickerTest">发送表情</button>
          </div>
          <pre v-if="integrations.testResult || integrations.voiceResult || integrations.stickerResult" class="integration-result">{{ [integrations.testResult, integrations.voiceResult, integrations.stickerResult].filter(Boolean).join('\n\n') }}</pre>
        </article>

        <article class="integration-panel log">
          <header>
            <div>
              <strong>桥接日志</strong>
              <small>{{ selected?.id || "--" }}</small>
            </div>
            <div class="log-actions">
              <select v-model="integrations.logScope" @change="integrations.refreshLogs()">
                <option value="current">本次启动</option>
                <option value="all">全部日志</option>
              </select>
              <button class="secondary-action" type="button" @click="integrations.refreshLogs()"><RefreshCw :size="16" /> 刷新</button>
              <button class="secondary-action danger" type="button" @click="integrations.clearLogs"><Eraser :size="16" /> 清空</button>
            </div>
          </header>
          <pre class="log-box">{{ integrations.logs || "暂无日志。" }}</pre>
        </article>
      </section>
    </main>
  </PageScaffold>
</template>
