import { defineStore } from "pinia";

export type ToastKind = "info" | "success" | "warning" | "error";

export interface ToastItem {
  id: number;
  message: string;
  type: ToastKind;
}

export interface ConfirmDialogState {
  id: number;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  tone: ToastKind;
}

interface UiState {
  toasts: ToastItem[];
  confirm: ConfirmDialogState | null;
}

let nextToastId = 1;
let nextConfirmId = 1;
const confirmResolvers = new Map<number, (confirmed: boolean) => void>();

export const useUiStore = defineStore("ui", {
  state: (): UiState => ({
    toasts: [],
    confirm: null,
  }),
  actions: {
    toast(message: string, type: ToastKind = "info", timeoutMs = 3600) {
      const text = String(message || "").trim();
      if (!text) return 0;
      const id = nextToastId;
      nextToastId += 1;
      this.toasts.push({ id, message: text, type });
      if (timeoutMs > 0) {
        window.setTimeout(() => {
          this.dismissToast(id);
        }, timeoutMs);
      }
      return id;
    },
    success(message: string, timeoutMs = 3600) {
      return this.toast(message, "success", timeoutMs);
    },
    info(message: string, timeoutMs = 3000) {
      return this.toast(message, "info", timeoutMs);
    },
    warning(message: string, timeoutMs = 4200) {
      return this.toast(message, "warning", timeoutMs);
    },
    error(message: string, timeoutMs = 5200) {
      return this.toast(message, "error", timeoutMs);
    },
    dismissToast(id: number) {
      this.toasts = this.toasts.filter((toast) => toast.id !== id);
    },
    confirmAction(options: {
      title?: string;
      message: string;
      confirmText?: string;
      cancelText?: string;
      tone?: ToastKind;
    }) {
      const id = nextConfirmId;
      nextConfirmId += 1;
      this.confirm = {
        id,
        title: options.title || "请确认",
        message: options.message,
        confirmText: options.confirmText || "确认",
        cancelText: options.cancelText || "取消",
        tone: options.tone || "info",
      };
      return new Promise<boolean>((resolve) => {
        confirmResolvers.set(id, resolve);
      });
    },
    resolveConfirm(confirmed: boolean) {
      const pending = this.confirm;
      if (!pending) return;
      this.confirm = null;
      const resolve = confirmResolvers.get(pending.id);
      confirmResolvers.delete(pending.id);
      resolve?.(confirmed);
    },
  },
});
