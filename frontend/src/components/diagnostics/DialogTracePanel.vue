<script setup lang="ts">
import type { DialogTrace } from "@/api/diagnostics";

defineProps<{
  traces: DialogTrace[];
}>();

function formatTraceTime(value: number) {
  if (!value) return "--";
  return new Date(value * 1000).toLocaleTimeString();
}

function traceDuration(trace: DialogTrace) {
  if (!trace.created_at || !trace.updated_at) return "--";
  const duration = Math.max(0, trace.updated_at - trace.created_at);
  return `${Math.round(duration * 1000)} ms`;
}

function traceEventClass(event: DialogTrace["events"][number]) {
  return {
    error: event.status === "error" || Boolean(event.failure_reason),
    warning: event.status === "warning",
  };
}

function traceEventDetails(event: DialogTrace["events"][number]) {
  const rows = [
    { label: "状态", value: event.status },
    { label: "耗时", value: typeof event.duration_ms === "number" ? `${event.duration_ms} ms` : "" },
    { label: "Profile", value: [event.profile_role, event.profile_name].filter(Boolean).join(" · ") },
    { label: "原因", value: event.failure_reason },
  ];
  return rows.filter((row) => row.value);
}
</script>

<template>
  <section class="trace-panel">
    <header class="trace-panel-head">
      <div>
        <p class="eyebrow">Dialog Trace</p>
        <h2>最近对话链路</h2>
      </div>
      <span>{{ traces.length }} 条</span>
    </header>

    <div v-if="traces.length" class="trace-list">
      <article v-for="trace in traces" :key="trace.id" class="trace-card" :class="trace.status">
        <div class="trace-card-head">
          <strong>{{ trace.source || "dialog" }}</strong>
          <span>{{ trace.status }} · {{ traceDuration(trace) }}</span>
        </div>
        <div class="trace-meta">
          <span>{{ trace.id }}</span>
          <span>{{ formatTraceTime(trace.created_at) }}</span>
        </div>
        <div class="trace-events">
          <div
            v-for="event in trace.events.slice(-8)"
            :key="`${trace.id}:${event.at}:${event.stage}:${event.message}`"
            :class="traceEventClass(event)"
          >
            <span>{{ event.stage }}</span>
            <strong>{{ event.message || "--" }}</strong>
            <small v-for="detail in traceEventDetails(event)" :key="`${event.at}:${detail.label}`">
              <span>{{ detail.label }}</span>
              <strong>{{ detail.value }}</strong>
            </small>
          </div>
        </div>
      </article>
    </div>

    <div v-else class="trace-empty">
      <span>还没有对话 trace。完成一次文本或语音对话后，这里会显示 ASR、LLM、TTS 和后台任务阶段。</span>
    </div>
  </section>
</template>
