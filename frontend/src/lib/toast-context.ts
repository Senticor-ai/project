import { createContext } from "react";

export type ToastType = "error" | "success" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

export interface ToastContextValue {
  toasts: Toast[];
  toast: (message: string, type?: ToastType) => void;
  dismiss: (id: string) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);
