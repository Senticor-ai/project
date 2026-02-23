import { createContext } from "react";

export type ToastType = "error" | "success" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  action?: ToastAction;
  persistent?: boolean;
}

export interface ToastContextValue {
  toasts: Toast[];
  toast: (
    message: string,
    type?: ToastType,
    options?: { action?: ToastAction; persistent?: boolean },
  ) => void;
  dismiss: (id: string) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);
