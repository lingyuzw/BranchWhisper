<script setup lang="ts">
import type { RuntimeDiagnosticCheck, RuntimeDiagnosticStatus } from "@/api/diagnostics";

defineProps<{
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
</script>

<template>
  <div class="diagnostic-checks">
    <div v-for="check in checks" :key="`${check.kind}:${check.target}`" class="diagnostic-check" :class="check.status">
      <span>{{ kindLabel(check.kind) }}</span>
      <strong>{{ check.target || "--" }}</strong>
      <small>{{ check.message || statusLabel(check.status) }}</small>
      <div v-if="checkMetadataRows(check).length" class="diagnostic-check-meta">
        <div v-for="row in checkMetadataRows(check)" :key="`${check.kind}:${check.target}:${row.key}`">
          <span>{{ row.label }}</span>
          <strong>{{ row.value }}</strong>
        </div>
      </div>
    </div>
  </div>
</template>
