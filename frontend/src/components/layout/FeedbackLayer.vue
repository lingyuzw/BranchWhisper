<script setup lang="ts">
import { AlertTriangle, CheckCircle2, Info, XCircle } from "@lucide/vue";
import { useUiStore, type ToastKind } from "@/stores/ui";

const ui = useUiStore();

function iconFor(type: ToastKind) {
  return {
    success: CheckCircle2,
    warning: AlertTriangle,
    error: XCircle,
    info: Info,
  }[type];
}
</script>

<template>
  <Teleport to="body">
    <div v-if="ui.toasts.length" class="toast-container" aria-live="polite" aria-atomic="false">
      <button
        v-for="toast in ui.toasts"
        :key="toast.id"
        class="toast feedback-toast"
        :class="toast.type"
        type="button"
        @click="ui.dismissToast(toast.id)"
      >
        <component :is="iconFor(toast.type)" :size="16" aria-hidden="true" />
        <span>{{ toast.message }}</span>
      </button>
    </div>

    <div v-if="ui.confirm" class="confirm-overlay" @click.self="ui.resolveConfirm(false)">
      <section class="confirm-dialog" role="dialog" aria-modal="true" :aria-labelledby="`confirm-title-${ui.confirm.id}`">
        <h2 :id="`confirm-title-${ui.confirm.id}`">{{ ui.confirm.title }}</h2>
        <p>{{ ui.confirm.message }}</p>
        <div class="confirm-actions">
          <button class="secondary-action" type="button" @click="ui.resolveConfirm(false)">
            {{ ui.confirm.cancelText }}
          </button>
          <button class="primary-action" :class="{ danger: ui.confirm.tone === 'error' }" type="button" @click="ui.resolveConfirm(true)">
            {{ ui.confirm.confirmText }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
