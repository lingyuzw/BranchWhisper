<script setup lang="ts">
import type { RuntimeDiagnosticCheck, RuntimeDiagnosticStatus } from "@/api/diagnostics";

const props = defineProps<{
  checks: RuntimeDiagnosticCheck[];
  kindLabel: (kind: string) => string;
  statusLabel: (status: RuntimeDiagnosticStatus) => string;
}>();

function metadataText(value: unknown) {
  if (typeof value === "boolean") return value ? "存在" : "不存在";
  if (typeof value === "number") return String(value);
  if (typeof value === "string" && value.trim()) return value;
  return "";
}

function checkMetadataRows(check: RuntimeDiagnosticCheck) {
  const metadata = check.metadata || {};
  const rows = [
    { key: "raw_target", label: "原始值", value: metadata.raw_target },
    { key: "resolved_target", label: "解析到", value: metadata.resolved_target || metadata.resolved_path || metadata.path },
    { key: "resolution_base", label: "解析基准", value: metadata.resolution_base },
    { key: "exists", label: "存在状态", value: metadata.exists },
    { key: "profile_cwd", label: "Profile cwd", value: metadata.profile_cwd },
  ];
  return rows
    .map((row) => ({ ...row, value: metadataText(row.value) }))
    .filter((row) => row.value);
}

function compactLine(text: string) {
  const value = String(text || "").trim();
  const firstLine = value.split(/\r?\n/).find((line) => line.trim()) || value;
  return firstLine.length > 150 ? `${firstLine.slice(0, 150)}...` : firstLine;
}

function friendlyFailureText(check: RuntimeDiagnosticCheck) {
  if (check.status === "ok") return "检查通过，当前配置可用。";
  if (check.kind === "model_path") return "模型文件没有在解析后的路径找到。";
  if (check.kind === "binary") return "启动命令在当前运行环境中不可用。";
  if (check.kind === "port") return "服务端口没有按预期响应。";
  if (check.kind === "health_url") return "健康检查地址暂时无法访问。";
  if (check.kind === "required_file") return "依赖文件没有在解析后的路径找到。";
  return compactLine(check.message) || props.statusLabel(check.status);
}

function technicalDetailText(check: RuntimeDiagnosticCheck) {
  const value = String(check.message || "").trim();
  if (!value || value === friendlyFailureText(check)) return "";
  return value;
}

function actionText(check: RuntimeDiagnosticCheck) {
  if (check.fix) return check.fix;
  if (check.kind === "model_path") return "检查模型文件是否存在，并确认相对路径的解析基准。";
  if (check.kind === "binary") return "填写可执行文件绝对路径，或进入正确环境后重新启动服务。";
  if (check.kind === "port") return "先启动对应服务，再确认端口没有被其他进程占用。";
  if (check.kind === "health_url") return "等待模型加载完成后重试，或检查健康检查地址配置。";
  return "修正配置或服务状态后重新检测。";
}
</script>

<template>
  <div class="diagnostic-checks">
    <div v-for="check in checks" :key="`${check.kind}:${check.target}`" class="diagnostic-check" :class="check.status">
      <span class="diagnostic-check-kind">{{ kindLabel(check.kind) }}</span>
      <div class="diagnostic-check-body">
        <strong class="diagnostic-check-target">{{ check.target || "--" }}</strong>
        <div class="diagnostic-check-summary" :class="check.status">
          <span>{{ check.status === "ok" ? "检查结果" : "当前异常" }}</span>
          <strong>{{ friendlyFailureText(check) }}</strong>
        </div>
        <details v-if="technicalDetailText(check)" class="diagnostic-check-message">
          <summary>技术详情</summary>
          <pre>{{ technicalDetailText(check) }}</pre>
        </details>
        <small v-if="check.status !== 'ok'" class="diagnostic-check-action">
          <span>建议操作</span>
          <strong>{{ actionText(check) }}</strong>
        </small>
        <div v-if="checkMetadataRows(check).length" class="diagnostic-check-meta">
          <div v-for="row in checkMetadataRows(check)" :key="`${check.kind}:${check.target}:${row.key}`">
            <span>{{ row.label }}</span>
            <strong>{{ row.value }}</strong>
          </div>
        </div>
      </div>
      <span class="diagnostic-check-state">{{ statusLabel(check.status) }}</span>
    </div>
  </div>
</template>
