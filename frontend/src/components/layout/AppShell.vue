<script setup lang="ts">
import { Activity, Bot, Brain, ClipboardCheck, Library, MessagesSquare, Settings2 } from "@lucide/vue";
import { onBeforeUnmount, onMounted, watch, watchEffect } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";
import FeedbackLayer from "@/components/layout/FeedbackLayer.vue";
import { useAppStore } from "@/stores/app";
import { useUiStore } from "@/stores/ui";

const app = useAppStore();
const ui = useUiStore();
const route = useRoute();

const navItems = [
  { to: "/", label: "对话", icon: MessagesSquare },
  { to: "/services", label: "服务", icon: Activity },
  { to: "/integrations", label: "接入", icon: Bot },
  { to: "/diagnostics", label: "检测", icon: ClipboardCheck },
  { to: "/memory", label: "记忆", icon: Brain },
  { to: "/assets", label: "素材库", icon: Library },
  { to: "/settings", label: "配置", icon: Settings2 },
];

onMounted(() => {
  void app.bootstrap();
  document.addEventListener("keydown", handleGlobalKeydown);
  document.addEventListener("click", handleDocumentClick);
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", handleGlobalKeydown);
  document.removeEventListener("click", handleDocumentClick);
});

watch(
  () => route.fullPath,
  () => {
    ui.closeTransientUi();
  },
);

watchEffect(() => {
  const page = route.path === "/" ? "dashboard" : route.path.replace(/^\//, "") || "dashboard";
  document.body.dataset.page = page;
});

function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") ui.closeTransientUi();
}

function handleDocumentClick(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (
    target.closest(
      [
        ".modal-panel",
        ".confirm-dialog",
        ".toast-container",
        ".topbar",
        "button",
        "a",
        "input",
        "textarea",
        "select",
        "label",
        "summary",
      ].join(","),
    )
  ) {
    return;
  }
  ui.closeTransientUi();
}
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <RouterLink class="brand" to="/">
        <span class="brand-mark">BW</span>
        <span>
          <strong>BranchWhisper</strong>
          <small>Local Voice AI</small>
        </span>
      </RouterLink>

      <nav class="nav-tabs" aria-label="主导航">
        <RouterLink v-for="item in navItems" :key="item.to" :to="item.to" active-class="active">
          <component :is="item.icon" :size="16" />
          {{ item.label }}
        </RouterLink>
      </nav>

      <div class="topbar-status">
        <span class="status-pill" :class="{ danger: app.error }">
          {{ app.error ? "连接异常" : app.loading ? "加载中" : "待机" }}
        </span>
      </div>
    </header>

    <RouterView />
    <FeedbackLayer />
  </div>
</template>
