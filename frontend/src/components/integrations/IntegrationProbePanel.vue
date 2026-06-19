<script setup lang="ts">
import InlineProbe from "@/components/layout/InlineProbe.vue";

type ProbeStatus = "idle" | "running" | "ok" | "failed" | "warning";

defineProps<{
  testText: string;
  voiceText: string;
  stickerText: string;
  actionMessage: string;
  dialogStatus: ProbeStatus;
  voiceStatus: ProbeStatus;
  stickerStatus: ProbeStatus;
  voiceUnconfirmed: boolean;
  testResult: string;
  voiceResult: string;
  stickerResult: string;
  disabled: boolean;
}>();

const emit = defineEmits<{
  "update:testText": [value: string];
  "update:voiceText": [value: string];
  "update:stickerText": [value: string];
  runDialog: [];
  runVoice: [];
  runSticker: [];
  copyDialog: [];
  copyVoice: [];
  copySticker: [];
}>();

function dialogStatusText(status: ProbeStatus) {
  if (status === "ok") return "回复正常";
  if (status === "failed") return "回复失败";
  if (status === "running") return "检测中";
  return "未检测";
}

function voiceStatusText(status: ProbeStatus, unconfirmed: boolean) {
  if (status === "ok") return "发送正常";
  if (status === "warning") return unconfirmed ? "原生语音未送达" : "等待 TTS";
  if (status === "failed") return "发送失败";
  if (status === "running") return "检测中";
  return "未检测";
}

function stickerStatusText(status: ProbeStatus) {
  if (status === "ok") return "接口已接收";
  if (status === "failed") return "发送失败";
  if (status === "running") return "检测中";
  return "未检测";
}
</script>

<template>
  <section class="integration-panel integration-tests-panel">
    <div class="panel-head">
      <div>
        <p class="eyebrow">Loop Checks</p>
        <h2>链路测试</h2>
      </div>
      <span v-if="actionMessage" class="soft-badge integration-action-message">{{ actionMessage }}</span>
    </div>
    <section class="integration-probe-panel">
      <div class="integration-probe-card">
        <input :value="testText" type="text" placeholder="你好，测试一下" @input="emit('update:testText', ($event.target as HTMLInputElement).value)" @keydown.enter="emit('runDialog')" />
        <InlineProbe
          variant="compact"
          title="文本回复链路"
          summary="模拟微信入站消息，测试 dialog API、LLM 和回传结果。"
          :status="dialogStatus"
          :status-text="dialogStatusText(dialogStatus)"
          :detail="testResult"
          action-text="运行"
          :disabled="disabled"
          @run="emit('runDialog')"
          @copy="emit('copyDialog')"
        />
      </div>
      <div class="integration-probe-card">
        <input :value="voiceText" type="text" placeholder="我在，听得到的话我们继续。" @input="emit('update:voiceText', ($event.target as HTMLInputElement).value)" @keydown.enter="emit('runVoice')" />
        <InlineProbe
          variant="compact"
          title="语音发送链路"
          summary="生成短音频并尝试发送微信原生语音；本地文件不算送达。"
          :status="voiceStatus"
          :status-text="voiceStatusText(voiceStatus, voiceUnconfirmed)"
          :detail="voiceResult"
          action-text="运行"
          :disabled="disabled"
          @run="emit('runVoice')"
          @copy="emit('copyVoice')"
        />
      </div>
      <div class="integration-probe-card">
        <input :value="stickerText" type="text" placeholder="打一架" @input="emit('update:stickerText', ($event.target as HTMLInputElement).value)" @keydown.enter="emit('runSticker')" />
        <InlineProbe
          variant="compact"
          title="素材发送链路"
          summary="按测试文本选择素材并发送到微信，验证素材策略和图片发送。"
          :status="stickerStatus"
          :status-text="stickerStatusText(stickerStatus)"
          :detail="stickerResult"
          action-text="运行"
          :disabled="disabled"
          @run="emit('runSticker')"
          @copy="emit('copySticker')"
        />
      </div>
    </section>
  </section>
</template>
